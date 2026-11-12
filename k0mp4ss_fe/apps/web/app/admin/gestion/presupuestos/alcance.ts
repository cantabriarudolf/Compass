/**
 * Quién registra y quién lee el presupuesto por partidas desde la PANTALLA
 * (F31 · U3 del plan «saldar-v2-pantallas-y-barrido»).
 *
 * Las dos rutas que consume la pantalla piden `fi:gasto_comun` con una acción
 * concreta y cada una decide un acto distinto:
 *
 *   - `GET  /api/presupuestos` → `fi:gasto_comun` con `ver`   (entrar y listar)
 *   - `POST /api/presupuestos` → `fi:gasto_comun` con `crear` (registrar)
 *
 * Dos claves y no una: la matriz declara `fi:gasto_comun` para que el comité LEA
 * lo que se va a cobrar como gasto común (`ver`) sin registrarlo, y la forma de
 * la ley es esa — el presupuesto lo registra quien administra y el cuerpo que lo
 * aprueba queda citado por el acuerdo (Ley 21.442 arts. 15 y 17), no por quién
 * escribe la fila. Por eso el portón de la pantalla es `ver` (el comité entra y
 * lee) y el alta se gatea aparte con la acción que la ruta exige.
 *
 * No se usa una lista de roles copiada: se declara acá, una sola vez, y sale de
 * la matriz (`tienePermiso`), que es la única fuente.
 */
import { tienePermiso } from "@/lib/authz"

/** El recurso de la matriz que gobierna el presupuesto por partidas. */
export const RECURSO_PRESUPUESTOS = "fi:gasto_comun"

/** `true` si alguno de los roles puede leer el presupuesto de la comunidad. */
export function puedeVerPresupuestos(roles: string[]): boolean {
  return tienePermiso(roles, "ver", RECURSO_PRESUPUESTOS)
}

/** `true` si alguno de los roles puede registrar un presupuesto por partidas. */
export function puedeCrearPresupuestos(roles: string[]): boolean {
  return tienePermiso(roles, "crear", RECURSO_PRESUPUESTOS)
}
