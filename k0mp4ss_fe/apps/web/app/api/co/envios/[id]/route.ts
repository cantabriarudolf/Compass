/**
 * /api/co/envios/[id] — detalle/actualización parcial/baja.
 *
 * GET_ONE y DELETE vía factory. PUT parcial vía put-merge sobre "co".
 */
import { EnvioCOSchema } from "@/lib/schemas"
import { puede } from "@/lib/authz"
import { prisma } from "@/lib/prisma"
import { createCrudHandlers, delegado } from "@/lib/api/crud-factory"
import { createPutMerge } from "@/lib/api/put-merge"

const modelo = delegado(prisma.envioCO)
const authzCheck = (rol: string, accion: "ver" | "crear" | "editar" | "eliminar" | "ejecutar") =>
  puede(rol, accion, "co")

const handlers = createCrudHandlers({
  model: modelo,
  schema: EnvioCOSchema,
  authzCheck,
})

export const GET = handlers.GET_ONE
export const PUT = createPutMerge({
  model: modelo,
  schema: EnvioCOSchema,
  authzCheck,
  recurso: "co/envios",
})
export const DELETE = handlers.DELETE
