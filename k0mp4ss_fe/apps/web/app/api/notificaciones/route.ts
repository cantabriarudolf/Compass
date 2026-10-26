/**
 * /api/notificaciones — bandeja de notificaciones de la comunidad (BD-FUENTE-VERDAD Fase 5A).
 *
 * GET paginado con filtro ABAC por destinatario (V3b de SERIE-DEUDA-6).
 * POST upsert idempotente vía factory (solo administrador: el resto de los roles
 * tiene únicamente `ver` en la matriz).
 *
 * Authz: recurso "notificaciones" (admin full; comité, conserjería, residente y
 * mantención solo ver). El `ver` NO alcanza por sí solo: la visibilidad se acota
 * en el `where` con `filtroNotificaciones` (lib/api/notificaciones-scope.ts)
 * ANTES de leer. Consecuencia declarada: el comité ve toda la comunidad (órgano
 * de gobierno); residente y personal de servicio solo lo suyo o lo de su rol.
 */
import { NotificacionSchema } from "@/lib/schemas"
import { puede } from "@/lib/authz"
import { prisma } from "@/lib/prisma"
import { createCrudHandlers } from "@/lib/api/crud-factory"
import { filtroNotificaciones } from "@/lib/api/notificaciones-scope"
import {
  personaIdDelUsuarioDb,
  unidadesVinculadasDb,
} from "@/lib/api/sesion-persona"
import {
  jsonError,
  withComunidadScope,
} from "@/lib/api/with-comunidad-scope"
import { logger } from "@/lib/logger"

function delegado(modelo: unknown) {
  return modelo as import("@/lib/api/crud-factory").CrudDelegate
}

export const notificacionesHandlers = createCrudHandlers({
  model: delegado(prisma.notificacion),
  schema: NotificacionSchema,
  authzCheck: (rol, accion) => puede(rol, accion, "notificaciones"),
})

/**
 * GET paginado — mismo shape que la factory (`{ data, page, pageSize, total }`),
 * pero con el `where` acotado al destinatario de la sesión.
 */
export async function GET(req: Request): Promise<Response> {
  const resultado = await withComunidadScope()
  if (!resultado.ok) return resultado.response
  const scope = resultado.scope

  if (!puede(scope.rol, "ver", "notificaciones")) {
    return jsonError(403, "Permiso denegado.")
  }

  let url: URL
  try {
    url = new URL(req.url)
  } catch {
    return jsonError(400, "URL de solicitud inválida.")
  }
  const page = Math.max(1, Number.parseInt(url.searchParams.get("page") ?? "1", 10) || 1)
  const pageSize = Math.min(
    100,
    Math.max(1, Number.parseInt(url.searchParams.get("pageSize") ?? "50", 10) || 50)
  )

  try {
    const personaId = await personaIdDelUsuarioDb(scope.usuarioId)
    // F5: las unidades con vínculo vigente salen del servidor, nunca del cliente.
    // Solo segmenta al residente (ver notificaciones-scope); los demás roles la
    // ignoran y conservan su visibilidad histórica.
    const unidades = personaId
      ? await unidadesVinculadasDb(personaId, scope.comunidadId)
      : []
    const where = filtroNotificaciones(scope, personaId, unidades)
    const [data, total] = await Promise.all([
      prisma.notificacion.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.notificacion.count({ where }),
    ])
    return Response.json({ data, page, pageSize, total })
  } catch (e) {
    logger.error({ err: e }, "[notificaciones] error GET")
    return jsonError(500, "Error interno del servidor.")
  }
}

export const POST = notificacionesHandlers.POST
