"use client"

/**
 * use-crud-collection — factory de hooks SWR para colecciones REST
 * (BD-FUENTE-VERDAD Fase 3).
 *
 * Lectura paginada (`{data,page,pageSize,total}`) + mutaciones create/update/
 * remove que devuelven `StoreResult`, el mismo contrato que las acciones
 * legacy del store zustand para poder intercambiarse.
 *
 * AVISO OBLIGATORIO AL CONSUMIDOR: sin `query`, el hook pide `pageSize=100` y
 * por eso `items.length` puede ser menor que `total`. La colección expone
 * `total` justamente para eso: si `total > items.length`, el consumidor DEBE
 * avisar en pantalla que la lista está recortada (ver
 * `components/pe/aviso-truncamiento.tsx`) en vez de truncar en silencio. Subir
 * el `pageSize` no resuelve el problema, solo lo esconde.
 */
import useSWR, { mutate as mutateGlobal } from "swr"
import type { StoreResult } from "@/lib/store"

interface Pagina<T> {
  data: T[]
  page: number
  pageSize: number
  total: number
}

async function fetcher<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { accept: "application/json" } })
  if (!res.ok) {
    const cuerpo = (await res.json().catch(() => null)) as { error?: string } | null
    throw new Error(cuerpo?.error ?? `Error ${res.status} al consultar ${url}.`)
  }
  return (await res.json()) as T
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

export interface CrudCollection<T> {
  items: T[]
  total: number
  isLoading: boolean
  error: Error | null
  create: (datos: Partial<T>) => Promise<StoreResult>
  update: (id: string, parcial: Partial<T>) => Promise<StoreResult>
  remove: (id: string) => Promise<StoreResult>
}

/**
 * Hooks de colección sobre `base` (ej. "/api/fondos-fi").
 * `query` arma la query inicial (ej. "periodo=2026-02"); `invalidarExtra`
 * revalida otras bases afectadas por las mutaciones (ej. cobros al emitir).
 */
export function useCrudCollection<T extends { id: string }>(
  base: string,
  query = "",
  invalidarExtra: string[] = []
): CrudCollection<T> {
  const url = query ? `${base}?${query}` : `${base}?pageSize=100`
  const { data, error, isLoading, mutate } = useSWR<Pagina<T>, Error>(url, fetcher, {
    revalidateOnFocus: true,
  })

  const invalidar = (): void => {
    void mutate()
    void mutateGlobal(
      (key) =>
        typeof key === "string" &&
        (key === base ||
          key.startsWith(`${base}?`) ||
          invalidarExtra.some((b) => key === b || key.startsWith(`${b}?`)))
    )
  }

  const create = async (datos: Partial<T>): Promise<StoreResult> => {
    const resultado = await enviar(base, "POST", datos)
    if (resultado.ok) invalidar()
    return resultado
  }

  const update = async (id: string, parcial: Partial<T>): Promise<StoreResult> => {
    const resultado = await enviar(`${base}/${id}`, "PUT", parcial)
    if (resultado.ok) invalidar()
    return resultado
  }

  const remove = async (id: string): Promise<StoreResult> => {
    const resultado = await enviar(`${base}/${id}`, "DELETE")
    if (resultado.ok) invalidar()
    return resultado
  }

  return {
    items: data?.data ?? [],
    total: data?.total ?? 0,
    isLoading,
    error: error ?? null,
    create,
    update,
    remove,
  }
}

/**
 * sinNulos — poda claves con valor null (primer nivel).
 *
 * Las filas Prisma traen null en opcionales y los forms reenvían el objeto
 * completo; los schemas Zod usan `.optional()` (ausente OK, null NO).
 * Misma semántica que put-merge: null de BD equivale a "ausente".
 * Uso: páginas que reenvían registros leídos (personal, tipos…).
 */
export function sinNulos<T extends Record<string, unknown>>(obj: T): T {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== null)
  ) as T
}
/** POST arbitrario contra `base` con revalidación (para acciones custom). */
export async function postAccion(
  base: string,
  body: unknown,
  invalidar: string[] = []
): Promise<{ ok: boolean; error?: string; data?: unknown }> {
  try {
    const res = await fetch(base, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    })
    const j = (await res.json().catch(() => null)) as { error?: string } | null
    if (!res.ok) {
      return { ok: false, error: (j as { error?: string } | null)?.error ?? `Error ${res.status}.` }
    }
    for (const b of [base, ...invalidar]) {
      void mutateGlobal(
        (key) => typeof key === "string" && (key === b || key.startsWith(`${b}?`))
      )
    }
    return { ok: true, data: j }
  } catch {
    return { ok: false, error: "Sin conexión con el servidor." }
  }
}
