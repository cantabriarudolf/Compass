/**
 * /api/pe/proveedores — proveedores externos PE (Fase 4).
 *
 * GET paginado vía factory. POST upsert idempotente por id; el RUT es único
 * por comunidad (@@unique → 409 vía factory). Authz "pe".
 */
import { ProveedorPESchema } from "@/lib/schemas"
import { puede } from "@/lib/authz"
import { prisma } from "@/lib/prisma"
import { createCrudHandlers, delegado } from "@/lib/api/crud-factory"

const handlers = createCrudHandlers({
  model: delegado(prisma.proveedorPE),
  schema: ProveedorPESchema,
  authzCheck: (rol, accion) => puede(rol, accion, "pe"),
})

export const GET = handlers.GET
export const POST = handlers.POST
