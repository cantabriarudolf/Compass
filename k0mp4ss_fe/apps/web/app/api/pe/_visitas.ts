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
 *   semántica del store (`!== false`: sin configuración, se notifica).
 *
 * Los dos son idempotentes por estado: el llamador decide si la transición
 * corresponde (una visita ya `ingresada` no vuelve a emitir ni a avisar).
 */
import { prisma } from "@/lib/prisma"
import { generarId } from "@/lib/id-utils"
import type { ComunidadScope } from "@/lib/api/with-comunidad-scope"
import { registrarEventoPE } from "@/app/api/pe/_acciones"

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
 */
export async function avisarResidenteVisita(
  fila: FilaVisita,
  scope: ComunidadScope,
  hora: string
): Promise<void> {
  if (fila.estado !== "ingresada" || !fila.destinoPersonaId) return
  const cfg = await prisma.configuracionGlobal.findUnique({
    where: { comunidadId: scope.comunidadId },
    select: { notificarRegistroVisitas: true },
  })
  if (cfg?.notificarRegistroVisitas === false) return
  await prisma.notificacion.create({
    data: {
      id: generarId("not"),
      comunidadId: scope.comunidadId,
      destinatarioRol: "residente",
      destinatarioPersonaId: fila.destinoPersonaId,
      unidadId: fila.unidadId ?? null,
      asunto: `Visita recibida: ${fila.nombre}`,
      cuerpo: `${fila.nombre} fue ingresada por conserjería a las ${hora}.`,
      moduloOrigen: "PE",
      fecha: fila.fecha,
    },
  })
}
