/**
 * /api/ir/entregas-epp/[id] — detalle/actualización parcial/baja.
 *
 * GET_ONE y DELETE vía factory. PUT parcial vía put-merge sobre
 * "ir:mantenimiento".
 *
 * Alcance por filas (`alcanceEntregasEPP`): la entrega hecha a otra persona
 * responde 404 y no se carga; gestión conserva la comunidad entera.
 */
import { EntregaEPPSchema } from "@/lib/schemas"
import { puede } from "@/lib/authz"
import { prisma } from "@/lib/prisma"
import { createCrudHandlers, delegado } from "@/lib/api/crud-factory"
import { createPutMerge } from "@/lib/api/put-merge"
import { alcanceEntregasEPP } from "../_alcance"

const modelo = delegado(prisma.entregaEPP)
const authzCheck = (rol: string, accion: "ver" | "crear" | "editar" | "eliminar" | "ejecutar") =>
  puede(rol, accion, "ir:mantenimiento")

const handlers = createCrudHandlers({
  model: modelo,
  schema: EntregaEPPSchema,
  authzCheck,
  alcance: alcanceEntregasEPP,
})

export const GET = handlers.GET_ONE
export const PUT = createPutMerge({
  model: modelo,
  schema: EntregaEPPSchema,
  authzCheck,
  recurso: "ir/entregas-epp",
})
export const DELETE = handlers.DELETE
