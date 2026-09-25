/**
 * /api/ir/recursos — catálogo de recursos IR (BD-FUENTE-VERDAD Fase 4).
 *
 * GET paginado vía factory. POST upsert idempotente por id. Authz sobre
 * "ir:mantenimiento" (personal de servicio y residentes crean solicitudes;
 * el catálogo lo administra el administrador).
 */
import { RecursoIRSchema } from "@/lib/schemas"
import { puede } from "@/lib/authz"
import { prisma } from "@/lib/prisma"
import { createCrudHandlers, delegado } from "@/lib/api/crud-factory"

const handlers = createCrudHandlers({
  model: delegado(prisma.recursoIR),
  schema: RecursoIRSchema,
  authzCheck: (rol, accion) => puede(rol, accion, "ir:mantenimiento"),
})

export const GET = handlers.GET
export const POST = handlers.POST
