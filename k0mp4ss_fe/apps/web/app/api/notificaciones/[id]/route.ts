/**
 * /api/notificaciones/[id] — detalle/actualización parcial/baja de una notificación.
 *
 * GET: detalle acotado al destinatario de la sesión (V3b de SERIE-DEUDA-6). Una
 * notificación de otro vecino responde 404, igual que una inexistente, para no
 * filtrar su existencia. DELETE usa la factory (solo administrador: `eliminar`).
 * PUT: admite actualización parcial estándar. El shortcut `{ leida: true }` de
 * la lectura quedó en POST ../leer (H7): el estado de lectura SOLO lo escribe
 * el destinatario, así que acá el campo `leida` del body se descarta si el
 * actor no es el destinatario (decisión owner 2026-10-21).
 */
import { NotificacionSchema } from "@/lib/schemas"
import { puede } from "@/lib/authz"
import { prisma } from "@/lib/prisma"
import {
  jsonError,
  withComunidadScope,
} from "@/lib/api/with-comunidad-scope"
import { filtroNotificaciones } from "@/lib/api/notificaciones-scope"
import { personaIdDelUsuarioDb } from "@/lib/api/sesion-persona"
import { esDestinatarioDeNotificacion } from "./leer/route"
import { notificacionesHandlers } from "../route"
import { logger } from "@/lib/logger"

type Ctx = { params: Promise<{ id: string }> }

/** GET por id — 404 si la notificación no es visible para la sesión. */
export async function GET(_req: Request, ctx: Ctx): Promise<Response> {
  const resultado = await withComunidadScope()
  if (!resultado.ok) return resultado.response
  const scope = resultado.scope

  if (!puede(scope.rol, "ver", "notificaciones")) {
    return jsonError(403, "Permiso denegado.")
  }

  const { id } = await ctx.params
  try {
    const personaId = await personaIdDelUsuarioDb(scope.usuarioId)
    const record = await prisma.notificacion.findFirst({
      where: { ...filtroNotificaciones(scope, personaId), id },
    })
    if (!record) return jsonError(404, "Registro no encontrado.")
    return Response.json(record)
  } catch (e) {
    logger.error({ err: e }, "[notificaciones] error GET por id")
    return jsonError(500, "Error interno del servidor.")
  }
}

export const DELETE = notificacionesHandlers.DELETE

/** PUT parcial: marca como leída o actualiza campos estándar. */
export async function PUT(req: Request, ctx: Ctx): Promise<Response> {
  const resultado = await withComunidadScope()
  if (!resultado.ok) return resultado.response
  const scope = resultado.scope

  if (!puede(scope.rol, "editar", "notificaciones")) {
    return jsonError(403, "Permiso denegado.")
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return jsonError(400, "Cuerpo JSON inválido.")
  }

  const parsed = NotificacionSchema.partial().safeParse(body)
  if (!parsed.success) {
    return jsonError(400, "Datos inválidos.", {
      detalles: parsed.error.flatten(),
    })
  }

  const { id } = await ctx.params

  try {
    const existente = await prisma.notificacion.findUnique({ where: { id } })
    if (!existente || existente.comunidadId !== scope.comunidadId) {
      return jsonError(404, "Registro no encontrado.")
    }

    // H7: el estado de lectura solo lo escribe el destinatario (POST ../leer).
    // Si el actor no es el destinatario, se descarta `leida` antes de la fusión
    // para que nadie —ni el administrador— firme la lectura de otro.
    const personaIdActor = await personaIdDelUsuarioDb(scope.usuarioId)
    const esDestinatario = esDestinatarioDeNotificacion(existente, scope.rol, personaIdActor)

    const datos = { ...(parsed.data as Record<string, unknown>) }
    delete datos.id
    delete datos.comunidadId
    if ("leida" in datos && !esDestinatario) {
      delete datos.leida
    }

    const actualizado = await prisma.notificacion.update({
      where: { id },
      data: datos,
    })
    return Response.json(actualizado)
  } catch (e) {
    logger.error({ err: e }, "[notificaciones] error PUT")
    return jsonError(500, "Error interno del servidor.")
  }
}
