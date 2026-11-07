/**
 * /api/ge/solicitudes/[id] — detalle/actualización parcial/baja.
 *
 * GET_ONE y DELETE vía factory. PUT parcial vía put-merge sobre "ge".
 *
 * Alcance por filas (`alcanceSolicitudesGE`): la solicitud de otra unidad/otra
 * persona responde 404 y no se carga. La escritura lleva además
 * `rechazoDeSolicitudAjena`, la misma guardia que el POST de la colección: un
 * PUT tampoco puede mover una solicitud a una unidad ajena.
 */
import { SolicitudGESchema } from "@/lib/schemas"
import { puede } from "@/lib/authz"
import { prisma } from "@/lib/prisma"
import { createCrudHandlers, delegado } from "@/lib/api/crud-factory"
import { createPutMerge } from "@/lib/api/put-merge"
import {
  alcanceSolicitudesGE,
  rechazoDeSolicitudAjena,
} from "../_alcance"

const modelo = delegado(prisma.solicitudGE)
const authzCheck = (rol: string, accion: "ver" | "crear" | "editar" | "eliminar" | "ejecutar") =>
  puede(rol, accion, "ge")

const handlers = createCrudHandlers({
  model: modelo,
  schema: SolicitudGESchema,
  authzCheck,
  alcance: alcanceSolicitudesGE,
  antesDeEscribir: rechazoDeSolicitudAjena,
})

export const GET = handlers.GET_ONE
export const PUT = createPutMerge({
  model: modelo,
  schema: SolicitudGESchema,
  authzCheck,
  recurso: "ge/solicitudes",
  antesDeEscribir: rechazoDeSolicitudAjena,
})
export const DELETE = handlers.DELETE
