/**
 * _folio — folio del libro de acuerdos de gobernanza (Ley 21.442, art. 15).
 *
 * Formato `AD-<año>-<correlativo de 4 dígitos>`: el mismo patrón del libro de
 * actas (`app/api/actas-gd/_folio.ts`), con su PROPIO contador — el libro de
 * acuerdos es otro libro, y su índice único es `(comunidadId, folio)` en la
 * tabla `acuerdos`. El folio es legible (se dicta y se cita), ordenable (año y
 * correlativo con ancho fijo) y por comunidad; el contador se reinicia con cada
 * año, como un libro foliado por tomo.
 *
 * Módulo PURO: lo usa el POST de `/api/acuerdos`, así que el formato vive en un
 * solo lugar y se puede probar sin base.
 */

/** Prefijo del folio de un acuerdo (mismo patrón que el acta: AD). */
export const PREFIJO_FOLIO_ACUERDO = "AD"

/** Ancho del correlativo: 4 dígitos (`0001` … `9999`). */
const ANCHO_CORRELATIVO = 4

/** Folio bien formado: `AD-<4 dígitos de año>-<4 o más dígitos>`. */
const FORMATO_FOLIO_ACUERDO = /^AD-(\d{4})-(\d{4,})$/

/** Año del folio: los 4 primeros dígitos de una fecha `AAAA-MM-DD`. */
export function anioDeFecha(fecha: string): string {
  return fecha.slice(0, 4)
}

/** Arma el folio a partir del año y del correlativo. */
export function formatearFolioAcuerdo(anio: string, correlativo: number): string {
  return `${PREFIJO_FOLIO_ACUERDO}-${anio}-${String(correlativo).padStart(ANCHO_CORRELATIVO, "0")}`
}

/** ¿El valor ya tiene la forma de un folio de acuerdo? */
export function esFolioAcuerdo(folio: string): boolean {
  return FORMATO_FOLIO_ACUERDO.test(folio)
}

/**
 * Siguiente folio de un año: `max(correlativo del año) + 1` sobre los folios ya
 * asignados de la comunidad. Ignora los folios de otros años y los valores que no
 * cumplen el formato (una fila vieja o un dato importado no debe envenenar el
 * contador). No es, por sí solo, la garantía contra la carrera: eso lo resuelve
 * el índice único `(comunidadId, folio)` + el reintento del POST.
 */
export function siguienteFolioAcuerdo(
  folios: readonly (string | null | undefined)[],
  anio: string
): string {
  let maximo = 0
  for (const folio of folios) {
    if (!folio) continue
    const partes = FORMATO_FOLIO_ACUERDO.exec(folio)
    if (!partes || partes[1] !== anio) continue
    const correlativo = Number.parseInt(partes[2]!, 10)
    if (Number.isFinite(correlativo) && correlativo > maximo) maximo = correlativo
  }
  return formatearFolioAcuerdo(anio, maximo + 1)
}
