-- CreateTable
CREATE TABLE "periodos_directiva" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "comunidadId" TEXT NOT NULL,
    "fechaInicio" TEXT NOT NULL,
    "duracionMeses" INTEGER NOT NULL,
    "fechaFin" TEXT,
    "fechaInscripcion" TEXT NOT NULL,
    "referenciaInscripcion" TEXT NOT NULL,
    "fechasEstimadas" BOOLEAN NOT NULL DEFAULT false,
    "estado" TEXT NOT NULL,
    "actaOrigenId" TEXT,
    "miembros" JSONB NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "periodos_directiva_comunidadId_fkey" FOREIGN KEY ("comunidadId") REFERENCES "Comunidad" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "periodos_directiva_comunidadId_idx" ON "periodos_directiva"("comunidadId");

-- CreateIndex
CREATE INDEX "periodos_directiva_estado_idx" ON "periodos_directiva"("estado");
