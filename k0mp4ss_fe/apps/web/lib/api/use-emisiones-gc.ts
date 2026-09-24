"use client"

/**
 * use-emisiones-gc — hooks SWR para emisiones de Gasto Común (Fase 3).
 * Incluye `emitir()` (acción custom: crea emisión + cobros en servidor).
 */
import {
  postAccion,
  useCrudCollection,
  type CrudCollection,
} from "./use-crud-collection"
import type { EmisionGC } from "@/lib/schemas"

export interface EmitirGCInput {
  periodo: string
  modo: "fijo" | "variable"
  gastoTotal?: number
  fechaVencimiento?: string
  unidadIds?: string[]
}

export interface UseEmisionesGC extends CrudCollection<EmisionGC> {
  emitir: (input: EmitirGCInput) => Promise<{ ok: boolean; error?: string; data?: unknown }>
}

export function useEmisionesGC(): UseEmisionesGC {
  const coleccion = useCrudCollection<EmisionGC>("/api/emisiones-gc")

  const emitir = async (input: EmitirGCInput): Promise<{ ok: boolean; error?: string; data?: unknown }> => {
    return postAccion("/api/emisiones-gc", input, ["/api/cobros-fi"])
  }

  return { ...coleccion, emitir }
}
