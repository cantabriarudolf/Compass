"use client"

/**
 * use-actas-gd — hooks SWR para las actas de directiva (BD-FUENTE-VERDAD Fase 2).
 *
 * Lectura: GET /api/actas-gd y GET /api/actas-gd/[id].
 * Escritura: POST (upsert idempotente), PUT parcial, DELETE y
 * POST /api/actas-gd/[id]/aprobar (firma; publica al completar el quórum).
 * Contrato de mutación: Promise<StoreResult>, intercambiable con el store legacy.
 */
import useSWR, { mutate as mutateGlobal } from "swr"
import type { ActaGD } from "@/lib/schemas"
import type { StoreResult } from "@/lib/store"

const LISTA = "/api/actas-gd"

const claveItem = (id: string) => `${LISTA}/${id}`

async function fetcher<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { accept: "application/json" } })
  if (!res.ok) {
    const cuerpo = (await res.json().catch(() => null)) as { error?: string } | null
    throw new Error(cuerpo?.error ?? `Error ${res.status} al consultar ${url}.`)
  }
  // SAFETY: la API valida con ActaGDSchema al escribir; el cliente tipa la fila como ActaGD.
  const crudo = (await res.json()) as unknown
  if (crudo && typeof crudo === "object" && "data" in (crudo as Record<string, unknown>)) {
    const col = crudo as { data: unknown[]; page: number; pageSize: number; total: number }
    // SAFETY: filas Json validadas por zod en el servidor; el cliente las tipa como entidad.
    return { ...col, data: col.data as unknown as ActaGD[] } as unknown as T
  }
  return crudo as T
}

interface ColeccionActas {
  data: ActaGD[]
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

function invalidarActas(): void {
  void mutateGlobal(
    (key) => typeof key === "string" && (key === LISTA || key.startsWith(`${LISTA}?`))
  )
}

export interface UseActasGDResultado {
  actas: ActaGD[]
  total: number
  isLoading: boolean
  error: Error | null
  create: (acta: ActaGD) => Promise<StoreResult>
  update: (id: string, parcial: Partial<ActaGD>) => Promise<StoreResult>
  remove: (id: string) => Promise<StoreResult>
  aprobar: (id: string, personaId: string) => Promise<StoreResult & { publicada?: boolean }>
}

/** Lista paginada de actas (el servidor filtra por rol y privacidad AD). */
export function useActasGD(): UseActasGDResultado {
  const url = `${LISTA}?pageSize=100`
  const { data, error, isLoading, mutate } = useSWR<ColeccionActas, Error>(url, fetcher, {
    revalidateOnFocus: true,
  })

  const create = async (acta: ActaGD): Promise<StoreResult> => {
    const resultado = await enviar(LISTA, "POST", acta)
    if (resultado.ok) void mutate()
    return resultado
  }

  const update = async (id: string, parcial: Partial<ActaGD>): Promise<StoreResult> => {
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

  const aprobar = async (
    id: string,
    personaId: string
  ): Promise<StoreResult & { publicada?: boolean }> => {
    try {
      const res = await fetch(`${claveItem(id)}/aprobar`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ personaId }),
      })
      if (!res.ok) {
        const cuerpo = (await res.json().catch(() => null)) as { error?: string } | null
        return { ok: false, error: cuerpo?.error ?? `Error ${res.status} al aprobar.` }
      }
      const j = (await res.json()) as { publicada?: boolean }
      void mutateGlobal(claveItem(id))
      void mutate()
      invalidarActas()
      return { ok: true, publicada: j.publicada }
    } catch {
      return { ok: false, error: "Sin conexión con el servidor." }
    }
  }

  return {
    actas: data?.data ?? [],
    total: data?.total ?? 0,
    isLoading,
    error: error ?? null,
    create,
    update,
    remove,
    aprobar,
  }
}

export interface UseActaResultado {
  acta: ActaGD | undefined
  isLoading: boolean
  error: Error | null
}

/** Detalle de un acta por id. */
export function useActa(id: string): UseActaResultado {
  const url = id ? claveItem(id) : null
  const { data, error, isLoading } = useSWR<ActaGD, Error>(url, fetcher, {
    revalidateOnFocus: true,
  })
  return { acta: data, isLoading, error: error ?? null }
}
