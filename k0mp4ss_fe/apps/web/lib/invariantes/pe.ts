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
