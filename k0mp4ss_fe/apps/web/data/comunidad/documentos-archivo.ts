// Seed del ARCHIVO de documentos de la comunidad (AD/F35 serie A, T9): las
// cuatro filas con las que la pantalla `/comunidad/archivo` nace con datos.
//
// Tres documentos LEGALES (S1) con su referencia auténtica —el reglamento, el
// acta de asamblea y la póliza de seguro— apuntando a los PDF sintéticos de
// `public/archivo-documentos/`, que dicen «DOCUMENTO DE PRUEBA — SIN VALOR
// LEGAL» y se reemplazan antes de producción. Un documento COMUNITARIO (S4, la
// circular del plan de emergencia) cuya URL es la del colorín por decisión del
// owner (L6): es la fila de broma, no un documento.
//
// `comunidadId` NO se declara acá: lo inyecta `scripts/seed-db-from-data.ts` con
// la misma comunidad destino que el resto de la semilla.
//
// `version` va fija en 1 porque la semilla es el punto de partida: el servidor
// asigna la siguiente dentro de (comunidadId, tipoDocumental) para las altas que
// haga la pantalla, no para estas filas.
//
// `subidoPorPersonaId` es null a propósito (L3-d): la columna no lleva FK para
// que la procedencia sobreviva a una fusión o baja del padrón, y la semilla no
// tiene persona que lo haya subido.

import type { DocumentoArchivo } from "@/lib/documento-archivo"

export type DocumentoArchivoSeed = Omit<DocumentoArchivo, "subidoPorPersonaId"> & {
  version: number
  subidoPorPersonaId: null
}

export const documentosArchivo: DocumentoArchivoSeed[] = [
  {
    id: "doc-archivo-reglamento-copropiedad",
    naturaleza: "legal",
    tipoDocumental: "reglamento-copropiedad",
    glosa: "Reglamento de copropiedad vigente y sus modificaciones",
    referenciaAutentica:
      "Conservador de Bienes Raíces de Santiago, inscripción 4521 del año 2026",
    archivoNombre: "reglamento-copropiedad.pdf",
    archivoTipoMime: "application/pdf",
    // Tamaño del PDF sintético de `public/archivo-documentos/` (4968 bytes).
    archivoTamanoKB: 5,
    archivoUrl: "/archivo-documentos/reglamento-copropiedad.pdf",
    vigenteDesde: "2026-01-15",
    version: 1,
    subidoPorPersonaId: null,
  },
  {
    id: "doc-archivo-acta-asamblea-2026",
    naturaleza: "legal",
    tipoDocumental: "actas-asamblea",
    glosa: "Acta de asamblea ordinaria de marzo 2026",
    referenciaAutentica: "Notaría 4ª de Santiago, fojas 12, 15-03-2026",
    archivoNombre: "acta-asamblea-2026.pdf",
    archivoTipoMime: "application/pdf",
    // Tamaño del PDF sintético de `public/archivo-documentos/` (4243 bytes).
    archivoTamanoKB: 4,
    archivoUrl: "/archivo-documentos/acta-asamblea-2026.pdf",
    vigenteDesde: "2026-03-15",
    version: 1,
    subidoPorPersonaId: null,
  },
  {
    id: "doc-archivo-poliza-seguro-2026",
    naturaleza: "legal",
    tipoDocumental: "polizas-seguro",
    glosa: "Póliza de seguro de áreas comunes 2026",
    referenciaAutentica: "Póliza POL-2026-004871, corredora inscrita en la CMF",
    archivoNombre: "poliza-seguro.pdf",
    archivoTipoMime: "application/pdf",
    // Tamaño del PDF sintético de `public/archivo-documentos/` (4396 bytes).
    archivoTamanoKB: 4,
    archivoUrl: "/archivo-documentos/poliza-seguro.pdf",
    vigenteDesde: "2026-01-01",
    version: 1,
    subidoPorPersonaId: null,
  },
  {
    id: "doc-archivo-circular-emergencia",
    naturaleza: "comunitario",
    tipoDocumental: "otros",
    glosa: "Circular del plan de emergencia",
    archivoNombre: "plan-de-emergencia.pdf",
    // Tipo MIME declarado de la fila; la URL no es un PDF por decisión del owner (L6).
    archivoTipoMime: "application/pdf",
    archivoTamanoKB: 0,
    archivoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    vigenteDesde: "2026-04-01",
    version: 1,
    subidoPorPersonaId: null,
  },
]
