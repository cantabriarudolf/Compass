/**
 * cobro-lineas — el cobro FI como lista de conceptos (S5).
 *
 * Este módulo es deliberadamente chico: este corte NO cambia a ninguno de los
 * 25 lectores de `montoBase`. `lineasDeCobro` es el único acceso que sabe leer
 * las dos formas del cobro:
 *
 * - cobro nuevo: `lineas` con sus conceptos y montos;
 * - cobro legacy (`lineas` NULL): una línea sintética con su `concepto` y
 *   `montoBase`, que es exactamente lo que el cobro significaba.
 *
 * `lineasContradicenMontoBase` le da nombre al invariante que el resto del
 * sistema va a usar: si hay líneas, su suma tiene que ser el total del cobro.
 */
import type { CobroFI, LineaCobroFI } from "@/lib/schemas"

/** Lo mínimo que `lineasDeCobro` necesita de un cobro. */
export type CobroConLineas = Pick<CobroFI, "concepto" | "montoBase" | "lineas">

function sumaDeLineas(lineas: readonly LineaCobroFI[]): number {
  return lineas.reduce((total, linea) => total + linea.monto, 0)
}

/**
 * ¿Las líneas presentes contradicen `montoBase`? La ausencia de líneas no es
 * una contradicción: es la forma legacy de un cobro de una sola línea.
 */
export function lineasContradicenMontoBase(
  lineas: readonly LineaCobroFI[] | null | undefined,
  montoBase: number
): boolean {
  return lineas != null && sumaDeLineas(lineas) !== montoBase
}

/**
 * Las líneas propias del cobro o, si es legacy, la única línea que sus campos
 * ya describían. Nunca inventa conceptos ni montos: el fallback sale del propio
 * cobro.
 */
export function lineasDeCobro(cobro: CobroConLineas): LineaCobroFI[] {
  if (cobro.lineas && cobro.lineas.length > 0) return cobro.lineas
  return [{ concepto: cobro.concepto, monto: cobro.montoBase }]
}
