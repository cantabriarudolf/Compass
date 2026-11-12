-- F31 — presupuesto por partidas aprobado por el cuerpo que el reglamento defina.
--
-- Aditiva: dos tablas nuevas, sin tocar ninguna existente.
--   · presupuestos          la versión aprobada de un período (AAAA) con el cuerpo
--                           que la aprobó (comite | asamblea), copiado del acuerdo
--                           foliado, y el total como snapshot de sus partidas.
--   · partidas_presupuesto  el desglose por concepto (categorías de egreso FI).
--
-- Una sola versión `vigente` por comunidad y período no se impone con un índice
-- parcial (SQLite no lo soporta): la ruta la garantiza dentro de la transacción y
-- el índice único (comunidadId, periodo, version) impide que dos altas concurrentes
-- escriban la misma versión.

-- CreateTable
CREATE TABLE "presupuestos" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "comunidadId" TEXT NOT NULL,
    "periodo" TEXT NOT NULL,
    "cuerpo" TEXT NOT NULL,
    "acuerdoId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'vigente',
    "total" REAL NOT NULL,
    "creadoPor" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "presupuestos_comunidadId_fkey" FOREIGN KEY ("comunidadId") REFERENCES "Comunidad" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "partidas_presupuesto" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "comunidadId" TEXT NOT NULL,
    "presupuestoId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "categoria" TEXT NOT NULL,
    "monto" REAL NOT NULL,
    "orden" INTEGER NOT NULL,
    CONSTRAINT "partidas_presupuesto_presupuestoId_fkey" FOREIGN KEY ("presupuestoId") REFERENCES "presupuestos" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "presupuestos_comunidadId_periodo_version_key" ON "presupuestos"("comunidadId", "periodo", "version");

-- CreateIndex
CREATE INDEX "presupuestos_comunidadId_periodo_estado_idx" ON "presupuestos"("comunidadId", "periodo", "estado");

-- CreateIndex
CREATE UNIQUE INDEX "partidas_presupuesto_presupuestoId_orden_key" ON "partidas_presupuesto"("presupuestoId", "orden");
