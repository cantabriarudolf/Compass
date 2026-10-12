/**
 * /api/ra/reservas/[id]/cancelar — cancela una reserva y materializa la
 * penalización por cancelación tardía.
 *
 * POST custom (edición sobre "ra"): paridad server-side con
 * `cancelarReservaRA` legacy. Solo una reserva Confirmada se cancela; si el
 * elemento define `cancelacionTardiaDias` y faltan esos días o menos, la
 * cancelación es tardía y se cobra `penalizacionTardiaMonto` al Fondo de
 * Amenities (`concepto: "penalizacion_ra"`, `origenRef` = id de la reserva).
 * El cobro es idempotente por procedencia (un cobro vivo previo se reutiliza) y
 * el update es condicional por estado (exactly-once con dos cancelaciones
 * concurrentes). Emite UN evento `RA_BOOKING_CANCELLED`.
 */
import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import { hoyISO } from "@/lib/date-utils"
import { jsonError } from "@/lib/api/with-comunidad-scope"
import {
  cargarReserva,
  construirCobro,
  contextoAccionRA,
  fondoAmenities,
  materializarCobro,
  registrarEventoRA,
  RechazoRA,
  unidadDeCobro,
} from "../../../_acciones"

type Ctx = { params: Promise<{ id: string }> }

/** Días completos entre dos fechas ISO (mismo cálculo del store). */
function diasEntre(fechaISO: string, hoyStr: string): number {
  return Math.round(
    (new Date(`${fechaISO}T00:00:00`).getTime() -
      new Date(`${hoyStr}T00:00:00`).getTime()) /
      86400000
  )
}

/** POST cancela la reserva (con penalización si la ventana de cancelación venció). */
export async function POST(_req: Request, ctx: Ctx): Promise<Response> {
  const contexto = await contextoAccionRA()
  if (!contexto.ok) return contexto.response
  const { scope } = contexto
  const { id } = await ctx.params

  try {
    const reserva = await cargarReserva(id, scope)
    if (!reserva) return jsonError(404, "Registro no encontrado.")
    if (reserva.estado !== "confirmada") {
      return jsonError(400, "Solo una reserva Confirmada puede cancelarse.")
    }

    const elemento = await prisma.elementoRA.findUnique({
      where: { id: reserva.elementoId },
    })
    const hoyStr = hoyISO()
    const diasRestantes = diasEntre(reserva.fecha, hoyStr)
    const ventanaTardia = elemento?.cancelacionTardiaDias ?? undefined
    const tardia = ventanaTardia !== undefined && diasRestantes <= ventanaTardia
    const montoPenalizacion = elemento?.penalizacionTardiaMonto ?? undefined
    const penalizacion =
      tardia && montoPenalizacion ? montoPenalizacion : undefined

    // Cobro de penalización (solo si hay fondo de amenities activo y unidad de
    // cobro; sin ellos la cancelación se registra sin cargo, como en el store).
    let candidato: Record<string, unknown> | undefined
    if (penalizacion) {
      const fondo = await fondoAmenities(scope.comunidadId)
      const unidadCobro = await unidadDeCobro(reserva, scope.comunidadId)
      if (fondo && unidadCobro) {
        candidato = construirCobro({
          unidadId: unidadCobro,
          concepto: "penalizacion_ra",
          origenRef: reserva.id,
          fondoId: fondo.id,
          descripcion: `Penalización por cancelación tardía (${reserva.folio})`,
          montoBase: penalizacion,
          fechaCargo: hoyStr,
          fechaVencimiento: hoyStr,
        })
      }
    }

    const resultado = await prisma.$transaction(async (tx) => {
      let cobroId: string | undefined
      let reutilizado = false
      if (candidato) {
        const cobro = await materializarCobro(tx, scope.comunidadId, candidato)
        cobroId = cobro.id
        reutilizado = cobro.reutilizado
      }

      // Update condicional por estado: garantiza exactly-once de la transición
      // (y del evento) ante dos cancelaciones concurrentes de la misma reserva.
      const update = await tx.reservaRA.updateMany({
        where: { id, comunidadId: scope.comunidadId, estado: "confirmada" },
        data: {
          estado: "cancelada",
          cancelacion: {
            fecha: hoyStr,
            tardia,
            ...(penalizacion ? { penalizacion } : {}),
          } as never,
          ...(cobroId ? { cargoFIReferencia: cobroId } : {}),
        },
      })
      if (update.count === 0) return null

      await registrarEventoRA(
        scope,
        "RA_BOOKING_CANCELLED",
        id,
        `Reserva ${reserva.folio} cancelada${tardia ? ` FUERA DE PLAZO (faltaban ${diasRestantes} día(s))` : ""}${cobroId ? `; penalización $${penalizacion!.toLocaleString("es-CL")} con cobro FI ${reutilizado ? "existente reutilizado" : "materializado"} (${cobroId})` : ""}.`,
        tx
      )
      return { cobroId }
    })

    if (!resultado) {
      return jsonError(400, "Solo una reserva Confirmada puede cancelarse.")
    }
    return Response.json({ ok: true })
  } catch (e) {
    if (e instanceof RechazoRA) {
      return jsonError(e.status, e.message, e.extra)
    }
    logger.error({ err: e }, "[api/ra/reservas/cancelar] error inesperado")
    return jsonError(500, "Error interno del servidor.")
  }
}
