/**
 * /api/in/tipos — tipos de infracción IN (BD-FUENTE-VERDAD Fase 4).
 *
 * GET paginado vía factory. POST upsert idempotente por id. Authz sobre "in":
 * el recurso ya está declarado en la MATRIZ para comité y conserjería (ver/crear/editar),
 * así que la matriz es la única fuente y la restricción previa al administrador ya no aplica.
 */
import { TipoInfraccionINSchema } from "@/lib/schemas"
import { puede } from "@/lib/authz"
import { prisma } from "@/lib/prisma"
import { createCrudHandlers, delegado } from "@/lib/api/crud-factory"

const handlers = createCrudHandlers({
  model: delegado(prisma.tipoInfraccionIN),
  schema: TipoInfraccionINSchema,
  authzCheck: (rol, accion) => puede(rol, accion, "in"),
})

export const GET = handlers.GET
export const POST = handlers.POST
