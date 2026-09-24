"use client"

/**
 * use-server-collection — hook de lectura para colecciones servidas por la
 * API REST (BD-FUENTE-VERDAD Fase 0).
 *
 * - SWR con revalidación en foco de ventana.
 * - Caché offline: cada respuesta exitosa se guarda en localStorage y se
 *   reutiliza como fallback cuando la red falla (navigator.onLine === false
 *   o fetch lanza error de red). La fuente de verdad sigue siendo el servidor.
 */
import useSWR, { type KeyedMutator } from "swr"

const CLAVE_CACHE = (endpoint: string) => `compass-server-cache:${endpoint}`

function leerCache<T>(endpoint: string): T | null {
  if (typeof window === "undefined") return null
  try {
    const bruto = window.localStorage.getItem(CLAVE_CACHE(endpoint))
    return bruto ? (JSON.parse(bruto) as T) : null
  } catch {
    return null
  }
}

function guardarCache<T>(endpoint: string, data: T): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(CLAVE_CACHE(endpoint), JSON.stringify(data))
  } catch {
    // Cuota llena o storage no disponible: la caché offline es best-effort.
  }
}

async function fetcher<T>(endpoint: string): Promise<T> {
  let res: Response
  try {
    res = await fetch(endpoint, { headers: { accept: "application/json" } })
  } catch {
    // Red caída (offline): servir la última copia conocida si existe.
    const cache = leerCache<T>(endpoint)
    if (cache !== null) return cache
    throw new Error(
      `Sin conexión y sin caché offline para ${endpoint}.`
    )
  }
  if (!res.ok) {
    throw new Error(`Error ${res.status} al consultar ${endpoint}.`)
  }
  const data = (await res.json()) as T
  guardarCache(endpoint, data)
  return data
}

export interface ServerCollection<T> {
  data: T | undefined
  error: Error | null
  isLoading: boolean
  mutate: KeyedMutator<T>
}

/**
 * Lee una colección del servidor. `endpoint` es la URL de la API
 * (ej. "/api/periodos-directiva"); el scoping por comunidad lo resuelve la
 * sesión, no el cliente.
 */
export function useServerCollection<T>(endpoint: string): ServerCollection<T> {
  const { data, error, isLoading, mutate } = useSWR<T, Error>(
    endpoint,
    fetcher,
    { revalidateOnFocus: true }
  )
  return { data, error: error ?? null, isLoading, mutate }
}
