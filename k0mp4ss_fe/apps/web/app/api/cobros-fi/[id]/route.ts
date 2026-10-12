/**
 * /api/cobros-fi/[id] — detalle/actualización parcial/baja de un cobro FI.
 *
 * GET_ONE con ABAC residente (solo sus unidades). PUT vía factory (solo
 * administrador). DELETE bloqueado (409) si el cobro tiene pagos, salvo
 * Decisión 8: un cobro TEST con pagos puede darse de baja en desarrollo para
 * que el limpiar() del QA-Lab purgue el residuo FI en BD.
 */
import { puede } from "@/lib/authz"
import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import { getAppEnv } from "@/lib/env-guard"
import { esCobroTest } from "@/lib/qa-lab-helpers"
import {
  jsonError,
  withComunidadScope,
} from "@/lib/api/with-comunidad-scope"
import { errorGenerico, personaIdDelUsuario } from "@/app/api/personas/route"
import { cobrosHandlers, unidadesDePersona } from "../route"

type Ctx = { params: Promise<{ id: string }> }

export const PUT = cobrosHandlers.PUT

/** GET_ONE por id (scoped). Residente: solo cobros de sus unidades. */
export async function GET(_req: Request, ctx: Ctx): Promise<Response> {
  const resultado = await withComunidadScope()
  if (!resultado.ok) return resultado.response
  const scope = resultado.scope
  const { id } = await ctx.params

  try {
    const record = await prisma.cobroFI.findUnique({ where: { id } })
    if (!record || record.comunidadId !== scope.comunidadId) {
      return jsonError(404, "Registro no encontrado.")
    }
    if (scope.rol === "residente") {
      const personaId = await personaIdDelUsuario(scope.usuarioId)
      const propias = personaId
        ? await unidadesDePersona(scope.comunidadId, personaId)
        : []
      if (!propias.includes(record.unidadId)) {
        return jsonError(403, "Permiso denegado: solo puedes ver tus propios cobros.")
      }
    } else if (!puede(scope.rol, "ver", "fi")) {
      return jsonError(403, "Permiso denegado.")
    }
    return Response.json(record)
  } catch (e) {
    logger.error({ err: e }, "[api/cobros-fi] error inesperado")
    return errorGenerico(e)
  }
}

/** DELETE: 409 si el cobro tiene pagos registrados. */
export async function DELETE(_req: Request, ctx: Ctx): Promise<Response> {
  const resultado = await withComunidadScope()
  if (!resultado.ok) return resultado.response
  const scope = resultado.scope
  const { id } = await ctx.params
  if (!puede(scope.rol, "eliminar", "fi")) {
    return jsonError(403, "Permiso denegado.")
  }

  try {
    const record = await prisma.cobroFI.findUnique({ where: { id } })
    if (!record || record.comunidadId !== scope.comunidadId) {
      return jsonError(404, "Registro no encontrado.")
    }
    // SAFETY: pagos es Json con shape PagoCobroFI[] según CobroFISchema.
    const pagos = (record.pagos as unknown as unknown[]) ?? []
    if (pagos.length > 0) {
      // Decisión 8: en desarrollo, un cobro TEST (id/unidadId/origenRef test-*)
      // se puede borrar aunque tenga pagos para que el QA-Lab pueda purgar su
      // residuo FI. El guard 409 sigue intacto para cualquier cobro real.
      const cobroTest = esCobroTest({
        id: record.id,
        unidadId: record.unidadId,
        origenRef: record.origenRef ?? undefined,
      })
      if (!(cobroTest && getAppEnv() === "development")) {
        return jsonError(
          409,
          "No se puede eliminar el cobro: tiene pagos registrados."
        )
      }
    }
    await prisma.cobroFI.delete({ where: { id } })
    return Response.json({ ok: true })
  } catch (e) {
    logger.error({ err: e }, "[api/cobros-fi] error inesperado")
    return errorGenerico(e)
  }
}
