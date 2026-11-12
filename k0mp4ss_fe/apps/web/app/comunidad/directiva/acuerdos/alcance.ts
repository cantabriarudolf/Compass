/**
 * Quién entra al registro de acuerdos desde la PANTALLA (U3b).
 *
 * Las dos rutas que consume la pantalla piden el recurso `gd` —el mismo de las
 * actas— con una acción concreta:
 *
 *   - `GET  /api/acuerdos`  → `gd` con `ver`
 *   - `POST /api/acuerdos`  → `gd` con `crear`
 *
 * Se declara acá, una sola vez, para que el `page.tsx` y la consola no digan
 * cosas distintas sobre quién puede hacer qué. La decisión no se reimplementa:
 * sale de la matriz (`tienePermiso`), que es la única fuente.
 *
 * Lo que NO se decide acá es quién puede VOTAR: eso lo resuelve el servidor con
 * la sesión y los vínculos en la base (miembro vigente del comité o propietario
 * vigente en la asamblea). La pantalla ofrece el voto mientras el acuerdo esté
 * `abierto` y deja que la API diga 403/409 con su mensaje: duplicar en el
 * navegador la elegibilidad sería una segunda verdad capaz de divergir.
 */
import { tienePermiso } from "@/lib/authz"

/** El recurso de la matriz que gobierna el registro de acuerdos. */
export const RECURSO_ACUERDOS = "gd"

/** `true` si alguno de los roles puede leer el registro de la comunidad. */
export function puedeVerRegistroAcuerdos(roles: string[]): boolean {
  return tienePermiso(roles, "editar", RECURSO_ACUERDOS)
}

/** `true` si alguno de los roles puede registrar un acuerdo (comité y administración). */
export function puedeRegistrarAcuerdos(roles: string[]): boolean {
  return tienePermiso(roles, "crear", RECURSO_ACUERDOS)
}
