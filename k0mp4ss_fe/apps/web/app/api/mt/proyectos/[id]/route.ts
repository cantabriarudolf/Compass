/**
 * /api/mt/proyectos/[id] — detalle/actualización parcial/baja.
 *
 * GET_ONE y DELETE vía factory. PUT parcial vía put-merge sobre "mt".
 */
import { ProyectoMTSchema } from "@/lib/schemas"
import { puede } from "@/lib/authz"
import { prisma } from "@/lib/prisma"
import { createCrudHandlers, delegado } from "@/lib/api/crud-factory"
import { createPutMerge } from "@/lib/api/put-merge"

const modelo = delegado(prisma.proyectoMT)
const authzCheck = (rol: string, accion: "ver" | "crear" | "editar" | "eliminar" | "ejecutar") =>
  puede(rol, accion, "mt")

const handlers = createCrudHandlers({
  model: modelo,
  schema: ProyectoMTSchema,
  authzCheck,
})

export const GET = handlers.GET_ONE
export const PUT = createPutMerge({
  model: modelo,
  schema: ProyectoMTSchema,
  authzCheck,
  recurso: "mt/proyectos",
})
export const DELETE = handlers.DELETE
