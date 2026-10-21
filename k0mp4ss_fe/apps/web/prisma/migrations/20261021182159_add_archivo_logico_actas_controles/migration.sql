-- CreateTable
CREATE TABLE "controles_propiedad_archivados" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "comunidadId" TEXT NOT NULL,
    "unidadId" TEXT NOT NULL,
    "residenteVeMorosidad" BOOLEAN NOT NULL,
    "residenteVeActas" BOOLEAN NOT NULL,
    "alertasResidentesActivas" BOOLEAN NOT NULL,
    "motivo" TEXT,
    "actorUsuarioId" TEXT NOT NULL,
    "archivadaEn" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "actas_gd_archivadas" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "comunidadId" TEXT NOT NULL,
    "fecha" TEXT NOT NULL,
    "hora" TEXT NOT NULL,
    "lugar" TEXT NOT NULL,
    "tablaTemas" JSONB NOT NULL,
    "presentes" JSONB NOT NULL,
    "ausentes" JSONB NOT NULL,
    "invitados" JSONB NOT NULL,
    "minuta" TEXT NOT NULL,
    "adjuntos" JSONB NOT NULL,
    "estado" TEXT NOT NULL,
    "aprobaciones" JSONB NOT NULL,
    "fechaPublicacion" TEXT,
    "avisoCVReferencia" TEXT,
    "periodoId" TEXT,
    "motivo" TEXT,
    "actorUsuarioId" TEXT NOT NULL,
    "archivadaEn" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_controles_propiedad" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "comunidadId" TEXT NOT NULL,
    "unidadId" TEXT NOT NULL,
    "residenteVeMorosidad" BOOLEAN NOT NULL,
    "residenteVeActas" BOOLEAN NOT NULL,
    "alertasResidentesActivas" BOOLEAN NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'vigente',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "controles_propiedad_comunidadId_fkey" FOREIGN KEY ("comunidadId") REFERENCES "Comunidad" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_controles_propiedad" ("alertasResidentesActivas", "comunidadId", "createdAt", "id", "residenteVeActas", "residenteVeMorosidad", "unidadId", "updatedAt") SELECT "alertasResidentesActivas", "comunidadId", "createdAt", "id", "residenteVeActas", "residenteVeMorosidad", "unidadId", "updatedAt" FROM "controles_propiedad";
DROP TABLE "controles_propiedad";
ALTER TABLE "new_controles_propiedad" RENAME TO "controles_propiedad";
CREATE INDEX "controles_propiedad_comunidadId_idx" ON "controles_propiedad"("comunidadId");
CREATE INDEX "controles_propiedad_unidadId_idx" ON "controles_propiedad"("unidadId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "controles_propiedad_archivados_comunidadId_idx" ON "controles_propiedad_archivados"("comunidadId");

-- CreateIndex
CREATE INDEX "actas_gd_archivadas_comunidadId_idx" ON "actas_gd_archivadas"("comunidadId");
