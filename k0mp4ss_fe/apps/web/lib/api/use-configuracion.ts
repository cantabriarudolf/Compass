"use client"

/**
 * use-configuracion — hooks SWR para la configuración de la comunidad
 * (BD-FUENTE-VERDAD Fase 5A).
 *
 * useConfiguracion:
 * GET: devuelve la config única por comunidad (recurso `cf`).
 * updateConfig: PUT parcial (crea si no existe).
 *
 * useComunidadActual:
 * GET: proyección de marca `{ nombre, logoUrl }` de /api/comunidad-actual —
 * sin permiso `cf` para que el encabezado global funcione en TODOS los roles.
 */
import useSWR, { mutate as mutateGlobal } from "swr"
import type { ConfiguracionGlobal } from "@/lib/schemas"
import type { StoreResult } from "@/lib/store"

const BASE = "/api/configuracion"
const BASE_COMUNIDAD_ACTUAL = "/api/comunidad-actual"

async function fetcher<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { accept: "application/json" } })
  if (!res.ok) {
    const cuerpo = (await res.json().catch(() => null)) as { error?: string } | null
    throw new Error(cuerpo?.error ?? `Error ${res.status} al consultar ${url}.`)
  }
  return (await res.json()) as T
}

/** La ruta envuelve la marca en `{ data }`; el fetcher de arriba devuelve el cuerpo entero. */
async function fetcherComunidadActual(url: string): Promise<ComunidadActual> {
  const cuerpo = await fetcher<{ data: ComunidadActual }>(url)
  return cuerpo.data
}

export interface ConfiguracionHook {
  config: ConfiguracionGlobal | null
  isLoading: boolean
  error: Error | null
  updateConfig: (parcial: Partial<ConfiguracionGlobal>) => Promise<StoreResult>
}

export function useConfiguracion(): ConfiguracionHook {
  const { data, error, isLoading } = useSWR<ConfiguracionGlobal, Error>(
    BASE,
    fetcher,
    { revalidateOnFocus: true }
  )

  const updateConfig = async (
    parcial: Partial<ConfiguracionGlobal>
  ): Promise<StoreResult> => {
    try {
      const res = await fetch(BASE, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(parcial),
      })
      const cuerpo = (await res.json().catch(() => null)) as
        | { error?: string }
        | null
      if (!res.ok) {
        return {
          ok: false,
          error: cuerpo?.error ?? `Error ${res.status} al actualizar configuración.`,
        }
      }
      void mutateGlobal(BASE)
      return { ok: true }
    } catch {
      return { ok: false, error: "Sin conexión con el servidor." }
    }
  }

  return {
    config: data ?? null,
    isLoading,
    error: error ?? null,
    updateConfig,
  }
}

export interface ComunidadActual {
  nombre: string
  logoUrl: string | null
}

export interface ComunidadActualHook {
  nombre: string
  logoUrl?: string
  isLoading: boolean
  error: Error | null
}

/**
 * Marca de la comunidad activa para el encabezado global (app-sidebar, community-header).
 *
 * Es la calle de uso que la app completa tiene disponible: no exige `cf`, así que
 * conserjería, residente y mantención obtienen la misma respuesta que el administrador.
 * Mientras carga o si la petición falla, `nombre` viene vacío y `logoUrl` undefined: los
 * componentes caen a su fallback ("GECOS" + ícono) sin parpadeos raros.
 */
/**
 * Hook de marca de la comunidad activa.
 *
 * `activa` en `false` deja la consulta apagada (SWR con clave null): el layout
 * global monta el encabezado también en las pantallas públicas, donde no hay
 * sesión ni comunidad y la petición respondería 401 en cada carga.
 */
export function useComunidadActual(activa = true): ComunidadActualHook {
  const { data, error, isLoading } = useSWR<ComunidadActual, Error>(
    activa ? BASE_COMUNIDAD_ACTUAL : null,
    fetcherComunidadActual,
    { revalidateOnFocus: true }
  )

  return {
    nombre: data?.nombre ?? "",
    logoUrl: data?.logoUrl || undefined,
    isLoading,
    error: error ?? null,
  }
}
