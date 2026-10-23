/**
 * métricas-utils — cálculos puros de Auditoría y Métricas (AM).
 *
 * Existe porque `/admin/metricas` mostraba `+7.2%` de variación tarifaria escrito
 * a mano: un número que no salía de ningún dato del sistema. Decisión del owner
 * (PENDIENTES-FUNCIONALIDAD F2): calcularlo de las emisiones y, si no hay datos
 * comparables, **no mostrar número** en vez de inventar uno.
 */

/** Lo mínimo que necesita el cálculo: el periodo y el gasto emitido. */
export interface EmisionParaVariacion {
  /** Periodo de la emisión, formato `AAAA-MM`. */
  periodo: string
  gastoTotal: number
}

export interface VariacionTarifaria {
  /** Variación porcentual con un decimal; `10.5` es un alza del 10,5 %. */
  porcentaje: number
  periodoActual: string
  periodoAnterior: string
  gastoActual: number
  gastoAnterior: number
}

const PERIODO_VALIDO = /^\d{4}-\d{2}$/

/**
 * Variación entre los dos últimos periodos con gasto emitido.
 *
 * Devuelve `null` (sin número en pantalla) cuando no hay dos periodos comparables.
 * Un periodo repetido se resuelve con la última emisión de la lista: es la
 * vigente de ese periodo, no la suma de correcciones. Los periodos sin gasto se
 * ignoran para no dividir por cero.
 */
export function variacionTarifaria(
  emisiones: readonly EmisionParaVariacion[]
): VariacionTarifaria | null {
  const porPeriodo = new Map<string, number>()
  for (const emision of emisiones) {
    if (!PERIODO_VALIDO.test(emision.periodo)) continue
    if (!Number.isFinite(emision.gastoTotal) || emision.gastoTotal <= 0) continue
    porPeriodo.set(emision.periodo, emision.gastoTotal)
  }

  // `AAAA-MM` ordena cronológicamente como string: el comparador explícito
  // documenta la intención y evita que un cambio de formato lo rompa en silencio.
  const periodos = [...porPeriodo.keys()].sort((a, b) => a.localeCompare(b))
  if (periodos.length < 2) return null

  // `noUncheckedIndexedAccess` está activo: el acceso por índice devuelve
  // `string | undefined`, así que se angosta antes de usarlo como clave.
  const periodoActual = periodos.at(-1)
  const periodoAnterior = periodos.at(-2)
  if (periodoActual === undefined || periodoAnterior === undefined) return null

  const gastoActual = porPeriodo.get(periodoActual)
  const gastoAnterior = porPeriodo.get(periodoAnterior)
  if (gastoActual === undefined || gastoAnterior === undefined || gastoAnterior === 0) {
    return null
  }

  const porcentaje = Math.round(((gastoActual - gastoAnterior) / gastoAnterior) * 1000) / 10
  return { porcentaje, periodoActual, periodoAnterior, gastoActual, gastoAnterior }
}
