"use client"

/**
 * use-vinculos — hooks SWR para la colección VU (BD-FUENTE-VERDAD Fase 0).
 *
 * - Lectura: GET /api/vinculos y GET /api/vinculos/[id]. La API no filtra por
 *   personaId en el servidor: el scoping por persona lo hace el consumidor.
 * - Escritura: POST (upsert idempotente por id, con cierre automático del tramo
 *   anterior), PUT parcial y DELETE; cada mutación revalida las claves SWR.
 * - Contrato de mutación: Promise<StoreResult> ({ ok, error? }).
 */
import useSWR, { mutate as mutateGlobal } from "swr"
import type { VinculoUnidad } from "@/data/comunidad/vinculos"
import type { StoreResult } from "@/lib/store"

const LISTA = "/api/vinculos"

const claveItem = (id: string) => `${LISTA}/${id}`

async function fetcher<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { accept: "application/json" } })
  if (!res.ok) {
    const cuerpo = (await res.json().catch(() => null)) as { error?: string } | null
    throw new Error(cuerpo?.error ?? `Error ${res.status} al consultar ${url}.`)
  }
  return (await res.json()) as T
}

interface ColeccionVinculos {
  data: VinculoUnidad[]
  page: number
  pageSize: number
  total: number
}

/** Envía una mutación y traduce la respuesta HTTP a StoreResult. */
async function enviar(
  url: string,
  method: "POST" | "PUT" | "DELETE",
  body?: unknown
): Promise<StoreResult> {
  try {
    const res = await fetch(url, {
      method,
      headers: { "content-type": "application/json" },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    })
    if (!res.ok) {
      const cuerpo = (await res.json().catch(() => null)) as { error?: string } | null
      return { ok: false, error: cuerpo?.error ?? `Error ${res.status} al llamar ${url}.` }
    }
    return { ok: true }
  } catch {
    return { ok: false, error: "Sin conexión con el servidor." }
  }
}

/** Invalida (revalida) todas las claves SWR de la colección de vínculos. */
function invalidarVinculos(): void {
  void mutateGlobal(
    (key) => typeof key === "string" && (key === LISTA || key.startsWith(`${LISTA}?`))
  )
}

export interface UseVinculosResultado {
  vinculos: VinculoUnidad[]
  isLoading: boolean
  error: Error | null
  create: (vinculo: VinculoUnidad) => Promise<StoreResult>
  update: (id: string, parcial: Partial<VinculoUnidad>) => Promise<StoreResult>
  remove: (id: string) => Promise<StoreResult>
}

/**
 * Colección completa de vínculos de la comunidad (el filtrado por persona es
 * responsabilidad del consumidor, ver vinculos → .filter(v => v.personaId === id)).
 */
export function useVinculos(): UseVinculosResultado {
  const url = `${LISTA}?pageSize=100`
  const { data, error, isLoading, mutate } = useSWR<ColeccionVinculos, Error>(url, fetcher, {
    revalidateOnFocus: true,
  })

  const create = async (vinculo: VinculoUnidad): Promise<StoreResult> => {
    const resultado = await enviar(LISTA, "POST", vinculo)
    if (resultado.ok) void mutate()
    return resultado
  }

  const update = async (id: string, parcial: Partial<VinculoUnidad>): Promise<StoreResult> => {
    const resultado = await enviar(claveItem(id), "PUT", parcial)
    if (resultado.ok) {
      void mutateGlobal(claveItem(id))
      void mutate()
    }
    return resultado
  }

  const remove = async (id: string): Promise<StoreResult> => {
    const resultado = await enviar(claveItem(id), "DELETE")
    if (resultado.ok) void mutate()
    return resultado
  }

  return {
    vinculos: data?.data ?? [],
    isLoading,
    error: error ?? null,
    create,
    update,
    remove,
  }
}

export interface UseVinculoResultado {
  vinculo: VinculoUnidad | undefined
  isLoading: boolean
  error: Error | null
  update: (parcial: Partial<VinculoUnidad>) => Promise<StoreResult>
  remove: () => Promise<StoreResult>
}

/** Detalle de un vínculo por id. */
export function useVinculo(id: string): UseVinculoResultado {
  const url = id ? claveItem(id) : null
  const { data, error, isLoading, mutate } = useSWR<VinculoUnidad, Error>(url, fetcher, {
    revalidateOnFocus: true,
  })

  const update = async (parcial: Partial<VinculoUnidad>): Promise<StoreResult> => {
    const resultado = await enviar(claveItem(id), "PUT", parcial)
    if (resultado.ok) {
      void mutate()
      invalidarVinculos()
    }
    return resultado
  }

  const remove = async (): Promise<StoreResult> => {
    const resultado = await enviar(claveItem(id), "DELETE")
    if (resultado.ok) invalidarVinculos()
    return resultado
  }

  return {
    vinculo: data,
    isLoading,
    error: error ?? null,
    update,
    remove,
  }
}
