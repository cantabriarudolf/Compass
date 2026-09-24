"use client"

/** use-unidades — hooks SWR para unidades EF (BD-FUENTE-VERDAD Fase 3). */
import { useCrudCollection, type CrudCollection } from "./use-crud-collection"
import type { Unidad } from "@/lib/schemas"

export function useUnidades(): CrudCollection<Unidad> {
  return useCrudCollection<Unidad>("/api/unidades")
}
