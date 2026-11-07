/**
 * /api/ge/solicitudes — solicitudes GE (BD-FUENTE-VERDAD Fase 4).
 *
 * GET paginado vía factory. POST upsert idempotente por id. Authz sobre "ge"
 * (residente crea sus solicitudes; administra el administrador).
 *
 * Alcance por filas (`alcanceSolicitudesGE`): el residente lee solo las
 * solicitudes de sus unidades con vínculo vigente o las que pidió su persona.
 * La ESCRITURA no se puede validar con un `where` (el alta no tiene fila), así
 * que la ruta declara además `rechazoDeSolicitudAjena`: nadie crea ni reescribe
 * una solicitud a nombre de una unidad/persona ajena.
 */
import { SolicitudGESchema } from "@/lib/schemas"
import { puede } from "@/lib/authz"
import { prisma } from "@/lib/prisma"
import { createCrudHandlers, delegado } from "@/lib/api/crud-factory"
import {
  alcanceSolicitudesGE,
  rechazoDeSolicitudAjena,
} from "./_alcance"

const handlers = createCrudHandlers({
  model: delegado(prisma.solicitudGE),
  schema: SolicitudGESchema,
  authzCheck: (rol, accion) => puede(rol, accion, "ge"),
  alcance: alcanceSolicitudesGE,
  antesDeEscribir: rechazoDeSolicitudAjena,
})

export const GET = handlers.GET
export const POST = handlers.POST
