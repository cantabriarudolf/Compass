/**
 * /api/co/mensajes-buzon — buzón de mensajes CO (Fase 4).
 *
 * GET paginado vía factory. POST upsert idempotente por id. Authz "co:buzon".
 *
 * Change co-lectura-residente D4: el buzón ciudadano es su propio recurso. El residente
 * escribe acá (`co:buzon` ver/crear) sin recibir `crear` sobre la difusión (`co`), que era
 * el defecto D-3: emitir comunicaciones masivas a toda la comunidad.
 */
import { MensajeBuzonCOSchema } from "@/lib/schemas"
import { puede } from "@/lib/authz"
import { prisma } from "@/lib/prisma"
import { createCrudHandlers, delegado } from "@/lib/api/crud-factory"

const handlers = createCrudHandlers({
  model: delegado(prisma.mensajeBuzonCO),
  schema: MensajeBuzonCOSchema,
  authzCheck: (rol, accion) => puede(rol, accion, "co:buzon"),
})

export const GET = handlers.GET
export const POST = handlers.POST
