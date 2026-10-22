-- SERIE-FASE2 §V5 — Cobranza FI multicanal con interruptores.
--
-- Aditiva: SOLO crea tres tablas nuevas; no altera ninguna columna existente,
-- así el histórico FI (cobros, notificaciones, eventos) no cambia de forma.
--
--   1. configuracion_cobranza_fi         interruptor GLOBAL de la comunidad
--   2. preferencias_canal_cobranza_fi    interruptor POR RESIDENTE (persona)
--   3. envios_cobranza_fi                registro por envío (canal, fecha,
--                                        destinatario, estado y motivo)
--

-- CreateTable
CREATE TABLE "configuracion_cobranza_fi" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "comunidadId" TEXT NOT NULL,
    "canalVisor" BOOLEAN NOT NULL DEFAULT true,
    "canalEmail" BOOLEAN NOT NULL DEFAULT true,
    "actualizadoPor" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "configuracion_cobranza_fi_comunidadId_fkey" FOREIGN KEY ("comunidadId") REFERENCES "Comunidad" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "preferencias_canal_cobranza_fi" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "comunidadId" TEXT NOT NULL,
    "personaId" TEXT NOT NULL,
    "canalVisor" BOOLEAN NOT NULL DEFAULT true,
    "canalEmail" BOOLEAN NOT NULL DEFAULT true,
    "actualizadoPor" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "preferencias_canal_cobranza_fi_comunidadId_fkey" FOREIGN KEY ("comunidadId") REFERENCES "Comunidad" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "envios_cobranza_fi" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "comunidadId" TEXT NOT NULL,
    "cobroId" TEXT NOT NULL,
    "unidadId" TEXT NOT NULL,
    "personaId" TEXT,
    "canal" TEXT NOT NULL,
    "estado" TEXT NOT NULL,
    "fecha" TEXT NOT NULL,
    "motivo" TEXT,
    "montoTotal" REAL NOT NULL DEFAULT 0,
    "cobrosIncluidos" JSONB NOT NULL,
    "claveEnvio" TEXT NOT NULL,
    "reenvio" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "envios_cobranza_fi_comunidadId_fkey" FOREIGN KEY ("comunidadId") REFERENCES "Comunidad" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "configuracion_cobranza_fi_comunidadId_key" ON "configuracion_cobranza_fi"("comunidadId");

-- CreateIndex
CREATE INDEX "configuracion_cobranza_fi_comunidadId_idx" ON "configuracion_cobranza_fi"("comunidadId");

-- CreateIndex
CREATE INDEX "preferencias_canal_cobranza_fi_comunidadId_idx" ON "preferencias_canal_cobranza_fi"("comunidadId");

-- CreateIndex
CREATE UNIQUE INDEX "preferencias_canal_cobranza_fi_comunidadId_personaId_key" ON "preferencias_canal_cobranza_fi"("comunidadId", "personaId");

-- CreateIndex
CREATE INDEX "envios_cobranza_fi_comunidadId_idx" ON "envios_cobranza_fi"("comunidadId");

-- CreateIndex
CREATE INDEX "envios_cobranza_fi_cobroId_idx" ON "envios_cobranza_fi"("cobroId");

-- CreateIndex
CREATE INDEX "envios_cobranza_fi_unidadId_idx" ON "envios_cobranza_fi"("unidadId");

-- CreateIndex
CREATE UNIQUE INDEX "envios_cobranza_fi_comunidadId_claveEnvio_key" ON "envios_cobranza_fi"("comunidadId", "claveEnvio");

