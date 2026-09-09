/**
 * Única fuente de verdad de helpers de fecha (SERIE-PRODUCCION P1).
 *
 * Antes de este módulo, `hoyISO()` estaba duplicado en finanzas-utils
 * (hoyISO), pl-utils (hoyISOPL), personal-utils (hoyISOPE), reporteria-utils
 * (hoyISORE) y como variantes inline en app/. Toda la lib/ y el store pasan
 * por aquí; los duplicados fueron eliminados o reexportados por compatibilidad.
 *
 * Convención: fechas de dominio en formato YYYY-MM-DD (UTC) y timestamps en
 * ISO-8601 completo (UTC). Zona horaria de dominio: Chile (los helpers
 * devuelven UTC; las seeds y APIs ya asumen esta convención).
 */

/** Fecha de hoy en formato YYYY-MM-DD. */
export function hoyISO(): string {
  return new Date().toISOString().slice(0, 10)
}

/** Timestamp ISO-8601 completo (UTC) del momento actual. */
export function ahoraISO(): string {
  return new Date().toISOString()
}

/** Valida que mes esté en 1..12; RangeError si no. */
function validarMes(mes: number): void {
  if (!Number.isInteger(mes) || mes < 1 || mes > 12) {
    throw new RangeError(`Mes fuera de rango: ${mes} (esperado 1-12)`)
  }
}

/**
 * Primer día del mes (YYYY-MM-01). Sin argumentos usa el mes actual.
 * `mes` es 1-12 (validado con RangeError fuera de rango).
 */
export function inicioMesISO(mes?: number, anio?: number): string {
  const ahora = new Date()
  const m = mes ?? ahora.getMonth() + 1
  const a = anio ?? ahora.getFullYear()
  validarMes(m)
  return `${a}-${String(m).padStart(2, "0")}-01`
}

/**
 * Último día del mes (YYYY-MM-DD). Sin argumentos usa el mes actual.
 * Maneja bisiestos correctamente (feb 2024 → 29). `mes` es 1-12 (RangeError
 * fuera de rango).
 */
export function finMesISO(mes?: number, anio?: number): string {
  const ahora = new Date()
  const m = mes ?? ahora.getMonth() + 1
  const a = anio ?? ahora.getFullYear()
  validarMes(m)
  // Día 0 del mes siguiente = último día del mes pedido (UTC).
  const ultimoDia = new Date(Date.UTC(a, m, 0)).getUTCDate()
  return `${a}-${String(m).padStart(2, "0")}-${String(ultimoDia).padStart(2, "0")}`
}
