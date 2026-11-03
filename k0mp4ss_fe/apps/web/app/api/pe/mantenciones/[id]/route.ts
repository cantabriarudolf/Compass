/**
 * /api/pe/mantenciones/[id] — detalle/actualización parcial/baja.
 *
 * GET_ONE y DELETE vía factory. PUT parcial vía put-merge sobre el recurso
 * propio "pe:mantenciones" (no el `pe` genérico): leer el calendario no es
 * gestionarlo, y conserjería solo conserva `ver`.
 */
import { MantencionPreventivaPESchema } from "@/lib/schemas"
import { puede } from "@/lib/authz"
import { prisma } from "@/lib/prisma"
import { createCrudHandlers, delegado } from "@/lib/api/crud-factory"
import { createPutMerge } from "@/lib/api/put-merge"

const modelo = delegado(prisma.mantencionPreventivaPE)
const authzCheck = (rol: string, accion: "ver" | "crear" | "editar" | "eliminar" | "ejecutar") =>
  puede(rol, accion, "pe:mantenciones")

const handlers = createCrudHandlers({
  model: modelo,
  schema: MantencionPreventivaPESchema,
  authzCheck,
})

export const GET = handlers.GET_ONE
export const PUT = createPutMerge({
  model: modelo,
  schema: MantencionPreventivaPESchema,
  authzCheck,
  recurso: "pe/mantenciones",
})
export const DELETE = handlers.DELETE
