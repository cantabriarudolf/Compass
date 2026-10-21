"use client"

/** use-mt — hooks SWR para Mantenimiento y Proyectos MT (Fase 4). */
import {
  postAccion,
  useCrudCollection,
  type CrudCollection,
} from "./use-crud-collection"
import type { ProyectoMT, TrabajoMT } from "@/lib/schemas"
import type { StoreResult } from "@/lib/store"

export function useTrabajosMT(): CrudCollection<TrabajoMT> {
  return useCrudCollection<TrabajoMT>("/api/mt/trabajos")
}

export function useProyectosMT(): CrudCollection<ProyectoMT> {
  return useCrudCollection<ProyectoMT>("/api/mt/proyectos")
}

/**
 * POST `/api/mt/garantias/verificar` — sin body.
 *
 * Paridad server-side con `verificarGarantiasMT` legacy: recorre los trabajos
 * finalizados con `garantiaFin` y alerta aún no enviada; marca la alerta de
 * forma idempotente por trabajo (una segunda corrida no repite el evento) y
 * devuelve cuántas alertas emitió. La colección de trabajos se revalida porque
 * el servidor actualiza `alertaGarantiaEnviada`.
 */
export async function verificarGarantiasMT(): Promise<
  StoreResult & { alertadas?: number }
> {
  const r = await postAccion("/api/mt/garantias/verificar", {}, ["/api/mt/trabajos"])
  if (!r.ok) {
    return { ok: false, error: r.error ?? "No se pudieron verificar las garantías." }
  }
  const alertadas = (r.data as { alertadas?: number } | undefined)?.alertadas
  return { ok: true, alertadas }
}
