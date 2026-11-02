/**
 * perfiles — eje de perfil del dashboard (`dashboard-operativo` T1, S2/S9, D1).
 *
 * D1: el eje es el ROL DE APLICACIÓN, no el cargo de gobernanza. `administrador`
 * y `comite` comparten el panel de gestión (el comité es el receptor legal de la
 * rendición de cuentas, art. 21 Ley 21.442); `conserjeria`, `mantencion` y
 * `residente` conservan una portada operativa acotada. El cargo específico
 * (presidente / tesorero / secretario) desde un maestro directiva queda para una
 * feature posterior.
 *
 * Los roles llegan resueltos del servidor (`app/dashboard/page.tsx` lee
 * `session.user.roles`), así que acá NO hay autenticación: solo la decisión de
 * qué se pinta. Cada panel además declara el permiso que exige su ruta API y lo
 * espeja con `puede()` —la misma matriz pura del servidor—, de modo que la UI
 * nunca monta un hook que la ruta vaya a rechazar con 403.
 */
import { puede } from "@/lib/authz"

export type PerfilDashboard = "gestion" | "operativo"

/** La portada de gestión es la que puede leer finanzas (administrador y comité). */
export function perfilDeRoles(roles: string[]): PerfilDashboard {
  return puedeVer(roles, "ver", "fi") ? "gestion" : "operativo"
}

/**
 * Espejo de la matriz RP del servidor (`lib/authz.ts`) para un rol múltiple.
 * Lo que se pinta no reemplaza el gate de la ruta: solo evita pedir de más.
 */
export function puedeVer(roles: string[], accion: string, recurso: string): boolean {
  return roles.some((rol) => puede(rol, accion, recurso))
}
