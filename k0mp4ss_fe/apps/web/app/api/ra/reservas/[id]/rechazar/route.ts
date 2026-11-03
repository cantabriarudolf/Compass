/**
 * /api/ra/reservas/[id]/rechazar — el administrador rechaza una solicitud.
 *
 * Alerta de reservas: la reserva pendiente pasa a `cancelada` con el MOTIVO que
 * declara el administrador (queda en el JSON `cancelacion`, junto a la fecha y
 * al flag `tardia: false`, porque rechazar una solicitud no es una cancelación
 * fuera de plazo y no cobra penalización).
 *
 * No hay cobro que revertir: el alta de una solicitud no materializa la tarifa,
 * así que rechazarla deja el Fondo de Amenities como estaba. UN evento
 * `RA_BOOKING_REJECTED` por rechazo, con el update condicional por estado para
 * que dos rechazos concurrentes no dupliquen el evento.
 */
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import { hoyISO } from "@/lib/date-utils"
import { jsonError } from "@/lib/api/with-comunidad-scope"
import {
  cargarReserva,
  contextoAccionRA,
  leerCuerpo,
  registrarEventoRA,
} from "../../../_acciones"

type Ctx = { params: Promise<{ id: string }> }

/** Motivo obligatorio: un rechazo sin razón no le sirve a nadie. */
const RechazoEntradaSchema = z.object({
  motivo: z
    .string({ required_error: "El motivo del rechazo es obligatorio." })
    .trim()
    .min(3, "El motivo del rechazo es obligatorio."),
})

/** POST rechaza la reserva pendiente con su motivo. */
export async function POST(req: Request, ctx: Ctx): Promise<Response> {
  const contexto = await contextoAccionRA()
  if (!contexto.ok) return contexto.response
  const { scope } = contexto
  const { id } = await ctx.params

  const body = await leerCuerpo(req)
  if (body === null) return jsonError(400, "Cuerpo JSON inválido.")

  const parsed = RechazoEntradaSchema.safeParse(body)
  if (!parsed.success) {
    return jsonError(400, "Datos inválidos.", {
      detalles: parsed.error.flatten(),
    })
  }
  const { motivo } = parsed.data

  try {
    const reserva = await cargarReserva(id, scope)
    if (!reserva) return jsonError(404, "Registro no encontrado.")
    if (reserva.estado !== "solicitada") {
      return jsonError(
        400,
        "Solo una reserva pendiente de autorización puede rechazarse."
      )
    }

    const hoyStr = hoyISO()
    const actualizada = await prisma.$transaction(async (tx) => {
      const update = await tx.reservaRA.updateMany({
        where: { id, comunidadId: scope.comunidadId, estado: "solicitada" },
        data: {
          estado: "cancelada",
          cancelacion: { fecha: hoyStr, tardia: false, motivo } as never,
        },
      })
      if (update.count === 0) return null

      await registrarEventoRA(
        scope,
        "RA_BOOKING_REJECTED",
        id,
        `Reserva ${reserva.folio} RECHAZADA por el administrador: ${reserva.fecha} ${reserva.horaInicio}–${reserva.horaFin}. Motivo: ${motivo}`,
        tx
      )
      return tx.reservaRA.findUnique({ where: { id } })
    })

    if (!actualizada) {
      return jsonError(409, "La reserva ya no está pendiente de autorización.")
    }

    return Response.json({ ok: true, reserva: actualizada })
  } catch (e) {
    logger.error({ err: e }, "[api/ra/reservas/[id]/rechazar] error inesperado")
    return jsonError(500, "Error interno del servidor.")
  }
}
