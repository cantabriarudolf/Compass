/**
 * unidades-destino — reglas de una unidad que puede recibir una visita.
 *
 * Vive fuera de `lib/api/use-unidades.ts` porque la misma regla la necesitan las dos puntas:
 * el servidor (`app/api/pe/unidades/route.ts` decide qué proyecta) y el cliente (el selector de
 * «Unidad destino» arma la etiqueta visible). Sin `"use client"`: es lógica pura y la importa
 * también el route handler.
 */

/** Campos de una unidad que la búsqueda de destino necesita. */
export interface UnidadBuscable {
  id: string
  numero: string
  etiqueta: string
  rolSii?: string
}

/** Opción mínima que consume `components/selector-buscable.tsx`. */
export interface UnidadOpcion {
  id: string
  etiqueta: string
}

/**
 * Etiqueta del maestro que NO es destino de visita.
 *
 * Es un valor de dato (`estadoId`-style), no un prefijo de id: los departamentos de la torre E
 * comparten el prefijo `u-E-` con las plazas de estacionamiento (`u-E-101` es «Depto 101» y
 * `u-E-001` es «Estacionamiento E-001»), así que filtrar por `startsWith("u-E-")` escondía una
 * torre entera.
 */
export const ETIQUETA_NO_DESTINO = "Estacionamiento"

/**
 * ¿La unidad puede ser destino de una visita?
 *
 * Lo decide la etiqueta, nunca el id. El `id` se acepta en la firma para que quien tenga la
 * unidad completa no tenga que recortarla, pero la decisión no lo mira.
 */
export function esUnidadDestino(unidad: Pick<UnidadBuscable, "etiqueta" | "id">): boolean {
  return unidad.etiqueta !== ETIQUETA_NO_DESTINO
}

/**
 * Etiqueta visible de una unidad: etiqueta + número, más el rol SII cuando existe.
 *
 * El rol SII es lo que desambigua las homónimas: una comunidad puede tener cinco «Depto 101»
 * (torres A–E) y sin el rol el conserje no puede saber cuál está eligiendo.
 */
export function etiquetaUnidad(
  unidad: Pick<UnidadBuscable, "etiqueta" | "numero" | "rolSii">
): string {
  const base = `${unidad.etiqueta} ${unidad.numero}`.trim()
  const rol = unidad.rolSii?.trim()
  return rol ? `${base} · ${rol}` : base
}
