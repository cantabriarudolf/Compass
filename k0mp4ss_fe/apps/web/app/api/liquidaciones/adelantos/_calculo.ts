/**
 * _calculo.ts — doctrina de adelantos PL (SERIE-FASE2 §V4). Módulo PURO: sin
 * Prisma, sin store y sin acceso a red, para poder testearlo con valores exactos
 * y reusarlo desde las rutas (alta y liquidación) y desde la página (preview).
 *
 * Decisiones del plan (no reinterpretar, DT ORD 2676/140):
 * - `anticipo_regular` = pago anticipado de lo devengado → se descuenta **100%**
 *   en la liquidación siguiente y **no** es descuento del art. 58 (sin tope 15%).
 * - `prestamo` = deuda con acuerdo escrito → tope **15%** de la remuneración
 *   bruta del período y **45% conjunto** con el resto de deducciones (art. 58
 *   inc. 3 y 4).
 * - Si el líquido no alcanza, el saldo **arrastra** al período siguiente con alerta.
 *
 * Prelación propia de esta ventana (no la fija el plan; se declara acá y en el
 * reporte): el préstamo va primero —es la deducción que la ley permite y topa—
 * y el anticipo regular se lleva lo que quede del líquido. Si el anticipo no
 * cabe completo, arrastra saldo; nunca se deja el líquido en negativo.
 */
import type { PactoAdelantoPL } from "@/lib/schemas"

/** Tope mensual del préstamo: 15% de la remuneración bruta (art. 58 inc. 3). */
export const TOPE_PRESTAMO_PCT = 0.15
/** Tope conjunto de deducciones: 45% de la remuneración bruta (art. 58 inc. 4). */
export const TOPE_CONJUNTO_PCT = 0.45

export type EstadoDeduccionAdelantoPL =
  | "pendiente"
  | "descontado_parcial"
  | "saldado"

/** Adelanto imputable: lo mínimo que el cálculo necesita de la fila. */
export interface AdelantoImputablePL {
  id: string
  pacto: PactoAdelantoPL
  saldo: number
  periodoImputacion?: string | null
}

/** Fila mínima para derivar saldo y aplicabilidad (sirve para filas Prisma y del store). */
export interface AdelantoConSaldoPL {
  monto: number
  saldo?: number | null
  estado: string
  periodoImputacion?: string | null
}

/** Normaliza el pacto: cualquier valor distinto de `prestamo` es anticipo regular. */
export function pactoDeAdelanto(pacto: string | null | undefined): PactoAdelantoPL {
  return pacto === "prestamo" ? "prestamo" : "anticipo_regular"
}

/**
 * Saldo vivo del adelanto. Los adelantos legados (pre §V4) no traen saldo (0) y
 * nacieron pendientes por su monto completo: sin este fallback nunca se
 * descontarían. Un adelanto liquidado/desestimado no tiene saldo vivo.
 */
export function saldoVivoAdelanto(adelanto: AdelantoConSaldoPL): number {
  if (adelanto.estado !== "pendiente" && adelanto.estado !== "descontado_parcial") {
    return 0
  }
  const saldo = adelanto.saldo ?? 0
  if (saldo > 0) return Math.round(saldo)
  return Math.max(0, Math.round(adelanto.monto))
}

/**
 * ¿El adelanto se imputa en este período? Sin período (legado) se imputa en la
 * liquidación siguiente que se genere; con período, cuando el período llegó o
 * pasó (un saldo arrastrado de un mes anterior sigue vigente).
 */
export function adelantoImputableAlPeriodo(
  adelanto: { periodoImputacion?: string | null },
  periodo: string
): boolean {
  const imputacion = (adelanto.periodoImputacion ?? "").trim()
  if (imputacion === "") return true
  return imputacion <= periodo
}

/** Tope del préstamo para un período (15% de la remuneración bruta). */
export function topePrestamoDelPeriodo(remuneracionBruta: number): number {
  if (!(remuneracionBruta > 0)) return 0
  return Math.round(remuneracionBruta * TOPE_PRESTAMO_PCT)
}

/** Tope conjunto de deducciones para un período (45% de la remuneración bruta). */
export function topeConjuntoDelPeriodo(remuneracionBruta: number): number {
  if (!(remuneracionBruta > 0)) return 0
  return Math.round(remuneracionBruta * TOPE_CONJUNTO_PCT)
}

