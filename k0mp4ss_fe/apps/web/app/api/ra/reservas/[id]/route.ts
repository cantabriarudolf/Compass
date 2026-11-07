/**
 * /api/ra/reservas/[id] — detalle/actualización parcial/baja.
 *
 * GET_ONE y DELETE vía factory. PUT parcial vía put-merge sobre "ra".
 * Nota: el PUT no revalida solapamiento (la guarda de concurrencia vive en el
 * POST transaccional); cambiar tramo/fecha de una reserva confirmada debe
 * hacerse cancelando y re-creando, como en el store legacy.
 *
 * Alcance por filas (`alcanceReservasRA`): el residente lee y escribe solo las
 * reservas que pidió su persona; la de otra unidad responde 404 y no se carga.
 * Gestión conserva la comunidad entera. El MISMO helper se pasa a la factory y al
 * put-merge —no un segundo filtro— porque la matriz puede dar `ra` editar a un rol
 * acotado (hoy solo administración lo tiene) y el PUT no puede quedar más abierto
 * que la lectura.
 */
import { ReservaRASchema } from "@/lib/schemas"
import { puede } from "@/lib/authz"
import { prisma } from "@/lib/prisma"
import { createCrudHandlers, delegado } from "@/lib/api/crud-factory"
import { createPutMerge } from "@/lib/api/put-merge"
import { alcanceReservasRA } from "../_alcance"

const modelo = delegado(prisma.reservaRA)
const authzCheck = (rol: string, accion: "ver" | "crear" | "editar" | "eliminar" | "ejecutar") =>
  puede(rol, accion, "ra")

const handlers = createCrudHandlers({
  model: modelo,
  schema: ReservaRASchema,
  authzCheck,
  alcance: alcanceReservasRA,
})

export const GET = handlers.GET_ONE
export const PUT = createPutMerge({
  model: modelo,
  schema: ReservaRASchema,
  authzCheck,
  recurso: "ra/reservas",
  alcance: alcanceReservasRA,
})
export const DELETE = handlers.DELETE
