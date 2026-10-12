/**
 * _acciones.ts — utilidades compartidas de las acciones IN sobre infracciones.
 *
 * Módulo co-locado (no es una ruta de Next): resuelve el scope de comunidad y
 * el permiso "in", carga la infracción scoped y emite eventos de auditoría con
 * el mismo shape que `registrarEvento` del store legacy.
 */
import { puede } from "@/lib/authz"
import { prisma } from "@/lib/prisma"
import { generarId } from "@/lib/id-utils"
import {
  jsonError,
  withComunidadScope,
  type ComunidadScope,
} from "@/lib/api/with-comunidad-scope"

export type ContextoAccionIN =
  | { ok: true; scope: ComunidadScope }
  | { ok: false; response: Response }

/** Contexto server-side de una acción IN: sesión + membresía + permiso de edición. */
export async function contextoAccionIN(): Promise<ContextoAccionIN> {
  const resultado = await withComunidadScope()
  if (!resultado.ok) return resultado
  if (!puede(resultado.scope.rol, "editar", "in")) {
    return { ok: false, response: jsonError(403, "Permiso denegado.") }
  }
  return { ok: true, scope: resultado.scope }
}

/** Lee el body JSON como objeto plano; `null` si no es JSON parseable. */
export async function leerCuerpo(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const body: unknown = await req.json()
    if (typeof body !== "object" || body === null || Array.isArray(body)) return {}
    return body as Record<string, unknown>
  } catch {
    return null
  }
}

/** Carga la infracción por id y exige que pertenezca a la comunidad del scope. */
export async function cargarInfraccion(
  id: string,
  scope: ComunidadScope
): Promise<Awaited<ReturnType<typeof prisma.infraccionIN.findUnique>> | null> {
  const infraccion = await prisma.infraccionIN.findUnique({ where: { id } })
  if (!infraccion || infraccion.comunidadId !== scope.comunidadId) return null
  return infraccion
}

/**
 * Emite UN evento de auditoría IN. El llamador decide si va dentro de una
 * transacción pasando `client` (default: cliente Prisma normal).
 */
export function registrarEventoIN(
  scope: ComunidadScope,
  tipoAccion: string,
  referenciaId: string,
  descripcion: string,
  client: Pick<typeof prisma, "eventoAuditoria"> = prisma
): Promise<unknown> {
  return client.eventoAuditoria.create({
    data: {
      id: generarId("ev"),
      comunidadId: scope.comunidadId,
      timestamp: new Date().toISOString(),
      usuario: scope.usuarioId,
      categoria: "IN",
      tipoAccion,
      referenciaId,
      descripcion,
    },
  })
}
