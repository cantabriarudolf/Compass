/**
 * /api/ra/reservas/[id]/retener — retiene la garantía de una reserva dañada.
 *
 * POST custom (edición sobre "ra"): paridad server-side con
 * `retenerGarantiaRA` legacy. Solo una reserva Confirmada y sin retención
 * previa; el monto retenido es SIEMPRE `montoGarantia` de la reserva (el body
 * puede enviar `monto`, que debe coincidir) y se materializa como cargo al
 * Fondo de Amenities (`concepto: "garantia_ra"`, `origenRef` = id de la
 * reserva). Idempotente por procedencia y por estado: un segundo intento no
 * duplica ni el cobro ni el evento `RA_WARRANTY_RETAINED`.
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
  leerCuerpo,
  materializarCobro,
  registrarEventoRA,
  RechazoRA,
  unidadDeCobro,
} from "../../../_acciones"

type Ctx = { params: Promise<{ id: string }> }

/** POST retiene la garantía por daño, con cargo al fondo de amenities. */
export async function POST(req: Request, ctx: Ctx): Promise<Response> {
  const contexto = await contextoAccionRA()
  if (!contexto.ok) return contexto.response
  const { scope } = contexto
  const { id } = await ctx.params

  const body = await leerCuerpo(req)
  if (body === null) return jsonError(400, "Cuerpo JSON inválido.")
  const motivo = typeof body.motivo === "string" ? body.motivo.trim() : ""
  const montoBody = typeof body.monto === "number" ? body.monto : undefined

  try {
    const reserva = await cargarReserva(id, scope)
    if (!reserva) return jsonError(404, "Registro no encontrado.")
    if (reserva.estado !== "confirmada") {
      return jsonError(400, "La garantía se retiene sobre una reserva Confirmada.")
    }
    if (reserva.garantiaRetenida) {
      return jsonError(400, "La garantía de esta reserva ya fue retenida.")
    }
    if (motivo.length === 0) {
      return jsonError(400, "La retención exige describir el daño o motivo.")
    }
    if (reserva.montoGarantia <= 0) {
      return jsonError(400, "El elemento no exige garantía: nada que retener.")
    }
    if (montoBody !== undefined && montoBody !== reserva.montoGarantia) {
      return jsonError(
        400,
        `El monto retenido debe coincidir con la garantía de la reserva ($${reserva.montoGarantia.toLocaleString("es-CL")}).`
      )
    }

    const hoyStr = hoyISO()
    const fondo = await fondoAmenities(scope.comunidadId)
    const unidadCobro = await unidadDeCobro(reserva, scope.comunidadId)
    const candidato =
      fondo && unidadCobro
        ? construirCobro({
            unidadId: unidadCobro,
            concepto: "garantia_ra",
            origenRef: reserva.id,
            fondoId: fondo.id,
            descripcion: `Garantía retenida (${reserva.folio}): ${motivo}`,
            montoBase: reserva.montoGarantia,
            fechaCargo: hoyStr,
            fechaVencimiento: hoyStr,
          })
        : undefined

    const resultado = await prisma.$transaction(async (tx) => {
      let cobroId: string | undefined
      let reutilizado = false
      if (candidato) {
        const cobro = await materializarCobro(tx, scope.comunidadId, candidato)
        cobroId = cobro.id
        reutilizado = cobro.reutilizado
      }

      // Guard de estado + ausencia de retención previa, releídos dentro de la
      // transacción: dos retenciones concurrentes no duplican el cobro.
      const actual = await tx.reservaRA.findUnique({ where: { id } })
      if (!actual || actual.comunidadId !== scope.comunidadId) return null
      if (actual.estado !== "confirmada" || actual.garantiaRetenida) {
        return "rechazada" as const
      }

      await tx.reservaRA.update({
        where: { id },
        data: {
          garantiaRetenida: {
            monto: actual.montoGarantia,
            motivo,
          } as never,
          ...(cobroId ? { cargoFIReferencia: cobroId } : {}),
        },
      })

      await registrarEventoRA(
        scope,
        "RA_WARRANTY_RETAINED",
        id,
        `Garantía RETENIDA ($${actual.montoGarantia.toLocaleString("es-CL")}) en reserva ${actual.folio}: ${motivo}. ${cobroId ? `Cargo al fondo de amenities ${reutilizado ? "existente reutilizado" : "materializado"} (${cobroId}).` : "Sin cargo al fondo de amenities."}`,
        tx
      )
      return "retenida" as const
    })

    if (resultado === null) return jsonError(404, "Registro no encontrado.")
    if (resultado === "rechazada") {
      return jsonError(400, "La garantía de esta reserva ya fue retenida.")
    }
    return Response.json({ ok: true })
  } catch (e) {
    if (e instanceof RechazoRA) {
      return jsonError(e.status, e.message, e.extra)
    }
    logger.error({ err: e }, "[api/ra/reservas/retener] error inesperado")
    return jsonError(500, "Error interno del servidor.")
  }
}
