/**
 * Quién lee y quién guarda la credencial de correo de la comunidad desde la
 * PANTALLA (F33 · U5 del plan «saldar-v2-pantallas-y-barrido», S1 y S2).
 *
 * Las tres rutas que consume la pantalla piden el recurso `cf` —el mismo que
 * gobierna la configuración global, que es donde vive el resto del correo: el
 * remitente y el BCC de auditoría— con una acción concreta:
 *
 *   - `GET  /api/configuracion/correo`        → `cf` con `ver`    (entrar y leer)
 *   - `PUT  /api/configuracion/correo`        → `cf` con `editar` (guardar o rotar)
 *   - `POST /api/configuracion/correo/probar` → `cf` con `editar` (probar el envío)
 *
 * Dos acciones y no una: la administración opera la credencial de su comunidad y el
 * comité la LEE para auditarla —la matriz le da `cf` ver y no `cf` editar—, así que
 * el portón de la pantalla es `ver` y guardar/probar se gatean aparte con la acción
 * que exige cada ruta. Es un secreto de la comunidad: leerlo no autoriza a cambiarlo
 * ni a probarlo.
 *
 * No se usa una lista de roles copiada: se declara acá, una sola vez, y sale de la
 * matriz (`tienePermiso`), que es la única fuente. El recurso es el mismo que
 * declaran las rutas: si mañana la matriz habilita otro rol, entra sin tocar este
 * archivo ni la pantalla.
 */
import { tienePermiso } from "@/lib/authz"

/** El recurso de la matriz que gobierna la configuración y la credencial de correo. */
export const RECURSO_CREDENCIAL_CORREO = "cf"

/** `true` si alguno de los roles puede leer la credencial de la comunidad. */
export function puedeVerCredencialCorreo(roles: string[]): boolean {
  return tienePermiso(roles, "ver", RECURSO_CREDENCIAL_CORREO)
}

/** `true` si alguno de los roles puede guardar (o rotar) la credencial y probarla. */
export function puedeEditarCredencialCorreo(roles: string[]): boolean {
  return tienePermiso(roles, "editar", RECURSO_CREDENCIAL_CORREO)
}
