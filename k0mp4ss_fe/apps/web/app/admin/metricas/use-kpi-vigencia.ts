"use client"

/**
 * use-kpi-vigencia — el KPI del Registro de Copropietarios para el módulo de
 * métricas (S9).
 *
 * Mismo patrón que los hooks de `lib/api/`: SWR con un fetcher que propaga el
 * mensaje del servidor como `Error`, así la pantalla muestra el motivo real
 * (por ejemplo «Permiso denegado.») en vez de un cero que se leería como «no hay
 * unidades al día». Vive acá y no en `lib/api/` porque su único consumidor es
 * `/admin/metricas` y el contrato de la cifra es de esta pantalla.
 *
 * La lectura NO se calcula en el navegador: pide el agregado a la ruta, que
 * deriva el estado de cada unidad con la misma regla que el listado del
 * Registro. Contar acá sobre el padrón completo sería una segunda definición del
 * mismo hecho y, además, obligaría a bajar todas las unidades sólo para sumar.
 */
import useSWR from "swr"
import type { KpiVigencia } from "@/lib/vigencia-metricas"

const URL_KPI = "/api/vigencia-registro/kpi"

/** Lo que devuelve la ruta: el KPI puro más la fecha con la que se derivó. */
export interface KpiVigenciaRespuesta extends KpiVigencia {
  /** ISO del instante en que el servidor derivó los estados. */
  hoy: string
}

export interface UseKpiVigenciaResultado {
  kpi: KpiVigenciaRespuesta | null
  isLoading: boolean
  error: Error | null
}

async function fetcher(url: string): Promise<KpiVigenciaRespuesta> {
  const res = await fetch(url, { headers: { accept: "application/json" } })
  if (!res.ok) {
    const cuerpo = (await res.json().catch(() => null)) as {
      error?: string
    } | null
    throw new Error(cuerpo?.error ?? `Error ${res.status} al consultar ${url}.`)
  }
  return (await res.json()) as KpiVigenciaRespuesta
}

export function useKpiVigencia(): UseKpiVigenciaResultado {
  const { data, error, isLoading } = useSWR<KpiVigenciaRespuesta, Error>(
    URL_KPI,
    fetcher,
    { revalidateOnFocus: true }
  )

  return { kpi: data ?? null, isLoading, error: error ?? null }
}
