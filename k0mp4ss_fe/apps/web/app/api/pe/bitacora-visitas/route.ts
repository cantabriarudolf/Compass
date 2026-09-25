/**
 * /api/pe/bitacora-visitas — bitácora de visitas PE (BD-FUENTE-VERDAD Fase 4).
 *
 * GET paginado vía factory (paginación obligatoria: alta frecuencia de
 * registros). POST upsert idempotente por id. Authz sobre el recurso "pe"
 * (conserjería + administrador operan; admin elimina).
 */
import { BitacoraVisitaPESchema } from "@/lib/schemas"
import { puede } from "@/lib/authz"
import { prisma } from "@/lib/prisma"
import { createCrudHandlers, delegado } from "@/lib/api/crud-factory"

const handlers = createCrudHandlers({
  model: delegado(prisma.bitacoraVisitaPE),
  schema: BitacoraVisitaPESchema,
  authzCheck: (rol, accion) => puede(rol, accion, "pe"),
})

export const GET = handlers.GET
export const POST = handlers.POST
