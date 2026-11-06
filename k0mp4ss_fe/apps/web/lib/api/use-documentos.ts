"use client"

/**
 * use-documentos — hook SWR para el ARCHIVO de documentos de la comunidad
 * (F35 serie A, A2 · T7).
 *
 * Una sola entidad con dos naturalezas (`lib/documento-archivo.ts`): `legal`
 * es append-only y `comunitario` se reemplaza. El CRUD es el estándar
 * (`useCrudCollection`), así que la pantalla puede crear, reemplazar y borrar
 * lo comunitario; lo legal responde 409 desde la ruta y acá no se inventa nada.
 *
 * El schema del dominio no declara `version` ni `createdAt` porque los pone el
 * servidor, así que el tipo de la fila los agrega: la marca de «vigente» de los
 * legales se calcula con esa `version` (S2/A2).
 */
import { useCrudCollection, type CrudCollection } from "./use-crud-collection"
import type { DocumentoArchivo } from "@/lib/documento-archivo"

/** Fila del archivo tal como la devuelve `GET /api/documentos`. */
export type DocumentoArchivoEnLista = DocumentoArchivo & {
  /** Asignada por el servidor dentro de (comunidadId, tipoDocumental). */
  version: number
  createdAt?: string
}

export function useDocumentos(): CrudCollection<DocumentoArchivoEnLista> {
  return useCrudCollection<DocumentoArchivoEnLista>("/api/documentos")
}
