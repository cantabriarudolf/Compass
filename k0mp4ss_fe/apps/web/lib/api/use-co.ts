"use client"

/** use-co — hooks SWR para Comunicación con Vecinos CO (Fase 4). */
import useSWR from "swr"
import { useCrudCollection, postAccion, type CrudCollection } from "./use-crud-collection"
import type { StoreResult } from "@/lib/store"
import type {
  DocumentoCO,
  EnvioCO,
  LecturaEnvioCO,
  MensajeBuzonCO,
  PlantillaCO,
} from "@/lib/schemas"

const BASE_ENVIOS = "/api/co/envios"

/**
 * Envío tal como lo ve el ADMINISTRADOR (change co-lectura-residente, D2): el
 * snapshot de destinatarios, el `lecturas` derivado de la tabla y los totales
 * que la API calcula server-side. `totalLecturas`/`totalDestinatarios` no están
 * en `EnvioCOSchema` porque el residente no los recibe.
 */
export type EnvioConsolaCO = EnvioCO & {
  totalDestinatarios: number
  totalLecturas: number
}

/**
 * Envío tal como lo ve el RESIDENTE o el COMITÉ en la bandeja (D2): sin nómina
 * de destinatarios, sin `lecturas` de terceros y —para el residente— sin
 * totales. `lecturaPropia` es el único dato de lectura del residente; los
 * `total*` son los agregados que sí recibe el comité.
 */
export interface EnvioBandejaCO {
  id: string
  asunto: string
  cuerpo: string
  plantillaId?: string
  fechaEnvio: string
  lecturaPropia?: { leidoEn: string | null }
  totalDestinatarios?: number
  totalLecturas?: number
}

export function usePlantillasCO(): CrudCollection<PlantillaCO> {
  return useCrudCollection<PlantillaCO>("/api/co/plantillas")
}

export function useEnviosCO(): CrudCollection<EnvioCO> {
  return useCrudCollection<EnvioCO>(BASE_ENVIOS)
}

export function useMensajesBuzonCO(): CrudCollection<MensajeBuzonCO> {
  return useCrudCollection<MensajeBuzonCO>("/api/co/mensajes-buzon")
}

export function useDocumentosCO(): CrudCollection<DocumentoCO> {
  return useCrudCollection<DocumentoCO>("/api/co/documentos")
}

/** GET de un recurso de CO con error legible (mismo contrato de mensajes que la colección). */
async function pedirJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { accept: "application/json" } })
  if (!res.ok) {
    const cuerpo = (await res.json().catch(() => null)) as { error?: string } | null
    throw new Error(cuerpo?.error ?? `Error ${res.status} al consultar ${url}.`)
  }
  return (await res.json()) as T
}

export interface UseLecturaCOResultado {
  /**
   * POST `/api/co/envios/[id]/leer` — registra la lectura propia del envío
   * (idempotente y sin pérdidas en concurrencia: la garantía vive en el
   * servidor) y revalida la bandeja y el desglose del envío.
   */
  registrar: (envioId: string) => Promise<StoreResult>
}

export function useLecturaCO(): UseLecturaCOResultado {
  const registrar = async (envioId: string): Promise<StoreResult> => {
    const r = await postAccion(`${BASE_ENVIOS}/${envioId}/leer`, {}, [
      BASE_ENVIOS,
      `${BASE_ENVIOS}/${envioId}/lecturas`,
    ])
    if (!r.ok) return { ok: false, error: r.error ?? "No se pudo registrar la lectura." }
    return { ok: true }
  }
  return { registrar }
}

export interface UseDesgloseLecturasCOResultado {
  /** Parejas `personaId` / `leidoEn` del envío (solo administrador puede pedirlas). */
  lecturas: LecturaEnvioCO[]
  isLoading: boolean
  error: Error | null
}

/**
 * Desglose nominativo de lecturas de un envío (`GET /api/co/envios/[id]/lecturas`).
 * Sin envío seleccionado no consulta. Reservado al administrador: el 403 del
 * comité/residente se expone tal cual en `error`.
 */
export function useDesgloseLecturasCO(
  envioId: string | null
): UseDesgloseLecturasCOResultado {
  const { data, error, isLoading } = useSWR<LecturaEnvioCO[], Error>(
    envioId ? `${BASE_ENVIOS}/${envioId}/lecturas` : null,
    pedirJson,
    { revalidateOnFocus: false }
  )
  return {
    lecturas: data ?? [],
    isLoading,
    error: error ?? null,
  }
}
