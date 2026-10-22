/**
 * Lectura del QR de la cédula de identidad chilena (PE-visitas).
 *
 * Alcance (decisión del owner, 2026-10-22):
 * - La cédula **nueva** (electrónica, desde dic-2024) imprime en el anverso un
 *   QR que apunta al Registro Civil con el RUN como parámetro:
 *   `https://www.registrocivil.cl/…?RUN=16.444.555-0&type=CEDULA`.
 * - La cédula **anterior** no tiene QR: trae PDF417 en el reverso (propietario
 *   del Registro Civil, sin parser público confiable) y zona MRZ (OCR frágil).
 *   Ninguno de los dos se implementa acá: el flujo cae a búsqueda manual por
 *   RUT, que es el fallback obligatorio.
 * - NFC/chip: no es viable desde un navegador de escritorio.
 *
 * Este módulo es puro y no toca el DOM: recibe el texto crudo del decodificador
 * y devuelve el RUN canónico. La validación del dígito verificador vive en
 * `lib/validacion-rut.ts` y el llamador DEBE aplicarla antes de usar el RUN.
 */
import { normalizarRun } from "@/lib/validacion-rut"

export { normalizarRun, validarRun, variantesRun, mascararRun } from "@/lib/validacion-rut"

/** Parámetro `RUN` (o `run`) de la URL del Registro Civil. */
const PARAMETRO_RUN = /[?&#](?:run)=([^&#\s]+)/i

/**
 * Intenta sacar el RUN del parámetro de una URL del Registro Civil.
 * Devuelve `null` si el texto no trae el parámetro.
 */
function runDesdeUrl(texto: string): string | null {
  const match = PARAMETRO_RUN.exec(texto)
  const crudo = match?.[1]
  if (!crudo) return null
  try {
    return decodeURIComponent(crudo)
  } catch {
    // `%` mal escapado en el QR: se intenta con el valor tal cual.
    return crudo
  }
}

/**
 * Extrae el RUN del texto leído en un QR.
 *
 * Acepta la URL del Registro Civil (`?RUN=…`) y también un RUN pelado con
 * puntos, guion, sin guion o con espacios (`16.444.555-0`, `16444555-0`,
 * `164445550`). Normaliza a `cuerpo-DV` en mayúscula.
 *
 * Devuelve `null` cuando el texto no contiene un RUN: el llamador lo traduce a
 * "el QR no corresponde a una cédula" y NUNCA registra una visita con eso.
 * No valida el módulo 11: eso es `validarRun`.
 */
export function extraerRunDeQr(texto: string): string | null {
  if (typeof texto !== "string") return null
  const bruto = texto.trim()
  if (!bruto) return null

  const desdeUrl = runDesdeUrl(bruto)
  const candidato = desdeUrl ?? bruto
  return normalizarRun(candidato)
}
