/**
 * /api/cv/avisos — avisos del Visor de Mensajes CV (BD-FUENTE-VERDAD Fase 4).
 *
 * GET paginado vía factory. POST upsert idempotente por id con refines de
 * negocio (multimedia excluyente, sin base64). Authz sobre "cv".
 */
import { AvisoCVSchema } from "@/lib/schemas"
import { puede } from "@/lib/authz"
import { prisma } from "@/lib/prisma"
import { createCrudHandlers, delegado } from "@/lib/api/crud-factory"

const handlers = createCrudHandlers({
  model: delegado(prisma.avisoCV),
  schema: AvisoCVSchema,
  authzCheck: (rol, accion) => puede(rol, accion, "cv"),
})

export const GET = handlers.GET
export const POST = handlers.POST
