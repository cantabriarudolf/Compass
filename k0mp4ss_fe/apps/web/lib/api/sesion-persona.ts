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
import { prisma } from "@/lib/prisma"

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
