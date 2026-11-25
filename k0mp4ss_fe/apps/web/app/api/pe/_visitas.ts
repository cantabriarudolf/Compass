/**
 * _visitas.ts — los dos efectos de escritura de una visita de la bitácora PE.
 *
 * Módulo co-locado (no es una ruta de Next): los usan tanto la colección
 * (`POST /api/pe/bitacora-visitas`) como el detalle (`PUT .../[id]`), que son los
 * dos caminos por los que una visita pasa a `ingresada`.
 *
 * - `emitirVisitaIngresada`: evento auditable `PE_VISITA_INGRESADA` con el texto
 *   exacto del store legacy.
 * - `avisarResidenteVisita` (F13): notificación al residente destinatario, con
 *   `unidadId` (F5). Sujeto al flag de CF `notificarRegistroVisitas` con la
 *   semántica del store (`!== false`: sin configuración, se notifica). El aviso
 *   in-app y su correo salen por el puente (`avisar` + `entregarPorCorreo`,
 *   S1 de `saldar-f45-f48`): la compuerta gobierna el evento completo, así que
 *   con el flag apagado no se escribe ni el aviso ni la entrega.
 *
 * Los dos son idempotentes por estado: el llamador decide si la transición
 * corresponde (una visita ya `ingresada` no vuelve a emitir ni a avisar).
 */
import { prisma } from "@/lib/prisma"
import type { ComunidadScope } from "@/lib/api/with-comunidad-scope"
import { registrarEventoPE } from "@/app/api/pe/_acciones"
import { avisar, entregarPorCorreo } from "@/lib/entrega/notificar"
import { CANAL_NOTIFICACION_EMAIL_SIMULADO } from "@/lib/schemas"

/** Campos de la fila que estos efectos necesitan. */
export interface FilaVisita {
  id: string
  nombre: string
  origenAgenda: string
  estado: string
  fecha: string
  destinoPersonaId?: string | null
  unidadId?: string | null
  horaIngreso?: string | null
}

/** Hora del sello: la de la fila o la del reloj si el cliente no la mandó. */
export function horaDeIngreso(fila: FilaVisita): string {
  return fila.horaIngreso ?? new Date().toTimeString().slice(0, 5)
}

/** Evento auditable del ingreso (no emite si la fila no está ingresada). */
export async function emitirVisitaIngresada(
  fila: FilaVisita,
  scope: ComunidadScope,
  hora: string
): Promise<void> {
  if (fila.estado !== "ingresada") return
  await registrarEventoPE(
    scope,
    "PE_VISITA_INGRESADA",
    fila.id,
    `Visita ${fila.nombre} ingresada (${fila.origenAgenda === "pre_agendada" ? "agendada" : "sin aviso"}) a las ${hora}.`
  )
}

/**
 * Aviso al residente destinatario (F13). Solo si la fila quedó `ingresada` y hay
 * `destinoPersonaId`: el aviso va dirigido a la persona y a su unidad, nunca
 * como difusión al rol (minimización y finalidad, asesoría 2026-10-25).
 *
 * Se dispara en los DOS caminos: al registrar una visita que entra sin aviso y
 * al confirmar el ingreso de una pre-agendada. El store legacy avisaba solo en
 * el primero, así que una visita agendada nunca avisaba a su residente.
 *
 * El correo (S1 de `saldar-f45-f48`) es el MISMO evento por el otro canal: mismo
 * asunto y mismo cuerpo, y su fila en `entregas_notificacion` cuelga del aviso
 * in-app. Sin correo cargado la entrega queda `fallido` con su motivo y el aviso
 * in-app se escribe igual.
 */
export async function avisarResidenteVisita(
  fila: FilaVisita,
  scope: ComunidadScope,
  hora: string
): Promise<void> {
  const personaId = fila.destinoPersonaId
  if (fila.estado !== "ingresada" || !personaId) return
  const cfg = await prisma.configuracionGlobal.findUnique({
    where: { comunidadId: scope.comunidadId },
    select: { notificarRegistroVisitas: true },
  })
  if (cfg?.notificarRegistroVisitas === false) return

  const asunto = `Visita recibida: ${fila.nombre}`
  const cuerpo = `${fila.nombre} fue ingresada por conserjería a las ${hora}.`

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
      fecha: fila.fecha,
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
