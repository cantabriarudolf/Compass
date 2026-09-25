"use client"

/** use-cv — hooks SWR para el Visor de Mensajes CV (Fase 4). */
import { useCrudCollection, type CrudCollection } from "./use-crud-collection"
import type { AvisoCV, PlantillaCV } from "@/lib/schemas"

export function useAvisosCV(): CrudCollection<AvisoCV> {
  return useCrudCollection<AvisoCV>("/api/cv/avisos")
}

export function usePlantillasCV(): CrudCollection<PlantillaCV> {
  return useCrudCollection<PlantillaCV>("/api/cv/plantillas")
}
