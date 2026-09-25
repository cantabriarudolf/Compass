/**
 * /api/ir/recursos/[id] — detalle/actualización parcial/baja.
 *
 * GET_ONE y DELETE vía factory. PUT parcial vía put-merge sobre
 * "ir:mantenimiento".
 */
import { RecursoIRSchema } from "@/lib/schemas"
import { puede } from "@/lib/authz"
import { prisma } from "@/lib/prisma"
import { createCrudHandlers, delegado } from "@/lib/api/crud-factory"
import { createPutMerge } from "@/lib/api/put-merge"

const modelo = delegado(prisma.recursoIR)
const authzCheck = (rol: string, accion: "ver" | "crear" | "editar" | "eliminar" | "ejecutar") =>
  puede(rol, accion, "ir:mantenimiento")

const handlers = createCrudHandlers({
  model: modelo,
  schema: RecursoIRSchema,
  authzCheck,
})

export const GET = handlers.GET_ONE
export const PUT = createPutMerge({
  model: modelo,
  schema: RecursoIRSchema,
  authzCheck,
  recurso: "ir/recursos",
})
export const DELETE = handlers.DELETE
