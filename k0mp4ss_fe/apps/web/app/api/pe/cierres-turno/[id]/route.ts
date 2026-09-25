/**
 * /api/pe/cierres-turno/[id] — detalle/actualización parcial/baja.
 *
 * GET_ONE y DELETE vía factory. PUT parcial vía put-merge sobre "pe".
 */
import { CierreTurnoPESchema } from "@/lib/schemas"
import { puede } from "@/lib/authz"
import { prisma } from "@/lib/prisma"
import { createCrudHandlers, delegado } from "@/lib/api/crud-factory"
import { createPutMerge } from "@/lib/api/put-merge"

const modelo = delegado(prisma.cierreTurnoPE)
const authzCheck = (rol: string, accion: "ver" | "crear" | "editar" | "eliminar" | "ejecutar") =>
  puede(rol, accion, "pe")

const handlers = createCrudHandlers({
  model: modelo,
  schema: CierreTurnoPESchema,
  authzCheck,
})

export const GET = handlers.GET_ONE
export const PUT = createPutMerge({
  model: modelo,
  schema: CierreTurnoPESchema,
  authzCheck,
  recurso: "pe/cierres-turno",
})
export const DELETE = handlers.DELETE
