"use client"

/**
 * use-periodos-directiva — hooks SWR para los períodos de directiva (Fase 2).
 *
 * Lectura: GET /api/periodos-directiva.
 * Escritura: POST (upsert; activa y rota el vigente), PUT parcial
 * (nómina congelada si está cerrado) y POST /api/periodos-directiva/[id]/cerrar.
 * Contrato de mutación: Promise<StoreResult>, intercambiable con el store legacy.
 */
import useSWR, { mutate as mutateGlobal } from "swr"
import type { PeriodoDirectiva } from "@/lib/schemas"
import type { StoreResult } from "@/lib/store"

const LISTA = "/api/periodos-directiva"

const claveItem = (id: string) => `${LISTA}/${id}`

async function fetcher<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { accept: "application/json" } })
  if (!res.ok) {
    const cuerpo = (await res.json().catch(() => null)) as { error?: string } | null
    throw new Error(cuerpo?.error ?? `Error ${res.status} al consultar ${url}.`)
  }
  // SAFETY: la API valida con PeriodoDirectivaSchema al escribir; el cliente tipa la fila como PeriodoDirectiva.
  const crudo = (await res.json()) as unknown
  if (crudo && typeof crudo === "object" && "data" in (crudo as Record<string, unknown>)) {
    const col = crudo as { data: unknown[]; page: number; pageSize: number; total: number }
    // SAFETY: filas Json validadas por zod en el servidor; el cliente las tipa como entidad.
    return { ...col, data: col.data as unknown as PeriodoDirectiva[] } as unknown as T
  }
  return crudo as T
}

interface ColeccionPeriodos {
  data: PeriodoDirectiva[]
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

function invalidarPeriodos(): void {
  void mutateGlobal(
    (key) => typeof key === "string" && (key === LISTA || key.startsWith(`${LISTA}?`))
  )
}

export interface UsePeriodosDirectivaResultado {
  periodos: PeriodoDirectiva[]
  vigente: PeriodoDirectiva | undefined
  isLoading: boolean
  error: Error | null
  create: (periodo: PeriodoDirectiva) => Promise<StoreResult>
  update: (id: string, parcial: Partial<PeriodoDirectiva>) => Promise<StoreResult>
  remove: (id: string) => Promise<StoreResult>
  cerrar: (id: string, fechaFin?: string) => Promise<StoreResult>
}

/** Lista de períodos (vigente + históricos del libro). */
export function usePeriodosDirectiva(): UsePeriodosDirectivaResultado {
  const url = `${LISTA}?pageSize=100`
  const { data, error, isLoading, mutate } = useSWR<ColeccionPeriodos, Error>(url, fetcher, {
    revalidateOnFocus: true,
  })
  const periodos = data?.data ?? []

  const create = async (periodo: PeriodoDirectiva): Promise<StoreResult> => {
    const resultado = await enviar(LISTA, "POST", periodo)
    if (resultado.ok) void mutate()
    return resultado
  }

  const update = async (id: string, parcial: Partial<PeriodoDirectiva>): Promise<StoreResult> => {
    const resultado = await enviar(claveItem(id), "PUT", parcial)
    if (resultado.ok) void mutate()
    return resultado
  }

  const remove = async (id: string): Promise<StoreResult> => {
    const resultado = await enviar(claveItem(id), "DELETE")
    if (resultado.ok) void mutate()
    return resultado
  }

  const cerrar = async (id: string, fechaFin?: string): Promise<StoreResult> => {
    const resultado = await enviar(`${claveItem(id)}/cerrar`, "POST", fechaFin ? { fechaFin } : {})
    if (resultado.ok) {
      void mutate()
      invalidarPeriodos()
    }
    return resultado
  }

  return {
    periodos,
    vigente: periodos.find((p) => p.estado === "vigente"),
    isLoading,
    error: error ?? null,
    create,
    update,
    remove,
    cerrar,
  }
}
