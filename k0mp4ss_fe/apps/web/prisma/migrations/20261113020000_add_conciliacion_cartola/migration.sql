-- F30 — conciliación bancaria por importación de cartola (decisión D1: sin
-- integración con el banco; se importa el archivo que el banco ya exporta).
--
-- Aditiva: dos tablas nuevas, sin tocar ninguna existente. IngresoFI, EgresoFI y
-- CobroFI se LEEN como candidatos y no se modifican: la cartola no crea asientos
-- contables, sólo registra el movimiento del banco y su estado de conciliación.
--   · cartolas_importadas   el archivo que entró, con los contadores de enlace
--                           (`filas = conciliadas + noConciliadas`).
--   · movimientos_cartola   la fila del banco con su estado: la cola de
--                           `no_conciliado` es la que una persona resuelve.
--
-- El índice (comunidadId, estado) es el que sostiene la lectura de la cola; el de
-- cartolaId es el que necesita el recalculo de contadores al resolver a mano.

-- CreateTable
CREATE TABLE "cartolas_importadas" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "comunidadId" TEXT NOT NULL,
    "nombreArchivo" TEXT NOT NULL,
    "importadaPor" TEXT NOT NULL,
    "filas" INTEGER NOT NULL,
    "conciliadas" INTEGER NOT NULL,
    "noConciliadas" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "cartolas_importadas_comunidadId_fkey" FOREIGN KEY ("comunidadId") REFERENCES "Comunidad" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "movimientos_cartola" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "comunidadId" TEXT NOT NULL,
    "cartolaId" TEXT NOT NULL,
    "fecha" DATETIME NOT NULL,
    "descripcion" TEXT NOT NULL,
    "referencia" TEXT,
    "contraparte" TEXT,
    "monto" REAL NOT NULL,
    "tipo" TEXT NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'no_conciliado',
    "origen" TEXT,
    "resueltoPor" TEXT,
    "resueltoEn" DATETIME,
    "cargoReferencia" TEXT,
    CONSTRAINT "movimientos_cartola_comunidadId_fkey" FOREIGN KEY ("comunidadId") REFERENCES "Comunidad" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "movimientos_cartola_cartolaId_fkey" FOREIGN KEY ("cartolaId") REFERENCES "cartolas_importadas" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "cartolas_importadas_comunidadId_idx" ON "cartolas_importadas"("comunidadId");

-- CreateIndex
CREATE INDEX "movimientos_cartola_comunidadId_estado_idx" ON "movimientos_cartola"("comunidadId", "estado");

-- CreateIndex
CREATE INDEX "movimientos_cartola_cartolaId_idx" ON "movimientos_cartola"("cartolaId");
