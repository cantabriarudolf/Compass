"use client"

/**
 * use-cobros-fi — hooks SWR para cobros FI, filtrables (Fase 3).
 *
 * SERIE-FASE2 §V5: además de la colección, acá viven la **cobranza multicanal**
 * (visor interno + email) y los **interruptores de canal**, que la página
 * `app/finanzas/gastos-comunes/page.tsx` ejecutaba contra el store legacy
 * (`enviarCobranzaFI`). Cada acción tiene su ruta propia:
 *
 * - `POST /api/cobros-fi/[id]/cobranza`         ejecuta la gestión (admin)
 * - `GET|PUT /api/cobros-fi/canales`            interruptor global + preferencias
 *
 * Contrato: `StoreResult` (el mismo del store), igual que `useAccionesRE`.
 * Decisiones del plan que se ven en la firma (no reinterpretar):
 * - El email queda en outbox `pendiente` sin SMTP: el hook NUNCA lo reporta
 *   como enviado, devuelve el estado por canal tal cual lo dio el servidor.
 * - `reenviar: true` es el reenvío explícito; sin él, reenviar la misma gestión
 *   no duplica el envío (el servidor responde `duplicado`).
 */
import useSWR, { mutate as mutateGlobal } from "swr"
import {
  postAccion,
  useCrudCollection,
  type CrudCollection,
} from "./use-crud-collection"
import type { CanalCobranzaFI, CobroFI } from "@/lib/schemas"
import type { StoreResult } from "@/lib/store"

const BASE_COBROS = "/api/cobros-fi"
const BASE_CANALES = "/api/cobros-fi/canales"

export function useCobrosFI(periodo?: string, unidadId?: string): CrudCollection<CobroFI> {
  const params = new URLSearchParams({ pageSize: "100" })
  if (periodo) params.set("periodo", periodo)
  if (unidadId) params.set("unidadId", unidadId)
  return useCrudCollection<CobroFI>("/api/cobros-fi", params.toString())
}

/** Interruptores de canal (global de la comunidad o de un residente). */
export interface CanalesCobranzaFI {
  visor: boolean
  email: boolean
}

/** Preferencia de canal de un residente (fila persistida). */
export interface PreferenciaCanalCobranza {
  personaId: string
  canalVisor: boolean
  canalEmail: boolean
  actualizadoPor?: string | null
}

export interface CanalesCobranzaRespuesta {
  global: CanalesCobranzaFI
  personas: PreferenciaCanalCobranza[]
  propio: PreferenciaCanalCobranza | null
}

/** Estado de UN canal en la respuesta de la gestión. */
export interface ResumenCanalCobranza {
  canal: CanalCobranzaFI
  estado: "enviado" | "pendiente" | "omitido" | "duplicado"
  motivo?: string
  envioId?: string
  fecha?: string
}

/** Resultado de la gestión de cobranza (lo que la UI necesita mostrar). */
export interface ResultadoCobranzaFI {
  unidadRef?: string
  montoTotal?: number
  idempotente?: boolean
  reenvio?: boolean
  mensaje?: string
  notificacionId?: string | null
  canales?: {
    visor?: ResumenCanalCobranza
    email?: ResumenCanalCobranza
  }
}

export interface StoreResultCobranza extends StoreResult {
  resultado?: ResultadoCobranzaFI
}

export interface UseAccionesCobranzaFIResultado {
  /**
   * POST `/api/cobros-fi/[id]/cobranza` — gestión de cobranza de la unidad del
   * cobro: publica en el visor interno y/o encola el email según los
   * interruptores. Devuelve el resumen por canal.
   */
  enviarCobranza: (
    cobroId: string,
    opciones?: { reenviar?: boolean }
  ) => Promise<StoreResultCobranza>
  /** PUT global — interruptor de canal de toda la comunidad (solo admin). */
  actualizarCanalesGlobal: (
    parcial: Partial<CanalesCobranzaFI>
  ) => Promise<StoreResult>
  /** PUT por residente — preferencia individual de canal. */
  actualizarPreferenciaCanal: (
    personaId: string,
    parcial: Partial<CanalesCobranzaFI>
  ) => Promise<StoreResult>
}

/** PUT con el contrato del store (mismo shape que `updateConfig`). */
async function putCanales(
  body: Record<string, unknown>
): Promise<StoreResult> {
  try {
    const res = await fetch(BASE_CANALES, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    })
    const cuerpo = (await res.json().catch(() => null)) as
      | { error?: string }
      | null
    if (!res.ok) {
      return {
        ok: false,
        error: cuerpo?.error ?? `Error ${res.status} al guardar los canales de cobranza.`,
      }
    }
    void mutateGlobal(
      (key) => typeof key === "string" && key.startsWith(BASE_CANALES)
    )
    return { ok: true }
  } catch {
    return { ok: false, error: "Sin conexión con el servidor." }
  }
}

/** Las transiciones de cobranza FI con el contrato del store (`StoreResult`). */
export function useAccionesCobranzaFI(): UseAccionesCobranzaFIResultado {
  const enviarCobranza = async (
    cobroId: string,
    opciones?: { reenviar?: boolean }
  ): Promise<StoreResultCobranza> => {
    const r = await postAccion(
      `${BASE_COBROS}/${cobroId}/cobranza`,
      { reenviar: opciones?.reenviar === true },
      [BASE_COBROS, BASE_CANALES]
    )
    if (!r.ok) {
      return { ok: false, error: r.error ?? "No se pudo enviar la cobranza." }
    }
    const data = (r.data ?? {}) as ResultadoCobranzaFI & { error?: string }
    return { ok: true, resultado: data }
  }

  const actualizarCanalesGlobal = (parcial: Partial<CanalesCobranzaFI>) =>
    putCanales({
      global: {
        ...(parcial.visor === undefined ? {} : { canalVisor: parcial.visor }),
        ...(parcial.email === undefined ? {} : { canalEmail: parcial.email }),
      },
    })

  const actualizarPreferenciaCanal = (
    personaId: string,
    parcial: Partial<CanalesCobranzaFI>
  ) =>
    putCanales({
      personaId,
      ...(parcial.visor === undefined ? {} : { canalVisor: parcial.visor }),
      ...(parcial.email === undefined ? {} : { canalEmail: parcial.email }),
    })

  return {
    enviarCobranza,
    actualizarCanalesGlobal,
    actualizarPreferenciaCanal,
  }
}

async function fetcher<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { accept: "application/json" } })
  if (!res.ok) {
    const cuerpo = (await res.json().catch(() => null)) as { error?: string } | null
    throw new Error(cuerpo?.error ?? `Error ${res.status} al consultar ${url}.`)
  }
  return (await res.json()) as T
}

/**
 * GET `/api/cobros-fi/canales` — interruptor global + preferencias visibles para
 * el rol de la sesión (administrador y comité: todas; residente: solo la propia).
 * Sin fila persistida el servidor responde encendido en ambos niveles.
 */
export function useCanalesCobranzaFI(): {
  global: CanalesCobranzaFI
  personas: PreferenciaCanalCobranza[]
  propio: PreferenciaCanalCobranza | null
  isLoading: boolean
  error: Error | null
} {
  const { data, error, isLoading } = useSWR<CanalesCobranzaRespuesta, Error>(
    BASE_CANALES,
    fetcher
  )
  return {
    global: data?.global ?? { visor: true, email: true },
    personas: data?.personas ?? [],
    propio: data?.propio ?? null,
    isLoading,
    error: error ?? null,
  }
}
