"use client"

/** use-fondos-fi — hooks SWR para fondos FI (BD-FUENTE-VERDAD Fase 3). */
import { useCrudCollection, type CrudCollection } from "./use-crud-collection"
import type { FondoFI } from "@/lib/schemas"

export function useFondosFI(): CrudCollection<FondoFI> {
  return useCrudCollection<FondoFI>("/api/fondos-fi")
}