/** Orden determinista del descuento: período de imputación y luego id. */
function ordenarAdelantos<T extends AdelantoImputablePL>(adelantos: T[]): T[] {
  return [...adelantos].sort((a, b) => {
    const pa = a.periodoImputacion ?? ""
    const pb = b.periodoImputacion ?? ""
    if (pa !== pb) return pa < pb ? -1 : 1
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  })
}

export interface EntradaCalculoAdelantosPL {
  /** Remuneración bruta del período (total de haberes de la liquidación). */
  remuneracionBruta: number
  /** Descuentos legales ya calculados (AFP, salud, SIS, cesantía, APV). */
  deduccionesLegales: number
  /** Otras deducciones no legales ya registradas en el período. */
  otrosDescuentos?: number
  /** Líquido disponible antes de adelantos (haberes − descuentos legales). */
  alcanceLiquido: number
  /** Adelantos vigentes que aplican al período. */
  adelantos: AdelantoImputablePL[]
}

export interface DeduccionAdelantoPL {
  id: string
  pacto: PactoAdelantoPL
  saldoPrevio: number
  /** Monto descontado en esta liquidación. */
  monto: number
  saldoResultante: number
  estado: EstadoDeduccionAdelantoPL
  /** Saldo que arrastra al período siguiente (0 si se saldó). */
  arrastre: number
}

export interface ResultadoCalculoAdelantosPL {
  deducciones: DeduccionAdelantoPL[]
  descuentoAnticipo: number
  descuentoPrestamo: number
  descuentoTotal: number
  adelantosIds: string[]
  /** 15% y 45% de la remuneración bruta del período. */
  topePrestamo: number
  topeConjunto: number
  /** Lo que queda del 45% después de las deducciones ya registradas. */
  margenConjunto: number
  /** Saldo total que arrastra al período siguiente. */
  arrastreTotal: number
  alertas: string[]
}

function estadoPorMonto(
  monto: number,
  saldoPrevio: number
): EstadoDeduccionAdelantoPL {
  if (monto <= 0) return "pendiente"
  if (monto >= saldoPrevio) return "saldado"
  return "descontado_parcial"
}

/**
 * Calcula cuánto se descuenta de cada adelanto en la liquidación del período.
 *
 * Prelación: descuentos legales (ya calculados fuera) → préstamos (tope 15% y
 * margen del 45% conjunto) → anticipos regulares (100% de lo que el líquido
 * permita) → arrastre del saldo restante con alerta.
 */
export function calcularDeduccionAdelantos(
  input: EntradaCalculoAdelantosPL
): ResultadoCalculoAdelantosPL {
  const bruta = Math.max(0, input.remuneracionBruta)
  const topePrestamo = topePrestamoDelPeriodo(bruta)
  const topeConjunto = topeConjuntoDelPeriodo(bruta)
  const legales = Math.max(0, input.deduccionesLegales)
  const otros = Math.max(0, input.otrosDescuentos ?? 0)
  // El 45% es el techo del TOTAL de deducciones del período: legales + otras + préstamos.
  const margenConjunto = Math.max(0, topeConjunto - legales - otros)
  let liquido = Math.max(0, Math.round(input.alcanceLiquido))

  const prestamos = ordenarAdelantos(
    input.adelantos.filter((a) => a.pacto === "prestamo")
  )
  const anticipos = ordenarAdelantos(
    input.adelantos.filter((a) => a.pacto !== "prestamo")
  )

  let topePrestamoRestante = topePrestamo
  let margenRestante = margenConjunto
  const deducciones: DeduccionAdelantoPL[] = []
  const alertas: string[] = []

  const aplicar = (
    adelanto: AdelantoImputablePL,
    tope: number
  ): number => {
    const saldoPrevio = Math.max(0, Math.round(adelanto.saldo))
    const monto = Math.max(
      0,
      Math.round(Math.min(saldoPrevio, tope, liquido))
    )
    const saldoResultante = Math.max(0, saldoPrevio - monto)
    deducciones.push({
      id: adelanto.id,
      pacto: adelanto.pacto,
      saldoPrevio,
      monto,
      saldoResultante,
      estado: estadoPorMonto(monto, saldoPrevio),
      arrastre: saldoResultante,
    })
    liquido -= monto
    return monto
  }

  let descuentoPrestamo = 0
  for (const prestamo of prestamos) {
    const tope = Math.min(topePrestamoRestante, margenRestante)
    const monto = aplicar(prestamo, tope)
    topePrestamoRestante -= monto
    margenRestante -= monto
    descuentoPrestamo += monto
  }

  let descuentoAnticipo = 0
  for (const anticipo of anticipos) {
    descuentoAnticipo += aplicar(anticipo, liquido)
  }

  const arrastreTotal = deducciones.reduce((acc, d) => acc + d.arrastre, 0)
  for (const d of deducciones) {
    if (d.arrastre > 0 && d.monto > 0) {
      alertas.push(
        `El líquido del período no alcanza para ${d.pacto === "prestamo" ? "el préstamo" : "el anticipo"} ${d.id}: arrastra $${d.arrastre.toLocaleString("es-CL")} al período siguiente.`
      )
    } else if (d.arrastre > 0 && d.monto === 0) {
      alertas.push(
        `${d.pacto === "prestamo" ? "El préstamo" : "El anticipo"} ${d.id} no se pudo descontar en este período: arrastra $${d.arrastre.toLocaleString("es-CL")}.`
      )
    }
  }
  if (descuentoPrestamo >= topePrestamo && topePrestamo > 0) {
    const sinDeducir = deducciones
      .filter((d) => d.pacto === "prestamo" && d.arrastre > 0)
      .reduce((acc, d) => acc + d.arrastre, 0)
    if (sinDeducir > 0) {
      alertas.push(
        `El préstamo topó el 15% de la remuneración bruta ($${topePrestamo.toLocaleString("es-CL")}): quedan $${sinDeducir.toLocaleString("es-CL")} para los períodos siguientes.`
      )
    }
  }

  return {
    deducciones,
    descuentoAnticipo,
    descuentoPrestamo,
    descuentoTotal: descuentoAnticipo + descuentoPrestamo,
    adelantosIds: deducciones.filter((d) => d.monto > 0).map((d) => d.id),
    topePrestamo,
    topeConjunto,
    margenConjunto,
    arrastreTotal,
    alertas,
  }
}

