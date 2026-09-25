"use client"

/** use-ra — hooks SWR para Reservas y Amenities RA (Fase 4). */
import { useCrudCollection, type CrudCollection } from "./use-crud-collection"
import type { ElementoRA, ReservaRA } from "@/lib/schemas"

export function useElementosRA(): CrudCollection<ElementoRA> {
  return useCrudCollection<ElementoRA>("/api/ra/elementos")
}

export function useReservasRA(): CrudCollection<ReservaRA> {
  return useCrudCollection<ReservaRA>("/api/ra/reservas")
}
