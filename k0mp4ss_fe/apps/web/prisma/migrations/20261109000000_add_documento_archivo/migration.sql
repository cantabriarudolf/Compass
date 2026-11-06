-- F35 serie A (A1) — el ARCHIVO de documentos de la comunidad.
--
-- Aditiva: SOLO crea una tabla y sus índices. No toca `documentos_co` (la
-- Biblioteca de CO) ni ninguna columna existente. Sin backfill: nace vacía.
--
-- Una sola entidad, dos naturalezas:
--   · `legal`       ⊂ append-only: no se edita ni se borra (la ruta responde 409);
--                     se corrige con otra versión. Exige `referenciaAutentica`.
--   · `comunitario` ⊂ reemplazable: se edita y se borra con la clave `doc`.
--
-- `version` la asigna el servidor dentro de (comunidadId, tipoDocumental): un
-- legal nuevo en el mismo tipo sube uno, y reemplazar un comunitario conserva
-- el número. El cliente nunca manda la versión.
--
-- D1 (media por referencia): el archivo son metadatos + URL, jamás bytes ni
-- base64; por eso no hay columna de contenido ni endpoint de descarga.
--
-- `subidoPorPersonaId` va SIN foreign key a propósito: la procedencia del
-- documento debe sobrevivir a una fusión o baja del padrón (y un documento
-- legal no se puede borrar para poder borrar a la persona).

-- CreateTable
CREATE TABLE "documentos" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "comunidadId" TEXT NOT NULL,
    "naturaleza" TEXT NOT NULL,
    "tipoDocumental" TEXT NOT NULL,
    "glosa" TEXT NOT NULL,
    "referenciaAutentica" TEXT,
    "archivoNombre" TEXT NOT NULL,
    "archivoTipoMime" TEXT NOT NULL,
    "archivoTamanoKB" REAL NOT NULL,
    "archivoUrl" TEXT NOT NULL,
    "hash" TEXT,
    "version" INTEGER NOT NULL,
    "vigenteDesde" TEXT NOT NULL,
    "subidoPorPersonaId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "documentos_comunidadId_fkey" FOREIGN KEY ("comunidadId") REFERENCES "Comunidad" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "documentos_comunidadId_naturaleza_idx" ON "documentos"("comunidadId", "naturaleza");

-- CreateIndex
CREATE INDEX "documentos_comunidadId_tipoDocumental_idx" ON "documentos"("comunidadId", "tipoDocumental");

-- CreateIndex — una sola línea de historia por tipo: si dos altas concurrentes
-- calculan la misma versión, la segunda choca acá (P2002 → 409) en vez de
-- convivir con un número repetido.
CREATE UNIQUE INDEX "documentos_comunidadId_tipoDocumental_version_key" ON "documentos"("comunidadId", "tipoDocumental", "version");
