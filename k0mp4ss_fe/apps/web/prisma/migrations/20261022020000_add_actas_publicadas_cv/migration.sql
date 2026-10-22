-- SERIE-FASE2 §V6 — publicar acta de asamblea en el visor CV (por referencia).
--
-- Aditiva: SOLO crea una tabla nueva; no altera ninguna columna existente, así
-- el libro de actas GD (actas_gd) queda intacto y sigue siendo el documento
-- canónico e inmutable.
--
--   1. actas_publicadas_cv   referencia (actaId) + visibilidad (publicado /
--                            despublicado) + actor y fechas de cada transición.
--                            NO guarda copia del contenido del acta.

-- CreateTable
CREATE TABLE "actas_publicadas_cv" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "comunidadId" TEXT NOT NULL,
    "actaId" TEXT NOT NULL,
    "estado" TEXT NOT NULL,
    "publicadoEn" DATETIME NOT NULL,
    "publicadoPorUsuarioId" TEXT NOT NULL,
    "despublicadoEn" DATETIME,
    "despublicadoPorUsuarioId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "actas_publicadas_cv_comunidadId_fkey" FOREIGN KEY ("comunidadId") REFERENCES "Comunidad" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "actas_publicadas_cv_comunidadId_idx" ON "actas_publicadas_cv"("comunidadId");

-- CreateIndex
CREATE UNIQUE INDEX "actas_publicadas_cv_comunidadId_actaId_key" ON "actas_publicadas_cv"("comunidadId", "actaId");
