/**
 * /api/cobros-fi/[id]/mora — aplicar mora a un cobro vencido FI.
 *
 * POST custom (solo administración): paridad server-side con `aplicarMoraFI`
 * legacy. Exige fecha de vencimiento, tasa > 0, atraso > 0 y saldo pendiente.
 * IDEMPOTENTE por día: si ya existe una mora con la fecha de hoy responde
 * `{ok:true}` sin duplicar. Emite UN evento `FI_MORA_APPLIED` solo al aplicar.
 */
import { MoraCobroFISchema, type MoraCobroFI, type PagoCobroFI } from "@/lib/schemas"
import { puede } from "@/lib/authz"
import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import { generarId } from "@/lib/id-utils"
import {
  diasDeAtraso,
  hoyISO,
  montoMoraPropuesta,
  saldoPendiente,
} from "@/lib/finanzas-utils"
import {
  jsonError,
  withComunidadScope,
} from "@/lib/api/with-comunidad-scope"

type Ctx = { params: Promise<{ id: string }> }

type BodyMora = { tasaMensualPct?: unknown }

/** POST aplica la mora del día sobre el cobro y emite el evento de auditoría. */
export async function POST(req: Request, ctx: Ctx): Promise<Response> {
  const resultado = await withComunidadScope()
  if (!resultado.ok) return resultado.response
  const scope = resultado.scope
  if (!puede(scope.rol, "editar", "fi")) {
    return jsonError(403, "Permiso denegado.")
  }
  const { id } = await ctx.params

  let body: BodyMora
  try {
    body = (await req.json()) as BodyMora
  } catch {
    return jsonError(400, "Cuerpo JSON inválido.")
  }

  try {
    const cobro = await prisma.cobroFI.findUnique({ where: { id } })
    if (!cobro || cobro.comunidadId !== scope.comunidadId) {
      return jsonError(404, "Registro no encontrado.")
    }
    if (!cobro.fechaVencimiento) {
      return jsonError(400, "El cobro no tiene fecha de vencimiento registrada.")
    }

    const tasaMensualPct =
      typeof body.tasaMensualPct === "number" ? body.tasaMensualPct : 1
    if (!(tasaMensualPct > 0)) {
      return jsonError(400, "La tasa de mora debe ser mayor a cero.")
    }

    const hoy = hoyISO()
    const dias = Math.max(0, diasDeAtraso(cobro.fechaVencimiento, hoy))
    if (dias <= 0) {
      return jsonError(400, "El cobro aún no está vencido: no procede aplicar mora.")
    }

    // SAFETY: moras/pagos son Json con shape validado por CobroFISchema.
    const moras = (cobro.moras ?? []) as unknown as MoraCobroFI[]
    // SAFETY: pagos es Json con shape PagoCobroFI[]; solo se lee `monto`.
    const pagos = (cobro.pagos ?? []) as unknown as PagoCobroFI[]
    const pendiente = saldoPendiente({
      montoBase: cobro.montoBase,
      moras,
      pagos,
    })
    if (pendiente <= 0) {
      return jsonError(400, "El cobro ya está completamente pagado.")
    }

    // Idempotencia diaria: una sola mora por fecha.
    if (moras.some((m) => m.fecha === hoy)) return Response.json({ ok: true })

    const monto = montoMoraPropuesta(pendiente, dias, tasaMensualPct)
    if (monto <= 0) {
      return jsonError(400, "El cálculo no arrojó mora aplicable.")
    }

    const moraCandidata: MoraCobroFI = {
      id: generarId("mora"),
      monto,
      diasAtraso: dias,
      tasaMensualPct,
      fecha: hoy,
    }
    const validacion = MoraCobroFISchema.safeParse(moraCandidata)
    if (!validacion.success) {
      return jsonError(400, "Datos inválidos.", {
        detalles: validacion.error.flatten(),
      })
    }

    await prisma.cobroFI.update({
      where: { id },
      data: { moras: [...moras, validacion.data] as never },
    })

    await prisma.eventoAuditoria.create({
      data: {
        id: generarId("ev"),
        comunidadId: scope.comunidadId,
        timestamp: new Date().toISOString(),
        usuario: scope.usuarioId,
        categoria: "FI",
        tipoAccion: "FI_MORA_APPLIED",
        referenciaId: id,
        descripcion: `Mora aplicada a ${cobro.descripcion}: $${monto.toLocaleString("es-CL")} (${dias} día(s) de atraso, tasa ${tasaMensualPct}% mensual pro-rata).`,
      },
    })

    return Response.json({ ok: true })
  } catch (e) {
    logger.error({ err: e }, "[api/cobros-fi/mora] error inesperado")
    return jsonError(500, "Error interno del servidor.")
  }
}
