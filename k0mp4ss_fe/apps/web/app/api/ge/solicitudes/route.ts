/**
 * /api/ge/solicitudes — solicitudes GE (BD-FUENTE-VERDAD Fase 4).
 *
 * GET paginado vía factory. POST upsert idempotente por id. Authz sobre "ge"
 * (residente crea sus solicitudes; administra el administrador).
 */
import { SolicitudGESchema } from "@/lib/schemas"
import { puede } from "@/lib/authz"
import { prisma } from "@/lib/prisma"
import { createCrudHandlers, delegado } from "@/lib/api/crud-factory"

const handlers = createCrudHandlers({
  model: delegado(prisma.solicitudGE),
  schema: SolicitudGESchema,
  authzCheck: (rol, accion) => puede(rol, accion, "ge"),
})

export const GET = handlers.GET
export const POST = handlers.POST
