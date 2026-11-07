/**
 * Alcance por filas de `ir/solicitudes-insumo` — el dueño de la solicitud es
 * `SolicitudInsumoIR.solicitantePersonaId`. El modelo NO tiene `unidadId`
 * (`prisma/schema.prisma`), así que la unidad no sirve como campo de
 * pertenencia: quien pide el insumo es la persona.
 *
 * La matriz (`ir:mantenimiento` ver) decide quién ENTRA; este módulo decide qué
 * FILAS ve. Administrador y comité conservan la comunidad entera (`null`); el
 * residente lee solo lo que pidió su persona, resuelta desde la BD de la sesión
 * (`personaIdDelUsuarioDb`), nunca desde el body/query.
 *
 * La solicitud ajena responde 404 «Registro no encontrado.» y no 403: el 403
 * confirmaría que existe.
 */
import type { Prisma } from "@prisma/client"
import { normalizaRol } from "@/lib/authz"
import { personaIdDelUsuarioDb } from "@/lib/api/sesion-persona"
import type { ComunidadScope } from "@/lib/api/with-comunidad-scope"

/** Roles que ven la comunidad entera (mismo criterio que `certificados-ct`). */
const VE_TODA_LA_COMUNIDAD = new Set(["administrador", "comite"])

function veTodaLaComunidad(scope: ComunidadScope): boolean {
  const rol = normalizaRol(scope.rol) ?? scope.rol.trim().toLowerCase()
  return VE_TODA_LA_COMUNIDAD.has(rol)
}

/**
 * Fragmento de «lo propio», o `null` si el actor ve la comunidad completa.
 *
 * Sin `personaId` en el `Usuario` no hay «lo propio» que comparar: el alcance no
 * acota y se conserva el acceso que el rol ya tenía (el hueco es del alta del
 * usuario sin ficha en el Maestro de Personas, no de la matriz).
 */
export async function alcanceSolicitudesInsumoIR(
  scope: ComunidadScope
): Promise<Prisma.SolicitudInsumoIRWhereInput | null> {
  if (veTodaLaComunidad(scope)) return null
  const personaId = await personaIdDelUsuarioDb(scope.usuarioId)
  if (!personaId) return null
  return { solicitantePersonaId: personaId }
}
