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
    // SAFETY: adelantosIds es Json (string[]); el cast solo tipa la lectura.
    const adelantosIds = (liquidacion.adelantosIds ?? []) as unknown as string[]
    await prisma.liquidacionPL.update({
      where: { id },
      data: { estado: "confirmada", egresoFIReferencia: egreso.id },
    })
    if (adelantosIds.length > 0) {
      await prisma.adelantoPL.updateMany({
        where: {
          comunidadId: scope.comunidadId,
          id: { in: adelantosIds },
          estado: "pendiente",
        },
        data: { estado: "descontado", liquidacionId: id },
      })
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
        descripcion: `Liquidación ${liquidacion.folio} CONFIRMADA: egreso ${egreso.folio} de $${egreso.monto.toLocaleString("es-CL")} imputado a ${fondoGC.nombre} (categoría Sueldos); ${adelantosIds.length} anticipo(s) descontado(s).`,
      },
    })
    return Response.json({ ok: true, egresoId: egreso.id })
  } catch (e) {
    logger.error({ err: e }, "[api/liquidaciones/confirmar] error inesperado")
    return jsonError(500, "Error interno del servidor.")
  }
}
