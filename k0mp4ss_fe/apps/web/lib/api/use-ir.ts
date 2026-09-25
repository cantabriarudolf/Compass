"use client"

/** use-ir — hooks SWR para Inventario y Recursos IR (Fase 4). */
import { useCrudCollection, type CrudCollection } from "./use-crud-collection"
import type {
  EntregaEPP,
  RecursoIR,
  SolicitudInsumoIR,
} from "@/lib/schemas"

export function useRecursosIR(): CrudCollection<RecursoIR> {
  return useCrudCollection<RecursoIR>("/api/ir/recursos")
}

export function useSolicitudesInsumoIR(): CrudCollection<SolicitudInsumoIR> {
  return useCrudCollection<SolicitudInsumoIR>("/api/ir/solicitudes-insumo")
}

export function useEntregasEPP(): CrudCollection<EntregaEPP> {
  return useCrudCollection<EntregaEPP>("/api/ir/entregas-epp")
}
