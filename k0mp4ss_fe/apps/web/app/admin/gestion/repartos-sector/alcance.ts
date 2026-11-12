/**
 * Quién emite y quién lee el reparto por sector desde la PANTALLA
 * (F32 · U4 del plan «saldar-v2-pantallas-y-barrido», S1 y S2).
 *
 * Las dos rutas que consume la pantalla piden `fi:gasto_comun` con una acción
 * concreta y cada una decide un acto distinto:
 *
 *   - `GET  /api/repartos-sector` → `fi:gasto_comun` con `ver`   (entrar y listar)
 *   - `POST /api/repartos-sector` → `fi:gasto_comun` con `crear` (emitir)
 *
 * Dos claves y no una: la administración emite el reparto (es la configuración de
 * lo que se le va a cargar al sector, la misma clave con la que se declara el
 * presupuesto) y el comité lo LEE — la forma de la ley: el Comité fiscaliza lo que
 * se cobra (Ley 21.442). Por eso el portón de la pantalla es `ver` (el comité entra
 * y lee) y la emisión se gatea aparte con la acción que exige el POST.
 *
 * No se usa una lista de roles copiada: se declara acá, una sola vez, y sale de la
 * matriz (`tienePermiso`), que es la única fuente. El recurso es el mismo
 * `fi:gasto_comun` que declara la ruta: si mañana la matriz habilita otro rol, entra
 * sin tocar este archivo ni la pantalla.
 */
import { tienePermiso } from "@/lib/authz"

/** El recurso de la matriz que gobierna el reparto del gasto de un sector. */
export const RECURSO_REPARTOS_SECTOR = "fi:gasto_comun"

/** `true` si alguno de los roles puede leer los repartos de la comunidad. */
export function puedeVerRepartosSector(roles: string[]): boolean {
  return tienePermiso(roles, "ver", RECURSO_REPARTOS_SECTOR)
}

/** `true` si alguno de los roles puede emitir un reparto por sector. */
export function puedeCrearRepartosSector(roles: string[]): boolean {
  return tienePermiso(roles, "crear", RECURSO_REPARTOS_SECTOR)
}
