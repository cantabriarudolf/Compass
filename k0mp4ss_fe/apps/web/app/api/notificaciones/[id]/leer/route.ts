/**
 * POST /api/notificaciones/[id]/leer — el destinatario marca leída la SUYA (H7).
 *
 * Decisión owner 2026-10-21: la gracia de una notificación es alertar al admin
 * de que se leyó. El que marca es el destinatario; el admin ve el estado
 * (`leida`). OJO: el modelo no guarda la fecha de lectura (`fechaLectura` no
 * existe en `Notificacion`); agregarla exige migración y queda como deuda
 * declarada. Por eso el permiso vive en la MATRIZ como recurso granular
 * `notificaciones:propias` (editar) y la pertenencia se valida AQUÍ
 * server-side: una notificación ajena responde 404, igual que una inexistente,
 * para no filtrar su existencia. Idempotente: marcar dos veces no falla.
 */
import { puede, normalizaRol } from "@/lib/authz"
import { prisma } from "@/lib/prisma"
import {
  jsonError,
  withComunidadScope,
} from "@/lib/api/with-comunidad-scope"
import { DESTINATARIOS_POR_ROL } from "@/lib/api/notificaciones-scope"
import { personaIdDelUsuarioDb } from "@/lib/api/sesion-persona"
import { logger } from "@/lib/logger"

type Ctx = { params: Promise<{ id: string }> }

/**
 * ¿Es el destinatario de la notificación? Destinataria puntual por personaId,
 * o difusión a su rol sin destinatario puntual. Pura y exportada para que el
 * PUT de [id]/route.ts use la MISMA regla al proteger el campo `leida`.
 */
export function esDestinatarioDeNotificacion(
  notificacion: { destinatarioRol: string; destinatarioPersonaId: string | null },
  rol: string,
  personaId: string | null
): boolean {
  const sinPuntual =
    notificacion.destinatarioPersonaId === null || notificacion.destinatarioPersonaId === ""
  if (!sinPuntual) return personaId != null && notificacion.destinatarioPersonaId === personaId
  const rolNorm = normalizaRol(rol) ?? rol.trim().toLowerCase()
  const roles = DESTINATARIOS_POR_ROL[rolNorm] ?? []
  return roles.includes(notificacion.destinatarioRol)
}

export async function POST(_req: Request, ctx: Ctx): Promise<Response> {
  const resultado = await withComunidadScope()
  if (!resultado.ok) return resultado.response
  const scope = resultado.scope

  if (!puede(scope.rol, "editar", "notificaciones:propias")) {
    return jsonError(403, "Permiso denegado.")
  }

  const { id } = await ctx.params
  try {
    const personaId = await personaIdDelUsuarioDb(scope.usuarioId)
    const record = await prisma.notificacion.findFirst({
      where: { id, comunidadId: scope.comunidadId },
    })
    if (!record) return jsonError(404, "Registro no encontrado.")

    // ABAC: solo el destinatario firma la lectura. Ajena → 404 (no 403) para no
    // filtrar su existencia.
    if (!esDestinatarioDeNotificacion(record, scope.rol, personaId)) {
      return jsonError(404, "Registro no encontrado.")
    }

    await prisma.notificacion.update({
      where: { id },
      data: { leida: true },
    })
    return Response.json({ ok: true })
  } catch (e) {
    logger.error({ err: e }, "[notificaciones] error POST leer")
    return jsonError(500, "Error interno del servidor.")
  }
}
