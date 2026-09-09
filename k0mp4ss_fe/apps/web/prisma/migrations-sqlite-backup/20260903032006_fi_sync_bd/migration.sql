-- AlterTable
ALTER TABLE "fondos_fi" ADD COLUMN "saldoInicial" REAL;

-- CreateTable
CREATE TABLE "ingresos_fi" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "comunidadId" TEXT NOT NULL,
    "fondoId" TEXT NOT NULL,
    "fecha" TEXT NOT NULL,
    "monto" REAL NOT NULL,
    "concepto" TEXT NOT NULL,
    "familia" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ingresos_fi_comunidadId_fkey" FOREIGN KEY ("comunidadId") REFERENCES "Comunidad" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ingresos_fi_comunidadId_idx" ON "ingresos_fi"("comunidadId");

-- CreateIndex
CREATE INDEX "ingresos_fi_fondoId_idx" ON "ingresos_fi"("fondoId");
