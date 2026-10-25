"use client"

/**
 * use-crud-collection — factory de hooks SWR para colecciones REST
 * (BD-FUENTE-VERDAD Fase 3).
 *
 * Lectura paginada (`{data,page,pageSize,total}`) + mutaciones create/update/
 * remove que devuelven `StoreResult`, el mismo contrato que las acciones
 * legacy del store zustand para poder intercambiarse.
 *
 * PAGINACIÓN REAL (F11): sin `query`, el hook pide `pageSize=100`, así que
 * `items.length` puede ser menor que `total`. La forma correcta de resolver ese
 * recorte es la paginación acumulativa que expone la colección:
 *
 * - `hasMore`  → `true` mientras `items.length < total`.
 * - `cargarMas()` → pide la página siguiente (`&page=N`), la acumula al final de
 *                   `items` y apaga `hasMore` cuando ya no queda nada. Si no hay
 *                   más filas no dispara ninguna petición.
 * - `cargandoMas` → la petición de página siguiente está en vuelo.
 *
 * Con eso, donde se use paginación el aviso de truncamiento deja de ser
 * necesario: la lista no está recortada, está paginada y se puede completar
 * (ver `components/ver-mas.tsx`). El aviso sigue vigente solo en los listados
 * que NO usan `hasMore` (recortes locales de `Select`/tablas, ver
 * `components/pe/aviso-truncamiento.tsx`). Subir el `pageSize` no resuelve el
 * problema, solo lo esconde.
 *
 * La URL de la página 1 no cambia (`?pageSize=100`): es la clave de SWR y el
 * `pageSize` que ya mandan los consumidores con `query`, así que tocarla
 * rompería a los 25 consumidores.
 */
import * as React from "react"
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
  /** Total de filas de la página 1 (lo que reporta el servidor). */
  total: number
  isLoading: boolean
  error: Error | null
  /** `true` mientras quedan filas del `total` que no están en `items`. */
  hasMore: boolean
  /** Pide la página siguiente y la acumula; si no hay más, no hace nada. */
  cargarMas: () => Promise<void>
  /** Hay una petición de página siguiente en vuelo. */
  cargandoMas: boolean
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

  // Páginas pedidas con `cargarMas`, atadas a la URL que las produjo: si cambia
  // la query, las páginas viejas dejan de aplicar sin necesidad de un efecto.
  const [paginacion, setPaginacion] = React.useState<{
    url: string
    paginas: Pagina<T>[]
  }>({ url, paginas: [] })
  const paginasExtra = React.useMemo(
    () => (paginacion.url === url ? paginacion.paginas : []),
    [paginacion, url]
  )
  const [cargandoMas, setCargandoMas] = React.useState(false)

  const items = React.useMemo(
    () => [...(data?.data ?? []), ...paginasExtra.flatMap((p) => p.data)],
    [data, paginasExtra]
  )
  const total = data?.total ?? 0
  const hasMore = items.length < total

  const urlDePagina = (page: number): string =>
    `${url}${url.includes("?") ? "&" : "?"}page=${page}`

  const cargarMas = async (): Promise<void> => {
    if (cargandoMas || !hasMore) return
    const siguiente = (data?.page ?? 1) + paginasExtra.length + 1
    setCargandoMas(true)
    try {
      const pagina = await fetcher<Pagina<T>>(urlDePagina(siguiente))
      setPaginacion((previa) => {
        const base = previa.url === url ? previa.paginas : []
        // Idempotente: una página ya acumulada no se duplica en `items`.
        if (base.some((p) => p.page === pagina.page)) return previa
        return { url, paginas: [...base, pagina] }
      })
    } catch {
      // La página 1 sigue exponiendo su error vía SWR; acá solo se corta la
      // carga para no dejar el botón en «Cargando…» eternamente.
    } finally {
      setCargandoMas(false)
    }
  }

  const invalidar = (): void => {
    // Tras una mutación la única página fresca es la 1: se descartan las extra.
    setPaginacion({ url, paginas: [] })
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
    items,
    total,
    isLoading,
    error: error ?? null,
    hasMore,
    cargarMas,
    cargandoMas,
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
