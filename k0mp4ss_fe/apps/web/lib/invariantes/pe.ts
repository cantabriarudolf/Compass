/**
 * INV-02 — Un cierre de turno por trabajador, fecha y jornada reportada.
 *
 * Decisión del owner (2026-10-31): una persona cierra UN turno por fecha y
 * jornada. Dos trabajadores pueden llamarse igual —lo que los distingue es el
 * RUT, identidad del Maestro de Personas— así que la regla se ancla en
 * `trabajadorPersonaId` (la ficha con RUT único por comunidad) y NUNCA en
 * `nombreCompleto`.
 *
 * Antes vivía sólo en la pantalla de bitácora:
 * `app/operaciones/bitacora/page.tsx:182` bloqueaba el alta con un `setError`,
 * y la API aceptaba el duplicado (POST y PUT).
 *
 * `guardiaCierreUnico` es la única puerta del servidor y se enchufa como
 * `antesDeEscribir` tanto en la factory CRUD (`POST /api/pe/cierres-turno`)
 * como en el put-merge (`PUT /api/pe/cierres-turno/[id]`).
 */

import { prisma } from "@/lib/prisma"
import { jsonError } from "@/lib/api/with-comunidad-scope"
import type { ComunidadScope } from "@/lib/api/with-comunidad-scope"

export const MENSAJE_CIERRE_DUPLICADO =
  "Conflicto: ese trabajador ya registró un cierre para esa fecha y jornada."

/** Claves efectivas: en el PUT parcial se funden payload y fila previa. */
export function clavesCierre(
  fila: Record<string, unknown>
): { fecha: string; jornadaReportadaId: string; trabajadorPersonaId: string } | null {
  const fecha = fila.fecha
  const jornada = fila.jornadaReportadaId
  const trabajador = fila.trabajadorPersonaId
  if (
    typeof fecha !== "string" ||
    typeof jornada !== "string" ||
    typeof trabajador !== "string"
  ) {
    return null
  }
  return { fecha, jornadaReportadaId: jornada, trabajadorPersonaId: trabajador }
}

/** ¿Ya hay otro cierre de ese trabajador para la misma fecha y jornada? */
export async function cierreTurnoDuplicado(
  comunidadId: string,
  fecha: string,
  jornadaReportadaId: string,
  trabajadorPersonaId: string,
  excluirId?: string
): Promise<boolean> {
  const dup = await prisma.cierreTurnoPE.findFirst({
    where: {
      comunidadId,
      fecha,
      jornadaReportadaId,
      trabajadorPersonaId,
      ...(excluirId ? { NOT: { id: excluirId } } : {}),
    },
    select: { id: true },
  })
  return dup !== null
}

/** Guardia `antesDeEscribir`: 409 si el cierre rompe INV-02, null si puede pasar. */
export async function guardiaCierreUnico({
  datos,
  previo,
  scope,
}: {
  datos: Record<string, unknown>
  previo: Record<string, unknown> | null
  scope: ComunidadScope
}): Promise<Response | null> {
  const efectivo = clavesCierre({ ...(previo ?? {}), ...datos })
  if (!efectivo) return null
  const excluirId = typeof previo?.id === "string" ? previo.id : undefined
  const dup = await cierreTurnoDuplicado(
    scope.comunidadId,
    efectivo.fecha,
    efectivo.jornadaReportadaId,
    efectivo.trabajadorPersonaId,
    excluirId
  )
  return dup ? jsonError(409, MENSAJE_CIERRE_DUPLICADO) : null
}

/**
 * PE-visitas — La autorización telefónica del residente no se reedita.
 *
 * Decisión del owner (2026-11-01): cuando la visita llega SIN aviso, el conserje
 * llama al residente y pide el OK por teléfono. Si lo recibe, registra la visita
 * marcando «autorización telefónica recibida» y el sistema guarda la hora de esa
 * gestión. Una vez guardada, la autorización es **constancia de quién dejó entrar
 * a esa persona** y por eso no se puede revocar ni corregir después: si se
 * pudiera, el registro dejaría de servir como prueba.
 *
 * El aviso de que no se podrá editar se da en la UI ANTES de guardar
 * (`components/pe/visitas-panel.tsx`, AlertDialog). Esta guardia es la que lo
 * hace valer por cualquier camino —panel, curl o script—, igual que la baja
 * protegida de F15 y la guardia de INV-02.
 *
 * Reglas:
 * 1. Una autorización ya registrada no se revoca (true → false se corta).
 * 2. La hora de una gestión ya registrada no se reescribe.
 * 3. Marcar la autorización exige la hora de la gestión: sin ella el registro
 *    diría que alguien autorizó pero no cuándo, que es medio registro.
 */

export const MENSAJE_AUTORIZACION_INMUTABLE =
  "La autorización telefónica ya quedó registrada y no se puede editar."

export const MENSAJE_AUTORIZACION_SIN_HORA =
  "La autorización telefónica necesita la hora de la gestión."

/** Guardia `antesDeEscribir`: corta la reedición de la autorización, null si puede pasar. */
export function guardiaAutorizacionInmutable({
  datos,
  previo,
}: {
  datos: Record<string, unknown>
  previo: Record<string, unknown> | null
}): Response | null {
  const autorizada = datos.autorizacionTelefonica === true
  const hora = typeof datos.horaAutorizacion === "string" ? datos.horaAutorizacion : undefined

  // Marcar la autorización sin hora deja un registro a medias.
  if (autorizada && !hora) return jsonError(400, MENSAJE_AUTORIZACION_SIN_HORA)

  // En el POST no hay fila previa: no hay nada que proteger todavía.
  if (!previo) return null

  // Revocar una autorización ya registrada.
  if (previo.autorizacionTelefonica === true && !autorizada) {
    return jsonError(409, MENSAJE_AUTORIZACION_INMUTABLE)
  }

  // Reescribir la hora de una gestión ya registrada.
  const horaPrevia =
    typeof previo.horaAutorizacion === "string" ? previo.horaAutorizacion : undefined
  if (horaPrevia !== undefined && hora !== undefined && hora !== horaPrevia) {
    return jsonError(409, MENSAJE_AUTORIZACION_INMUTABLE)
  }

  return null
}
