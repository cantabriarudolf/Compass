/**
 * /api/mt/trabajos/[id]/iniciar — inicia un trabajo MT.
 *
 * POST custom (edición sobre "mt"): paridad server-side con `iniciarTrabajoMT`
 * legacy. Solo un trabajo Planificado pasa a En Curso (sella `fechaInicio`),
 * mediante un update condicional por estado que garantiza exactly-once de la
 * transición y del evento `MT_WORK_STARTED`.
 */
import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import { hoyISO } from "@/lib/date-utils"
import { jsonError } from "@/lib/api/with-comunidad-scope"
import { errorGenerico } from "@/app/api/personas/route"
import { contextoAccionMT, registrarEventoMT } from "../../../_acciones"

type Ctx = { params: Promise<{ id: string }> }

/** POST inicia el trabajo (Planificado → En Curso). */
export async function POST(_req: Request, ctx: Ctx): Promise<Response> {
  const contexto = await contextoAccionMT("editar")
  if (!contexto.ok) return contexto.response
  const { scope } = contexto
  const { id } = await ctx.params

  try {
    const trabajo = await prisma.trabajoMT.findUnique({ where: { id } })
    if (!trabajo || trabajo.comunidadId !== scope.comunidadId) {
      return jsonError(404, "Registro no encontrado.")
    }
    if (trabajo.estado !== "planificado") {
      return jsonError(400, "Solo un trabajo Planificado puede iniciarse.")
    }

    // Update condicional por estado: exactly-once ante dos inicios concurrentes.
    const update = await prisma.trabajoMT.updateMany({
      where: { id, comunidadId: scope.comunidadId, estado: "planificado" },
      data: { estado: "en_curso", fechaInicio: hoyISO() },
    })
    if (update.count === 0) {
      return jsonError(400, "Solo un trabajo Planificado puede iniciarse.")
    }

    await registrarEventoMT(
      scope,
      "MT_WORK_STARTED",
      id,
      `Trabajo ${trabajo.folio} "${trabajo.titulo}" En Curso.`
    )
    return Response.json({ ok: true })
  } catch (e) {
    logger.error({ err: e }, "[api/mt/trabajos/iniciar] error inesperado")
    return errorGenerico(e)
  }
}
