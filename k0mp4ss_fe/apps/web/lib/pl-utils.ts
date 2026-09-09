// Helpers puros de PL - Liquidaciones y Remuneraciones (ventana 8). Sin acceso
// al store: reciben slices tipados y devuelven derivaciones testables.
import type { BonoLiquidacion } from "./schemas"

// §1.1 Lógica de cálculo de horas extras (estándar Chile):
// diario = base / días mes comercial (CF) → semanal = diario × 7 →
// hora ordinaria = semanal / jornada semanal (PE/CF) → recargo 50%.
export function valorHoraExtra(
  sueldoBase: number,
  diasMesComercial: number,
  jornadaSemanal: number
): number {
  if (sueldoBase <= 0 || diasMesComercial <= 0 || jornadaSemanal <= 0) return 0
  const sueldoDiario = sueldoBase / diasMesComercial
  const sueldoSemanaL = sueldoDiario * 7
  return Math.round(sueldoSemanaL / jornadaSemanal)
}

export function montoHorasExtra(
  sueldoBase: number,
  diasMesComercial: number,
  jornadaSemanal: number,
  horas: number
): number {
  if (horas <= 0) return 0
  return Math.round(valorHoraExtra(sueldoBase, diasMesComercial, jornadaSemanal) * 1.5 * horas)
}

// Gratificación legal: 25% del imponible con tope = factor × ingreso mínimo
// mensual / 12 (parámetros CF).
export function gratificacionLegal(
  imponibleSinGratificacion: number,
  ingresoMinimoMensual: number,
  topeGratificacionLegal: number
): number {
  const base = Math.round(imponibleSinGratificacion * 0.25)
  const tope = Math.round((topeGratificacionLegal * ingresoMinimoMensual) / 12)
  return Math.max(0, Math.min(base, tope))
}

export function descuentoAFP(baseImponible: number, tasaCotizacion: number): number {
  return Math.round((baseImponible * tasaCotizacion) / 100)
}

export interface PlanSaludInput {
  tipo: "fonasa" | "isapre"
  porcentaje?: number
  valorUF?: number
  ufVigente: number
}

// Salud: Fonasa 7% fijo; Isapre por valor UF o porcentaje sobre el imponible.
export function descuentoSalud(baseImponible: number, plan: PlanSaludInput): number {
  if (plan.tipo === "isapre") {
    if (plan.valorUF && plan.valorUF > 0) return Math.round(plan.valorUF * plan.ufVigente)
    const pct = plan.porcentaje ?? 7
    return Math.round((baseImponible * pct) / 100)
  }
  return Math.round((baseImponenteFonasa(baseImponible) * 7) / 100)
}

function baseImponenteFonasa(base: number): number {
  // Fonasa cotiza sobre el imponible con tope de 80.2 UF; sin tope parametrizado
  // en el alcance se aplica el imponible completo.
  return base
}

export function asignacionFamiliarMonto(montoTramo: number, cargas: number): number {
  if (cargas <= 0 || montoTramo <= 0) return 0
  return montoTramo * cargas
}

export interface EntradaCalculoLiquidacion {
  sueldoBaseContrato: number
  diasTrabajados: number
  diasMesComercial: number
  jornadaSemanal: number
  horasExtrasHoras: number
  bonos: Pick<BonoLiquidacion, "id" | "glosa" | "monto" | "imponible">[]
  asignacionMovilizacion: number
  asignacionColacion: number
  montoAsignacionFamiliar: number
  tasaAFP: number
  saludPlan: PlanSaludInput
  ufVigente: number
  ingresoMinimoMensual: number
  topeGratificacionLegal: number
  tasaSIS: number
  tasaSeguroCesantia: number
  esHonorarios: boolean
  montoAPV: number
  anticiposPendientes: { id: string; monto: number }[]
}

export interface ResultadoCalculoLiquidacion {
  sueldoBaseProporcional: number
  valorHoraOrdinaria: number
  montoHorasExtras: number
  gratificacionLegal: number
  totalImponible: number
  totalHaberes: number
  montoAFP: number
  montoSalud: number
  montoSIS: number
  montoSeguroCesantia: number
  totalDescuentos: number
  descuentoAnticipos: number
  adelantosIds: string[]
  alcanceLiquido: number
  liquidoAPagar: number
}

// Totales de control NSGC §1: haberes → descuentos legales → alcance líquido →
// anticipos → líquido a pagar.
export function calcularLiquidacion(input: EntradaCalculoLiquidacion): ResultadoCalculoLiquidacion {
  const sueldoBaseProporcional = Math.round((input.sueldoBaseContrato * input.diasTrabajados) / input.diasMesComercial)
  const valorHoraOrdinaria = valorHoraExtra(input.sueldoBaseContrato, input.diasMesComercial, input.jornadaSemanal)
  const montoHorasExtras = montoHorasExtra(input.sueldoBaseContrato, input.diasMesComercial, input.jornadaSemanal, input.horasExtrasHoras)
  const bonosImponibles = input.bonos.filter(b => b.imponible).reduce((acc, b) => acc + b.monto, 0)

  const imponibleSinGratificacion = sueldoBaseProporcional + montoHorasExtras + bonosImponibles
  const grat = input.esHonorarios
    ? 0
    : gratificacionLegal(imponibleSinGratificacion, input.ingresoMinimoMensual, input.topeGratificacionLegal)
  const totalImponible = imponibleSinGratificacion + grat

  const noImponibles =
    input.asignacionMovilizacion +
    input.asignacionColacion +
    input.montoAsignacionFamiliar +
    input.bonos.filter(b => !b.imponible).reduce((acc, b) => acc + b.monto, 0)
  const totalHaberes = totalImponible + noImponibles

  const legal = input.esHonorarios ? 0 : 1
  const montoAFP = legal ? descuentoAFP(totalImponible, input.tasaAFP) : 0
  const montoSalud = legal ? descuentoSalud(totalImponible, input.saludPlan) : 0
  const montoSIS = legal ? descuentoAFP(totalImponible, input.tasaSIS) : 0
  const montoSeguroCesantia = legal ? descuentoAFP(totalImponible, input.tasaSeguroCesantia) : 0
  const totalDescuentos = montoAFP + montoSalud + montoSIS + montoSeguroCesantia + input.montoAPV

  const alcanceLiquido = totalHaberes - totalDescuentos
  const descuentoAnticipos = input.anticiposPendientes.reduce((acc, a) => acc + a.monto, 0)
  const liquidoAPagar = alcanceLiquido - descuentoAnticipos

  return {
    sueldoBaseProporcional,
    valorHoraOrdinaria,
    montoHorasExtras,
    gratificacionLegal: grat,
    totalImponible,
    totalHaberes,
    montoAFP,
    montoSalud,
    montoSIS,
    montoSeguroCesantia,
    totalDescuentos,
    descuentoAnticipos,
    adelantosIds: input.anticiposPendientes.map(a => a.id),
    alcanceLiquido,
    liquidoAPagar,
  }
}
