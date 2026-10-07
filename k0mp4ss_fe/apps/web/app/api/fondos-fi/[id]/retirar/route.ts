/**
 * /api/fondos-fi/[id]/retirar — retiro de un fondo FI (BD-FUENTE-VERDAD).
 *
 * POST custom (solo administración): paridad server-side con `retirarFondoFI`
 * legacy. Exige fondo activo de la comunidad, monto > 0, descripción no vacía,
 * acta publicada cuando se declara una (obligatoria para fondo de reserva) y
 * saldo suficiente calculado contra BD. Crea el egreso categoría `uso_de_fondo`
 * (folio FE- correlativo, validado con `EgresoFISchema`) y emite UN evento
 * `FI_FUND_WITHDRAWN`.
 */
import { EgresoFISchema, type PagoCobroFI } from "@/lib/schemas"
import { puede } from "@/lib/authz"
import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import { generarId } from "@/lib/id-utils"
import { hoyISO, saldoFondo } from "@/lib/finanzas-utils"
import { siguienteFolioFE } from "@/app/api/egresos-fi/route"
import {
  jsonError,
  withComunidadScope,
} from "@/lib/api/with-comunidad-scope"

type Ctx = { params: Promise<{ id: string }> }

type BodyRetiro = {
  monto?: unknown
  descripcion?: unknown
  aprobacionActaGDId?: unknown
}

/** POST retira dinero de un fondo creando el egreso y su evento de auditoría. */
export async function POST(req: Request, ctx: Ctx): Promise<Response> {
  const resultado = await withComunidadScope()
  if (!resultado.ok) return resultado.response
  const scope = resultado.scope
  if (!puede(scope.rol, "editar", "fi")) {
    return jsonError(403, "Permiso denegado.")
  }
  const { id } = await ctx.params

  let body: BodyRetiro
  try {
    body = (await req.json()) as BodyRetiro
  } catch {
    return jsonError(400, "Cuerpo JSON inválido.")
  }

  try {
    const fondo = await prisma.fondoFI.findUnique({ where: { id } })
    if (!fondo || fondo.comunidadId !== scope.comunidadId) {
      return jsonError(404, "Registro no encontrado.")
    }
    if (!fondo.activo) {
      return jsonError(
        400,
        `No se puede retirar: el fondo "${fondo.nombre}" está inactivo.`
      )
    }

    const monto = typeof body.monto === "number" ? body.monto : Number.NaN
    if (!(monto > 0)) {
      return jsonError(400, "El monto del retiro debe ser mayor a cero.")
    }
    const descripcion =
      typeof body.descripcion === "string" ? body.descripcion.trim() : ""
    if (descripcion.length === 0) {
      return jsonError(400, "El retiro exige describir el uso del dinero.")
    }

    let actaPublicada: string | undefined
    const aprobacionActaGDId =
      typeof body.aprobacionActaGDId === "string"
        ? body.aprobacionActaGDId
        : ""
    if (aprobacionActaGDId) {
      const acta = await prisma.actaGD.findFirst({
        where: { comunidadId: scope.comunidadId, id: aprobacionActaGDId },
      })
      if (!acta) {
        return jsonError(400, "El acta de aprobación indicada no existe.")
      }
      if (acta.estado !== "publicada") {
        return jsonError(
          400,
          "Solo un acta Publicada por la directiva respalda el retiro."
        )
      }
      actaPublicada = acta.id
    }
    if (fondo.tipo === "reserva" && !actaPublicada) {
      return jsonError(
        400,
        "El retiro del Fondo de Reserva exige aprobación documentada mediante un acta publicada de la directiva."
      )
    }

    const cobros = await prisma.cobroFI.findMany({
      where: { comunidadId: scope.comunidadId, fondoId: fondo.id },
    })
    const egresos = await prisma.egresoFI.findMany({
      where: { comunidadId: scope.comunidadId, fondoId: fondo.id },
      select: { fondoId: true, monto: true },
    })
    const ingresosFI = await prisma.ingresoFI.findMany({
      where: { comunidadId: scope.comunidadId, fondoId: fondo.id },
      select: { fondoId: true, monto: true },
    })
    const emisiones = await prisma.emisionGC.findMany({
      where: { comunidadId: scope.comunidadId },
      select: { fondoReservaAporte: true },
    })
    const saldo = saldoFondo(fondo.id, {
      cobros: cobros.map((c) => ({
        fondoId: c.fondoId,
        // SAFETY: pagos es Json con shape PagoCobroFI[] validado por CobroFISchema.
        pagos: (c.pagos ?? []) as unknown as PagoCobroFI[],
      })),
      egresos,
      ingresosFI,
      // SAFETY: fondoReservaAporte es Json con shape AporteFondoReserva validado por EmisionGCSchema.
      emisiones: emisiones as unknown as { fondoReservaAporte?: { fondoId: string; monto: number } }[],
      saldoInicialPorFondo: { [fondo.id]: fondo.saldoInicial ?? 0 },
    })
    if (monto > saldo) {
      return jsonError(
        400,
        `Saldo insuficiente en "${fondo.nombre}": disponible $${saldo.toLocaleString("es-CL")} para un retiro de $${monto.toLocaleString("es-CL")}.`
      )
    }

    const egresoCandidato = {
      id: generarId("egr"),
      folio: await siguienteFolioFE(scope.comunidadId),
      fecha: hoyISO(),
      categoria: "uso_de_fondo",
      descripcion,
      monto,
      fondoId: fondo.id,
      esRecurrente: false,
      aprobacionActaGDId: actaPublicada,
    }
    const validacionEgreso = EgresoFISchema.safeParse(egresoCandidato)
    if (!validacionEgreso.success) {
      return jsonError(400, "Datos inválidos.", {
        detalles: validacionEgreso.error.flatten(),
      })
    }
    const egreso = await prisma.egresoFI.create({
      data: {
        ...validacionEgreso.data,
        comunidadId: scope.comunidadId,
      } as never,
    })

    await prisma.eventoAuditoria.create({
      data: {
        id: generarId("ev"),
        comunidadId: scope.comunidadId,
        timestamp: new Date().toISOString(),
        usuario: scope.usuarioId,
        categoria: "FI",
        tipoAccion: "FI_FUND_WITHDRAWN",
        referenciaId: egreso.id,
        descripcion: `Retiro de $${monto.toLocaleString("es-CL")} desde ${fondo.nombre}: ${descripcion}${actaPublicada ? ` (aprobado en acta ${actaPublicada})` : ""}.`,
      },
    })

    return Response.json({ ok: true, egresoId: egreso.id })
  } catch (e) {
    logger.error({ err: e }, "[api/fondos-fi/retirar] error inesperado")
    return jsonError(500, "Error interno del servidor.")
  }
}
