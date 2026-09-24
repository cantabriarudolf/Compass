"use client"

/**
 * use-controles-propiedad — hooks SWR para los controles de privacidad AD (Fase 2).
 *
 * Lectura: GET /api/controles-propiedad (el servidor filtra por rol: gestión
 * ve todo, residente solo sus unidades).
 * Escritura: POST (upsert idempotente por id), PUT parcial y DELETE.
 * Contrato de mutación: Promise<StoreResult>, intercambiable con el store legacy.
 */
import useSWR, { mutate as mutateGlobal } from "swr"
import type { ControlPropiedad } from "@/lib/schemas"
import type { StoreResult } from "@/lib/store"

const LISTA = "/api/controles-propiedad"

const claveItem = (id: string) => `${LISTA}/${id}`

async function fetcher<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { accept: "application/json" } })
  if (!res.ok) {
    const cuerpo = (await res.json().catch(() => null)) as { error?: string } | null
    throw new Error(cuerpo?.error ?? `Error ${res.status} al consultar ${url}.`)
  }
  // SAFETY: la API valida con ControlPropiedadSchema al escribir; el cliente tipa la fila como ControlPropiedad.
  const crudo = (await res.json()) as unknown
  if (crudo && typeof crudo === "object" && "data" in (crudo as Record<string, unknown>)) {
    const col = crudo as { data: unknown[]; page: number; pageSize: number; total: number }
    // SAFETY: filas Json validadas por zod en el servidor; el cliente las tipa como entidad.
    return { ...col, data: col.data as unknown as ControlPropiedad[] } as unknown as T
  }
  return crudo as T
}

interface ColeccionControles {
  data: ControlPropiedad[]
  page: number
  pageSize: number
  total: number
}

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

function invalidarControles(): void {
  void mutateGlobal(
    (key) => typeof key === "string" && (key === LISTA || key.startsWith(`${LISTA}?`))
  )
}

export interface UseControlesPropiedadResultado {
  controles: ControlPropiedad[]
  isLoading: boolean
  error: Error | null
  save: (control: ControlPropiedad) => Promise<StoreResult>
  update: (id: string, parcial: Partial<ControlPropiedad>) => Promise<StoreResult>
  remove: (id: string) => Promise<StoreResult>
}

/** Lista de controles de privacidad por unidad. */
export function useControlesPropiedad(): UseControlesPropiedadResultado {
  const url = `${LISTA}?pageSize=100`
  const { data, error, isLoading, mutate } = useSWR<ColeccionControles, Error>(url, fetcher, {
    revalidateOnFocus: true,
  })

  const save = async (control: ControlPropiedad): Promise<StoreResult> => {
    const resultado = await enviar(LISTA, "POST", control)
    if (resultado.ok) {
      void mutate()
      invalidarControles()
    }
    return resultado
  }

  const update = async (id: string, parcial: Partial<ControlPropiedad>): Promise<StoreResult> => {
    const resultado = await enviar(claveItem(id), "PUT", parcial)
    if (resultado.ok) void mutate()
    return resultado
  }

  const remove = async (id: string): Promise<StoreResult> => {
    const resultado = await enviar(claveItem(id), "DELETE")
    if (resultado.ok) void mutate()
    return resultado
  }

  return {
    controles: data?.data ?? [],
    isLoading,
    error: error ?? null,
    save,
    update,
    remove,
  }
}
