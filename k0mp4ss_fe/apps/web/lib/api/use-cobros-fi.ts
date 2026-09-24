"use client"

/** use-cobros-fi — hooks SWR para cobros FI, filtrables (Fase 3). */
import { useCrudCollection, type CrudCollection } from "./use-crud-collection"
import type { CobroFI } from "@/lib/schemas"

export function useCobrosFI(periodo?: string, unidadId?: string): CrudCollection<CobroFI> {
  const params = new URLSearchParams({ pageSize: "100" })
  if (periodo) params.set("periodo", periodo)
  if (unidadId) params.set("unidadId", unidadId)
  return useCrudCollection<CobroFI>("/api/cobros-fi", params.toString())
}
