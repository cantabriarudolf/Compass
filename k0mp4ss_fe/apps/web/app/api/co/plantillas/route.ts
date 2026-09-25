/**
 * /api/co/plantillas — plantillas de Comunicación con Vecinos CO (Fase 4).
 *
 * GET paginado vía factory. POST upsert idempotente por id. Authz "co".
 */
import { PlantillaCOSchema } from "@/lib/schemas"
import { puede } from "@/lib/authz"
import { prisma } from "@/lib/prisma"
import { createCrudHandlers, delegado } from "@/lib/api/crud-factory"

const handlers = createCrudHandlers({
  model: delegado(prisma.plantillaCO),
  schema: PlantillaCOSchema,
  authzCheck: (rol, accion) => puede(rol, accion, "co"),
})

export const GET = handlers.GET
export const POST = handlers.POST
