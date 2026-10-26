/**
 * F9 — Aislamiento del módulo QA/dev (pe-paneles-bd, unidad N2).
 *
 * Por qué existe: el módulo de pruebas (`/admin/qa-lab`, `/admin/dev-dashboard`,
 * `/admin/mantenimiento`) opera sobre localStorage y datos TEST, y hasta hoy
 * cualquier usuario autenticado podía abrirlo (el proxy sólo exige sesión).
 * Es un defecto de seguridad, no una preferencia: este módulo no debería ser
 * visible fuera del rol de administración y del entorno de desarrollo.
 *
 * Qué NO protege: nada. Esto es sólo la decisión de UI; las rutas API que
 * consume el módulo (`/api/qa-lab/**`, `/api/dev-dashboard`) llevan su propio
 * candado de entorno (`isWriteApiEnabled` en lib/env-guard.ts) más sesión y
 * permisos. Si alguien pasara por encima de esta función, no gana nada:
 * las APIs responden 404 fuera de desarrollo igual. El opt-in de la lane e2e
 * reusa la semántica ya establecida ahí (`E2E_ALLOW_WRITE_APIS === "1"`)
 * para no inventar un segundo mecanismo.
 *
 * Función pura y testeable: recibe la sesión ya resuelta (roles) y el entorno
 * ya resuelto (esProduccion / optInE2E), sin dependencias de Next.
 */

export interface AccesoModuloQaDev {
  /** Roles de la membresía de la sesión (puede venir vacío o ausente). */
  roles?: string[] | null
  /** true si el entorno efectivo de la app es producción. */
  esProduccion: boolean
  /** true si `E2E_ALLOW_WRITE_APIS === "1"` (opt-in de la lane e2e en CI). */
  optInE2E: boolean
}

/** El rol que opera el módulo QA/dev es administración de la comunidad. */
const ROL_ADMIN = "administrador"

/**
 * Entra al módulo QA/dev sólo si el rol incluye `administrador` Y
 * (no es producción O el opt-in e2e está activo). Un no-administrador
 * nunca entra, ni siquiera con el opt-in activo.
 */
export function puedeVerModuloQaDev({
  roles,
  esProduccion,
  optInE2E,
}: AccesoModuloQaDev): boolean {
  const esAdmin = Array.isArray(roles) && roles.includes(ROL_ADMIN)
  if (!esAdmin) return false
  return !esProduccion || optInE2E
}
