-- SERIE-FASE2 §V3 — Reportería (RE): snapshot de emisión + distribución.
-- Aditiva: todas las columnas son NULL-ables, así los reportes ya emitidos
-- (que solo tenían payloadSnapshot + fechaGeneracion) siguen válidos y el
-- histórico no cambia de forma.

-- AlterTable
ALTER TABLE "reportes_re" ADD COLUMN "numero" INTEGER;
ALTER TABLE "reportes_re" ADD COLUMN "periodo" TEXT;
ALTER TABLE "reportes_re" ADD COLUMN "autorUsuarioId" TEXT;
ALTER TABLE "reportes_re" ADD COLUMN "autorNombre" TEXT;
ALTER TABLE "reportes_re" ADD COLUMN "estadoDistribucion" TEXT;
ALTER TABLE "reportes_re" ADD COLUMN "envios" JSONB;
ALTER TABLE "reportes_re" ADD COLUMN "lecturas" JSONB;

-- CreateIndex: número correlativo por comunidad (NULL múltiple permitido en
-- SQLite, así las filas históricas sin número no colisionan).
CREATE UNIQUE INDEX "reportes_re_comunidadId_numero_key" ON "reportes_re"("comunidadId", "numero");
