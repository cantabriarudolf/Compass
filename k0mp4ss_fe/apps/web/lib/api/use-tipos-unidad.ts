"use client"

/** use-tipos-unidad — hooks SWR para tipos de unidad EF (Fase 3). */
import { useCrudCollection, type CrudCollection } from "./use-crud-collection"
import type { TipoUnidad } from "@/lib/schemas"

export function useTiposUnidad(): CrudCollection<TipoUnidad> {
  return useCrudCollection<TipoUnidad>("/api/tipos-unidad")
}
