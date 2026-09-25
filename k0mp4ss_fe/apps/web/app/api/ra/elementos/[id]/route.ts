/**
 * /api/ra/elementos/[id] — detalle/actualización parcial/baja.
 *
 * GET_ONE y DELETE vía factory. PUT parcial vía put-merge (el schema es
 * ZodEffects por el refine de bloques horarios; la fusión + validación
 * completa preserva el invariante). Authz "ra".
 */
import { ElementoRASchema } from "@/lib/schemas"
import { puede } from "@/lib/authz"
import { prisma } from "@/lib/prisma"
import { createCrudHandlers, delegado } from "@/lib/api/crud-factory"
import { createPutMerge } from "@/lib/api/put-merge"

const modelo = delegado(prisma.elementoRA)
const authzCheck = (rol: string, accion: "ver" | "crear" | "editar" | "eliminar" | "ejecutar") =>
  puede(rol, accion, "ra")

const handlers = createCrudHandlers({
  model: modelo,
  schema: ElementoRASchema,
  authzCheck,
})

export const GET = handlers.GET_ONE
export const PUT = createPutMerge({
  model: modelo,
  schema: ElementoRASchema,
  authzCheck,
  recurso: "ra/elementos",
})
export const DELETE = handlers.DELETE
