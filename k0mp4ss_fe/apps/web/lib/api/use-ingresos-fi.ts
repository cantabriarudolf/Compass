"use client"

/** use-ingresos-fi — hooks SWR para ingresos a fondo FI (Fase 3). */
import { useCrudCollection, type CrudCollection } from "./use-crud-collection"
import type { IngresoFI } from "@/lib/schemas"

export function useIngresosFI(): CrudCollection<IngresoFI> {
  return useCrudCollection<IngresoFI>("/api/ingresos-fi")
}
