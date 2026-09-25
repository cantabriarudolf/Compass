/**
 * /api/ra/elementos — elementos reservables RA (BD-FUENTE-VERDAD Fase 4).
 *
 * GET paginado vía factory. POST upsert idempotente por id con refine de
 * negocio (bloques horarios exigen duración). Authz sobre "ra" (residente
 * crea reservas; administra el administrador).
 */
import { ElementoRASchema } from "@/lib/schemas"
import { puede } from "@/lib/authz"
import { prisma } from "@/lib/prisma"
import { createCrudHandlers, delegado } from "@/lib/api/crud-factory"

const handlers = createCrudHandlers({
  model: delegado(prisma.elementoRA),
  schema: ElementoRASchema,
  authzCheck: (rol, accion) => puede(rol, accion, "ra"),
})

export const GET = handlers.GET
export const POST = handlers.POST
