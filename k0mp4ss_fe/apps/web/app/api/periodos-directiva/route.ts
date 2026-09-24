/**
 * /api/periodos-directiva — colección GD de períodos de directiva
 * (BD-FUENTE-VERDAD Fase 0). Scoping y authz resueltos por la factory:
 * - comunidadId siempre desde sesión (nunca body/query).
 * - `puede(rol, accion, "gd")`: administrador full, el resto según matriz.
 */
import { PeriodoDirectivaSchema } from "@/lib/schemas"
import { puede } from "@/lib/authz"
import { prisma } from "@/lib/prisma"
import { createCrudHandlers } from "@/lib/api/crud-factory"
import type { CrudDelegate } from "@/lib/api/crud-factory"

const handlers = createCrudHandlers({
  // SAFETY: el delegado tipado de Prisma cumple el contrato CrudDelegate;
  // el cast evita el frote de tipos genéricos generados.
  model: prisma.periodoDirectiva as unknown as CrudDelegate,
  schema: PeriodoDirectivaSchema,
  authzCheck: (rol, accion) => puede(rol, accion, "gd"),
})

export const GET = handlers.GET
export const POST = handlers.POST
