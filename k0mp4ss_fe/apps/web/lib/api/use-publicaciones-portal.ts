"use client"

/** use-publicaciones-portal — hooks SWR para publicaciones PI (SERIE-GATED-API-BD P2). */
import { useCrudCollection, type CrudCollection } from "./use-crud-collection"
import type { PublicacionPortal } from "@/lib/schemas"

export function usePublicacionesPortal(): CrudCollection<PublicacionPortal> {
  return useCrudCollection<PublicacionPortal>("/api/publicaciones-portal")
}
