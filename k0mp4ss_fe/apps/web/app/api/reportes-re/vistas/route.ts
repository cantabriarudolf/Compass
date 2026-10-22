/**
 * /api/reportes-re/vistas — registra la consulta del Centro de Mando.
 *
 * POST custom (`re:centro_mando` ver): paridad server-side con
 * `registrarVistaDashboardRE` del store legacy, que solo emitía el evento
 * `RE_DASHBOARD_VIEW` (no persistía métrica propia). El plan SERIE-FASE2 §V3
 * mantiene el alcance: la métrica de reportería son los informes emitidos /
 * distribuidos / leídos, no las visitas al tablero; esto queda como auditoría.
 *
 * Authz: `re:centro_mando` ver — administrador y comité (centro de mando).
 * Conserjería, mantención y residente no tienen ese recurso.
 */
import { z } from "zod"
import { logger } from "@/lib/logger"
import { jsonError } from "@/lib/api/with-comunidad-scope"
import { contextoAccionRE, RECURSO_CENTRO_MANDO_RE, registrarEventoRE } from "../_acciones"

const VISTAS_CENTRO_MANDO = [
  "demografico",
  "operativo",
  "gestiones",
  "financiero",
] as const

const EntradaVistaSchema = z.object({
  vista: z.enum(VISTAS_CENTRO_MANDO, {
    errorMap: () => ({ message: "La vista del Centro de Mando no es válida." }),
  }),
})

/** POST registra la vista del Centro de Mando (auditoría, sin métrica propia). */
export async function POST(req: Request): Promise<Response> {
  const contexto = await contextoAccionRE(RECURSO_CENTRO_MANDO_RE, "ver")
  if (!contexto.ok) return contexto.response
  const { scope } = contexto

  const crudo = await req.json().catch(() => null)
  const parsed = EntradaVistaSchema.safeParse(crudo)
  if (!parsed.success) {
    return jsonError(
      400,
      parsed.error.issues[0]?.message ?? "La vista del Centro de Mando no es válida."
    )
  }

  try {
    await registrarEventoRE(
      scope,
      "RE_DASHBOARD_VIEW",
      parsed.data.vista,
      `Vista "${parsed.data.vista}" del Centro de Mando consultada (rol ${scope.rol}).`
    )
    return Response.json({ ok: true })
  } catch (e) {
    logger.error({ err: e }, "[api/reportes-re/vistas] error inesperado")
    return jsonError(500, "Error interno del servidor.")
  }
}
