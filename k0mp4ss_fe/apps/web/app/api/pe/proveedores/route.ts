/**
 * /api/pe/proveedores — proveedores externos PE (Fase 4).
 *
 * GET paginado vía factory. POST upsert idempotente por id; el RUT es único
 * por comunidad (@@unique → 409 vía factory). Authz "pe:proveedor" (recurso propio):
 * el proveedor es un MAESTRO (RUT, contacto, contrato). Administrar maestros es del
 * administrador; el resto de la operación solo necesita leer quién es la empresa.
 * El `pe` genérico de conserjería y mantención ya no alcanza esta ruta por herencia.
 */
import { ProveedorPESchema } from "@/lib/schemas"
import { puede } from "@/lib/authz"
import { prisma } from "@/lib/prisma"
import { createCrudHandlers, delegado } from "@/lib/api/crud-factory"

const handlers = createCrudHandlers({
  model: delegado(prisma.proveedorPE),
  schema: ProveedorPESchema,
  authzCheck: (rol, accion) => puede(rol, accion, "pe:proveedor"),
})

export const GET = handlers.GET
export const POST = handlers.POST
