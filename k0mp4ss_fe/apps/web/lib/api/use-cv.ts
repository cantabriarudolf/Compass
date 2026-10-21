"use client"

/** use-cv — hooks SWR para el Visor de Mensajes CV (Fase 4). */
import { useCrudCollection, type CrudCollection } from "./use-crud-collection"
import type { AvisoCV, PlantillaCV } from "@/lib/schemas"
import { hoyISO } from "@/lib/date-utils"

export function useAvisosCV(): CrudCollection<AvisoCV> {
  return useCrudCollection<AvisoCV>("/api/cv/avisos")
}

export function usePlantillasCV(): CrudCollection<PlantillaCV> {
  return useCrudCollection<PlantillaCV>("/api/cv/plantillas")
}

/**
 * avisosVencidos — avisos publicados cuyo `expiresAt` ya pasó (regla de la
 * caducidad del visor). Misma semántica que la acción legacy
 * `caducarAvisosCV` del store (`estado === "publicado"` + `expiresAt < hoy`);
 * el archivado lo hace el llamador con `update` del hook, contra
 * `PUT /api/cv/avisos/[id]` (contrato ya existente, igual que
 * `app/comunidad/visor`).
 */
export function avisosVencidos(items: AvisoCV[], hoy: string = hoyISO()): AvisoCV[] {
  return items.filter(
    (a) =>
      a.estado === "publicado" &&
      a.expiresAt !== undefined &&
      a.expiresAt !== "" &&
      a.expiresAt < hoy
  )
}
