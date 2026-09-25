/**
 * /api/mt/trabajos — trabajos de mantenimiento MT (BD-FUENTE-VERDAD Fase 4).
 *
 * GET paginado vía factory. POST upsert idempotente por id. Authz sobre "mt"
 * (personal de mantención + administrador operan).
 */
import { TrabajoMTSchema } from "@/lib/schemas"
import { puede } from "@/lib/authz"
import { prisma } from "@/lib/prisma"
import { createCrudHandlers, delegado } from "@/lib/api/crud-factory"

const handlers = createCrudHandlers({
  model: delegado(prisma.trabajoMT),
  schema: TrabajoMTSchema,
  authzCheck: (rol, accion) => puede(rol, accion, "mt"),
})

export const GET = handlers.GET
export const POST = handlers.POST
