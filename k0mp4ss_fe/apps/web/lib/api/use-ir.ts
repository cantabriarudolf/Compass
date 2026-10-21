"use client"

/**
 * use-ir — hooks SWR para Inventario y Recursos IR (Fase 4).
 *
 * Las dos acciones del ciclo de insumos (entregar / resolver comodín) ya tienen
 * ruta propia en el servidor (`app/api/ir/solicitudes-insumo/[id]/{entregar,
 * resolver-comodin}/route.ts`); acá se cablean con `postAccion` para que la UI
 * deje de depender de las acciones del store legacy. Devuelven `StoreResult`
 * (mismo contrato que el store) y revalidan las colecciones que el servidor
 * toca en la misma transacción: solicitudes Y recursos (el stock baja).
 */
import {
  postAccion,
  useCrudCollection,
  type CrudCollection,
} from "./use-crud-collection"
import type {
  AccionResolucionComodinIR,
  EntregaEPP,
  RecursoIR,
  SolicitudInsumoIR,
} from "@/lib/schemas"
import type { StoreResult } from "@/lib/store"

const BASE_RECURSOS = "/api/ir/recursos"
const BASE_SOLICITUDES = "/api/ir/solicitudes-insumo"

export function useRecursosIR(): CrudCollection<RecursoIR> {
  return useCrudCollection<RecursoIR>(BASE_RECURSOS)
}

/** Colección de solicitudes + las dos acciones que cierran el ciclo de insumos. */
export interface UseSolicitudesInsumoIRResultado
  extends CrudCollection<SolicitudInsumoIR> {
  /**
   * POST `/api/ir/solicitudes-insumo/[id]/entregar` — sin body. Marca la
   * solicitud como entregada y descuenta el stock en una sola transacción;
   * una segunda entrega no vuelve a descontar.
   */
  entregar: (id: string) => Promise<StoreResult>
  /**
   * POST `/api/ir/solicitudes-insumo/[id]/resolver-comodin` — body
   * `{ accion, recursoSustitutoId?, justificacion? }`. `sustituir` entrega el
   * sustituto (descuenta su stock), `rechazar` cierra sin descontar y
   * `aprobar_crear` da de alta el artículo en el catálogo.
   */
  resolverComodin: (
    id: string,
    decision: AccionResolucionComodinIR,
    opts?: { recursoSustitutoId?: string; justificacion?: string }
  ) => Promise<StoreResult>
}

export function useSolicitudesInsumoIR(): UseSolicitudesInsumoIRResultado {
  const col = useCrudCollection<SolicitudInsumoIR>(BASE_SOLICITUDES)

  // El servidor mueve stock en la MISMA transacción: la colección de recursos
  // se revalida junto con la de solicitudes (dos vistas, un solo hecho).
  const invalidar = [BASE_SOLICITUDES, BASE_RECURSOS]

  const entregar = async (id: string): Promise<StoreResult> => {
    const r = await postAccion(`${BASE_SOLICITUDES}/${id}/entregar`, {}, invalidar)
    if (!r.ok) return { ok: false, error: r.error ?? "No se pudo entregar." }
    return { ok: true }
  }

  const resolverComodin = async (
    id: string,
    decision: AccionResolucionComodinIR,
    opts?: { recursoSustitutoId?: string; justificacion?: string }
  ): Promise<StoreResult> => {
    const r = await postAccion(
      `${BASE_SOLICITUDES}/${id}/resolver-comodin`,
      { accion: decision, ...opts },
      invalidar
    )
    // Mensajes de respaldo idénticos a los de la página legacy.
    const respaldo =
      decision === "aprobar_crear"
        ? "No se pudo aprobar."
        : decision === "sustituir"
          ? "No se pudo sustituir."
          : "No se pudo rechazar."
    if (!r.ok) return { ok: false, error: r.error ?? respaldo }
    return { ok: true }
  }

  return { ...col, entregar, resolverComodin }
}

export function useEntregasEPP(): CrudCollection<EntregaEPP> {
  return useCrudCollection<EntregaEPP>("/api/ir/entregas-epp")
}
