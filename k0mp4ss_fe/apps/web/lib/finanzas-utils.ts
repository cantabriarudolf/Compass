import type { CobroFI, EgresoFI, EmisionGC, IngresoFI, Unidad } from "./schemas"
import { lineasDeCobro } from "./cobro-lineas"

// SERIE-PRODUCCION P1: hoyISO vive en date-utils; se reexporta por
// compatibilidad con app/finanzas/gastos-comunes/page.tsx que lo importa aquí.
import { hoyISO } from "./date-utils"
export { hoyISO }

export type EstadoCobroFI = "pendiente" | "parcial" | "pagado" | "vencido"

export type ContextoSaldoFondo = {
  /**
   * Cobros con lo que decide a qué fondo va cada peso: sus `lineas` (S5) y, en
   * los cobros legacy sin líneas, el `concepto` + `montoBase` que
   * `lineasDeCobro` sintetiza como su única línea.
   */
  cobros: Pick<
    CobroFI,
    "fondoId" | "pagos" | "concepto" | "montoBase" | "lineas"
  >[]
  egresos: Pick<EgresoFI, "fondoId" | "monto">[]
  /**
   * @deprecated Ya no acredita nada: el aporte al fondo de reserva es una línea
   * real del cobro, y el fondo recibe caja de lo que las unidades pagan. Se
   * conserva en el tipo para no romper a los llamadores que todavía lo cargan;
   * migrarlos es parte del corte 3 de T5.
   */
  emisiones?: Pick<EmisionGC, "fondoReservaAporte">[]
  ingresosFI?: Pick<IngresoFI, "fondoId" | "monto">[]
  saldoInicialPorFondo?: Record<string, number>
}

/** Lo mínimo que necesita el reparto de un pago: sus líneas y sus pagos. */
type CobroParaSaldo = ContextoSaldoFondo["cobros"][number]

export function diasDeAtraso(fechaVencimiento: string, hoy: string): number {
  const diff = new Date(`${hoy}T00:00:00`).getTime() - new Date(`${fechaVencimiento}T00:00:00`).getTime()
  return Math.floor(diff / 86400000)
}

export function totalMoras(cobro: Pick<CobroFI, "moras">): number {
  return cobro.moras.reduce((acc, m) => acc + m.monto, 0)
}

export function totalPagado(cobro: Pick<CobroFI, "pagos">): number {
  return cobro.pagos.reduce((acc, p) => acc + p.monto, 0)
}

export function exigibleTotal(cobro: Pick<CobroFI, "montoBase" | "moras">): number {
  return cobro.montoBase + totalMoras(cobro)
}

export function saldoPendiente(cobro: Pick<CobroFI, "montoBase" | "moras" | "pagos">): number {
  return Math.max(0, exigibleTotal(cobro) - totalPagado(cobro))
}

export function estadoDeCobro(
  cobro: Pick<CobroFI, "montoBase" | "moras" | "pagos" | "fechaVencimiento">,
  hoy = hoyISO()
): EstadoCobroFI {
  const pendiente = saldoPendiente(cobro)
  if (pendiente <= 0) return "pagado"
  if (cobro.fechaVencimiento && cobro.fechaVencimiento < hoy) return "vencido"
  if (totalPagado(cobro) > 0) return "parcial"
  return "pendiente"
}

export function montoMoraPropuesta(exigiblePendiente: number, diasAtraso: number, tasaMensualPct: number): number {
  if (exigiblePendiente <= 0 || diasAtraso <= 0 || tasaMensualPct <= 0) return 0
  return Math.round((exigiblePendiente * tasaMensualPct * diasAtraso) / (100 * 30))
}

/**
 * Reparte lo pagado entre los fondos que nombran las líneas del cobro, en
 * proporción al monto de cada línea; una línea sin `fondoId` se imputa al fondo
 * del cobro. El cobro legacy (sin líneas) es una sola línea a su propio
 * `fondoId`, así que su pago completo se acredita donde siempre se acreditó.
 *
 * Con el recargo de reserva como línea real, acreditar además el aporte de la
 * emisión contaba la misma plata dos veces (S5): el fondo ahora ve solo lo que
 * las unidades efectivamente pagan. No se redondea cada parte, porque redondear
 * por fondo rompería la suma: los montos FI son números reales.
 */
function ingresosDeCobroPorFondo(cobro: CobroParaSaldo): Map<string, number> {
  const porFondo = new Map<string, number>()
  const pagado = totalPagado(cobro)
  if (pagado <= 0) return porFondo
  const lineas = lineasDeCobro(cobro)
  const totalLineas = lineas.reduce((acc, linea) => acc + linea.monto, 0)
  if (totalLineas <= 0) {
    // Sin montos no hay proporción posible: lo pagado va al fondo del cobro.
    porFondo.set(cobro.fondoId, pagado)
    return porFondo
  }
  for (const linea of lineas) {
    const fondoId = linea.fondoId ?? cobro.fondoId
    porFondo.set(
      fondoId,
      (porFondo.get(fondoId) ?? 0) + (pagado * linea.monto) / totalLineas
    )
  }
  return porFondo
}

export function saldoFondo(fondoId: string, ctx: ContextoSaldoFondo): number {
  const ingresosCobros = ctx.cobros.reduce(
    (acc, cobro) => acc + (ingresosDeCobroPorFondo(cobro).get(fondoId) ?? 0),
    0
  )
  const ingresosManuales = (ctx.ingresosFI ?? [])
    .filter(i => i.fondoId === fondoId)
    .reduce((acc, i) => acc + i.monto, 0)
  const egresos = ctx.egresos.filter(e => e.fondoId === fondoId).reduce((acc, e) => acc + e.monto, 0)
  const saldoInicial = ctx.saldoInicialPorFondo?.[fondoId] ?? 0
  return saldoInicial + ingresosCobros + ingresosManuales - egresos
}

export type MorosidadUnidad = {
  unidadId: string
  periodosVencidos: number
  deudaVencida: number
}

export function morosidadPorUnidad(unidadId: string, cobros: CobroFI[], hoy = hoyISO()): MorosidadUnidad {
  const vencidos = cobros.filter(
    c => c.unidadId === unidadId && estadoDeCobro(c, hoy) === "vencido"
  )
  return {
    unidadId,
    periodosVencidos: new Set(vencidos.map(c => c.periodo)).size,
    deudaVencida: vencidos.reduce((acc, c) => acc + saldoPendiente(c), 0),
  }
}

export function unidadesParaCorteServicios(
  unidades: Pick<Unidad, "id" | "numero" | "etiqueta">[],
  cobros: CobroFI[],
  limiteMesesAvisoCorte: number,
  hoy = hoyISO()
): MorosidadUnidad[] {
  return unidades
    .map(u => morosidadPorUnidad(u.id, cobros, hoy))
    .filter(m => m.periodosVencidos >= Math.max(1, limiteMesesAvisoCorte))
}

export function vencimientoDesdeDiaCorte(periodo: string, diaCortePago: number): string {
  const [anioStr, mesStr] = periodo.split("-")
  const anio = Number.parseInt(anioStr!, 10)
  const mes = Number.parseInt(mesStr!, 10)
  const fecha = new Date(Date.UTC(anio, mes, 1))
  const diasEnMes = new Date(Date.UTC(fecha.getUTCFullYear(), fecha.getUTCMonth() + 1, 0)).getUTCDate()
  const dia = Math.min(Math.max(1, diaCortePago), diasEnMes)
  return `${fecha.getUTCFullYear()}-${String(fecha.getUTCMonth() + 1).padStart(2, "0")}-${String(dia).padStart(2, "0")}`
}
