/**
 * /api/pe/mantenciones — mantenciones preventivas PE (Fase 4).
 *
 * GET paginado vía factory. POST upsert idempotente por id. Authz "pe".
 */
import { MantencionPreventivaPESchema } from "@/lib/schemas"
import { puede } from "@/lib/authz"
import { prisma } from "@/lib/prisma"
import { createCrudHandlers, delegado } from "@/lib/api/crud-factory"

const handlers = createCrudHandlers({
  model: delegado(prisma.mantencionPreventivaPE),
  schema: MantencionPreventivaPESchema,
  authzCheck: (rol, accion) => puede(rol, accion, "pe"),
})

export const GET = handlers.GET
export const POST = handlers.POST
