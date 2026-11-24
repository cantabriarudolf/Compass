/**
 * /api/pe/encomiendas — encomiendas PE (BD-FUENTE-VERDAD Fase 4).
 *
 * GET paginado vía factory. POST upsert idempotente por id. Authz sobre el recurso
 * granular `pe:encomienda` (decisión owner 2026-11-05): la recepción es un registro
 * del portón, la escribe conserjería y la leen conserjería y el administrador. El
 * comité y mantención NO la leen (hasta ahora entraban por la raíz `pe`).
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
import { avisar, entregarPorCorreo } from "@/lib/entrega/notificar"
import { CANAL_NOTIFICACION_EMAIL_SIMULADO } from "@/lib/schemas"
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
 *
 * El correo (S1 de `saldar-f45-f48`) es el MISMO evento por el otro canal: mismo
 * asunto y mismo cuerpo, y su fila en `entregas_notificacion` cuelga del aviso
 * in-app. Sin correo cargado la entrega queda `fallido` con su motivo y el aviso
 * in-app se escribe igual.
 */
async function avisarResidenteEncomienda(
  fila: FilaEncomienda,
  scope: ComunidadScope
): Promise<void> {
  const personaId = fila.destinatarioPersonaId
  if (!personaId) return
  const cfg = await prisma.configuracionGlobal.findUnique({
    where: { comunidadId: scope.comunidadId },
    select: { notificarEncomiendas: true },
  })
  if (cfg?.notificarEncomiendas === false) return

  const asunto = "Encomienda recibida en conserjería"
  const cuerpo = `Tiene una encomienda recibida el ${fila.fechaRecepcion}. Retírela presentando su identificación.`

  // Camino único (S2): el canal se declara acá, no se hereda del `@default` de
  // Prisma, y la entrega al visor queda persistida junto al aviso.
  const { notificacionId } = await prisma.$transaction((tx) =>
    avisar(tx, {
      comunidadId: scope.comunidadId,
      destinatarioRol: "residente",
      destinatarioPersonaId: personaId,
      unidadId: fila.unidadId ?? null,
      asunto,
      cuerpo,
      canal: CANAL_NOTIFICACION_EMAIL_SIMULADO,
      moduloOrigen: "PE",
      fecha: fila.fechaRecepcion,
    })
  )

  // El correo sale DESPUÉS del commit y con el cliente PLANO (S3b): el diálogo
  // SMTP no retiene el lock de la base. La dirección la resuelve el puente por
  // la persona destinataria; sin dirección no abre ninguna conexión.
  await entregarPorCorreo(prisma, {
    comunidadId: scope.comunidadId,
    asunto,
    cuerpo,
    destinatarioPersonaId: personaId,
    notificacionId,
  })
}

const handlers = createCrudHandlers({
  model: delegado(prisma.encomiendaPE),
  schema: EncomiendaPESchema,
  authzCheck: (rol, accion) => puede(rol, accion, "pe:encomienda"),
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
