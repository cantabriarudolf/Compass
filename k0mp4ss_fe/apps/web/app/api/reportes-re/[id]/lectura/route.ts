/**
 * /api/reportes-re/[id]/lectura — registra la LECTURA del informe por el usuario.
 *
 * POST custom (`re` ver): paridad server-side con la vista del informe, con las
 * decisiones del plan SERIE-FASE2 §V3:
 * - **No existe tasa de apertura.** La métrica es emitidos / distribuidos /
 *   leídos en la app: esta ruta marca el "leído" y congela su fecha.
 * - La lectura es **una por usuario y por informe** (idempotente): reabrir el
 *   informe no infla la métrica; se conserva la fecha de la PRIMERA lectura.
 *
 * Authz: `re` ver (administrador y comité). El residente no tiene `re`: no lee
 * el visor de reportería.
 */
import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import { hoyISO } from "@/lib/date-utils"
import type { LecturaReporteRE } from "@/lib/schemas"
import { jsonError } from "@/lib/api/with-comunidad-scope"
import { cargarReporteRE, contextoAccionRE, registrarEventoRE } from "../../_acciones"

type Ctx = { params: Promise<{ id: string }> }

/** POST marca la lectura del informe (idempotente por usuario). */
export async function POST(_req: Request, ctx: Ctx): Promise<Response> {
  const contexto = await contextoAccionRE("re", "ver")
  if (!contexto.ok) return contexto.response
  const { scope } = contexto
  const { id } = await ctx.params

  try {
    const reporte = await cargarReporteRE(id, scope)
    if (!reporte) return jsonError(404, "Registro no encontrado.")

    // SAFETY: `lecturas` es una columna Json; Prisma la devuelve como JsonValue.
    // El único escritor de esa columna es esta ruta (que guarda LecturaReporteRE[]),
    // así que el cast recupera la forma que el propio código persistió.
    const lecturas = Array.isArray(reporte.lecturas)
      ? (reporte.lecturas as unknown as LecturaReporteRE[])
      : []
    const previa = lecturas.find((l) => l.usuarioId === scope.usuarioId)
    if (previa) {
      return Response.json({ ok: true, yaLeido: true, fecha: previa.fecha })
    }

    const fecha = hoyISO()
    const nueva: LecturaReporteRE = { usuarioId: scope.usuarioId, rol: scope.rol, fecha }
    await prisma.$transaction(async (tx) => {
      await tx.reporteRE.update({
        where: { id },
        data: { lecturas: [...lecturas, nueva] as never },
      })
      await registrarEventoRE(
        scope,
        "RE_REPORT_READ",
        id,
        `Reporte "${reporte.titulo}"${reporte.numero ? ` N°${reporte.numero}` : ""} leído en la app.`,
        tx
      )
    })

    return Response.json({ ok: true, yaLeido: false, fecha })
  } catch (e) {
    logger.error({ err: e }, "[api/reportes-re/lectura] error inesperado")
    return jsonError(500, "Error interno del servidor.")
  }
}
