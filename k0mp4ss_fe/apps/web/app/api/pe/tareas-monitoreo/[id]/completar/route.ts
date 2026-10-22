/**
 * /api/pe/tareas-monitoreo/[id]/completar — cierra una tarea de mantenimiento
 * desde el panel de monitoreo de PE.
 *
 * POST custom (`pe` editar): paridad server-side con `completarTareaMonitoreoPE`
 * del store legacy. Un trabajo Planificado o En Curso pasa a Finalizado con
 * `fechaTermino` (hoy si no venía) mediante un update condicional por estado:
 * exactly-once de la transición y del evento `PE_TASK_DONE` — completar dos
 * veces la misma tarea responde "La tarea ya se encuentra cerrada." sin volver a
 * escribir ni repetir auditoría.
 *
 * Authz: `pe` editar (conserjería y mantención, que son quienes operan el panel).
 * No se reutiliza `/api/mt/trabajos/[id]/finalizar` a propósito: esa ruta exige
 * `mt`, dispara `MT_WORK_FINISHED` y reprograma el preventivo; acá el acto es el
 * cierre operativo visto desde PE, con su propio evento y su propio recurso.
 *
 * Scoping: el trabajo debe pertenecer a la comunidad de la sesión (404 si no).
 */
import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import { hoyISO } from "@/lib/date-utils"
import { jsonError } from "@/lib/api/with-comunidad-scope"
import { contextoAccionPE, registrarEventoPE } from "../../../_acciones"

type Ctx = { params: Promise<{ id: string }> }

/** POST finaliza la tarea de monitoreo. */
export async function POST(_req: Request, ctx: Ctx): Promise<Response> {
  const contexto = await contextoAccionPE()
  if (!contexto.ok) return contexto.response
  const { scope } = contexto
  const { id } = await ctx.params

  try {
    const trabajo = await prisma.trabajoMT.findUnique({ where: { id } })
    if (!trabajo || trabajo.comunidadId !== scope.comunidadId) {
      return jsonError(404, "La tarea indicada no existe en Mantenimiento.")
    }
    if (trabajo.estado === "finalizado" || trabajo.estado === "cancelado") {
      return jsonError(400, "La tarea ya se encuentra cerrada.")
    }

    const cerrada = await prisma.$transaction(async (tx) => {
      // Update condicional: si otra corrida cerró la tarea, count === 0 y esta
      // corrida no escribe ni repite el evento.
      const marca = await tx.trabajoMT.updateMany({
        where: {
          id,
          comunidadId: scope.comunidadId,
          estado: { in: ["planificado", "en_curso"] },
        },
        data: {
          estado: "finalizado",
          fechaTermino: trabajo.fechaTermino ?? hoyISO(),
        },
      })
      if (marca.count === 0) return false

      await registrarEventoPE(
        scope,
        "PE_TASK_DONE",
        id,
        `Tarea "${trabajo.titulo}" completada desde el panel de monitoreo de PE.`,
        tx
      )
      return true
    })

    if (!cerrada) return jsonError(400, "La tarea ya se encuentra cerrada.")
    return Response.json({ ok: true })
  } catch (e) {
    logger.error({ err: e }, "[api/pe/tareas-monitoreo/completar] error inesperado")
    return jsonError(500, "Error interno del servidor.")
  }
}
