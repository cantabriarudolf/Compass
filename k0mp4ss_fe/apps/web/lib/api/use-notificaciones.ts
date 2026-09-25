"use client"

/**
 * use-notificaciones — hooks SWR para notificaciones (BD-FUENTE-VERDAD Fase 5A).
 *
 * Expose `marcarLeida(id)` como shortcut para PUT `{ leida: true }`.
 */
import { useCrudCollection, type CrudCollection } from "./use-crud-collection"
import type { Notificacion } from "@/lib/schemas"
import type { StoreResult } from "@/lib/store"

export function useNotificaciones(): CrudCollection<Notificacion> & {
  marcarLeida: (id: string) => Promise<StoreResult>
} {
  const base = "/api/notificaciones"
  const coleccion = useCrudCollection<Notificacion>(base)

  const marcarLeida = async (id: string): Promise<StoreResult> => {
    return coleccion.update(id, { leida: true })
  }

  return { ...coleccion, marcarLeida }
}
