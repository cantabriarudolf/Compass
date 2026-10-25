"use client"

/**
 * use-unidades — colección de unidades EF y búsqueda de destino de la operación (F6).
 *
 * - `useUnidades()`: hooks SWR para unidades EF (BD-FUENTE-VERDAD Fase 3).
 * - `useUnidadesOperacion()`: padrón completo de la operación para los selects de los paneles PE
 *   (`pageSize=100`, el `LIMITE_SELECT` de `components/pe/aviso-truncamiento.tsx`), con el `total`
 *   del servidor para poder avisar el truncamiento en vez de cortar en silencio.
 * - `buscarUnidades()`: búsqueda por texto para el selector de «Unidad destino» de la bitácora
 *   PE. Pega en `GET /api/pe/unidades?q=`, la proyección de solo lectura de la operación de
 *   conserjería: cuatro campos, el scope de la sesión y el permiso `pe:bitacora`, que es el que
 *   tiene el rol que registra la visita. `/api/unidades` es el padrón completo y está detrás de
 *   `mp`, que conserjería no tiene: pedirlo ahí devolvía 403 al rol que lo necesita.
 *
 * Mismo patrón que `buscarPersonaPorRun` en `use-personas.ts`: función suelta que propaga el
 * error, para que el consumidor decida si lo declara o cae a un padrón local.
 */
import useSWR from "swr"
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
 * Tamaño de página de la búsqueda: más chico que el tope de la ruta (100) para que el listbox
 * del selector no monte cientos de opciones por tecla.
 */
const PAGE_SIZE_BUSQUEDA = 25

/** Tamaño de página del padrón completo: coincide con `LIMITE_SELECT` (AvisoTruncamiento). */
const PAGE_SIZE_PADRON = 100

/**
 * Fetcher SWR del padrón de la operación: lanza Error con el mensaje del cuerpo cuando el HTTP
 * falla, mismo estilo que el resto de los hooks de `lib/api/`.
 */
async function fetcher<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { accept: "application/json" } })
  if (!res.ok) {
    const cuerpo = (await res.json().catch(() => null)) as { error?: string } | null
    throw new Error(cuerpo?.error ?? `Error ${res.status} al consultar ${url}.`)
  }
  return (await res.json()) as T
}

interface ColeccionUnidadesOperacion {
  data: UnidadBuscable[]
  pageSize: number
  total: number
}

export interface UseUnidadesOperacionResultado {
  unidades: UnidadBuscable[]
  /**
   * Total de unidades que reporta el servidor para el scope activo.
   *
   * La lista se pide con `pageSize=100`, así que `unidades.length` puede ser menor que `total`:
   * el consumidor DEBE avisar en pantalla cuando `total > unidades.length` en vez de truncar en
   * silencio (ver `components/pe/aviso-truncamiento.tsx`).
   */
  total: number
  isLoading: boolean
  error: Error | null
}

/**
 * Padrón completo de unidades destino de la operación, paginado al tope del selector.
 *
 * Pega en `GET /api/pe/unidades?pageSize=100`, la proyección de solo lectura gobernada por
 * `pe:bitacora` (el padrón de `mp` le devuelve 403 a la conserjería). El filtro
 * `esUnidadDestino` de la vista NO se aplica acá: la ruta ya excluye las plazas, y el total
 * del envelope se referencia contra lo que efectivamente devuelve.
 */
export function useUnidadesOperacion(): UseUnidadesOperacionResultado {
  const url = `${LISTA}?pageSize=${PAGE_SIZE_PADRON}`
  const { data, error, isLoading } = useSWR<ColeccionUnidadesOperacion, Error>(url, fetcher, {
    revalidateOnFocus: true,
  })

  return {
    unidades: data?.data ?? [],
    total: data?.total ?? 0,
    isLoading,
    error: error ?? null,
  }
}

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
