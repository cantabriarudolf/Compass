/**
 * /api/liquidaciones/adelantos/[id]/desestimar — baja con historia (SERIE-FASE2 §V4).
 *
 * El adelanto NO se borra: se marca `desestimado`, se anula el saldo vivo y el
 * registro queda con sus deducciones ya aplicadas (si las tuvo). Es la paridad
 * server-side de `removeAdelantoPL` del store legacy, que solo permitía eliminar
 * un adelanto `pendiente`; acá, con la doctrina DT, tampoco se puede desestimar
 * un adelanto ya saldado (descontado completo en una liquidación).
 *
 * Authz: `pl:adelantos` editar — solo administración. 404 cross-comunidad.
 */
import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import { generarId } from "@/lib/id-utils"
import { puede } from "@/lib/authz"
import {
  jsonError,
  withComunidadScope,
} from "@/lib/api/with-comunidad-scope"
import { RECURSO_ADELANTOS_PL } from "../../route"

/** Estados con saldo vivo: los únicos que se pueden desestimar. */
const ESTADOS_DESESTIMABLES = new Set(["pendiente", "descontado_parcial"])

/** POST desestima el adelanto conservando el registro. */
export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
): Promise<Response> {
  const resultado = await withComunidadScope()
  if (!resultado.ok) return resultado.response
  const scope = resultado.scope
  if (!puede(scope.rol, "editar", RECURSO_ADELANTOS_PL)) {
    return jsonError(403, "Permiso denegado.")
  }
  const { id } = await ctx.params

  try {
    const adelanto = await prisma.adelantoPL.findUnique({ where: { id } })
    if (!adelanto || adelanto.comunidadId !== scope.comunidadId) {
      return jsonError(404, "Registro no encontrado.")
    }
    if (!ESTADOS_DESESTIMABLES.has(adelanto.estado)) {
      return jsonError(
        409,
        "No se puede desestimar un adelanto ya descontado en liquidación."
      )
    }

    await prisma.$transaction(async (tx) => {
      await tx.adelantoPL.update({
        where: { id },
        data: { estado: "desestimado", saldo: 0 },
      })
      await tx.eventoAuditoria.create({
        data: {
          id: generarId("ev"),
          comunidadId: scope.comunidadId,
          timestamp: new Date().toISOString(),
          usuario: scope.usuarioId,
          categoria: "PL",
          tipoAccion: "PL_DISMISS_ADVANCE",
          referenciaId: id,
          descripcion: `Adelanto ${adelanto.folio} (${adelanto.pacto}) desestimado: se anula el saldo vivo de $${Math.round(adelanto.saldo ?? 0).toLocaleString("es-CL")} sin borrar el registro.`,
        },
      })
    })

    return Response.json({ ok: true, id, estado: "desestimado" })
  } catch (e) {
    logger.error(
      { err: e },
      "[api/liquidaciones/adelantos/desestimar] error inesperado"
    )
    return jsonError(500, "Error interno del servidor.")
  }
}
