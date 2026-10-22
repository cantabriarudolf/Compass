-- SERIE-FASE2 §V4 — Adelantos PL: anticipo vs préstamo (doctrina DT ORD 2676/140).
--
-- Aditiva: las columnas nuevas son NULL-ables o traen default, así los adelantos
-- ya registrados (solo id/folio/trabajador/fecha/monto/glosa/estado) siguen
-- válidos y el histórico no cambia de forma.

-- AlterTable: naturaleza + saldo vivo + período de imputación + acuerdo escrito
ALTER TABLE "adelantos_pl" ADD COLUMN "pacto" TEXT NOT NULL DEFAULT 'anticipo_regular';
ALTER TABLE "adelantos_pl" ADD COLUMN "saldo" REAL NOT NULL DEFAULT 0;
ALTER TABLE "adelantos_pl" ADD COLUMN "periodoImputacion" TEXT NOT NULL DEFAULT '';
ALTER TABLE "adelantos_pl" ADD COLUMN "acuerdoEscritoRef" TEXT;
ALTER TABLE "adelantos_pl" ADD COLUMN "creadoPor" TEXT;
ALTER TABLE "adelantos_pl" ADD COLUMN "aprobadoPor" TEXT;
ALTER TABLE "adelantos_pl" ADD COLUMN "comprobante" TEXT;
ALTER TABLE "adelantos_pl" ADD COLUMN "deducciones" JSONB;

-- AlterTable: plan de deducción congelado al generar la liquidación
ALTER TABLE "liquidaciones_pl" ADD COLUMN "adelantosDetalle" JSONB;

-- Backfill: el saldo vivo de un adelanto legado es su monto completo (nació
-- pendiente y no tenía saldo explícito; con saldo 0 nunca se descontaría).
UPDATE "adelantos_pl" SET "saldo" = "monto" WHERE "saldo" = 0 AND "estado" = 'pendiente';

-- CreateIndex: consulta de los adelantos vivos de un trabajador al liquidar
CREATE INDEX "adelantos_pl_comunidadId_trabajadorPersonaId_estado_idx" ON "adelantos_pl"("comunidadId", "trabajadorPersonaId", "estado");
