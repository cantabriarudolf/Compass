"use client"

/** use-ge — hook SWR para Gestión de Solicitudes GE (Fase 4). */
import { useCrudCollection, type CrudCollection } from "./use-crud-collection"
import type { SolicitudGE } from "@/lib/schemas"

export function useSolicitudesGE(): CrudCollection<SolicitudGE> {
  return useCrudCollection<SolicitudGE>("/api/ge/solicitudes")
}
