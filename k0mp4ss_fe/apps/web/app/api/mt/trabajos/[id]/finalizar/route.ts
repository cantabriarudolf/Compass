/**
 * /api/mt/trabajos/[id]/finalizar — finaliza un trabajo MT y reprograma la
 * mantención preventiva.
 *
 * POST custom (edición sobre "mt"): paridad server-side con
 * `finalizarTrabajoMT` legacy. Un trabajo Planificado o En Curso pasa a
 * Finalizado con `fechaTermino`/`costoFinal` (defaults: hoy y el costo del
 * trabajo), mediante un update condicional por estado que garantiza
 * exactly-once de la transición y del evento `MT_WORK_FINISHED`. Si el trabajo
 * declara `preventivo`, se crea DENTRO de la misma transacción el próximo
 * trabajo `planificado` (+periodicidadMeses) con evento
 * `MT_PREVENTIVE_GENERATED`; la creación es idempotente por procedencia
 * (título + fecha programada), así que un reintento no duplica el hijo.
 */
import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import { hoyISO } from "@/lib/date-utils"
import { jsonError } from "@/lib/api/with-comunidad-scope"
import { errorGenerico } from "@/app/api/personas/route"
import {
  contextoAccionMT,
  registrarEventoMT,
  siguienteFolioMT,
  sumarMesesISO,
  type ClienteMT,
} from "../../../_acciones"

type Ctx = { params: Promise<{ id: string }> }

type CierreBody = { fechaTermino?: unknown; costoFinal?: unknown }

/** Próximo preventivo ya generado para el mismo título y fecha (procedencia). */
async function preventivoExistente(
  tx: ClienteMT,
  comunidadId: string,
  padreId: string,
  titulo: string,
  fechaProgramada: string
) {
  return tx.trabajoMT.findFirst({
    where: {
      comunidadId,
      id: { not: padreId },
      titulo,
      fechaProgramada,
    },
    orderBy: { id: "asc" },
  })
}

/** POST finaliza el trabajo y, si corresponde, genera el próximo preventivo. */
export async function POST(req: Request, ctx: Ctx): Promise<Response> {
  const contexto = await contextoAccionMT("editar")
  if (!contexto.ok) return contexto.response
  const { scope } = contexto
  const { id } = await ctx.params

  const body: CierreBody = await req.json().catch(() => ({}))
  if (typeof body !== "object" || body === null) return jsonError(400, "Cuerpo JSON inválido.")
  if (body.fechaTermino !== undefined && typeof body.fechaTermino !== "string") {
    return jsonError(400, "La fecha de término debe ser una fecha AAAA-MM-DD.")
  }
  if (body.costoFinal !== undefined && typeof body.costoFinal !== "number") {
    return jsonError(400, "El costo final debe ser un número.")
  }

  try {
    const trabajo = await prisma.trabajoMT.findUnique({ where: { id } })
    if (!trabajo || trabajo.comunidadId !== scope.comunidadId) {
      return jsonError(404, "Registro no encontrado.")
    }
    if (trabajo.estado === "finalizado") {
      return jsonError(400, "El trabajo ya está finalizado.")
    }
    if (trabajo.estado === "cancelado") {
      return jsonError(400, "Un trabajo cancelado no puede finalizarse.")
    }

    const fechaTermino =
      (typeof body.fechaTermino === "string" ? body.fechaTermino.trim() : "") || hoyISO()
    const costoFinal =
      typeof body.costoFinal === "number" ? body.costoFinal : trabajo.costoTotal

    const resultado = await prisma.$transaction(async (tx) => {
      // Update condicional: garantiza exactly-once de la transición y del evento.
      const update = await tx.trabajoMT.updateMany({
        where: {
          id,
          comunidadId: scope.comunidadId,
          estado: { in: ["planificado", "en_curso"] },
        },
        data: { estado: "finalizado", fechaTermino, costoTotal: costoFinal },
      })
      if (update.count === 0) return { conflicto: true as const }

      await registrarEventoMT(
        scope,
        "MT_WORK_FINISHED",
        id,
        `Trabajo ${trabajo.folio} FINALIZADO (${fechaTermino}, costo $${costoFinal.toLocaleString("es-CL")}).`,
        tx
      )

      let preventivoId: string | undefined
      if (trabajo.preventivo) {
        // SAFETY: preventivo es Json con shape PreventivoConfigSchema validado al crear el trabajo.
        const config = trabajo.preventivo as unknown as { periodicidadMeses: number }
        const proximaFecha = sumarMesesISO(fechaTermino, config.periodicidadMeses)
        const yaExiste = await preventivoExistente(
          tx,
          scope.comunidadId,
          id,
          trabajo.titulo,
          proximaFecha
        )
        if (!yaExiste) {
          const folio = await siguienteFolioMT(scope.comunidadId, tx)
          const siguiente = await tx.trabajoMT.create({
            data: {
              id: `${id}-prev-${proximaFecha}`,
              comunidadId: scope.comunidadId,
              folio,
              titulo: trabajo.titulo,
              descripcion: trabajo.descripcion,
              ...(trabajo.unidadId ? { unidadId: trabajo.unidadId } : {}),
              ...(trabajo.microSectorId ? { microSectorId: trabajo.microSectorId } : {}),
              ...(trabajo.activoIRId ? { activoIRId: trabajo.activoIRId } : {}),
              ...(trabajo.responsablePersonaId
                ? { responsablePersonaId: trabajo.responsablePersonaId }
                : {}),
              ...(trabajo.proveedor ? { proveedor: trabajo.proveedor as never } : {}),
              prioridad: trabajo.prioridad,
              estado: "planificado",
              fechaProgramada: proximaFecha,
              costoTotal: trabajo.costoTotal,
              origenFondos: trabajo.origenFondos,
              estadoPago: "pendiente",
              ...(trabajo.garantiaInicio ? { garantiaInicio: trabajo.garantiaInicio } : {}),
              ...(trabajo.garantiaFin ? { garantiaFin: trabajo.garantiaFin } : {}),
              alertaGarantiaEnviada: false,
              evidencias: [],
              ...(trabajo.preventivo ? { preventivo: trabajo.preventivo as never } : {}),
            },
          })
          preventivoId = siguiente.id

          await registrarEventoMT(
            scope,
            "MT_PREVENTIVE_GENERATED",
            siguiente.id,
            `Mantención preventiva ${siguiente.folio} generada automáticamente (${siguiente.fechaProgramada}).`,
            tx
          )
        } else {
          preventivoId = yaExiste.id
        }
      }
      return { conflicto: false as const, preventivoId }
    })

    if (resultado.conflicto) {
      return jsonError(400, "El trabajo ya está finalizado.")
    }
    return Response.json({ ok: true, preventivoId: resultado.preventivoId })
  } catch (e) {
    logger.error({ err: e }, "[api/mt/trabajos/finalizar] error inesperado")
    return errorGenerico(e)
  }
}
