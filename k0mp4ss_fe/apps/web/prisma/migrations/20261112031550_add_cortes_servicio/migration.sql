-- CreateTable
CREATE TABLE "cortes_servicio" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "comunidadId" TEXT NOT NULL,
    "unidadId" TEXT NOT NULL,
    "servicio" TEXT NOT NULL,
    "acuerdoId" TEXT NOT NULL,
    "cuotasImpagas" INTEGER NOT NULL,
    "montoAdeudado" REAL NOT NULL,
    "fechaPreaviso" DATETIME NOT NULL,
    "fechaHabilitada" DATETIME NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'preaviso',
    "ejecutadoPor" TEXT,
    "ejecutadoEn" DATETIME,
    "revocadoPor" TEXT,
    "revocadoEn" DATETIME,
    "motivo" TEXT,
    "creadoPor" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "cortes_servicio_comunidadId_fkey" FOREIGN KEY ("comunidadId") REFERENCES "Comunidad" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_unidades" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "comunidadId" TEXT NOT NULL,
    "microSectorId" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "etiqueta" TEXT NOT NULL,
    "tipoUnidadId" TEXT NOT NULL,
    "metraje" REAL NOT NULL,
    "prorrateo" REAL NOT NULL,
    "rolSii" TEXT NOT NULL,
    "estadoId" TEXT NOT NULL,
    "servicios" JSONB NOT NULL,
    "electrodependiente" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "unidades_comunidadId_fkey" FOREIGN KEY ("comunidadId") REFERENCES "Comunidad" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_unidades" ("comunidadId", "createdAt", "estadoId", "etiqueta", "id", "metraje", "microSectorId", "numero", "prorrateo", "rolSii", "servicios", "tipoUnidadId", "updatedAt") SELECT "comunidadId", "createdAt", "estadoId", "etiqueta", "id", "metraje", "microSectorId", "numero", "prorrateo", "rolSii", "servicios", "tipoUnidadId", "updatedAt" FROM "unidades";
DROP TABLE "unidades";
ALTER TABLE "new_unidades" RENAME TO "unidades";
CREATE INDEX "unidades_comunidadId_idx" ON "unidades"("comunidadId");
CREATE INDEX "unidades_microSectorId_idx" ON "unidades"("microSectorId");
CREATE INDEX "unidades_tipoUnidadId_idx" ON "unidades"("tipoUnidadId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "cortes_servicio_comunidadId_idx" ON "cortes_servicio"("comunidadId");

-- CreateIndex
CREATE INDEX "cortes_servicio_comunidadId_unidadId_idx" ON "cortes_servicio"("comunidadId", "unidadId");

-- CreateIndex
CREATE INDEX "cortes_servicio_comunidadId_estado_idx" ON "cortes_servicio"("comunidadId", "estado");
