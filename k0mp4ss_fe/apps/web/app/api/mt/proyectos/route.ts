/**
 * /api/mt/proyectos — proyectos de mantenimiento MT (Fase 4).
 *
 * GET paginado vía factory. POST upsert idempotente por id. Authz "mt".
 */
import { ProyectoMTSchema } from "@/lib/schemas"
import { puede } from "@/lib/authz"
import { prisma } from "@/lib/prisma"
import { createCrudHandlers, delegado } from "@/lib/api/crud-factory"

const handlers = createCrudHandlers({
  model: delegado(prisma.proyectoMT),
  schema: ProyectoMTSchema,
  authzCheck: (rol, accion) => puede(rol, accion, "mt"),
})

export const GET = handlers.GET
export const POST = handlers.POST
