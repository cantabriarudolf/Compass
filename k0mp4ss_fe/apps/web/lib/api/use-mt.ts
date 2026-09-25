"use client"

/** use-mt — hooks SWR para Mantenimiento y Proyectos MT (Fase 4). */
import { useCrudCollection, type CrudCollection } from "./use-crud-collection"
import type { ProyectoMT, TrabajoMT } from "@/lib/schemas"

export function useTrabajosMT(): CrudCollection<TrabajoMT> {
  return useCrudCollection<TrabajoMT>("/api/mt/trabajos")
}

export function useProyectosMT(): CrudCollection<ProyectoMT> {
  return useCrudCollection<ProyectoMT>("/api/mt/proyectos")
}
