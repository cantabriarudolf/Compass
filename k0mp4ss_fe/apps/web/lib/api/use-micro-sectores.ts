"use client"

/** use-micro-sectores — hooks SWR para micro sectores EF (Fase 3). */
import { useCrudCollection, type CrudCollection } from "./use-crud-collection"
import type { MicroSector } from "@/lib/schemas"

export function useMicroSectores(): CrudCollection<MicroSector> {
  return useCrudCollection<MicroSector>("/api/micro-sectores")
}
