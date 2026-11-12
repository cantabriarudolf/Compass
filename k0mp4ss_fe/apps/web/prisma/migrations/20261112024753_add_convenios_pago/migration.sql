-- CreateTable
CREATE TABLE "convenios_pago" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "comunidadId" TEXT NOT NULL,
    "unidadId" TEXT NOT NULL,
    "personaId" TEXT NOT NULL,
    "acuerdoId" TEXT NOT NULL,
    "montoTotal" REAL NOT NULL,
    "numeroCuotas" INTEGER NOT NULL,
    "fechaSuscripcion" DATETIME NOT NULL,
    "primeraCuota" REAL NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'vigente',
    "observaciones" TEXT,
    "creadoPor" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "convenios_pago_comunidadId_fkey" FOREIGN KEY ("comunidadId") REFERENCES "Comunidad" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "convenios_pago_cuotas" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "comunidadId" TEXT NOT NULL,
    "convenioId" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "monto" REAL NOT NULL,
    "venceEn" DATETIME NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'pendiente',
    "pagadaEn" DATETIME,
    "registradaPor" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "convenios_pago_cuotas_convenioId_fkey" FOREIGN KEY ("convenioId") REFERENCES "convenios_pago" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "convenios_pago_comunidadId_unidadId_idx" ON "convenios_pago"("comunidadId", "unidadId");

-- CreateIndex
CREATE INDEX "convenios_pago_comunidadId_idx" ON "convenios_pago"("comunidadId");

-- CreateIndex
CREATE INDEX "convenios_pago_cuotas_comunidadId_idx" ON "convenios_pago_cuotas"("comunidadId");

-- CreateIndex
CREATE UNIQUE INDEX "convenios_pago_cuotas_convenioId_numero_key" ON "convenios_pago_cuotas"("convenioId", "numero");
