/**
 * /api/liquidaciones/[id]/confirmar — confirmación de liquidación PL
 * (SERIE-GATED-API-BD P3).
 *
 * POST custom (solo administración): exige estado borrador (400 si no) y fondo
 * GC activo (400 si no); crea el egreso FI categoría sueldos por el líquido a
 * pagar (folio FE- correlativo, validado con `EgresoFISchema`), materializa
 * `egresoFIReferencia`, pasa a descontados los adelantos vinculados y emite
 * `PL_EXPENSE_SYNC`. Paridad server-side con `confirmarLiquidacionPL` legacy.
 */
import { randomUUID } from "node:crypto"
import { EgresoFISchema } from "@/lib/schemas"
import { puede } from "@/lib/authz"
import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import {
  jsonError,
  withComunidadScope,
} from "@/lib/api/with-comunidad-scope"

function hoyISO(): string {
  return new Date().toISOString().slice(0, 10)
}

async function siguienteFolioFE(comunidadId: string): Promise<string> {
  const filas = await prisma.egresoFI.findMany({
    where: { comunidadId },
    select: { folio: true },
  })
  const numeros = filas
    .map((e) => Number.parseInt((e.folio ?? "").replace(/^FE-/, ""), 10))
    .filter((n) => Number.isFinite(n))
  return `FE-${String((numeros.length > 0 ? Math.max(...numeros) : 0) + 1).padStart(4, "0")}`
}

/** POST confirma un borrador y sincroniza el egreso de sueldos en FI. */
export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
): Promise<Response> {
  const resultado = await withComunidadScope()
  if (!resultado.ok) return resultado.response
  const scope = resultado.scope
  if (!puede(scope.rol, "editar", "pl")) {
    return jsonError(403, "Permiso denegado.")
  }
  const { id } = await ctx.params

  try {
    const liquidacion = await prisma.liquidacionPL.findUnique({
      where: { id },
    })
    if (!liquidacion || liquidacion.comunidadId !== scope.comunidadId) {
      return jsonError(404, "Registro no encontrado.")
    }
    if (liquidacion.estado !== "borrador") {
      return jsonError(400, "La liquidación ya está confirmada.")
    }
    const fondoGC = await prisma.fondoFI.findFirst({
      where: {
        comunidadId: scope.comunidadId,
        tipo: "gasto_comun",
        activo: true,
      },
    })
    if (!fondoGC) {
      return jsonError(
        400,
        "No existe un Fondo de Gasto Común activo para imputar el egreso de sueldos."
      )
    }
    const trabajador = await prisma.persona.findFirst({
      where: {
        comunidadId: scope.comunidadId,
        id: liquidacion.trabajadorPersonaId,
      },
      select: { nombres: true, apellidos: true },
    })
    const nombreCompleto = trabajador
      ? `${trabajador.nombres} ${trabajador.apellidos}`
      : liquidacion.trabajadorPersonaId

    const egresoCandidato = {
      id: `egr-${randomUUID().slice(0, 8)}`,
      folio: await siguienteFolioFE(scope.comunidadId),
      fecha: hoyISO(),
      categoria: "sueldos",
      descripcion: `Liquidación ${liquidacion.folio} ${nombreCompleto} (${liquidacion.periodo})`,
      monto: Math.max(1, liquidacion.liquidoAPagar),
      fondoId: fondoGC.id,
      esRecurrente: false,
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
    // SAFETY: adelantosIds / adelantosDetalle son Json; los casts solo tipan la lectura.
    const adelantosIds = (liquidacion.adelantosIds ?? []) as unknown as string[]
    const detalle = (liquidacion.adelantosDetalle ?? null) as unknown as
      | {
          id: string
          monto: number
          saldoResultante: number
          estado: string
        }[]
      | null
    await prisma.liquidacionPL.update({
      where: { id },
      data: { estado: "confirmada", egresoFIReferencia: egreso.id },
    })
    let adelantosAplicados = 0
    if (detalle && detalle.length > 0) {
      // SERIE-FASE2 §V4 — el plan calculado al generar dice cuánto se descuenta de
      // cada adelanto (100% del anticipo, hasta 15% del préstamo). Acá se
      // materializa: saldo, estado y la deducción ligada a esta liquidación.
      for (const d of detalle) {
        if (!(d.monto > 0)) continue
        const adelanto = await prisma.adelantoPL.findUnique({ where: { id: d.id } })
        if (!adelanto || adelanto.comunidadId !== scope.comunidadId) continue
        // SAFETY: deducciones es Json (DeduccionAdelantoPL[]); el cast solo tipa.
        const previas = Array.isArray(adelanto.deducciones)
          ? (adelanto.deducciones as unknown as unknown[])
          : []
        await prisma.adelantoPL.update({
          where: { id: adelanto.id },
          data: {
            saldo: Math.max(0, Math.round(d.saldoResultante)),
            estado: d.estado,
            liquidacionId: id,
            deducciones: [
              ...previas,
              {
                liquidacionId: id,
                folio: liquidacion.folio,
                periodo: liquidacion.periodo,
                fecha: hoyISO(),
                monto: Math.round(d.monto),
                saldoResultante: Math.max(0, Math.round(d.saldoResultante)),
                estado: d.estado,
              },
            ] as never,
          },
        })
        adelantosAplicados += 1
      }
    } else if (adelantosIds.length > 0) {
      // Liquidaciones generadas antes de §V4 (sin plan por adelanto): se saldan
      // completas, que es la única información que traía el registro legado.
      const legado = await prisma.adelantoPL.updateMany({
        where: {
          comunidadId: scope.comunidadId,
          id: { in: adelantosIds },
          estado: { in: ["pendiente", "descontado_parcial"] },
        },
        data: { estado: "saldado", saldo: 0, liquidacionId: id },
      })
      adelantosAplicados = legado.count
    }
    await prisma.eventoAuditoria.create({
      data: {
        id: randomUUID(),
        comunidadId: scope.comunidadId,
        timestamp: new Date().toISOString(),
        usuario: scope.usuarioId,
        categoria: "PL",
        tipoAccion: "PL_EXPENSE_SYNC",
        referenciaId: id,
        descripcion: `Liquidación ${liquidacion.folio} CONFIRMADA: egreso ${egreso.folio} de $${egreso.monto.toLocaleString("es-CL")} imputado a ${fondoGC.nombre} (categoría Sueldos); ${adelantosAplicados} adelanto(s) descontado(s).`,
      },
    })
    return Response.json({ ok: true, egresoId: egreso.id })
  } catch (e) {
    logger.error({ err: e }, "[api/liquidaciones/confirmar] error inesperado")
    return jsonError(500, "Error interno del servidor.")
  }
}
