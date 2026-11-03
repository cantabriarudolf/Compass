/**
 * /api/pe/proyecciones — proyecciones operativas PE (Fase 4).
 *
 * GET paginado vía factory. POST upsert idempotente por id. Authz "pe:proyeccion"
 * (recurso propio): la proyección de costo la computan conserjería y mantención —son
 * ellos quienes calculan los reemplazos—, y el comité la lee. El ENVÍO a Finanzas es
 * otro recurso (`pe:proyeccion:enviar`, solo administrador), no esta colección.
 */
import { ProyeccionPESchema } from "@/lib/schemas"
import { puede } from "@/lib/authz"
import { prisma } from "@/lib/prisma"
import { createCrudHandlers, delegado } from "@/lib/api/crud-factory"

const handlers = createCrudHandlers({
  model: delegado(prisma.proyeccionPE),
  schema: ProyeccionPESchema,
  authzCheck: (rol, accion) => puede(rol, accion, "pe:proyeccion"),
})

export const GET = handlers.GET
export const POST = handlers.POST
