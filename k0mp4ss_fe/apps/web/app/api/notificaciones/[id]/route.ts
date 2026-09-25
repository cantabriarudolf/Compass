/**
 * /api/notificaciones/[id] — detalle/actualización parcial/baja de una notificación.
 *
 * PUT: admite actualización parcial estándar + también un shortcut para marcar
 * como leída vía `{ leida: true }`.
 */
import { NotificacionSchema } from "@/lib/schemas"
import { puede } from "@/lib/authz"
import { prisma } from "@/lib/prisma"
import {
  jsonError,
  withComunidadScope,
} from "@/lib/api/with-comunidad-scope"
import { notificacionesHandlers } from "../route"
import { logger } from "@/lib/logger"

type Ctx = { params: Promise<{ id: string }> }

export const GET = notificacionesHandlers.GET_ONE
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

    const datos = { ...(parsed.data as Record<string, unknown>) }
    delete datos.id
    delete datos.comunidadId

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
