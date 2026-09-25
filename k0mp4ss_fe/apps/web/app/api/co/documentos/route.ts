/**
 * /api/co/documentos — documentos compartidos CO (Fase 4).
 *
 * GET paginado vía factory. POST upsert idempotente por id. Authz "co".
 */
import { DocumentoCOSchema } from "@/lib/schemas"
import { puede } from "@/lib/authz"
import { prisma } from "@/lib/prisma"
import { createCrudHandlers, delegado } from "@/lib/api/crud-factory"

const handlers = createCrudHandlers({
  model: delegado(prisma.documentoCO),
  schema: DocumentoCOSchema,
  authzCheck: (rol, accion) => puede(rol, accion, "co"),
})

export const GET = handlers.GET
export const POST = handlers.POST
