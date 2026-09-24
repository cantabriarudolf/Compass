"use client"

/**
 * use-personas — hooks SWR para la colección MP (BD-FUENTE-VERDAD Fase 0).
 *
 - Lectura: GET /api/personas (con ?q= opcional) y GET /api/personas/[id].
 - Escritura: POST (upsert idempotente por id), PUT parcial y DELETE contra las
   mismas rutas; cada mutación revalida las claves SWR afectadas.
 - Contrato de mutación: Promise<StoreResult> ({ ok, error? }) para poder
   intercambiarse con las acciones legacy del store zustand.
 */
import useSWR, { mutate as mutateGlobal } from "swr"
import type { Persona } from "@/data/comunidad/personas"
import type { StoreResult } from "@/lib/store"

const LISTA = "/api/personas"

const claveItem = (id: string) => `${LISTA}/${id}`

async function fetcher<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { accept: "application/json" } })
  if (!res.ok) {
    const cuerpo = (await res.json().catch(() => null)) as { error?: string } | null
    throw new Error(cuerpo?.error ?? `Error ${res.status} al consultar ${url}.`)
  }
  return (await res.json()) as T
}

interface ColeccionPersonas {
  data: Persona[]
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

/** Invalida (revalida) todas las claves SWR de la colección de personas. */
function invalidarPersonas(): void {
  void mutateGlobal(
    (key) => typeof key === "string" && (key === LISTA || key.startsWith(`${LISTA}?`))
  )
}

export interface UsePersonasResultado {
  personas: Persona[]
  isLoading: boolean
  error: Error | null
  create: (persona: Partial<Persona>) => Promise<StoreResult>
  update: (id: string, parcial: Partial<Persona>) => Promise<StoreResult>
  remove: (id: string) => Promise<StoreResult>
}

/** Lista paginada de personas, filtrable por ?q= (nombreCompleto | rut | email). */
export function usePersonas(q?: string): UsePersonasResultado {
  const url = q && q.trim() ? `${LISTA}?q=${encodeURIComponent(q.trim())}&pageSize=100` : `${LISTA}?pageSize=100`
  const { data, error, isLoading, mutate } = useSWR<ColeccionPersonas, Error>(url, fetcher, {
    revalidateOnFocus: true,
  })

  const create = async (persona: Partial<Persona>): Promise<StoreResult> => {
    const resultado = await enviar(LISTA, "POST", persona)
    if (resultado.ok) void mutate()
    return resultado
  }

  const update = async (id: string, parcial: Partial<Persona>): Promise<StoreResult> => {
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
    personas: data?.data ?? [],
    isLoading,
    error: error ?? null,
    create,
    update,
    remove,
  }
}

export interface UsePersonaResultado {
  persona: Persona | undefined
  isLoading: boolean
  error: Error | null
  update: (parcial: Partial<Persona>) => Promise<StoreResult>
  remove: () => Promise<StoreResult>
}

/** Detalle de una persona por id. */
export function usePersona(id: string): UsePersonaResultado {
  const url = id ? claveItem(id) : null
  const { data, error, isLoading, mutate } = useSWR<Persona, Error>(url, fetcher, {
    revalidateOnFocus: true,
  })

  const update = async (parcial: Partial<Persona>): Promise<StoreResult> => {
    const resultado = await enviar(claveItem(id), "PUT", parcial)
    if (resultado.ok) {
      void mutate()
      invalidarPersonas()
    }
    return resultado
  }

  const remove = async (): Promise<StoreResult> => {
    const resultado = await enviar(claveItem(id), "DELETE")
    if (resultado.ok) invalidarPersonas()
    return resultado
  }

  return {
    persona: data,
    isLoading,
    error: error ?? null,
    update,
    remove,
  }
}
