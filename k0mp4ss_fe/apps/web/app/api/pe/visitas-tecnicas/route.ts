/**
 * /api/pe/visitas-tecnicas — libro de visitas técnicas PE (Fase 4).
 *
 * GET paginado vía factory. POST upsert idempotente por id. Authz "pe:visita_tecnica"
 * (recurso propio): la visita técnica es el LOG DE UN HECHO, no un acto administrativo
 * —`VisitaTecnicaPE` no tiene ningún campo de dinero— y quien sabe qué pasó es quien
 * estuvo ahí. Heredar el `pe` genérico dejaba el permiso en manos del fallback de
 * prefijo: cualquier rol con `pe` escribía acá aunque la pantalla no lo mostrara.
 */
import { VisitaTecnicaPESchema } from "@/lib/schemas"
import { puede } from "@/lib/authz"
import { prisma } from "@/lib/prisma"
import { createCrudHandlers, delegado } from "@/lib/api/crud-factory"

const handlers = createCrudHandlers({
  model: delegado(prisma.visitaTecnicaPE),
  schema: VisitaTecnicaPESchema,
  authzCheck: (rol, accion) => puede(rol, accion, "pe:visita_tecnica"),
})

export const GET = handlers.GET
export const POST = handlers.POST
