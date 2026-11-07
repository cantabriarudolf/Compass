/**
 * /api/ir/solicitudes-insumo/[id] — detalle/actualización parcial/baja.
 *
 * GET_ONE y DELETE vía factory. PUT parcial vía put-merge sobre
 * "ir:mantenimiento".
 *
 * Alcance por filas (`alcanceSolicitudesInsumoIR`): la solicitud de otra persona
 * responde 404 y no se carga; gestión conserva la comunidad entera.
 */
import { SolicitudInsumoIRSchema } from "@/lib/schemas"
import { puede } from "@/lib/authz"
import { prisma } from "@/lib/prisma"
import { createCrudHandlers, delegado } from "@/lib/api/crud-factory"
import { createPutMerge } from "@/lib/api/put-merge"
import { alcanceSolicitudesInsumoIR } from "../_alcance"

const modelo = delegado(prisma.solicitudInsumoIR)
const authzCheck = (rol: string, accion: "ver" | "crear" | "editar" | "eliminar" | "ejecutar") =>
  puede(rol, accion, "ir:mantenimiento")

const handlers = createCrudHandlers({
  model: modelo,
  schema: SolicitudInsumoIRSchema,
  authzCheck,
  alcance: alcanceSolicitudesInsumoIR,
})

export const GET = handlers.GET_ONE
export const PUT = createPutMerge({
  model: modelo,
  schema: SolicitudInsumoIRSchema,
  authzCheck,
  recurso: "ir/solicitudes-insumo",
})
export const DELETE = handlers.DELETE
