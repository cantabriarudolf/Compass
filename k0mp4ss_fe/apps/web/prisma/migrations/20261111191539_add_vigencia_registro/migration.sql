-- CreateTable
CREATE TABLE "vigencia_registro_unidad" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "comunidadId" TEXT NOT NULL,
    "unidadId" TEXT NOT NULL,
    "ultimaActualizacion" DATETIME,
    "requerimientoEn" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "vigencia_registro_unidad_comunidadId_fkey" FOREIGN KEY ("comunidadId") REFERENCES "Comunidad" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "requerimientos_vigencia" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "comunidadId" TEXT NOT NULL,
    "unidadId" TEXT NOT NULL,
    "fecha" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "venceEn" DATETIME NOT NULL,
    "registradoPor" TEXT NOT NULL,
    "fundamento" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "requerimientos_vigencia_comunidadId_fkey" FOREIGN KEY ("comunidadId") REFERENCES "Comunidad" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "vigencia_registro_unidad_comunidadId_idx" ON "vigencia_registro_unidad"("comunidadId");

-- CreateIndex
CREATE UNIQUE INDEX "vigencia_registro_unidad_comunidadId_unidadId_key" ON "vigencia_registro_unidad"("comunidadId", "unidadId");

-- CreateIndex
CREATE INDEX "requerimientos_vigencia_comunidadId_unidadId_idx" ON "requerimientos_vigencia"("comunidadId", "unidadId");
