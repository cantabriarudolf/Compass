import type { CobroFI, EgresoFI, EmisionGC, Unidad } from "./schemas"

export type EstadoCobroFI = "pendiente" | "parcial" | "pagado" | "vencido"

export type ContextoSaldoFondo = {
  cobros: Pick<CobroFI, "fondoId" | "pagos">[]
  egresos: Pick<EgresoFI, "fondoId" | "monto">[]
  emisiones: Pick<EmisionGC, "fondoReservaAporte">[]
}

export function hoyISO(): string {
  return new Date().toISOString().slice(0, 10)
}

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

export function saldoFondo(fondoId: string, ctx: ContextoSaldoFondo): number {
  const ingresosCobros = ctx.cobros
    .filter(c => c.fondoId === fondoId)
    .reduce((acc, c) => acc + totalPagado(c), 0)
  const aportes = ctx.emisiones
    .filter(e => e.fondoReservaAporte?.fondoId === fondoId)
    .reduce((acc, e) => acc + (e.fondoReservaAporte?.monto ?? 0), 0)
  const egresos = ctx.egresos.filter(e => e.fondoId === fondoId).reduce((acc, e) => acc + e.monto, 0)
  return ingresosCobros + aportes - egresos
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
