-- CreateTable
CREATE TABLE "acuerdos" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "comunidadId" TEXT NOT NULL,
    "cuerpo" TEXT NOT NULL,
    "materia" TEXT NOT NULL,
    "folio" TEXT NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'abierto',
    "quorumRequerido" TEXT NOT NULL,
    "fecha" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actaId" TEXT,
    "creadoPor" TEXT NOT NULL,
    "resueltoEn" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "acuerdos_comunidadId_fkey" FOREIGN KEY ("comunidadId") REFERENCES "Comunidad" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "acuerdos_votos" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "comunidadId" TEXT NOT NULL,
    "acuerdoId" TEXT NOT NULL,
    "personaId" TEXT NOT NULL,
    "unidadId" TEXT,
    "decision" TEXT NOT NULL,
    "peso" REAL NOT NULL,
    "registradoPor" TEXT NOT NULL,
    "fecha" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "acuerdos_votos_acuerdoId_fkey" FOREIGN KEY ("acuerdoId") REFERENCES "acuerdos" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "acuerdos_comunidadId_idx" ON "acuerdos"("comunidadId");

-- CreateIndex
CREATE UNIQUE INDEX "acuerdos_comunidadId_folio_key" ON "acuerdos"("comunidadId", "folio");

-- CreateIndex
CREATE INDEX "acuerdos_votos_comunidadId_idx" ON "acuerdos_votos"("comunidadId");

-- CreateIndex
CREATE UNIQUE INDEX "acuerdos_votos_acuerdoId_personaId_key" ON "acuerdos_votos"("acuerdoId", "personaId");
