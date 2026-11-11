-- CreateTable
CREATE TABLE "revalidaciones_vigencia" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "comunidadId" TEXT NOT NULL,
    "unidadId" TEXT NOT NULL,
    "fecha" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revalidadoPor" TEXT NOT NULL,
    "detalle" TEXT NOT NULL,
    CONSTRAINT "revalidaciones_vigencia_comunidadId_fkey" FOREIGN KEY ("comunidadId") REFERENCES "Comunidad" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "revalidaciones_vigencia_comunidadId_unidadId_idx" ON "revalidaciones_vigencia"("comunidadId", "unidadId");
