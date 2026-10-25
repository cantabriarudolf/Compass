/**
 * /api/pe/encomiendas — encomiendas PE (BD-FUENTE-VERDAD Fase 4).
 *
 * GET paginado vía factory. POST upsert idempotente por id. Authz "pe".
 *
 * Auditoría (T1c): el store legacy emitía `PE_ENCOMIENDA_RECIBIDA` en cada
 * save de encomienda, sin mirar el estado final; el POST conserva el evento
 * vía el hook post-escritura con el mismo texto y el mismo fallback (nombre
 * del courier, o el id si el maestro no lo tiene).
 */
import { EncomiendaPESchema } from "@/lib/schemas"
import { puede } from "@/lib/authz"
import { prisma } from "@/lib/prisma"
import { createCrudHandlers, delegado } from "@/lib/api/crud-factory"
import { registrarEventoPE } from "@/app/api/pe/_acciones"

const handlers = createCrudHandlers({
  model: delegado(prisma.encomiendaPE),
  schema: EncomiendaPESchema,
  authzCheck: (rol, accion) => puede(rol, accion, "pe"),
  despuesDeEscribir: async ({ registro, scope }) => {
    const fila = registro as { id: string; courierId: string }
    const courier = await prisma.courier.findUnique({ where: { id: fila.courierId } })
    const nombreCourier = courier?.nombre ?? fila.courierId
    await registrarEventoPE(
      scope,
      "PE_ENCOMIENDA_RECIBIDA",
      fila.id,
      `Encomienda recibida de ${nombreCourier}.`
    )
  },
})

export const GET = handlers.GET
export const POST = handlers.POST
