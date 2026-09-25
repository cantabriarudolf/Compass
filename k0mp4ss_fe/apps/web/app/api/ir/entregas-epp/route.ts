/**
 * /api/ir/entregas-epp — entregas de EPP IR (Fase 4).
 *
 * GET paginado vía factory. POST upsert idempotente por id. Authz
 * "ir:mantenimiento".
 */
import { EntregaEPPSchema } from "@/lib/schemas"
import { puede } from "@/lib/authz"
import { prisma } from "@/lib/prisma"
import { createCrudHandlers, delegado } from "@/lib/api/crud-factory"

const handlers = createCrudHandlers({
  model: delegado(prisma.entregaEPP),
  schema: EntregaEPPSchema,
  authzCheck: (rol, accion) => puede(rol, accion, "ir:mantenimiento"),
})

export const GET = handlers.GET
export const POST = handlers.POST
