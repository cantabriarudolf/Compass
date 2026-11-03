/**
 * _folio — folio del libro de actas GD (Ley 21.442, art. 15: libro foliado).
 *
 * Formato `AD-<año>-<correlativo de 4 dígitos>`: legible (se dicta y se cita),
 * ordenable (el año y el correlativo van con ancho fijo) y por comunidad. El
 * contador se reinicia con cada año, igual que un libro foliado por tomo: dos
 * actas del mismo año nunca comparten número y el año encabeza el orden.
 *
 * Módulo PURO a propósito: lo usan el POST de `/api/actas-gd` y el backfill
 * (`scripts/backfill-folio-actas.ts`), así que el formato vive en un solo lugar.
 * El prefijo `_` es la convención del proyecto para módulos que no son rutas
 * (ver `app/api/cv/_actas.ts`).
 */

/** Prefijo del folio de un acta de directiva (AD). */
export const PREFIJO_FOLIO_ACTA = "AD"

/** Ancho del correlativo: 4 dígitos (`0001` … `9999`). */
const ANCHO_CORRELATIVO = 4

/** Folio bien formado: `AD-<4 dígitos de año>-<4 o más dígitos>`. */
const FORMATO_FOLIO_ACTA = /^AD-(\d{4})-(\d{4,})$/

/** Año del folio: los 4 primeros dígitos de la fecha del acta (`AAAA-MM-DD`). */
export function anioDeFecha(fecha: string): string {
  return fecha.slice(0, 4)
}

/** Arma el folio a partir del año y del correlativo (sin ceros perdidos). */
export function formatearFolio(anio: string, correlativo: number): string {
  return `${PREFIJO_FOLIO_ACTA}-${anio}-${String(correlativo).padStart(ANCHO_CORRELATIVO, "0")}`
}

/** ¿El valor ya tiene la forma de un folio de acta? */
export function esFolioActa(folio: string): boolean {
  return FORMATO_FOLIO_ACTA.test(folio)
}

/**
 * Siguiente folio de un año: `max(correlativo del año) + 1`.
 *
 * Se calcula sobre los folios YA asignados de la comunidad, así que nunca
 * repite un número dentro del mismo año. Ignora los folios de otros años y los
 * valores que no cumplen el formato (una fila vieja o un dato importado no debe
 * envenenar el contador). No es, por sí solo, la garantía contra la carrera:
 * eso lo resuelve el índice único `(comunidadId, folio)` + el reintento del
 * POST (mismo patrón que el folio `CT-####` de certificados).
 */
export function siguienteFolioActa(
  folios: readonly (string | null | undefined)[],
  anio: string
): string {
  let maximo = 0
  for (const folio of folios) {
    if (!folio) continue
    const partes = FORMATO_FOLIO_ACTA.exec(folio)
    if (!partes || partes[1] !== anio) continue
    const correlativo = Number.parseInt(partes[2]!, 10)
    if (Number.isFinite(correlativo) && correlativo > maximo) maximo = correlativo
  }
  return formatearFolio(anio, maximo + 1)
}
