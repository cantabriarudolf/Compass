/**
 * /api/in/infracciones — infracciones y multas IN (Fase 4).
 *
 * GET paginado vía factory. POST upsert idempotente por id. Authz "in".
 */
import { InfraccionINSchema } from "@/lib/schemas"
import { puede } from "@/lib/authz"
import { prisma } from "@/lib/prisma"
import { createCrudHandlers, delegado } from "@/lib/api/crud-factory"

const handlers = createCrudHandlers({
  model: delegado(prisma.infraccionIN),
  schema: InfraccionINSchema,
  authzCheck: (rol, accion) => puede(rol, accion, "in"),
})

export const GET = handlers.GET
export const POST = handlers.POST
