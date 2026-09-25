/**
 * /api/notificaciones — colección de notificaciones (BD-FUENTE-VERDAD Fase 5A).
 *
 * GET paginado vía factory. POST upsert idempotente.
 * Authz: recurso "notificaciones" (admin full, comité ver, residente ver propias).
 * Nota: residente solo ve notificaciones donde destinatarioRol = "residente"
 * o destinatarioPersonaId = su personaId (ABAC en UI, no en API por simplicidad).
 */
import { NotificacionSchema } from "@/lib/schemas"
import { puede } from "@/lib/authz"
import { prisma } from "@/lib/prisma"
import { createCrudHandlers } from "@/lib/api/crud-factory"

function delegado(modelo: unknown) {
  return modelo as import("@/lib/api/crud-factory").CrudDelegate
}

export const notificacionesHandlers = createCrudHandlers({
  model: delegado(prisma.notificacion),
  schema: NotificacionSchema,
  authzCheck: (rol, accion) => puede(rol, accion, "notificaciones"),
})

export const GET = notificacionesHandlers.GET
export const POST = notificacionesHandlers.POST
