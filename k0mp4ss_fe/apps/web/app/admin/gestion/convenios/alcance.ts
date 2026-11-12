/**
 * Quién administra los convenios de pago desde la PANTALLA (F29 · U1 del plan
 * «saldar-v2-pantallas-y-barrido»).
 *
 * Las dos rutas que consume la pantalla piden `fi:cobranza` con una acción
 * concreta y cada una decide un acto distinto:
 *
 *   - `GET  /api/convenios`       → `fi:cobranza` con `ver`   (entrar y listar)
 *   - `POST /api/convenios`       → `fi:cobranza` con `crear` (suscribir)
 *   - `POST /api/convenios/pago`  → `fi:cobranza` con `editar` (registrar el pago)
 *
 * Tres claves y no una: la matriz declara `fi:cobranza` para que el comité
 * AUDITE la cobranza (`ver`) sin ejecutarla, y la ley es de esa forma — el
 * administrador celebra el convenio (art. 6 de la Ley 21.442), el comité lo
 * autoriza por el acuerdo. Por eso el portón de la pantalla es `ver` (el comité
 * entra y lee) y el alta y el pago se gatean aparte con la acción que cada ruta
 * exige: `crear` y `editar` no son intercambiables aunque hoy sólo las tenga la
 * administración, y usar `crear` como si fuera `editar` sería una segunda
 * verdad de la guardia del servidor.
 *
 * No se usa una lista de roles copiada: se declara acá, una sola vez, y sale de
 * la matriz (`tienePermiso`), que es la única fuente.
 */
import { tienePermiso } from "@/lib/authz"

/** El recurso de la matriz que gobierna los convenios de pago. */
export const RECURSO_CONVENIOS = "fi:cobranza"

/** `true` si alguno de los roles puede leer los convenios de la comunidad. */
export function puedeVerConvenios(roles: string[]): boolean {
  return tienePermiso(roles, "ver", RECURSO_CONVENIOS)
}

/** `true` si alguno de los roles puede suscribir un convenio de pago. */
export function puedeCrearConvenios(roles: string[]): boolean {
  return tienePermiso(roles, "crear", RECURSO_CONVENIOS)
}

/**
 * `true` si alguno de los roles puede registrar el pago de una cuota.
 *
 * Es `editar` —la acción que exige `POST /api/convenios/pago`—, no `crear`: el
 * pago es un acto sobre un convenio existente y cobrarlo con la clave del alta
 * dejaría entrar el día que un rol tenga `crear` sin `editar`.
 */
export function puedeRegistrarPagoConvenio(roles: string[]): boolean {
  return tienePermiso(roles, "editar", RECURSO_CONVENIOS)
}
