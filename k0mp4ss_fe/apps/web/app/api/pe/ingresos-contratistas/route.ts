/**
 * /api/pe/ingresos-contratistas — ingresos de contratistas PE (Fase 4).
 *
 * GET paginado vía factory. POST upsert idempotente por id. Authz "pe".
 *
 * Sin hook post-escritura (T1c): el POST agenda la visita del contratista y
 * el store legacy tampoco emitía evento al agendar; la emisión de
 * `PE_CONTRATISTA_INGRESADO` vive en la transición a `ingresado` del [id]
 * (put-merge).
 */
import { IngresoContratistaPESchema } from "@/lib/schemas"
import { puede } from "@/lib/authz"
import { prisma } from "@/lib/prisma"
import { createCrudHandlers, delegado } from "@/lib/api/crud-factory"

const handlers = createCrudHandlers({
  model: delegado(prisma.ingresoContratistaPE),
  schema: IngresoContratistaPESchema,
  authzCheck: (rol, accion) => puede(rol, accion, "pe"),
})

export const GET = handlers.GET
export const POST = handlers.POST
