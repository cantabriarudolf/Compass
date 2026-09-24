"use client"

/** use-macro-sectores — hooks SWR para macro sectores EF (Fase 3). */
import { useCrudCollection, type CrudCollection } from "./use-crud-collection"
import type { MacroSector } from "@/lib/schemas"

export function useMacroSectores(): CrudCollection<MacroSector> {
  return useCrudCollection<MacroSector>("/api/macro-sectores")
}
