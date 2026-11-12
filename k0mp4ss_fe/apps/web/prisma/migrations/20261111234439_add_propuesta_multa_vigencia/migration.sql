-- CreateTable
CREATE TABLE "propuestas_multa_vigencia" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "comunidadId" TEXT NOT NULL,
    "unidadId" TEXT NOT NULL,
    "fecha" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "monto" REAL NOT NULL,
    "referenciaLegal" TEXT,
    "tipoInfraccionId" TEXT,
    "estado" TEXT NOT NULL DEFAULT 'propuesta',
    "requerimientoEn" DATETIME NOT NULL,
    "propuestaPor" TEXT NOT NULL,
    "aplicadaPor" TEXT,
    "aplicadaEn" DATETIME,
    "acuerdoReferencia" TEXT,
    "infraccionId" TEXT,
    "motivoDesestimacion" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "propuestas_multa_vigencia_comunidadId_fkey" FOREIGN KEY ("comunidadId") REFERENCES "Comunidad" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "propuestas_multa_vigencia_comunidadId_idx" ON "propuestas_multa_vigencia"("comunidadId");

-- CreateIndex
CREATE UNIQUE INDEX "propuestas_multa_vigencia_comunidadId_unidadId_requerimientoEn_key" ON "propuestas_multa_vigencia"("comunidadId", "unidadId", "requerimientoEn");
