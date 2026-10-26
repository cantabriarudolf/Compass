/**
 * /api/pe/bitacora-visitas — bitácora de visitas PE (BD-FUENTE-VERDAD Fase 4).
 *
 * GET paginado vía factory (paginación obligatoria: alta frecuencia de
 * registros). POST upsert idempotente por id. Authz sobre el recurso "pe"
 * (conserjería + administrador operan; admin elimina).
 *
 * Efectos de escritura (en `_visitas.ts`, compartidos con el PUT del detalle):
 * - `PE_VISITA_INGRESADA` como evento auditable (mismo texto que el store).
 * - aviso al residente destinatario (F13) con `unidadId` (F5).
 * En POST solo cuenta el estado final de la fila; un re-save no repite nada.
 */
import { BitacoraVisitaPESchema } from "@/lib/schemas"
import { puede } from "@/lib/authz"
import { prisma } from "@/lib/prisma"
import { createCrudHandlers, delegado } from "@/lib/api/crud-factory"
import {
  avisarResidenteVisita,
  emitirVisitaIngresada,
  horaDeIngreso,
  type FilaVisita,
} from "@/app/api/pe/_visitas"

const handlers = createCrudHandlers({
  model: delegado(prisma.bitacoraVisitaPE),
  schema: BitacoraVisitaPESchema,
  authzCheck: (rol, accion) => puede(rol, accion, "pe"),
  despuesDeEscribir: async ({ registro, scope, accion }) => {
    // La visita que entra es un hecho nuevo: un re-save del mismo id no vuelve a
    // emitir evento ni a avisar al residente.
    if (accion === "editar") return
    const fila = registro as FilaVisita
    const hora = horaDeIngreso(fila)
    await emitirVisitaIngresada(fila, scope, hora)
    await avisarResidenteVisita(fila, scope, hora)
  },
})

export const GET = handlers.GET
export const POST = handlers.POST
