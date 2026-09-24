/**
 * with-comunidad-scope — scoping multi-tenant inescapable (BD-FUENTE-VERDAD Fase 0).
 *
 * Extrae la comunidad del usuario desde la membresía en BD, NUNCA desde
 * body/query: el `comunidadId` es una decisión del servidor, nunca del cliente.
 * Toda API route de dominio debe pasar por aquí antes de tocar Prisma.
 */
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export interface ComunidadScope {
  comunidadId: string
  usuarioId: string
  rol: string
}

export type ScopeResult =
  | { ok: true; scope: ComunidadScope }
  | { ok: false; response: Response }

/** Respuesta de error JSON estandarizada para las API routes de dominio. */
export function jsonError(
  status: number,
  error: string,
  extra?: Record<string, unknown>
): Response {
  return Response.json({ error, ...extra }, { status })
}

/**
 * Resuelve el scope de comunidad desde la sesión Auth.js + membresía en BD.
 *
 * - Sin sesión → 401.
 * - Sin membresía registrada → 403.
 * - Con varias membresías → se usa la más reciente (createdAt desc; determinista).
 *   Un usuario multi-comunidad deberá elegir comunidad activa en fases futuras;
 *   hoy la API nunca confía en un `comunidadId` provisto por el cliente.
 */
export async function withComunidadScope(): Promise<ScopeResult> {
  const sesion = await auth()
  const usuarioId = sesion?.user?.id
  if (!usuarioId) {
    return { ok: false, response: jsonError(401, "No autenticado.") }
  }

  const membresias = await prisma.membresia.findMany({
    where: { usuarioId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 1,
  })
  const membresia = membresias[0]
  if (!membresia) {
    return {
      ok: false,
      response: jsonError(403, "Sin comunidad asignada."),
    }
  }

  return {
    ok: true,
    scope: {
      comunidadId: membresia.comunidadId,
      usuarioId,
      rol: membresia.rol,
    },
  }
}
