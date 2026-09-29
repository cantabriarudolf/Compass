"use client"

/** use-leads-portal — hooks SWR para leads PI (SERIE-GATED-API-BD P2). */
import { useCrudCollection, type CrudCollection } from "./use-crud-collection"
import type { LeadPortal } from "@/lib/schemas"

export function useLeadsPortal(): CrudCollection<LeadPortal> {
  return useCrudCollection<LeadPortal>("/api/leads-portal")
}
