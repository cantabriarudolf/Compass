/**
 * /api/reportes-re — colección de reportes RE (BD-FUENTE-VERDAD Fase 5A).
 *
 * GET paginado vía factory. POST upsert idempotente.
 * Authz: recurso "re" (admin full, comité solo ver).
 */
import { ReporteRESchema } from "@/lib/schemas"
import { puede } from "@/lib/authz"
import { prisma } from "@/lib/prisma"
import { createCrudHandlers } from "@/lib/api/crud-factory"

function delegado(modelo: unknown) {
  return modelo as import("@/lib/api/crud-factory").CrudDelegate
}

export const reportesHandlers = createCrudHandlers({
  model: delegado(prisma.reporteRE),
  schema: ReporteRESchema,
  authzCheck: (rol, accion) => puede(rol, accion, "re"),
})

export const GET = reportesHandlers.GET
export const POST = reportesHandlers.POST
