/**
 * /api/ir/entregas-epp — entregas de EPP IR (Fase 4).
 *
 * GET paginado vía factory. POST upsert idempotente por id. Authz
 * "ir:mantenimiento".
 *
 * Alcance por filas (`alcanceEntregasEPP`): el residente solo ve las entregas
 * hechas a su persona; gestión conserva la comunidad entera.
 */
import { EntregaEPPSchema } from "@/lib/schemas"
import { puede } from "@/lib/authz"
import { prisma } from "@/lib/prisma"
import { createCrudHandlers, delegado } from "@/lib/api/crud-factory"
import { alcanceEntregasEPP } from "./_alcance"

const handlers = createCrudHandlers({
  model: delegado(prisma.entregaEPP),
  schema: EntregaEPPSchema,
  authzCheck: (rol, accion) => puede(rol, accion, "ir:mantenimiento"),
  alcance: alcanceEntregasEPP,
})

export const GET = handlers.GET
export const POST = handlers.POST
