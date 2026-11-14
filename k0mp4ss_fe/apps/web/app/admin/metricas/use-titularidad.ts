"use client"

/**
 * use-titularidad — las unidades sin propietario vigente para el módulo de
 * métricas.
 *
 * Mismo patrón que `use-kpi-vigencia`: SWR con un fetcher que propaga el mensaje
 * del servidor como `Error`, así la tarjeta muestra el motivo real (por ejemplo
 * «Permiso denegado.») en vez de un cero que se leería como «todas las unidades
 * tienen dueño». Vive acá y no en `lib/api/` porque su único consumidor es
 * `/admin/metricas` y el contrato de la cifra es de esta pantalla.
 *
 * La lectura NO se calcula en el navegador: pide el agregado a la ruta, que lo
 * deriva con `leerTitularidad` — la misma definición del chequeo de integridad.
 * El cuerpo NUNCA trae datos de persona: unidad, número y causa.
 */
import useSWR from "swr"
import type { CausaSinTitular } from "./_titularidad"

const URL_TITULARIDAD = "/api/metricas/titularidad"

/** Una unidad sin propietario vigente, proyectada para la pantalla. */
export interface UnidadSinTitularRespuesta {
  numero: string
  causa: CausaSinTitular
}

/** Lo que devuelve la ruta: el agregado más la lista corta por número. */
export interface TitularidadRespuesta {
  /** Total de unidades sin propietario vigente (completo, aunque la lista se corte). */
  sinTitular: number
  nuncaDeclarado: number
  vinculoCerradoSinReemplazo: number
  unidades: UnidadSinTitularRespuesta[]
}

export interface UseTitularidadResultado {
  titularidad: TitularidadRespuesta | null
  isLoading: boolean
  error: Error | null
}

async function fetcher(url: string): Promise<TitularidadRespuesta> {
  const res = await fetch(url, { headers: { accept: "application/json" } })
  if (!res.ok) {
    const cuerpo = (await res.json().catch(() => null)) as {
      error?: string
    } | null
    throw new Error(cuerpo?.error ?? `Error ${res.status} al consultar ${url}.`)
  }
  return (await res.json()) as TitularidadRespuesta
}

export function useTitularidad(): UseTitularidadResultado {
  const { data, error, isLoading } = useSWR<TitularidadRespuesta, Error>(
    URL_TITULARIDAD,
    fetcher,
    { revalidateOnFocus: true }
  )

  return { titularidad: data ?? null, isLoading, error: error ?? null }
}
