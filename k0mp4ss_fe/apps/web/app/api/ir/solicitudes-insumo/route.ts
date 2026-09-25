/**
 * /api/ir/solicitudes-insumo — solicitudes de insumo IR (Fase 4).
 *
 * GET paginado vía factory. POST upsert idempotente por id. Authz
 * "ir:mantenimiento".
 */
import { SolicitudInsumoIRSchema } from "@/lib/schemas"
import { puede } from "@/lib/authz"
import { prisma } from "@/lib/prisma"
import { createCrudHandlers, delegado } from "@/lib/api/crud-factory"

const handlers = createCrudHandlers({
  model: delegado(prisma.solicitudInsumoIR),
  schema: SolicitudInsumoIRSchema,
  authzCheck: (rol, accion) => puede(rol, accion, "ir:mantenimiento"),
})

export const GET = handlers.GET
export const POST = handlers.POST
