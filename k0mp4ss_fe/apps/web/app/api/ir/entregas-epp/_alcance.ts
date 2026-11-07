/**
 * Alcance por filas de `ir/entregas-epp` — el dueño de la entrega es
 * `EntregaEPP.personaId` (a quién se le entregó el equipo).
 *
 * La matriz (`ir:mantenimiento` ver) decide quién ENTRA a la ruta; este módulo
 * decide qué FILAS ve. Administrador y comité conservan la visión de toda la
 * comunidad (`null` = sin restricción por fila, comportamiento de siempre). El
 * resto —el residente— lee solo las entregas hechas a su persona, y esa persona
 * sale de la BD de la sesión (`personaIdDelUsuarioDb`), nunca del body/query.
 *
 * La entrega ajena responde 404 «Registro no encontrado.» y no 403: el 403
 * confirmaría que la fila existe (mismo criterio que certificados, liquidaciones
 * y notificaciones).
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
 * Sin `personaId` en el `Usuario` no hay «lo propio» que comparar. Ahí el
 * alcance no puede acotar nada y se conserva el acceso que el rol ya tenía: el
 * hueco no es de permisos sino del alta del usuario (una sesión sin ficha en el
 * Maestro de Personas), y cerrarlo exige que todo `Usuario` tenga persona, que
 * es otro cambio. `test/api/ir-entregas-epp-item.test.ts` fija hoy ese caso.
 */
export async function alcanceEntregasEPP(
  scope: ComunidadScope
): Promise<Prisma.EntregaEPPWhereInput | null> {
  if (veTodaLaComunidad(scope)) return null
  const personaId = await personaIdDelUsuarioDb(scope.usuarioId)
  if (!personaId) return null
  return { personaId }
}
