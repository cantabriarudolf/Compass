/**
 * /api/cv/plantillas/[id] — detalle/actualización parcial/baja.
 *
 * GET_ONE y DELETE vía factory. PUT parcial vía put-merge sobre "cv".
 */
import { PlantillaCVSchema } from "@/lib/schemas"
import { puede } from "@/lib/authz"
import { prisma } from "@/lib/prisma"
import { createCrudHandlers, delegado } from "@/lib/api/crud-factory"
import { createPutMerge } from "@/lib/api/put-merge"

const modelo = delegado(prisma.plantillaCV)
const authzCheck = (rol: string, accion: "ver" | "crear" | "editar" | "eliminar" | "ejecutar") =>
  puede(rol, accion, "cv")

const handlers = createCrudHandlers({
  model: modelo,
  schema: PlantillaCVSchema,
  authzCheck,
})

export const GET = handlers.GET_ONE
export const PUT = createPutMerge({
  model: modelo,
  schema: PlantillaCVSchema,
  authzCheck,
  recurso: "cv/plantillas",
})
export const DELETE = handlers.DELETE
