/**
 * /api/cv/plantillas — plantillas del Visor de Mensajes CV (Fase 4).
 *
 * GET paginado vía factory. POST upsert idempotente por id. Authz "cv".
 */
import { PlantillaCVSchema } from "@/lib/schemas"
import { puede } from "@/lib/authz"
import { prisma } from "@/lib/prisma"
import { createCrudHandlers, delegado } from "@/lib/api/crud-factory"

const handlers = createCrudHandlers({
  model: delegado(prisma.plantillaCV),
  schema: PlantillaCVSchema,
  authzCheck: (rol, accion) => puede(rol, accion, "cv"),
})

export const GET = handlers.GET
export const POST = handlers.POST
