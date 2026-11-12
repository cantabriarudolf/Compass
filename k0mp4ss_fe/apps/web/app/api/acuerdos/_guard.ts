/**
 * _guard — autorización del registro de acuerdos de gobernanza (U3).
 *
 * La autorización vive en la MATRIZ de `lib/authz.ts` (H5: sin bypass) y el
 * registro usa el recurso `gd`, el mismo de las actas: registrar un acuerdo es
 * un acto de gobernanza del comité y de la administración, no de la operación
 * diaria. `crear` lo tienen el comité y el administrador (wildcard); ningún otro
 * rol. El votante NO se autoriza acá: sale de la sesión y de los vínculos en la
 * base, en `[id]/voto/route.ts`.
 */
import { puede } from "@/lib/authz"
import type { Accion } from "@/lib/authz"

/** ¿El rol puede gestionar el registro de acuerdos con esta acción? */
export function puedeGestionarAcuerdos(rol: string, accion: Accion): boolean {
  return puede(rol, accion, "gd")
}
