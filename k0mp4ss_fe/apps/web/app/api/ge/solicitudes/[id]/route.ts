/**
 * /api/ge/solicitudes/[id] — detalle/actualización parcial/baja.
 *
 * GET_ONE y DELETE vía factory. PUT parcial vía put-merge sobre "ge".
 *
 * Alcance por filas (`alcanceSolicitudesGE`): la solicitud de otra unidad/otra
 * persona responde 404 y no se carga. La escritura lleva además
 * `rechazoDeSolicitudAjena`, la misma guardia que el POST de la colección: un
 * PUT tampoco puede mover una solicitud a una unidad ajena.
 *
 * POR QUÉ EL PUT NO DECLARA `alcance` (a diferencia de las dos rutas de `ir`):
 * hoy el único rol con `ge` editar es el administrador (wildcard de `puede()`,
 * lib/authz.ts:401) y su alcance es `null`, así que ningún actor acotado por
 * filas llega a escribir; `rechazoDeSolicitudAjena` ya corta con el 404 genérico
 * cualquier payload cuya `unidadId`/`solicitantePersonaId` no sea del actor, y en
 * el PUT el payload fusionado lleva la unidad/persona de la fila EXISTENTE, así
 * que editar una solicitud ajena cae ahí. Añadir `alcance` no cerraría nada hoy y
 * sí cambiaría un código de estado: el residente (sin `ge` editar) pasaría de 403
 * por CLAVE a 404 por ALCANCE en la fila ajena.
 *
 * CUÁNDO SÍ AGREGARLO: si un rol con alcance por filas recibe `ge` editar. La
 * guardia sola dejaría «adoptar» una solicitud ajena moviéndola a la unidad
 * propia; en ese momento esta ruta debe pasar `alcance: alcanceSolicitudesGE`,
 * igual que `ir/entregas-epp` e `ir/solicitudes-insumo`.
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
