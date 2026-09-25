"use client"

/** use-reportes-re — hooks SWR para reportes RE (BD-FUENTE-VERDAD Fase 5A). */
import { useCrudCollection, type CrudCollection } from "./use-crud-collection"
import type { ReporteRE } from "@/lib/schemas"

export function useReportesRE(): CrudCollection<ReporteRE> {
  return useCrudCollection<ReporteRE>("/api/reportes-re")
}
