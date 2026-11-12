-- F32 — gasto por sector con avalúo fiscal.
--
-- Aditiva: una columna nueva en `unidades` y dos tablas nuevas, sin tocar ninguna
-- otra. `EmisionGC` y `CobroFI` NO se modifican: el reparto de un sector es su
-- propio documento y conectar la emisión general con él es trabajo aparte (queda
-- declarado como deuda en `specs/PENDIENTES-FUNCIONALIDAD.md`).
--
--   · unidades.avaluoFiscal        el avalúo fiscal declarado de la unidad. NULL =
--                                 NO DECLARADO: la unidad no entra al reparto de su
--                                 sector y nunca se reparte en partes iguales para
--                                 compensarla (ver `lib/reparto-sector.ts`).
--   · repartos_sector             el gasto de un sector emitido: período, concepto,
--                                 monto total y avalúo total como snapshot.
--   · cuotas_reparto_sector       cuánto le toca a cada unidad, con el avalúo que se
--                                 usó (congelado por unidad).
--
-- El índice único (repartoSectorId, unidadId) impide dos cuotas de la misma unidad
-- en el mismo reparto; el de (comunidadId, periodo) sostiene la lectura por período.

-- AlterTable
ALTER TABLE "unidades" ADD COLUMN "avaluoFiscal" REAL;

-- CreateTable
CREATE TABLE "repartos_sector" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "comunidadId" TEXT NOT NULL,
    "microSectorId" TEXT NOT NULL,
    "periodo" TEXT NOT NULL,
    "concepto" TEXT NOT NULL,
    "montoTotal" REAL NOT NULL,
    "avaluoTotal" REAL NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'emitido',
    "creadoPor" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "repartos_sector_comunidadId_fkey" FOREIGN KEY ("comunidadId") REFERENCES "Comunidad" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "cuotas_reparto_sector" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "comunidadId" TEXT NOT NULL,
    "repartoSectorId" TEXT NOT NULL,
    "unidadId" TEXT NOT NULL,
    "avaluoUsado" REAL NOT NULL,
    "monto" REAL NOT NULL,
    CONSTRAINT "cuotas_reparto_sector_repartoSectorId_fkey" FOREIGN KEY ("repartoSectorId") REFERENCES "repartos_sector" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "repartos_sector_comunidadId_idx" ON "repartos_sector"("comunidadId");

-- CreateIndex
CREATE INDEX "repartos_sector_comunidadId_periodo_idx" ON "repartos_sector"("comunidadId", "periodo");

-- CreateIndex
CREATE INDEX "repartos_sector_microSectorId_idx" ON "repartos_sector"("microSectorId");

-- CreateIndex
CREATE UNIQUE INDEX "cuotas_reparto_sector_repartoSectorId_unidadId_key" ON "cuotas_reparto_sector"("repartoSectorId", "unidadId");

-- CreateIndex
CREATE INDEX "cuotas_reparto_sector_comunidadId_idx" ON "cuotas_reparto_sector"("comunidadId");

-- CreateIndex
CREATE INDEX "cuotas_reparto_sector_unidadId_idx" ON "cuotas_reparto_sector"("unidadId");
