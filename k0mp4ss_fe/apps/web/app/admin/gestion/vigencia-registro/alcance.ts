/**
 * Quién administra el Registro desde la PANTALLA (serie «Vigencia del Registro», T6).
 *
 * Las cuatro rutas que consume la pantalla piden `ad` con una acción concreta y
 * NUNCA `ver`:
 *
 *   - `GET /api/vigencia-registro`            → `ad` con `editar`
 *   - `POST …/revalidacion`                   → `ad` con `editar`
 *   - `POST …/avisos`                         → `ad` con `editar`
 *   - `POST …/requerimiento`                  → `ad` con `crear`
 *
 * `ver` no sirve de portón a propósito: el rol `residente` la tiene sobre `ad` y
 * con ella vería el registro de TODAS las unidades, que es justo lo que S5
 * prohíbe. Por eso el portón de la pantalla es `ad:editar` —el mismo que exige
 * la lectura— y el acto de requerir se decide con `ad:crear`.
 *
 * Se declara acá, una sola vez, para que el `page.tsx` y la consola no digan
 * cosas distintas sobre quién puede entrar. La decisión no se reimplementa: sale
 * de la matriz (`tienePermiso`), que es la única fuente.
 */
import { tienePermiso } from "@/lib/authz"

/** El recurso de la matriz que gobierna el Registro de Copropietarios. */
export const RECURSO_VIGENCIA = "ad"

/** `true` si alguno de los roles puede leer y revalidar el Registro. */
export function puedeAdministrarVigencia(roles: string[]): boolean {
  return tienePermiso(roles, "editar", RECURSO_VIGENCIA)
}

/** `true` si alguno de los roles puede requerir la actualización (arranca los 60 días). */
export function puedeRequerirVigencia(roles: string[]): boolean {
  return tienePermiso(roles, "crear", RECURSO_VIGENCIA)
}
