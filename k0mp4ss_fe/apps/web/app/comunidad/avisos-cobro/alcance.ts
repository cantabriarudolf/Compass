/**
 * Quién lee el aviso de cobro desde la PANTALLA (F27).
 *
 * El par de claves es el MISMO que decide la API
 * (`puedeLeerAvisosCobro` en `app/api/avisos-cobro/_alcance.ts`):
 *
 *   - `fi:gasto_comun` ver → gestión (administración y comité): los avisos de la
 *     comunidad completa;
 *   - `fi:aviso:propio` ver → residente: SOLO los avisos de las unidades donde
 *     tiene vínculo vigente. El alcance por fila lo resuelve el servidor en el
 *     `where` de la ruta; la pantalla no filtra nada por su cuenta.
 *
 * Se declara una sola vez, acá, para que el portón del `page.tsx`, el texto de
 * la consola y el menú lateral no puedan decir cosas distintas sobre quién
 * entra. La decisión de rol no se reimplementa: sale de la matriz
 * (`tienePermiso`), que es la única fuente.
 */
import { tienePermiso } from "@/lib/authz"

/** La lectura de la gestión: el aviso es parte del gasto común. */
export const RECURSO_AVISO_GESTION = "fi:gasto_comun"

/** La lectura del residente: el aviso de SU unidad. */
export const RECURSO_AVISO_PROPIO = "fi:aviso:propio"

/** `true` si el rol ve la comunidad completa (y por eso el vacío no es «su unidad»). */
export function esGestionDeAvisos(roles: string[]): boolean {
  return tienePermiso(roles, "ver", RECURSO_AVISO_GESTION)
}

/** `true` si alguno de los roles del usuario puede abrir la pantalla del aviso. */
export function puedeVerAvisosCobro(roles: string[]): boolean {
  return (
    esGestionDeAvisos(roles) || tienePermiso(roles, "ver", RECURSO_AVISO_PROPIO)
  )
}
