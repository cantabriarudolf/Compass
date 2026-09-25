"use client"

/** use-certificados-ct — hooks SWR para certificados CT (BD-FUENTE-VERDAD Fase 5A). */
import { useCrudCollection, type CrudCollection } from "./use-crud-collection"
import type { CertificadoCT } from "@/lib/schemas"

export function useCertificadosCT(): CrudCollection<CertificadoCT> {
  return useCrudCollection<CertificadoCT>("/api/certificados-ct")
}
