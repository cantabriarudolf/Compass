"use client"

/** use-egresos-fi — hooks SWR para egresos FI (BD-FUENTE-VERDAD Fase 3). */
import { useCrudCollection, type CrudCollection } from "./use-crud-collection"
import type { EgresoFI } from "@/lib/schemas"

export function useEgresosFI(): CrudCollection<EgresoFI> {
  return useCrudCollection<EgresoFI>("/api/egresos-fi")
}
