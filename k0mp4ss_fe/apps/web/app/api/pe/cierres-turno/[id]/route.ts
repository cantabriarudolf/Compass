/**
 * /api/pe/cierres-turno/[id] — detalle/actualización parcial/baja.
 *
 * GET_ONE y DELETE vía factory. PUT parcial vía put-merge sobre "pe".
 * La edición de un cierre ya registrado emite `PE_CIERRE_EDITADO`
 * (categoría PE) después de la escritura.
 */
import { CierreTurnoPESchema } from "@/lib/schemas"
import { puede } from "@/lib/authz"
import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import { generarId } from "@/lib/id-utils"
import { createCrudHandlers, delegado } from "@/lib/api/crud-factory"
import { createPutMerge } from "@/lib/api/put-merge"
import { withComunidadScope } from "@/lib/api/with-comunidad-scope"

const modelo = delegado(prisma.cierreTurnoPE)
const authzCheck = (rol: string, accion: "ver" | "crear" | "editar" | "eliminar" | "ejecutar") =>
  puede(rol, accion, "pe")

const handlers = createCrudHandlers({
  model: modelo,
  schema: CierreTurnoPESchema,
  authzCheck,
})

const putMerge = createPutMerge({
  model: modelo,
  schema: CierreTurnoPESchema,
  authzCheck,
  recurso: "pe/cierres-turno",
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
      await prisma.eventoAuditoria.create({
        data: {
          id: generarId("ev"),
          comunidadId: scope.comunidadId,
          timestamp: new Date().toISOString(),
          usuario: scope.usuarioId,
          categoria: "PE",
          tipoAccion: "PE_CIERRE_EDITADO",
          referenciaId: id,
          descripcion: `Cierre de turno del ${cierre.fecha ?? "?"} ${cierre.hora ?? ""} editado: novedades "${(cierre.novedadesGenerales ?? "").slice(0, 200)}", ${entradasHistorial} entrada(s) en el historial de cambios.`,
        },
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
