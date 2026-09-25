/**
 * /api/certificados-ct — colección de certificados CT (BD-FUENTE-VERDAD Fase 5A).
 *
 * GET paginado vía factory. POST upsert idempotente.
 * Authz: recurso "ct" (admin full, comité ver, residente ver/crear propios).
 */
import { CertificadoCTSchema } from "@/lib/schemas"
import { puede } from "@/lib/authz"
import { prisma } from "@/lib/prisma"
import { createCrudHandlers } from "@/lib/api/crud-factory"

function delegado(modelo: unknown) {
  return modelo as import("@/lib/api/crud-factory").CrudDelegate
}

export const certificadosHandlers = createCrudHandlers({
  model: delegado(prisma.certificadoCT),
  schema: CertificadoCTSchema,
  authzCheck: (rol, accion) => puede(rol, accion, "ct"),
})

export const GET = certificadosHandlers.GET
export const POST = certificadosHandlers.POST