export interface EntradaValidacionAdelantoPL {
  pacto: PactoAdelantoPL
  monto: number
  /** Remuneración bruta del período de imputación (líquida o de la ficha). */
  remuneracionBruta: number
  /** Deducciones ya registradas para el período (legales + otras). */
  deduccionesRegistradas: number
  /** Cuotas de préstamo ya comprometidas para el período (otros préstamos). */
  cuotasPrestamoDelPeriodo: number
}

export type ResultadoValidacionAdelantoPL =
  | { ok: true; topePrestamo: number; topeConjunto: number }
  | { ok: false; status: 400; error: string }

const clp = (n: number): string => `$${Math.round(n).toLocaleString("es-CL")}`

/**
 * Valida los topes del art. 58 al dar de alta un adelanto.
 *
 * - anticipo regular: sin tope (no es descuento del art. 58).
 * - préstamo: exige remuneración bruta conocida; el monto a descontar no puede
 *   superar el 15% de esa bruta ni hacer que el total de deducciones del período
 *   pase del 45% conjunto.
 */
export function validarTopeAdelanto(
  input: EntradaValidacionAdelantoPL
): ResultadoValidacionAdelantoPL {
  const bruta = Math.max(0, input.remuneracionBruta)
  const topePrestamo = topePrestamoDelPeriodo(bruta)
  const topeConjunto = topeConjuntoDelPeriodo(bruta)
  if (input.pacto !== "prestamo") return { ok: true, topePrestamo, topeConjunto }
  if (!(bruta > 0)) {
    return {
      ok: false,
      status: 400,
      error:
        "No se puede validar el tope del 15%: el trabajador no tiene remuneración bruta registrada para el período.",
    }
  }
  const monto = Math.max(0, Math.round(input.monto))
  if (monto > topePrestamo) {
    return {
      ok: false,
      status: 400,
      error: `El préstamo de ${clp(monto)} supera el tope mensual del 15% de la remuneración bruta del período (${clp(topePrestamo)}): regístralo como anticipo regular o difiere el excedente a otro período.`,
    }
  }
  const total = Math.round(
    input.deduccionesRegistradas + input.cuotasPrestamoDelPeriodo + monto
  )
  if (total > topeConjunto) {
    return {
      ok: false,
      status: 400,
      error: `Las deducciones del período (${clp(total)}) superan el tope conjunto del 45% de la remuneración bruta (${clp(topeConjunto)}) — art. 58 inc. 4.`,
    }
  }
  return { ok: true, topePrestamo, topeConjunto }
}
