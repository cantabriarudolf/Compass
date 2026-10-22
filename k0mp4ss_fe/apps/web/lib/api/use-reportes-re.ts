"use client"

/**
 * use-reportes-re — hooks SWR para reportes RE (BD-FUENTE-VERDAD Fase 5A).
 *
 * SERIE-FASE2 §V3: además de la colección, acá viven las TRES transiciones de
 * Reportería que la página `app/admin/reporteria/page.tsx` todavía ejecutaba
 * contra el store legacy (`generarReporteRE`, `distribuirReporteRE`,
 * `registrarVistaDashboardRE`). Cada una tiene su ruta propia en
 * `app/api/reportes-re/**` y se cablea con `postAccion`, devolviendo
 * `StoreResult` (el mismo contrato del store) y revalidando la colección.
 *
 * Decisiones del plan que se ven en la firma (no reinterpretar):
 * - `emitirReporte` congela el informe en el servidor (snapshot desde la BD).
 * - `distribuirReporte` publica en el visor y deja el email en `pendiente`:
 *   nunca reporta un envío como hecho.
 * - `registrarVistaReporte` es la métrica de "leídos en la app" (no hay tasa de
 *   apertura); `registrarVistaCentroMando` solo audita la visita al tablero.
 */
import { postAccion, useCrudCollection, type CrudCollection } from "./use-crud-collection"
import type { ReporteRE } from "@/lib/schemas"
import type { StoreResult } from "@/lib/store"

const BASE_REPORTES = "/api/reportes-re"

/** Vistas del Centro de Mando que se auditan (paridad con el store legacy). */
export type VistaCentroMandoRE =
  | "demografico"
  | "operativo"
  | "gestiones"
  | "financiero"

/** Entrada del generador: mismo shape que el formulario de la página. */
export interface EntradaEmisionRE {
  titulo: string
  bloques: ReporteRE["bloques"]
  segmento?: {
    macroSectorIds?: string[]
    microSectorIds?: string[]
    unidadIds?: string[]
    perfiles?: ReporteRE["segmento"]["perfiles"]
    tenencias?: ReporteRE["segmento"]["tenencias"]
  }
  /** Periodo del informe (AAAA-MM); el servidor usa el mes en curso si falta. */
  periodo?: string
}

export function useReportesRE(): CrudCollection<ReporteRE> {
  return useCrudCollection<ReporteRE>(BASE_REPORTES)
}

export interface UseAccionesREResultado {
  /**
   * POST `/api/reportes-re/generar` — calcula el informe desde la BD y persiste
   * el snapshot con fecha, autor y número correlativo. Idempotente por
   * contenido: reemitir el mismo informe devuelve el snapshot congelado.
   */
  emitirReporte: (input: EntradaEmisionRE) => Promise<StoreResult>
  /**
   * POST `/api/reportes-re/[id]/distribuir` — publica en el visor interno y
   * encola el email (`pendiente`). Sin SMTP el correo NO se envía.
   */
  distribuirReporte: (id: string, opciones?: { email?: boolean }) => Promise<StoreResult>
  /**
   * POST `/api/reportes-re/[id]/lectura` — marca la lectura del informe por el
   * usuario (una por usuario, con fecha: base de la métrica "leídos").
   */
  registrarVistaReporte: (id: string) => Promise<StoreResult>
  /**
   * POST `/api/reportes-re/vistas` — audita la consulta del Centro de Mando
   * (`re:centro_mando` ver: administrador y comité).
   */
  registrarVistaCentroMando: (vista: VistaCentroMandoRE) => Promise<StoreResult>
}

/** Las transiciones RE con el contrato del store (`StoreResult`). */
export function useAccionesRE(): UseAccionesREResultado {
  const emitirReporte = async (input: EntradaEmisionRE): Promise<StoreResult> => {
    const r = await postAccion(`${BASE_REPORTES}/generar`, input, [BASE_REPORTES])
    if (!r.ok) return { ok: false, error: r.error ?? "No se pudo generar el reporte." }
    return { ok: true }
  }

  const distribuirReporte = async (
    id: string,
    opciones?: { email?: boolean }
  ): Promise<StoreResult> => {
    const r = await postAccion(
      `${BASE_REPORTES}/${id}/distribuir`,
      { email: opciones?.email ?? true },
      [BASE_REPORTES]
    )
    if (!r.ok) return { ok: false, error: r.error ?? "No se pudo distribuir el reporte." }
    return { ok: true }
  }

  const registrarVistaReporte = async (id: string): Promise<StoreResult> => {
    const r = await postAccion(`${BASE_REPORTES}/${id}/lectura`, {}, [BASE_REPORTES])
    if (!r.ok) return { ok: false, error: r.error ?? "No se pudo registrar la lectura." }
    return { ok: true }
  }

  const registrarVistaCentroMando = async (
    vista: VistaCentroMandoRE
  ): Promise<StoreResult> => {
    const r = await postAccion(`${BASE_REPORTES}/vistas`, { vista })
    if (!r.ok) return { ok: false, error: r.error ?? "No se pudo registrar la vista." }
    return { ok: true }
  }

  return {
    emitirReporte,
    distribuirReporte,
    registrarVistaReporte,
    registrarVistaCentroMando,
  }
}
