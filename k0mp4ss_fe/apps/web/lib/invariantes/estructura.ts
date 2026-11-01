/**
 * INV-04 — Un micro sector por nombre dentro de su macro sector (edificio).
 *
 * Decisión del owner (2026-10-31): "Piso 4" se repite ENTRE edificios (macro
 * sectores distintos) porque el nombre se compone con el padre; lo que no puede
 * pasar es dos "Piso 4" en el MISMO edificio: eso es duplicación.
 *
 * Complementa la restricción de la base
 * (`@@unique([comunidadId, macroSectorId, nombre])`, migración
 * `20261031000000_add_micro_sectores_nombre_unico`), que compara TEXT tal cual:
 * acá se compara normalizado (trim + minúsculas) para que "Piso 4" y "piso 4"
 * tampoco entren.
 */

import { prisma } from "@/lib/prisma"
import { jsonError } from "@/lib/api/with-comunidad-scope"
import type { ComunidadScope } from "@/lib/api/with-comunidad-scope"

export const MENSAJE_MICRO_DUPLICADO =
  "Conflicto: ya existe un micro sector con ese nombre en este macro sector."

/**
 * ¿Otro micro sector del mismo macro sector ya usa ese nombre?
 *
 * El filtro por nombre va en memoria (normalizado) y no en SQL a propósito: el
 * conjunto es chico (los pisos/sectores de un edificio) y la comparación tiene
 * que ser case-insensitive, que SQLite no ofrece sin `mode: "insensitive"`.
 */
export async function microSectorDuplicado(
  comunidadId: string,
  macroSectorId: string,
  nombre: string,
  excluirId?: string
): Promise<boolean> {
  const iguales = await prisma.microSector.findMany({
    where: {
      comunidadId,
      macroSectorId,
      ...(excluirId ? { NOT: { id: excluirId } } : {}),
    },
    select: { nombre: true },
  })
  const buscado = nombre.trim().toLowerCase()
  return iguales.some((m) => m.nombre.trim().toLowerCase() === buscado)
}

/** Guardia `antesDeEscribir` para el POST de la colección. */
export async function guardiaMicroSectorUnico({
  datos,
  previo,
  scope,
}: {
  datos: Record<string, unknown>
  previo: Record<string, unknown> | null
  scope: ComunidadScope
}): Promise<Response | null> {
  const nombre = datos.nombre ?? previo?.nombre
  const macroSectorId = datos.macroSectorId ?? previo?.macroSectorId
  if (typeof nombre !== "string" || typeof macroSectorId !== "string") return null
  const excluirId = typeof previo?.id === "string" ? previo.id : undefined
  const dup = await microSectorDuplicado(
    scope.comunidadId,
    macroSectorId,
    nombre,
    excluirId
  )
  return dup ? jsonError(409, MENSAJE_MICRO_DUPLICADO) : null
}
