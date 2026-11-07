/**
 * sesion-persona — identidad MP del usuario autenticado y sus unidades vinculadas.
 *
 * Helpers transversales de las API routes (servidor): resuelven el `personaId`
 * del Maestro de Personas y los vínculos vigentes del usuario de sesión, que es
 * lo que necesitan las reglas ABAC "solo lo propio" (notificaciones, apelaciones,
 * certificados, controles de propiedad).
 *
 * Regla: el cliente nunca aporta su personaId ni su unidadId; ambos salen de la
 * membresía/vínculos en BD (igual criterio que with-comunidad-scope).
 */
import { normalizaRol } from "@/lib/authz"
import { prisma } from "@/lib/prisma"
import type { ComunidadScope } from "@/lib/api/with-comunidad-scope"

/** personaId (MP) del usuario de sesión, o null. */
export async function personaIdDelUsuarioDb(
  usuarioId: string
): Promise<string | null> {
  const usuario = await prisma.usuario.findUnique({
    where: { id: usuarioId },
    select: { personaId: true },
  })
  return usuario?.personaId ?? null
}

/** Unidades con vínculo vigente del usuario (ABAC "solo lo propio"). */
export async function unidadesVinculadasDb(
  personaId: string,
  comunidadId: string
): Promise<string[]> {
  const vinculos = await prisma.vinculoUnidad.findMany({
    where: { personaId, comunidadId, fechaFin: null },
    select: { unidadId: true },
  })
  return [...new Set(vinculos.map((v) => v.unidadId))]
}

/**
 * Roles que NO están acotados por fila: ven y escriben la comunidad entera.
 *
 * La lista es la misma de `alcanceCertificadosCT`
 * (`app/api/certificados-ct/route.ts`) y la de toda la serie «permisos por
 * objeto»: administrador y comité.
 */
export const ROLES_CON_ALCANCE_DE_COMUNIDAD = new Set(["administrador", "comite"])

/**
 * Decisión de alcance por filas de una sesión, en tres estados:
 *
 * - `comunidad`: el rol no está acotado por fila (administrador, comité) → el
 *   `where` no lleva fragmento.
 * - `denegado`: el rol SÍ está acotado por fila pero el `Usuario` no tiene
 *   `personaId` en el Maestro de Personas → no hay «lo propio» que comparar, así
 *   que no hay fila que pueda ver ni escribir (falla CERRADO).
 * - `propio`: rol acotado con identidad → el recurso compone su fragmento con
 *   este `personaId`.
 *
 * Por qué `denegado` y no «sin restricción»: devolver `null` para una sesión sin
 * identidad le abría la comunidad ENTERA a un rol acotado (fail-open). El hueco
 * es del alta del usuario (una sesión sin ficha en el Maestro de Personas), pero
 * el permiso no puede decidirse por «personaId es null»: se decide por ROL. La
 * decisión vive acá, una sola vez, y la consumen los `_alcance.ts` de los
 * recursos con dueño por fila.
 */
export type AlcancePorFilasDeSesion =
  | { tipo: "comunidad" }
  | { tipo: "denegado" }
  | { tipo: "propio"; personaId: string }

/**
 * Resuelve la decisión de alcance por filas de la sesión (ver
 * `AlcancePorFilasDeSesion`). `rol` sale de la membresía, `personaId` de la BD:
 * ninguno de los dos se acepta del body ni del query.
 */
export async function alcancePorFilasDeSesion(
  scope: ComunidadScope
): Promise<AlcancePorFilasDeSesion> {
  const rol = normalizaRol(scope.rol) ?? scope.rol.trim().toLowerCase()
  if (ROLES_CON_ALCANCE_DE_COMUNIDAD.has(rol)) return { tipo: "comunidad" }
  const personaId = await personaIdDelUsuarioDb(scope.usuarioId)
  if (!personaId) return { tipo: "denegado" }
  return { tipo: "propio", personaId }
}
