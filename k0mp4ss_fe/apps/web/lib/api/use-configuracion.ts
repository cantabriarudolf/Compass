"use client"

/**
 * use-configuracion — hook SWR para ConfiguracionGlobal singleton
 * (BD-FUENTE-VERDAD Fase 5A).
 *
 * GET: devuelve la config única por comunidad.
 * updateConfig: PUT parcial (crea si no existe).
 */
import useSWR, { mutate as mutateGlobal } from "swr"
import type { ConfiguracionGlobal } from "@/lib/schemas"
import type { StoreResult } from "@/lib/store"

const BASE = "/api/configuracion"

async function fetcher<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { accept: "application/json" } })
  if (!res.ok) {
    const cuerpo = (await res.json().catch(() => null)) as { error?: string } | null
    throw new Error(cuerpo?.error ?? `Error ${res.status} al consultar ${url}.`)
  }
  return (await res.json()) as T
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
