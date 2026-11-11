-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_revalidaciones_vigencia" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "comunidadId" TEXT NOT NULL,
    "unidadId" TEXT NOT NULL,
    "fecha" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revalidadoPor" TEXT NOT NULL,
    "detalle" TEXT NOT NULL,
    "origen" TEXT NOT NULL DEFAULT 'administrador',
    CONSTRAINT "revalidaciones_vigencia_comunidadId_fkey" FOREIGN KEY ("comunidadId") REFERENCES "Comunidad" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_revalidaciones_vigencia" ("comunidadId", "detalle", "fecha", "id", "revalidadoPor", "unidadId") SELECT "comunidadId", "detalle", "fecha", "id", "revalidadoPor", "unidadId" FROM "revalidaciones_vigencia";
DROP TABLE "revalidaciones_vigencia";
ALTER TABLE "new_revalidaciones_vigencia" RENAME TO "revalidaciones_vigencia";
CREATE INDEX "revalidaciones_vigencia_comunidadId_unidadId_idx" ON "revalidaciones_vigencia"("comunidadId", "unidadId");
CREATE TABLE "new_vinculos" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "comunidadId" TEXT NOT NULL,
    "personaId" TEXT NOT NULL,
    "unidadId" TEXT NOT NULL,
    "rol" TEXT NOT NULL,
    "fechaInicio" TEXT NOT NULL,
    "fechaFin" TEXT,
    "estadoOcupacionPropiedad" TEXT,
    "permiteVerFinanzas" BOOLEAN NOT NULL,
    "puedeDeclararRegistro" BOOLEAN NOT NULL DEFAULT false,
    "cerrarAnterior" BOOLEAN,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "vinculos_comunidadId_fkey" FOREIGN KEY ("comunidadId") REFERENCES "Comunidad" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_vinculos" ("cerrarAnterior", "comunidadId", "createdAt", "estadoOcupacionPropiedad", "fechaFin", "fechaInicio", "id", "permiteVerFinanzas", "personaId", "rol", "unidadId", "updatedAt") SELECT "cerrarAnterior", "comunidadId", "createdAt", "estadoOcupacionPropiedad", "fechaFin", "fechaInicio", "id", "permiteVerFinanzas", "personaId", "rol", "unidadId", "updatedAt" FROM "vinculos";
DROP TABLE "vinculos";
ALTER TABLE "new_vinculos" RENAME TO "vinculos";
CREATE INDEX "vinculos_comunidadId_idx" ON "vinculos"("comunidadId");
CREATE INDEX "vinculos_personaId_idx" ON "vinculos"("personaId");
CREATE INDEX "vinculos_unidadId_idx" ON "vinculos"("unidadId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
