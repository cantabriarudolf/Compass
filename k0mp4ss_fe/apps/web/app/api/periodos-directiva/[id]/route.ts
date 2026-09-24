/**
 * /api/periodos-directiva/[id] — detalle/actualización/baja de un período
 * (BD-FUENTE-VERDAD Fase 0). Regla de negocio GD: un período "vigente" es el
 * libro en curso y no se puede eliminar (GD-períodos: la nómina se archiva
 * al cerrarse; el libro nunca se borra).
 */
import { PeriodoDirectivaSchema } from "@/lib/schemas"
import { puede } from "@/lib/authz"
import { prisma } from "@/lib/prisma"
import { createCrudHandlers } from "@/lib/api/crud-factory"
import type { CrudDelegate } from "@/lib/api/crud-factory"
import { jsonError } from "@/lib/api/with-comunidad-scope"

const handlers = createCrudHandlers({
  // SAFETY: el delegado tipado de Prisma cumple el contrato CrudDelegate;
  // el cast evita el frote de tipos genéricos generados.
  model: prisma.periodoDirectiva as unknown as CrudDelegate,
  schema: PeriodoDirectivaSchema,
  authzCheck: (rol, accion) => puede(rol, accion, "gd"),
  beforeDelete: (record) => {
    if ((record as { estado?: string }).estado === "vigente") {
      return jsonError(
        409,
        "No se puede eliminar un período vigente: cerralo antes (el libro de directiva nunca se borra)."
      )
    }
    return null
  },
})

export const GET = handlers.GET_ONE
export const PUT = handlers.PUT
export const DELETE = handlers.DELETE
