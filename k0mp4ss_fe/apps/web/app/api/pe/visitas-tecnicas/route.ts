/**
 * /api/pe/visitas-tecnicas — libro de visitas técnicas PE (Fase 4).
 *
 * GET paginado vía factory. POST upsert idempotente por id. Authz "pe".
 */
import { VisitaTecnicaPESchema } from "@/lib/schemas"
import { puede } from "@/lib/authz"
import { prisma } from "@/lib/prisma"
import { createCrudHandlers, delegado } from "@/lib/api/crud-factory"

const handlers = createCrudHandlers({
  model: delegado(prisma.visitaTecnicaPE),
  schema: VisitaTecnicaPESchema,
  authzCheck: (rol, accion) => puede(rol, accion, "pe"),
})

export const GET = handlers.GET
export const POST = handlers.POST
