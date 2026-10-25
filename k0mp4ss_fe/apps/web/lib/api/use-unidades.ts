"use client"

/**
 * use-unidades — colección de unidades EF y búsqueda de destino en el servidor.
 *
 * - `useUnidades()`: hooks SWR para unidades EF (BD-FUENTE-VERDAD Fase 3).
 * - `buscarUnidades()` + helpers: búsqueda por texto para el selector de «Unidad destino»
 *   de la bitácora PE (F6). El término viaja a `GET /api/unidades?q=`, que resuelve sobre
 *   `numero`, `etiqueta` y `rolSii` de toda la comunidad en el scope de la sesión
 *   (`busqueda` opt-in de `lib/api/crud-factory.ts`, PR #16): el selector ya no depende de
 *   las primeras `LIMITE_SELECT` opciones montadas.
 *
 * Mismo patrón que `buscarPersonaPorRun` en `use-personas.ts`: función suelta que propaga el
 * error, para que el consumidor decida si lo declara o cae a un padrón local.
 */
import { useCrudCollection, type CrudCollection } from "./use-crud-collection"
import type { Unidad } from "@/lib/schemas"

export function useUnidades(): CrudCollection<Unidad> {
  return useCrudCollection<Unidad>("/api/unidades")
}

const LISTA = "/api/unidades"

/**
 * Tamaño de página de la búsqueda: más chico que el tope de la API (100) para que el listbox
 * del selector no monte cientos de opciones por tecla.
 */
const PAGE_SIZE_BUSQUEDA = 25

/** Campos de una unidad que la búsqueda necesita (subset de `Unidad`). */
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
 * ¿La unidad puede ser destino de una visita?
 *
 * Lo decide la ETIQUETA, nunca el prefijo del id: los departamentos de la torre E comparten el
 * prefijo `u-E-` con las plazas de estacionamiento (`u-E-101` es «Depto 101» y `u-E-001` es
 * «Estacionamiento E-001»), así que filtrar por `startsWith("u-E-")` escondía una torre entera.
 * El `id` se acepta en la firma para que quien tenga la unidad completa no tenga que recortarla,
 * pero la decisión no lo mira.
 */
export function esUnidadDestino(
  unidad: Pick<UnidadBuscable, "etiqueta" | "id">
): boolean {
  return unidad.etiqueta !== "Estacionamiento"
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

/**
 * Busca unidades destino por texto y devuelve las opciones listas para el selector.
 *
 * Descarta las plazas de estacionamiento de la página pedida: no son destinos de visita.
 */
export async function buscarUnidades(q: string): Promise<UnidadOpcion[]> {
  const termino = q.trim()
  if (!termino) return []
  const url = `${LISTA}?q=${encodeURIComponent(termino)}&pageSize=${PAGE_SIZE_BUSQUEDA}`
  const res = await fetch(url, { headers: { accept: "application/json" } })
  if (!res.ok) {
    const cuerpo = (await res.json().catch(() => null)) as { error?: string } | null
    throw new Error(cuerpo?.error ?? `Error ${res.status} al buscar unidades.`)
  }
  const coleccion = (await res.json()) as { data?: UnidadBuscable[] }
  return (coleccion.data ?? [])
    .filter(esUnidadDestino)
    .map((unidad) => ({ id: unidad.id, etiqueta: etiquetaUnidad(unidad) }))
}
