/**
 * /api/ra/reservas/[id]/autorizar — el administrador autoriza una solicitud.
 *
 * Alerta de reservas: una reserva de un elemento con `requiereAutorizacion`
 * nace `solicitada`; este POST la pasa a `confirmada`, materializa el cargo al
 * Fondo de Amenities que el alta NO generó (una solicitud pendiente no es deuda)
 * y emite UN evento `RA_BOOKING_AUTHORIZED`.
 *
 * La transición es exactly-once: el update es condicional por estado, así que dos
 * autorizaciones concurrentes no duplican ni el cambio ni el cobro.
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

/** POST autoriza la reserva pendiente. */
export async function POST(_req: Request, ctx: Ctx): Promise<Response> {
  const contexto = await contextoAccionRA()
  if (!contexto.ok) return contexto.response
  const { scope } = contexto
  const { id } = await ctx.params

  try {
    const reserva = await cargarReserva(id, scope)
    if (!reserva) return jsonError(404, "Registro no encontrado.")
    if (reserva.estado !== "solicitada") {
      return jsonError(
        400,
        "Solo una reserva pendiente de autorización puede autorizarse."
      )
    }

    const elemento = await prisma.elementoRA.findUnique({
      where: { id: reserva.elementoId },
    })
    if (!elemento) return jsonError(404, "Elemento no encontrado.")

    // Cobro de la tarifa (antes no se materializó: la solicitud no generaba deuda).
    let candidato: Record<string, unknown> | undefined
    if (reserva.montoTarifa > 0) {
      const fondo = await fondoAmenities(scope.comunidadId)
      const unidadCobro = await unidadDeCobro(reserva, scope.comunidadId)
      if (fondo && unidadCobro) {
        candidato = construirCobro({
          unidadId: unidadCobro,
          concepto: "reserva_ra",
          origenRef: reserva.id,
          fondoId: fondo.id,
          descripcion: `Tarifa reserva ${elemento.nombre} (${reserva.fecha})`,
          montoBase: reserva.montoTarifa,
          fechaCargo: hoyISO(),
          fechaVencimiento: reserva.fecha,
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

      // Update condicional por estado: exactly-once de la transición (y del cobro).
      const update = await tx.reservaRA.updateMany({
        where: { id, comunidadId: scope.comunidadId, estado: "solicitada" },
        data: {
          estado: "confirmada",
          ...(cobroId ? { cargoFIReferencia: cobroId } : {}),
        },
      })
      if (update.count === 0) return null

      await registrarEventoRA(
        scope,
        "RA_BOOKING_AUTHORIZED",
        id,
        `Reserva ${reserva.folio} AUTORIZADA por el administrador: ${elemento.nombre} el ${reserva.fecha} ${reserva.horaInicio}–${reserva.horaFin}${cobroId ? `; cargo FI ${reutilizado ? "existente reutilizado" : "materializado"} (${cobroId})` : ""}.`,
        tx
      )
      return { cobroId }
    })

    if (!resultado) {
      return jsonError(
        409,
        "La reserva ya no está pendiente de autorización."
      )
    }

    const actualizada = await prisma.reservaRA.findUnique({ where: { id } })
    return Response.json({ ok: true, reserva: actualizada })
  } catch (e) {
    if (e instanceof RechazoRA) {
      return jsonError(e.status, e.message, e.extra)
    }
    logger.error({ err: e }, "[api/ra/reservas/[id]/autorizar] error inesperado")
    return jsonError(500, "Error interno del servidor.")
  }
}
