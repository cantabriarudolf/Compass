/**
 * /api/in/infracciones/[id]/desestimar — desestima una infracción IN.
 *
 * POST custom (solo administración): paridad server-side con
 * `desestimarInfraccionIN` legacy. Exige que la infracción siga sin resolución
 * final y una justificación obligatoria; transiciona a "desestimada" y emite UN
 * evento `IN_DESESTIMADA`.
 */
import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import { jsonError } from "@/lib/api/with-comunidad-scope"
import {
  cargarInfraccion,
  contextoAccionIN,
  leerCuerpo,
  registrarEventoIN,
} from "../../_acciones"

type Ctx = { params: Promise<{ id: string }> }

/** POST desestima la infracción con la justificación obligatoria. */
export async function POST(req: Request, ctx: Ctx): Promise<Response> {
  const contexto = await contextoAccionIN()
  if (!contexto.ok) return contexto.response
  const { scope } = contexto
  const { id } = await ctx.params

  const body = await leerCuerpo(req)
  if (body === null) return jsonError(400, "Cuerpo JSON inválido.")
  const justificacion =
    typeof body.justificacion === "string" ? body.justificacion.trim() : ""

  try {
    const infraccion = await cargarInfraccion(id, scope)
    if (!infraccion) return jsonError(404, "Registro no encontrado.")
    if (!["en_revision", "apelada"].includes(infraccion.estado)) {
      return jsonError(400, "La infracción ya tiene resolución final.")
    }
    if (justificacion.length === 0) {
      return jsonError(400, "La desestimación exige justificación obligatoria.")
    }

    await prisma.infraccionIN.update({
      where: { id },
      data: {
        estado: "desestimada",
        desestimacionJustificacion: justificacion,
      },
    })

    await registrarEventoIN(
      scope,
      "IN_DESESTIMADA",
      id,
      `Infracción ${infraccion.folio} desestimada: ${justificacion}`
    )

    return Response.json({ ok: true })
  } catch (e) {
    logger.error({ err: e }, "[api/in/infracciones/desestimar] error inesperado")
    return jsonError(500, "Error interno del servidor.")
  }
}
