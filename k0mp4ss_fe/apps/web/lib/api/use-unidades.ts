"use client"

/**
 * use-unidades — colección de unidades EF y búsqueda de destino de la operación (F6).
 *
 * - `useUnidades()`: hooks SWR para unidades EF (BD-FUENTE-VERDAD Fase 3).
 * - `buscarUnidades()`: búsqueda por texto para el selector de «Unidad destino» de la bitácora
 *   PE. Pega en `GET /api/pe/unidades?q=`, la proyección de solo lectura de la operación de
 *   conserjería: cuatro campos, el scope de la sesión y el permiso `pe:bitacora`, que es el que
 *   tiene el rol que registra la visita. `/api/unidades` es el padrón completo y está detrás de
 *   `mp`, que conserjería no tiene: pedirlo ahí devolvía 403 al rol que lo necesita.
 *
 * Mismo patrón que `buscarPersonaPorRun` en `use-personas.ts`: función suelta que propaga el
 * error, para que el consumidor decida si lo declara o cae a un padrón local.
 */
import { useCrudCollection, type CrudCollection } from "./use-crud-collection"
import type { Unidad } from "@/lib/schemas"
import {
  esUnidadDestino,
  etiquetaUnidad,
  type UnidadBuscable,
  type UnidadOpcion,
} from "@/lib/unidades-destino"

export function useUnidades(): CrudCollection<Unidad> {
  return useCrudCollection<Unidad>("/api/unidades")
}

const LISTA = "/api/pe/unidades"

/**
 * Tamaño de página de la búsqueda: más chico que el tope de la ruta (50) para que el listbox
 * del selector no monte cientos de opciones por tecla.
 */
const PAGE_SIZE_BUSQUEDA = 25

/**
 * Busca unidades destino por texto y devuelve las opciones listas para el selector.
 *
 * La ruta ya excluye las plazas de estacionamiento; se filtra otra vez acá como guarda, porque
 * esta lista también alimenta la preselección de la identidad leída del QR.
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
