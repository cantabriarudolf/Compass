/**
 * /api/mt/trabajos — trabajos de mantenimiento MT (BD-FUENTE-VERDAD Fase 4).
 *
 * GET paginado vía factory. POST upsert idempotente por id con paridad
 * server-side con `saveTrabajoMT` legacy (Fase 1.5): deriva el folio `MT-####`
 * correlativo por comunidad cuando el cliente lo envía vacío, aplica los
 * defaults del store (estado `planificado`, pago `pendiente`, alerta de
 * garantía sin enviar) y emite UN evento `MT_WORK_CREATED` sólo en el alta.
 * Authz sobre "mt" (personal de mantención + administrador operan).
 */
import { z } from "zod"
import {
  EstadoPagoMTSchema,
  EstadoTrabajoMTSchema,
  TrabajoMTSchema,
} from "@/lib/schemas"
import { puede } from "@/lib/authz"
import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import { createCrudHandlers, delegado } from "@/lib/api/crud-factory"
import {
  jsonError,
  withComunidadScope,
} from "@/lib/api/with-comunidad-scope"
import { errorGenerico } from "@/app/api/personas/route"
import { registrarEventoMT, siguienteFolioMT } from "../_acciones"

const modelo = delegado(prisma.trabajoMT)

const handlers = createCrudHandlers({
  model: modelo,
  schema: TrabajoMTSchema,
  authzCheck: (rol, accion) => puede(rol, accion, "mt"),
})

export const GET = handlers.GET

/**
 * Entrada del POST: el folio y los defaults del store los completa el servidor
 * en el alta (el cliente puede omitirlos), igual que `saveTrabajoMT`.
 */
const EntradaTrabajoSchema = TrabajoMTSchema.extend({
  folio: z.string().optional(),
  estado: EstadoTrabajoMTSchema.optional(),
  estadoPago: EstadoPagoMTSchema.optional(),
  alertaGarantiaEnviada: z.boolean().optional(),
})

export async function POST(req: Request): Promise<Response> {
  const resultado = await withComunidadScope()
  if (!resultado.ok) return resultado.response
  const scope = resultado.scope

  const body: unknown = await req.json().catch(() => null)
  if (body === null) return jsonError(400, "Cuerpo JSON inválido.")

  const parsed = EntradaTrabajoSchema.safeParse(body)
  if (!parsed.success) {
    return jsonError(400, "Datos inválidos.", { detalles: parsed.error.flatten() })
  }
  const datos = parsed.data

  try {
    const existente = await prisma.trabajoMT.findUnique({ where: { id: datos.id } })
    if (existente && existente.comunidadId !== scope.comunidadId) {
      return jsonError(404, "Registro no encontrado.")
    }
    const accion = existente ? "editar" : "crear"
    if (!puede(scope.rol, accion, "mt")) return jsonError(403, "Permiso denegado.")

    const folio =
      (datos.folio ?? "").trim() ||
      (existente ? existente.folio : await siguienteFolioMT(scope.comunidadId))

    // Defaults del store para el alta; en la actualización se respetan los del
    // cliente (mismo criterio de upsert por id de la serie).
    const candidato = {
      ...datos,
      folio,
      estado: datos.estado ?? existente?.estado ?? "planificado",
      estadoPago: datos.estadoPago ?? existente?.estadoPago ?? "pendiente",
      alertaGarantiaEnviada:
        datos.alertaGarantiaEnviada ?? existente?.alertaGarantiaEnviada ?? false,
    }
    const validacion = TrabajoMTSchema.safeParse(candidato)
    if (!validacion.success) {
      return jsonError(400, "Datos inválidos.", { detalles: validacion.error.flatten() })
    }
    const registro = validacion.data

    const record = await prisma.trabajoMT.upsert({
      where: { id: registro.id },
      create: { ...registro, comunidadId: scope.comunidadId } as never,
      update: { ...registro } as never,
    })

    if (!existente) {
      await registrarEventoMT(
        scope,
        "MT_WORK_CREATED",
        registro.id,
        `Trabajo ${registro.folio} "${registro.titulo}" creado (${registro.prioridad}${registro.preventivo ? `, preventivo cada ${registro.preventivo.periodicidadMeses} mes(es)` : ""}).`
      )
    }

    return Response.json(record, { status: existente ? 200 : 201 })
  } catch (e) {
    logger.error({ err: e }, "[api/mt/trabajos] error inesperado")
    return errorGenerico(e)
  }
}
