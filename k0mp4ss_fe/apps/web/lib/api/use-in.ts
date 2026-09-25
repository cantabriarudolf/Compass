"use client"

/** use-in — hooks SWR para Infracciones y Multas IN (Fase 4). */
import { useCrudCollection, type CrudCollection } from "./use-crud-collection"
import type { InfraccionIN, TipoInfraccionIN } from "@/lib/schemas"

export function useTiposInfraccionIN(): CrudCollection<TipoInfraccionIN> {
  return useCrudCollection<TipoInfraccionIN>("/api/in/tipos")
}

export function useInfraccionesIN(): CrudCollection<InfraccionIN> {
  return useCrudCollection<InfraccionIN>("/api/in/infracciones")
}
