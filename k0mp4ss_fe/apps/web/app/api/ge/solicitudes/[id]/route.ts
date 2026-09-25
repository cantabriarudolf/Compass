/**
 * /api/ge/solicitudes/[id] — detalle/actualización parcial/baja.
 *
 * GET_ONE y DELETE vía factory. PUT parcial vía put-merge sobre "ge".
 */
import { SolicitudGESchema } from "@/lib/schemas"
import { puede } from "@/lib/authz"
import { prisma } from "@/lib/prisma"
import { createCrudHandlers, delegado } from "@/lib/api/crud-factory"
import { createPutMerge } from "@/lib/api/put-merge"

const modelo = delegado(prisma.solicitudGE)
const authzCheck = (rol: string, accion: "ver" | "crear" | "editar" | "eliminar" | "ejecutar") =>
  puede(rol, accion, "ge")

const handlers = createCrudHandlers({
  model: modelo,
  schema: SolicitudGESchema,
  authzCheck,
})

export const GET = handlers.GET_ONE
export const PUT = createPutMerge({
  model: modelo,
  schema: SolicitudGESchema,
  authzCheck,
  recurso: "ge/solicitudes",
})
export const DELETE = handlers.DELETE
