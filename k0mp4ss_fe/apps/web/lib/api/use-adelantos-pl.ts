"use client"

/**
 * use-adelantos-pl — acciones de adelantos PL contra la API (SERIE-FASE2 §V4).
 *
 * Reemplaza las acciones legacy `saveAdelantoPL` / `removeAdelantoPL` del store
 * zustand: el alta decide el servidor (folio ADE, saldo, estado, validación del
 * tope 15%/45% del préstamo) y la baja NO borra: marca `desestimado`.
 *
 * Las mutaciones devuelven `StoreResult`, el mismo contrato que las acciones
 * legacy, para que la página intercambie el store por el hook sin tocar el
 * manejo de errores.
 */
import { postAccion, useCrudCollection } from "./use-crud-collection"
import type { AdelantoPL, PactoAdelantoPL } from "@/lib/schemas"
import type { StoreResult } from "@/lib/store"

const BASE = "/api/liquidaciones/adelantos"
/** La liquidación lee los adelantos vivos al generar: se revalida junto. */
const INVALIDAR_ADEMAS = ["/api/liquidaciones"]

export interface CrearAdelantoPLInput {
  id?: string
  trabajadorPersonaId: string
  monto: number
  glosa: string
  /** `anticipo_regular` (sin tope) o `prestamo` (acuerdo escrito + 15%/45%). */
  pacto: PactoAdelantoPL
  fecha?: string
  periodoImputacion?: string
  /** Referencia del acuerdo escrito firmado; obligatoria si `pacto = prestamo`. */
  acuerdoEscritoRef?: string
}

export interface UseAdelantosPLResultado {
  adelantos: AdelantoPL[]
  total: number
  isLoading: boolean
  error: Error | null
  crear: (input: CrearAdelantoPLInput) => Promise<StoreResult>
  desestimar: (id: string) => Promise<StoreResult>
}

export function useAdelantosPL(): UseAdelantosPLResultado {
  const col = useCrudCollection<AdelantoPL>(BASE)

  const crear = async (input: CrearAdelantoPLInput): Promise<StoreResult> => {
    const r = await postAccion(BASE, input, INVALIDAR_ADEMAS)
    if (!r.ok) return { ok: false, error: r.error ?? "Error al registrar adelanto" }
    return { ok: true }
  }

  const desestimar = async (id: string): Promise<StoreResult> => {
    const r = await postAccion(`${BASE}/${id}/desestimar`, {}, INVALIDAR_ADEMAS)
    if (!r.ok) {
      return { ok: false, error: r.error ?? "Error al desestimar el adelanto" }
    }
    return { ok: true }
  }

  return {
    adelantos: col.items,
    total: col.total,
    isLoading: col.isLoading,
    error: col.error,
    crear,
    desestimar,
  }
}
