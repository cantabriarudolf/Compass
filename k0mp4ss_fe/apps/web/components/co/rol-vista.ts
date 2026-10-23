/**
 * rol-vista — qué pantalla de Comunicación con Vecinos (CO) corresponde al rol
 * de la sesión (change co-lectura-residente, tarea 1.7 · decisión D1).
 *
 * Antes existía un `<Select>` «Vista: Administración | Directiva | Vecino» en el
 * cliente: un toggle que gobernaba el filtro de alcance es autorización por UI
 * (defecto D-2 del proposal). Acá el rol llega resuelto del servidor y no hay
 * ningún valor que el usuario pueda elegir.
 *
 * La matriz de permisos es la fuente de verdad: un rol que no tiene `co` ver no
 * recibe ni consola ni bandeja, en vez de una lista de roles copiada a mano.
 */
import { normalizaRol, puede } from "@/lib/authz"

export type RolVistaCO = "administrador" | "comite" | "residente" | "sin-acceso"

/** Roles que se renderizan con la bandeja (nunca con la consola). */
export type RolBandejaCO = "comite" | "residente"

/**
 * Vista de CO para los roles de la sesión. Acepta el arreglo de roles del token
 * o un solo rol (la membresía que resuelve `withComunidadScope`).
 *
 * Precedencia explícita y de mayor a menor privilegio; cualquier rol con
 * `co` ver que no sea administrador ni comité cae al menor privilegio (bandeja
 * propia, con el alcance filtrado en el servidor).
 */
export function rolVistaCO(roles: string | string[]): RolVistaCO {
  const lista = (Array.isArray(roles) ? roles : [roles]).filter((rol) =>
    puede(rol, "ver", "co")
  )
  if (lista.length === 0) return "sin-acceso"
  if (lista.some((rol) => normalizaRol(rol) === "administrador")) return "administrador"
  if (lista.some((rol) => normalizaRol(rol) === "comite")) return "comite"
  return "residente"
}
