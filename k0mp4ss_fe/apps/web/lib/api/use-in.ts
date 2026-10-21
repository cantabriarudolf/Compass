"use client"

/**
 * use-in — hooks SWR para Infracciones y Multas IN (Fase 4).
 *
 * Las tres acciones del expediente (aplicar / desestimar / apelar) ya tienen
 * ruta propia en el servidor (`app/api/in/infracciones/[id]/{aplicar,
 * desestimar,apelar}/route.ts`); acá solo se cablean con `postAccion` para que
 * la UI deje de depender de las acciones del store legacy y pasen a ser
 * transaccionales contra la fuente de verdad, con el mismo `StoreResult`.
 */
import {
  postAccion,
  useCrudCollection,
  type CrudCollection,
} from "./use-crud-collection"
import type { InfraccionIN, TipoInfraccionIN } from "@/lib/schemas"
import type { StoreResult } from "@/lib/store"

const BASE_INFRACCIONES = "/api/in/infracciones"

/** Colección IN + las tres acciones del expediente (contrato de las rutas POST). */
export interface UseInfraccionesINResultado
  extends CrudCollection<InfraccionIN> {
  /** POST `/api/in/infracciones/[id]/aplicar` — sin body (la ruta no lo lee). */
  aplicar: (id: string) => Promise<StoreResult>
  /** POST `/api/in/infracciones/[id]/desestimar` — body `{ justificacion }`. */
  desestimar: (id: string, justificacion: string) => Promise<StoreResult>
  /** POST `/api/in/infracciones/[id]/apelar` — body `{ descargos }`. */
  apelar: (id: string, descargos: string) => Promise<StoreResult>
}

export function useTiposInfraccionIN(): CrudCollection<TipoInfraccionIN> {
  return useCrudCollection<TipoInfraccionIN>("/api/in/tipos")
}

export function useInfraccionesIN(): UseInfraccionesINResultado {
  const col = useCrudCollection<InfraccionIN>(BASE_INFRACCIONES)

  // Aplicar materializa el `cargoFI` de la multa en el servidor: además de la
  // colección IN se revalida la de cobros FI para que Finanzas no quede con la
  // lista vieja en memoria (misma transacción, dos vistas afectadas).
  const aplicar = async (id: string): Promise<StoreResult> => {
    const r = await postAccion(`${BASE_INFRACCIONES}/${id}/aplicar`, {}, [
      BASE_INFRACCIONES,
      "/api/cobros-fi",
    ])
    if (!r.ok) return { ok: false, error: r.error ?? "No se pudo aplicar." }
    return { ok: true }
  }

  const desestimar = async (
    id: string,
    justificacion: string
  ): Promise<StoreResult> => {
    const r = await postAccion(`${BASE_INFRACCIONES}/${id}/desestimar`, {
      justificacion,
    }, [BASE_INFRACCIONES])
    if (!r.ok) return { ok: false, error: r.error ?? "No se pudo desestimar." }
    return { ok: true }
  }

  const apelar = async (id: string, descargos: string): Promise<StoreResult> => {
    const r = await postAccion(`${BASE_INFRACCIONES}/${id}/apelar`, {
      descargos,
    }, [BASE_INFRACCIONES])
    if (!r.ok)
      return { ok: false, error: r.error ?? "No se pudieron registrar los descargos." }
    return { ok: true }
  }

  return {
    ...col,
    aplicar,
    desestimar,
    apelar,
  }
}
