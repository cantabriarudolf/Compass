-- T6 aviso-de-cobro (S3) — la ENTREGA del aviso y su prueba.
--
-- Aditiva: SOLO crea una tabla y sus índices. No altera `avisos_cobro` (el
-- documento congelado) ni ninguna otra columna existente.
--
-- Una fila por (aviso, persona, canal):
--   · canal  `visor` | `email`
--   · estado `entregado` | `pendiente` | `fallido`
--   · motivo el porqué de un estado que no es `entregado` (hoy: no hay SMTP)
--   · notificacionId la fila de `notificaciones` que prueba la entrega al visor
--
-- El índice único `(comunidadId, claveEnvio)` es el invariante de idempotencia:
-- re-entregar el mismo aviso a la misma persona por el mismo canal no crea una
-- fila nueva; el reenvío explícito agrega un sufijo `:reenvio:<epoch>` a la
-- clave, igual que `envios_cobranza_fi`. Sin backfill: la tabla nace vacía.

-- CreateTable
CREATE TABLE "envios_aviso_cobro" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "comunidadId" TEXT NOT NULL,
    "avisoId" TEXT NOT NULL,
    "personaId" TEXT NOT NULL,
    "canal" TEXT NOT NULL,
    "estado" TEXT NOT NULL,
    "fecha" TEXT NOT NULL,
    "motivo" TEXT,
    "notificacionId" TEXT,
    "claveEnvio" TEXT NOT NULL,
    "reenvio" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "envios_aviso_cobro_comunidadId_fkey" FOREIGN KEY ("comunidadId") REFERENCES "Comunidad" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "envios_aviso_cobro_avisoId_fkey" FOREIGN KEY ("avisoId") REFERENCES "avisos_cobro" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "envios_aviso_cobro_comunidadId_idx" ON "envios_aviso_cobro"("comunidadId");

-- CreateIndex
CREATE INDEX "envios_aviso_cobro_avisoId_idx" ON "envios_aviso_cobro"("avisoId");

-- CreateIndex
CREATE INDEX "envios_aviso_cobro_personaId_idx" ON "envios_aviso_cobro"("personaId");

-- CreateIndex
CREATE UNIQUE INDEX "envios_aviso_cobro_comunidadId_claveEnvio_key" ON "envios_aviso_cobro"("comunidadId", "claveEnvio");
