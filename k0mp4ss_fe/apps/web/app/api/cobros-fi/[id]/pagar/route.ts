/**
 * /api/cobros-fi/[id]/pagar — registrar pago de un cobro FI (BD-FUENTE-VERDAD).
 *
 * POST custom (solo administración): paridad server-side con `registrarPagoFI`
 * legacy. Exige monto > 0, medio de pago y saldo pendiente > 0. Si el monto no
 * coincide con el pendiente, exige `ajusteJustificacion` (mínimo 10 caracteres)
 * y agrega la entrada de diferencia. Emite UN evento `FI_RECEIVE_PAYMENT`.
 */
import {
  DiferenciaPagoFISchema,
  PagoCobroFISchema,
  type DiferenciaPagoFI,
  type MoraCobroFI,
  type PagoCobroFI,
} from "@/lib/schemas"
import { puede } from "@/lib/authz"
import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import { generarId } from "@/lib/id-utils"
import {
  exigibleTotal,
  hoyISO,
  saldoPendiente,
  totalPagado,
} from "@/lib/finanzas-utils"
import {
  jsonError,
  withComunidadScope,
} from "@/lib/api/with-comunidad-scope"

type Ctx = { params: Promise<{ id: string }> }

type BodyPago = {
  monto?: unknown
  medio?: unknown
  ajusteJustificacion?: unknown
}

/** POST registra un pago sobre el cobro y emite el evento de auditoría. */
export async function POST(req: Request, ctx: Ctx): Promise<Response> {
  const resultado = await withComunidadScope()
  if (!resultado.ok) return resultado.response
  const scope = resultado.scope
  if (!puede(scope.rol, "editar", "fi")) {
    return jsonError(403, "Permiso denegado.")
  }
  const { id } = await ctx.params

  let body: BodyPago
  try {
    body = (await req.json()) as BodyPago
  } catch {
    return jsonError(400, "Cuerpo JSON inválido.")
  }

  try {
    const cobro = await prisma.cobroFI.findUnique({ where: { id } })
    if (!cobro || cobro.comunidadId !== scope.comunidadId) {
      return jsonError(404, "Registro no encontrado.")
    }

    const monto = typeof body.monto === "number" ? body.monto : Number.NaN
    const medio = typeof body.medio === "string" ? body.medio : ""
    if (!(monto > 0)) {
      return jsonError(400, "El monto del pago debe ser mayor a cero.")
    }
    if (medio.trim().length === 0) {
      return jsonError(400, "Debe indicar el medio de pago.")
    }

    // SAFETY: moras es Json con shape MoraCobroFI[] validado por CobroFISchema.
    const moras = (cobro.moras ?? []) as unknown as MoraCobroFI[]
    // SAFETY: pagos es Json con shape PagoCobroFI[] validado por CobroFISchema.
    const pagos = (cobro.pagos ?? []) as unknown as PagoCobroFI[]
    // SAFETY: diferencias es Json con shape DiferenciaPagoFI[] validado por CobroFISchema.
    const diferencias = (cobro.diferencias ?? []) as unknown as DiferenciaPagoFI[]
    const lectura = { montoBase: cobro.montoBase, moras, pagos }
    const pendiente = saldoPendiente(lectura)
    if (pendiente <= 0) {
      return jsonError(400, "El cobro ya está completamente pagado.")
    }

    const fecha = hoyISO()
    const esAjuste = monto !== pendiente
    let diferencia: DiferenciaPagoFI | undefined
    if (esAjuste) {
      const justificacion =
        typeof body.ajusteJustificacion === "string"
          ? body.ajusteJustificacion.trim()
          : ""
      if (!justificacion) {
        return jsonError(
          400,
          "El ajuste manual exige una justificación obligatoria para generar el informe de diferencia."
        )
      }
      if (justificacion.length < 10) {
        return jsonError(
          400,
          "La justificación debe explicar el motivo del ajuste (mínimo 10 caracteres)."
        )
      }
      const candidato: DiferenciaPagoFI = {
        id: generarId("dif"),
        tipo: monto < pendiente ? "descuento" : "recargo",
        esperado: exigibleTotal(lectura),
        recibido: totalPagado(lectura) + monto,
        diferencia: Math.abs(monto - pendiente),
        justificacion,
        fecha,
      }
      const validacion = DiferenciaPagoFISchema.safeParse(candidato)
      if (!validacion.success) {
        return jsonError(400, "Datos inválidos.", {
          detalles: validacion.error.flatten(),
        })
      }
      diferencia = validacion.data
    }

    const pagoCandidato: PagoCobroFI = {
      id: generarId("pag"),
      monto,
      fecha,
      medio: medio.trim(),
    }
    const validacionPago = PagoCobroFISchema.safeParse(pagoCandidato)
    if (!validacionPago.success) {
      return jsonError(400, "Datos inválidos.", {
        detalles: validacionPago.error.flatten(),
      })
    }

    await prisma.cobroFI.update({
      where: { id },
      data: {
        pagos: [...pagos, validacionPago.data] as never,
        diferencias: [
          ...diferencias,
          ...(diferencia ? [diferencia] : []),
        ] as never,
      },
    })

    await prisma.eventoAuditoria.create({
      data: {
        id: generarId("ev"),
        comunidadId: scope.comunidadId,
        timestamp: new Date().toISOString(),
        usuario: scope.usuarioId,
        categoria: "FI",
        tipoAccion: "FI_RECEIVE_PAYMENT",
        referenciaId: id,
        descripcion: `Pago recibido por $${monto.toLocaleString("es-CL")} (${medio.trim()}) sobre ${cobro.descripcion}.`,
      },
    })

    return Response.json({ ok: true })
  } catch (e) {
    logger.error({ err: e }, "[api/cobros-fi/pagar] error inesperado")
    return jsonError(500, "Error interno del servidor.")
  }
}
