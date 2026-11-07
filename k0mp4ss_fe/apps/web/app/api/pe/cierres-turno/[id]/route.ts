/**
 * /api/pe/cierres-turno/[id] — detalle/actualización parcial/baja.
 *
 * GET_ONE y DELETE vía factory. PUT parcial vía put-merge sobre "pe:cierre_turno".
 * La edición de un cierre ya registrado emite `PE_CIERRE_EDITADO`
 * (categoría PE) después de la escritura.
 *
 * OJO: el recurso es `pe:cierre_turno`, no el `pe` genérico. Con `pe` (que V2 abrió con
 * `editar` a mantención para las transiciones de personal) cualquier rol operativo podía
 * editar cierres de turno ajenos; el test preexistente lo fijaba como 403 y lo destapó.
 *
 * Alcance por filas (`alcanceCierresTurnoPE`): el cierre del OTRO trabajador responde
 * 404 y no se carga; gestión conserva la comunidad entera. El MISMO helper se pasa al
 * PUT de `put-merge` —no un segundo filtro— porque conserjería tiene
 * `pe:cierre_turno` editar y `personaId` en el seed (`scripts/seed-authz.mjs:55`): sin
 * él editaba el cierre ajeno aunque ya no pudiera leerlo.
 *
 * ESCRITURA (T17): el PUT parcial tampoco puede MOVER un cierre propio a otro
 * trabajador —dejaría asentado que A-2 cerró un turno que nunca cerró—, así que
 * `antesDeEscribir` encadena `rechazoDeCierreTurnoAjeno` (la misma composición que el
 * POST de la colección) antes de INV-02. La fila ajena responde 404, y la propia con
 * dueño ajeno también.
 */
import { CierreTurnoPESchema } from "@/lib/schemas"
import { puede } from "@/lib/authz"
import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import { generarId } from "@/lib/id-utils"
import { registrarEventoAuditoria } from "@/lib/auditoria"
import {
  createCrudHandlers,
  delegado,
  type AntesDeEscribir,
} from "@/lib/api/crud-factory"
import { createPutMerge } from "@/lib/api/put-merge"
import { withComunidadScope } from "@/lib/api/with-comunidad-scope"
import { guardiaCierreUnico } from "@/lib/invariantes/pe"
import { alcanceCierresTurnoPE, rechazoDeCierreTurnoAjeno } from "../_alcance"

const modelo = delegado(prisma.cierreTurnoPE)
const authzCheck = (rol: string, accion: "ver" | "crear" | "editar" | "eliminar" | "ejecutar") =>
  puede(rol, accion, "pe:cierre_turno")

/**
 * Propiedad del cierre (T17) y después INV-02: `antesDeEscribir` es un solo hook, así
 * que el orden se declara acá, una vez, y lo usan el POST y el PUT.
 */
const antesDeEscribir: AntesDeEscribir = async (args) =>
  (await rechazoDeCierreTurnoAjeno(args)) ?? guardiaCierreUnico(args)

const handlers = createCrudHandlers({
  model: modelo,
  schema: CierreTurnoPESchema,
  authzCheck,
  alcance: alcanceCierresTurnoPE,
})

const putMerge = createPutMerge({
  model: modelo,
  schema: CierreTurnoPESchema,
  authzCheck,
  recurso: "pe/cierres-turno",
  alcance: alcanceCierresTurnoPE,
  // INV-02: mover fecha/jornada/trabajador por PUT tampoco puede duplicar el
  // cierre. La guardia funde el parche con la fila previa y excluye el propio id.
  antesDeEscribir,
})

type Ctx = { params: Promise<{ id: string }> }

export const GET = handlers.GET_ONE

/**
 * PUT parcial + auditoría de la edición del cierre.
 *
 * El cierre nace por `POST /api/pe/cierres-turno`; cualquier PUT exitoso sobre
 * `[id]` es una edición de un cierre ya registrado (el put-merge fusiona el
 * parche y preserva el historial que envía el cliente). Se emite después de la
 * escritura y en su propio try/catch: la auditoría nunca bloquea la edición.
 */
export async function PUT(req: Request, ctx: Ctx): Promise<Response> {
  const { id } = await ctx.params
  const res = await putMerge(req, ctx)
  if (!res.ok) return res

  try {
    const cierre = (await res.clone().json()) as {
      fecha?: string
      hora?: string
      novedadesGenerales?: string | null
      historialCambios?: unknown[]
    }
    const scopeResult = await withComunidadScope()
    if (scopeResult.ok) {
      const { scope } = scopeResult
      const entradasHistorial = Array.isArray(cierre.historialCambios)
        ? cierre.historialCambios.length
        : 0
      await registrarEventoAuditoria({
        id: generarId("ev"),
        comunidadId: scope.comunidadId,
        timestamp: new Date().toISOString(),
        usuario: scope.usuarioId,
        categoria: "PE",
        tipoAccion: "PE_CIERRE_EDITADO",
        referenciaId: id,
        descripcion: `Cierre de turno del ${cierre.fecha ?? "?"} ${cierre.hora ?? ""} editado: novedades "${(cierre.novedadesGenerales ?? "").slice(0, 200)}", ${entradasHistorial} entrada(s) en el historial de cambios.`,
      })
    }
  } catch (e) {
    logger.error(
      { err: e },
      "[api/pe/cierres-turno] no se pudo registrar PE_CIERRE_EDITADO"
    )
  }

  return res
}

export const DELETE = handlers.DELETE
