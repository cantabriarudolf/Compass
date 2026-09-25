"use client"

/**
 * use-pe — hooks SWR para Personal y Servicios PE (BD-FUENTE-VERDAD Fase 4).
 *
 * Las 8 colecciones comparten GET paginado (obligatorio por alta frecuencia)
 * + upsert/PUT/DELETE con el contrato StoreResult del store legacy.
 */
import { useCrudCollection, type CrudCollection } from "./use-crud-collection"
import type {
  BitacoraVisitaPE,
  CierreTurnoPE,
  EncomiendaPE,
  IngresoContratistaPE,
  MantencionPreventivaPE,
  ProyeccionPE,
  ProveedorPE,
  VisitaTecnicaPE,
} from "@/lib/schemas"

export function useBitacoraVisitasPE(): CrudCollection<BitacoraVisitaPE> {
  return useCrudCollection<BitacoraVisitaPE>("/api/pe/bitacora-visitas")
}

export function useEncomiendasPE(): CrudCollection<EncomiendaPE> {
  return useCrudCollection<EncomiendaPE>("/api/pe/encomiendas")
}

export function useIngresosContratistasPE(): CrudCollection<IngresoContratistaPE> {
  return useCrudCollection<IngresoContratistaPE>("/api/pe/ingresos-contratistas")
}

export function useProveedoresPE(): CrudCollection<ProveedorPE> {
  return useCrudCollection<ProveedorPE>("/api/pe/proveedores")
}

export function useMantencionesPE(): CrudCollection<MantencionPreventivaPE> {
  return useCrudCollection<MantencionPreventivaPE>("/api/pe/mantenciones")
}

export function useVisitasTecnicasPE(): CrudCollection<VisitaTecnicaPE> {
  return useCrudCollection<VisitaTecnicaPE>("/api/pe/visitas-tecnicas")
}

export function useCierresTurnoPE(): CrudCollection<CierreTurnoPE> {
  return useCrudCollection<CierreTurnoPE>("/api/pe/cierres-turno")
}

export function useProyeccionesPE(): CrudCollection<ProyeccionPE> {
  return useCrudCollection<ProyeccionPE>("/api/pe/proyecciones")
}
