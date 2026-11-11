-- CreateTable
CREATE TABLE "avisos_vigencia" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "comunidadId" TEXT NOT NULL,
    "unidadId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "destinatario" TEXT NOT NULL,
    "hito" TEXT NOT NULL,
    "notificacionId" TEXT NOT NULL,
    "emitidoEn" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "avisos_vigencia_comunidadId_fkey" FOREIGN KEY ("comunidadId") REFERENCES "Comunidad" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "avisos_vigencia_comunidadId_idx" ON "avisos_vigencia"("comunidadId");

-- CreateIndex
CREATE UNIQUE INDEX "avisos_vigencia_comunidadId_unidadId_tipo_destinatario_hito_key" ON "avisos_vigencia"("comunidadId", "unidadId", "tipo", "destinatario", "hito");
