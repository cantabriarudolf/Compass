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
import { generarId } from "@/lib/id-utils"
import { createCrudHandlers, delegado } from "@/lib/api/crud-factory"
import { registrarEventoPE } from "@/app/api/pe/_acciones"
import type { ComunidadScope } from "@/lib/api/with-comunidad-scope"

interface FilaEncomienda {
  id: string
  courierId: string
  fechaRecepcion: string
  unidadId?: string | null
  destinatarioPersonaId?: string | null
}

/**
 * F13: aviso al destinatario de la encomienda (lib/store.ts saveEncomiendaPE),
 * SOLO cuando la fila escrita trae `destinatarioPersonaId`. Sujeto al flag de
 * CF `notificarEncomiendas` con la semántica del store (`!== false`: sin
 * configuración, se notifica). La fila nueva es la recepción; un re-save del
 * mismo registro no repite el aviso. El aviso va dirigido al residente y a su
 * unidad (F5, asesoría normativa 2026-10-25: minimización y finalidad), nunca
 * como difusión al rol.
 */
async function avisarResidenteEncomienda(
  fila: FilaEncomienda,
  scope: ComunidadScope
): Promise<void> {
  if (!fila.destinatarioPersonaId) return
  const cfg = await prisma.configuracionGlobal.findUnique({
    where: { comunidadId: scope.comunidadId },
    select: { notificarEncomiendas: true },
  })
  if (cfg?.notificarEncomiendas === false) return
  await prisma.notificacion.create({
    data: {
      id: generarId("not"),
      comunidadId: scope.comunidadId,
      destinatarioRol: "residente",
      destinatarioPersonaId: fila.destinatarioPersonaId,
      unidadId: fila.unidadId ?? null,
      asunto: "Encomienda recibida en conserjería",
      cuerpo: `Tiene una encomienda recibida el ${fila.fechaRecepcion}. Retírela presentando su identificación.`,
      moduloOrigen: "PE",
      fecha: fila.fechaRecepcion,
    },
  })
}

const handlers = createCrudHandlers({
  model: delegado(prisma.encomiendaPE),
  schema: EncomiendaPESchema,
  authzCheck: (rol, accion) => puede(rol, accion, "pe"),
  despuesDeEscribir: async ({ registro, scope, accion }) => {
    const fila = registro as FilaEncomienda
    // La recepción de UNA encomienda es un evento nuevo, no un re-save del
    // mismo registro (idempotencia: ver también avisarResidenteEncomienda).
    if (accion === "editar") return
    const courier = await prisma.courier.findUnique({ where: { id: fila.courierId } })
    const nombreCourier = courier?.nombre ?? fila.courierId
    await registrarEventoPE(
      scope,
      "PE_ENCOMIENDA_RECIBIDA",
      fila.id,
      `Encomienda recibida de ${nombreCourier}.`
    )
    await avisarResidenteEncomienda(fila, scope)
  },
})

export const GET = handlers.GET
export const POST = handlers.POST
