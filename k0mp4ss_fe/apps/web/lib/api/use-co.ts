"use client"

/** use-co — hooks SWR para Comunicación con Vecinos CO (Fase 4). */
import { useCrudCollection, type CrudCollection } from "./use-crud-collection"
import type {
  DocumentoCO,
  EnvioCO,
  MensajeBuzonCO,
  PlantillaCO,
} from "@/lib/schemas"

export function usePlantillasCO(): CrudCollection<PlantillaCO> {
  return useCrudCollection<PlantillaCO>("/api/co/plantillas")
}

export function useEnviosCO(): CrudCollection<EnvioCO> {
  return useCrudCollection<EnvioCO>("/api/co/envios")
}

export function useMensajesBuzonCO(): CrudCollection<MensajeBuzonCO> {
  return useCrudCollection<MensajeBuzonCO>("/api/co/mensajes-buzon")
}

export function useDocumentosCO(): CrudCollection<DocumentoCO> {
  return useCrudCollection<DocumentoCO>("/api/co/documentos")
}
