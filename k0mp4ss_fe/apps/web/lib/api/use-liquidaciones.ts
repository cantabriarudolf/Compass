"use client"

/** use-liquidaciones — hooks SWR para liquidaciones PL (SERIE-GATED-API-BD P3). */
import {
  postAccion,
  useCrudCollection,
  type CrudCollection,
} from "./use-crud-collection"
import type { LiquidacionPL } from "@/lib/schemas"
import type { StoreResult } from "@/lib/store"

/** Entrada de generación: parámetros de negocio (los totales los calcula el servidor). */
export interface GenerarLiquidacionInput {
  trabajadorPersonaId: string
  periodo: string
  diasTrabajados: number
  asignacionMovilizacion?: number
  asignacionColacion?: number
  montoAPV?: number
  saludPorcentaje?: number
  saludValorUF?: number
  bonos?: { glosa: string; monto: number; imponible: boolean }[]
}

export interface UseLiquidacionesResultado
  extends Pick<
    CrudCollection<LiquidacionPL>,
    "items" | "total" | "isLoading" | "error" | "remove"
  > {
  liquidaciones: LiquidacionPL[]
  generar: (input: GenerarLiquidacionInput) => Promise<StoreResult>
  confirmar: (id: string) => Promise<StoreResult>
}

const BASE = "/api/liquidaciones"

export function useLiquidaciones(): UseLiquidacionesResultado {
  const col = useCrudCollection<LiquidacionPL>(BASE)

  const generar = async (input: GenerarLiquidacionInput): Promise<StoreResult> => {
    const r = await postAccion(BASE, input, [BASE])
    if (!r.ok) return { ok: false, error: r.error ?? "Error al generar" }
    return { ok: true }
  }

  const confirmar = async (id: string): Promise<StoreResult> => {
    const r = await postAccion(`${BASE}/${id}/confirmar`, {}, [BASE])
    if (!r.ok) return { ok: false, error: r.error ?? "Error al confirmar" }
    return { ok: true }
  }

  return {
    items: col.items,
    total: col.total,
    isLoading: col.isLoading,
    error: col.error,
    remove: col.remove,
    liquidaciones: col.items,
    generar,
    confirmar,
  }
}
