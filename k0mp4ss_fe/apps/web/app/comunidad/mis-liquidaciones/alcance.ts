/**
 * Quién lee la liquidación desde la PANTALLA (T10 · serie «Permisos por objeto»).
 *
 * El par de claves es el MISMO que decide la API (`alcanceDeLectura` en
 * `app/api/liquidaciones/route.ts`):
 *
 *   - `pl` ver → gestión (administración): las liquidaciones de toda la
 *     comunidad, con el `where` de la factory;
 *   - `pl:propia` ver → trabajador (hoy conserjería): SOLO la fila de SU
 *     persona, resuelta en el servidor con `personaIdDelUsuarioDb`. El alcance
 *     por fila lo decide el `where` de la ruta; la pantalla no filtra nada por
 *     su cuenta —repetir la regla acá sería una segunda copia capaz de divergir
 *     de la que protege los datos—.
 *
 * Se declara una sola vez, acá, para que el portón del `page.tsx`, el texto de
 * la consola y el menú lateral no puedan decir cosas distintas sobre quién
 * entra. La decisión de rol no se reimplementa: sale de la matriz
 * (`tienePermiso`), que es la única fuente. El administrador entra por su
 * comodín (`*`), no porque su nombre esté escrito en esta lista.
 */
import { tienePermiso } from "@/lib/authz"

/** La lectura de la gestión: la liquidación es parte de las remuneraciones. */
export const RECURSO_LIQUIDACION_GESTION = "pl"

/** La lectura del trabajador: la liquidación de SU persona. */
export const RECURSO_LIQUIDACION_PROPIA = "pl:propia"

/** `true` si el rol ve las liquidaciones de la comunidad (y el vacío no es «tu persona»). */
export function esGestionDeLiquidaciones(roles: string[]): boolean {
  return tienePermiso(roles, "ver", RECURSO_LIQUIDACION_GESTION)
}

/** `true` si alguno de los roles del usuario puede abrir la pantalla. */
export function puedeVerMisLiquidaciones(roles: string[]): boolean {
  return (
    esGestionDeLiquidaciones(roles) ||
    tienePermiso(roles, "ver", RECURSO_LIQUIDACION_PROPIA)
  )
}
