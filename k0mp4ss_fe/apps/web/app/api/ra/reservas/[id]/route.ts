/**
 * /api/ra/reservas/[id] — detalle/actualización parcial/baja.
 *
 * GET_ONE y DELETE vía factory. PUT parcial vía put-merge sobre "ra".
 * Nota: el PUT no revalida solapamiento (la guarda de concurrencia vive en el
 * POST transaccional); cambiar tramo/fecha de una reserva confirmada debe
 * hacerse cancelando y re-creando, como en el store legacy.
 */
import { ReservaRASchema } from "@/lib/schemas"
import { puede } from "@/lib/authz"
import { prisma } from "@/lib/prisma"
import { createCrudHandlers, delegado } from "@/lib/api/crud-factory"
import { createPutMerge } from "@/lib/api/put-merge"

const modelo = delegado(prisma.reservaRA)
const authzCheck = (rol: string, accion: "ver" | "crear" | "editar" | "eliminar" | "ejecutar") =>
  puede(rol, accion, "ra")

const handlers = createCrudHandlers({
  model: modelo,
  schema: ReservaRASchema,
  authzCheck,
})

export const GET = handlers.GET_ONE
export const PUT = createPutMerge({
  model: modelo,
  schema: ReservaRASchema,
  authzCheck,
  recurso: "ra/reservas",
})
export const DELETE = handlers.DELETE
