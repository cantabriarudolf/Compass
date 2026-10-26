"use client"

/**
 * use-maestros — hook SWR para las colecciones MA de maestros administrativos
 * (BD-FUENTE-VERDAD Fase 0).
 *
 * - Lectura: GET /api/maestros/[tipo] (el `tipo` es el segmento kebab-case:
 *   "bancos", "estados-ocupacion", "condiciones-especiales", ...). En
 *   catálogos nacionales (F20 fase 1b) `incluirOcultos: true` pide también las
 *   filas ocultadas con el booleano `oculto` por fila; `ocultar()` marca o
 *   desmarca vía PUT /api/maestros/[tipo]/ocultar.
 * - Escritura: POST (upsert idempotente por id), PUT parcial por id y DELETE
 *   por id; cada mutación revalida la clave SWR de la colección.
 * - Contrato de mutación: Promise<StoreResult> ({ ok, error? }).
 */
import useSWR from "swr"
import type { StoreResult } from "@/lib/store"

const baseTipo = (tipo: string) => `/api/maestros/${tipo}`

async function fetcher<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { accept: "application/json" } })
  if (!res.ok) {
    const cuerpo = (await res.json().catch(() => null)) as { error?: string } | null
    throw new Error(cuerpo?.error ?? `Error ${res.status} al consultar ${url}.`)
  }
  return (await res.json()) as T
}

interface ColeccionMaestro {
  data: unknown[]
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

/** Opciones de lectura de la colección (aditivas; sin ellas, el GET es el de siempre). */
export interface UseMaestrosOpciones {
  /** F20 fase 1b: pedir también las filas ocultas (solo catálogos nacionales). */
  incluirOcultos?: boolean
}

export interface UseMaestrosResultado<T> {
  data: T[]
  isLoading: boolean
  error: Error | null
  create: (item: T & { id: string }) => Promise<StoreResult>
  update: (id: string, parcial: Partial<T>) => Promise<StoreResult>
  remove: (id: string) => Promise<StoreResult>
  /** F20 fase 1b: marca/desmarca el ocultamiento de una fila nacional. */
  ocultar: (maestroId: string, oculto: boolean) => Promise<StoreResult>
}

/**
 * Colección de un maestro administrativo por su `tipo` kebab-case.
 * `tipo` falsy deshabilita la consulta (SWR con clave null no fetchea).
 */
export function useMaestros<T = Record<string, unknown>>(
  tipo: string | null | undefined,
  opciones?: UseMaestrosOpciones
): UseMaestrosResultado<T> {
  const incluirOcultos = opciones?.incluirOcultos === true
  const url = tipo
    ? `${baseTipo(tipo)}?pageSize=100${incluirOcultos ? "&incluirOcultos=1" : ""}`
    : null
  const { data, error, isLoading, mutate } = useSWR<ColeccionMaestro, Error>(url, fetcher, {
    revalidateOnFocus: true,
  })

  const create = async (item: T & { id: string }): Promise<StoreResult> => {
    if (!tipo) return { ok: false, error: "Tipo de maestro no seleccionado." }
    const resultado = await enviar(baseTipo(tipo), "POST", item)
    if (resultado.ok) void mutate()
    return resultado
  }

  const update = async (id: string, parcial: Partial<T>): Promise<StoreResult> => {
    if (!tipo) return { ok: false, error: "Tipo de maestro no seleccionado." }
    const resultado = await enviar(`${baseTipo(tipo)}/${id}`, "PUT", parcial)
    if (resultado.ok) void mutate()
    return resultado
  }

  const remove = async (id: string): Promise<StoreResult> => {
    if (!tipo) return { ok: false, error: "Tipo de maestro no seleccionado." }
    const resultado = await enviar(`${baseTipo(tipo)}/${id}`, "DELETE")
    if (resultado.ok) void mutate()
    return resultado
  }

  const ocultar = async (
    maestroId: string,
    oculto: boolean
  ): Promise<StoreResult> => {
    if (!tipo) return { ok: false, error: "Tipo de maestro no seleccionado." }
    const resultado = await enviar(`${baseTipo(tipo)}/ocultar`, "PUT", {
      maestroId,
      oculto,
    })
    if (resultado.ok) void mutate()
    return resultado
  }

  return {
    data: (data?.data as T[] | undefined) ?? [],
    isLoading,
    error: error ?? null,
    create,
    update,
    remove,
    ocultar,
  }
}
