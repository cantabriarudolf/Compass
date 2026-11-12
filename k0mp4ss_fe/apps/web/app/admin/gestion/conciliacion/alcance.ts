/**
 * Quién administra la conciliación bancaria desde la PANTALLA (F30 · U2 del plan
 * «saldar-v2-pantallas-y-barrido»).
 *
 * Las tres rutas que consume la pantalla piden `fi:cobranza` con una acción
 * concreta y cada una decide un acto distinto:
 *
 *   - `GET  /api/conciliacion`           → `fi:cobranza` con `ver`   (entrar y leer)
 *   - `POST /api/conciliacion/importar`  → `fi:cobranza` con `crear` (importar la cartola)
 *   - `POST /api/conciliacion/resolver`  → `fi:cobranza` con `editar` (resolver la cola)
 *
 * Tres claves y no una: la matriz declara `fi:cobranza` para que el comité
 * AUDITE la cobranza (`ver`) sin ejecutarla — conciliar es el acto que decide qué
 * unidad pagó y qué egreso se cubrió—. Por eso el portón de la pantalla es `ver`
 * y la importación y la resolución se gatean aparte con la acción que cada ruta
 * exige: `crear` y `editar` no son intercambiables, y usar una como si fuera la
 * otra sería una segunda verdad de la guardia del servidor.
 *
 * No se usa una lista de roles copiada: se declara acá, una sola vez, y sale de
 * la matriz (`tienePermiso`), que es la única fuente.
 */
import { tienePermiso } from "@/lib/authz"

/** El recurso de la matriz que gobierna la conciliación bancaria. */
export const RECURSO_CONCILIACION = "fi:cobranza"

/** `true` si alguno de los roles puede leer las cartolas de la comunidad. */
export function puedeVerConciliacion(roles: string[]): boolean {
  return tienePermiso(roles, "ver", RECURSO_CONCILIACION)
}

/** `true` si alguno de los roles puede importar una cartola del banco. */
export function puedeImportarCartola(roles: string[]): boolean {
  return tienePermiso(roles, "crear", RECURSO_CONCILIACION)
}

/**
 * `true` si alguno de los roles puede resolver un movimiento de la cola.
 *
 * Es `editar` —la acción que exige `POST /api/conciliacion/resolver`—, no `crear`:
 * resolver la cola es un acto sobre una cartola existente y cobrarlo con la clave
 * de la importación dejaría entrar el día que un rol tenga `crear` sin `editar`.
 */
export function puedeResolverMovimiento(roles: string[]): boolean {
  return tienePermiso(roles, "editar", RECURSO_CONCILIACION)
}
