"use client"

/**
 * use-pe — hooks SWR para Personal y Servicios PE (BD-FUENTE-VERDAD Fase 4).
 *
 * Las 8 colecciones comparten GET paginado (obligatorio por alta frecuencia)
 * + upsert/PUT/DELETE con el contrato StoreResult del store legacy.
 *
 * SERIE-FASE2 §V2: además de las colecciones, acá viven las CINCO transiciones
 * de Personal que la página todavía ejecutaba contra el store legacy
 * (`iniciarTurnoPE`, `registrarHoraExtraPE`, `registrarEvaluacionPE`,
 * `completarTareaMonitoreoPE`, `enviarProyeccionCostoFI`). Cada una tiene su
 * ruta propia en `app/api/pe/**` y se cablea con `postAccion`, devolviendo
 * `StoreResult` (mismo contrato) y revalidando las colecciones que el servidor
 * toca de verdad.
 */
import useSWR from "swr"
import {
  postAccion,
  useCrudCollection,
  type CrudCollection,
} from "./use-crud-collection"
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
import type { StoreResult } from "@/lib/store"

const BASE_TURNOS = "/api/pe/turnos"
const BASE_PERSONAS = "/api/personas"
const BASE_TRABAJOS_MT = "/api/mt/trabajos"
const BASE_PROYECCIONES = "/api/pe/proyecciones"

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

/** Inicio de turno del día tal como lo devuelve `/api/pe/turnos` (evento PE). */
export interface TurnoIniciadoPE {
  id: string
  timestamp: string
  referenciaId: string
  descripcion: string
}

interface PaginaTurnos {
  data: TurnoIniciadoPE[]
  page: number
  pageSize: number
  total: number
}

async function fetchTurnos(url: string): Promise<PaginaTurnos> {
  const res = await fetch(url, { headers: { accept: "application/json" } })
  if (!res.ok) {
    const cuerpo = (await res.json().catch(() => null)) as { error?: string } | null
    throw new Error(cuerpo?.error ?? `Error ${res.status} al consultar ${url}.`)
  }
  return (await res.json()) as PaginaTurnos
}

/**
 * Turnos iniciados HOY, leídos de los eventos `PE_START_SHIFT` (la fuente que
 * ya usaba el panel de monitoreo). Reemplaza la lectura de `eventos` del store
 * legacy: `/api/auditoria` exige `am:ver` y este panel lo opera conserjería.
 */
export function useTurnosIniciadosPE(): {
  items: TurnoIniciadoPE[]
  isLoading: boolean
} {
  const { data, isLoading } = useSWR<PaginaTurnos, Error>(
    `${BASE_TURNOS}?pageSize=100`,
    fetchTurnos,
    { revalidateOnFocus: true }
  )
  return { items: data?.data ?? [], isLoading }
}

export interface UseAccionesPEResultado {
  /**
   * POST `/api/pe/turnos/iniciar` — body `{ personaId, jornadaId }`. Marca el
   * inicio del turno con el evento `PE_START_SHIFT` (el sistema valida el
   * evento, no cronometra). Exige `pe:cierre_turno` (conserjería).
   */
  iniciarTurno: (personaId: string, jornadaId: string) => Promise<StoreResult>
  /**
   * POST `/api/pe/personas/[id]/horas-extras` — body `{ fecha, horas, motivo }`.
   * Agrega la hora extra al historial laboral; no crea egreso FI ni liquidación
   * (el sobretiempo se sugiere al administrador cuando liquida).
   */
  registrarHoraExtra: (
    personaId: string,
    horaExtra: { fecha: string; horas: number; motivo: string }
  ) => Promise<StoreResult>
  /**
   * POST `/api/pe/personas/[id]/evaluaciones` — body
   * `{ fecha, puntaje, comentarios? }`. Solo administrador; la evaluación es
   * histórica e inmutable (un segundo intento sobre la misma responde 409).
   */
  registrarEvaluacion: (
    personaId: string,
    evaluacion: { fecha: string; puntaje: number; comentarios?: string }
  ) => Promise<StoreResult>
  /**
   * POST `/api/pe/tareas-monitoreo/[id]/completar` — sin body. Cierra la tarea
   * de mantenimiento y emite `PE_TASK_DONE`.
   */
  completarTareaMonitoreo: (trabajoMTId: string) => Promise<StoreResult>
  /**
   * POST `/api/pe/proyecciones/enviar` — body
   * `{ mesAnio, costoParche, costoDiaExtra }`. La proyección es un AVISO: no
   * crea ningún egreso FI.
   */
  enviarProyeccionCosto: (
    mesAnio: string,
    params: { costoParche: number; costoDiaExtra: number }
  ) => Promise<StoreResult>
}

/**
 * Las cinco transiciones PE con el contrato del store (`StoreResult`) y los
 * mensajes de respaldo idénticos a los que mostraba la página legacy.
 */
export function useAccionesPE(): UseAccionesPEResultado {
  const iniciarTurno = async (personaId: string, jornadaId: string): Promise<StoreResult> => {
    const r = await postAccion(`${BASE_TURNOS}/iniciar`, { personaId, jornadaId }, [BASE_TURNOS])
    if (!r.ok) return { ok: false, error: r.error ?? "No se pudo iniciar el turno." }
    return { ok: true }
  }

  const registrarHoraExtra = async (
    personaId: string,
    horaExtra: { fecha: string; horas: number; motivo: string }
  ): Promise<StoreResult> => {
    const r = await postAccion(
      `${BASE_PERSONAS}/${personaId}/horas-extras`,
      horaExtra,
      [BASE_PERSONAS]
    )
    if (!r.ok) return { ok: false, error: r.error ?? "No se pudo registrar la hora extra." }
    return { ok: true }
  }

  const registrarEvaluacion = async (
    personaId: string,
    evaluacion: { fecha: string; puntaje: number; comentarios?: string }
  ): Promise<StoreResult> => {
    const r = await postAccion(
      `${BASE_PERSONAS}/${personaId}/evaluaciones`,
      evaluacion,
      [BASE_PERSONAS]
    )
    if (!r.ok) return { ok: false, error: r.error ?? "No se pudo registrar la evaluación." }
    return { ok: true }
  }

  // El servidor cierra el trabajo MT: se revalida la colección de trabajos.
  const completarTareaMonitoreo = async (trabajoMTId: string): Promise<StoreResult> => {
    const r = await postAccion(
      `/api/pe/tareas-monitoreo/${trabajoMTId}/completar`,
      {},
      [BASE_TRABAJOS_MT]
    )
    if (!r.ok) return { ok: false, error: r.error ?? "No se pudo completar la tarea." }
    return { ok: true }
  }

  const enviarProyeccionCosto = async (
    mesAnio: string,
    params: { costoParche: number; costoDiaExtra: number }
  ): Promise<StoreResult> => {
    const r = await postAccion(
      `${BASE_PROYECCIONES}/enviar`,
      { mesAnio, ...params },
      [BASE_PROYECCIONES]
    )
    if (!r.ok) return { ok: false, error: r.error ?? "No se pudo enviar la proyección." }
    return { ok: true }
  }

  return {
    iniciarTurno,
    registrarHoraExtra,
    registrarEvaluacion,
    completarTareaMonitoreo,
    enviarProyeccionCosto,
  }
}
