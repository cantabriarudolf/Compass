-- Change co-lectura-residente, tarea 1.1 — modelo relacional EnvioDestinatarioCO (S8 / D3).
--
-- `envio_destinatarios_co` pasa a ser la ÚNICA fuente de verdad de pertenencia y de
-- estado de lectura de un envío CO. Las columnas JSON de `envios_co` quedan así:
--   · `destinatarios` → snapshot inmutable de lo que el administrador envió (trazabilidad)
--   · `lecturas`      → derivada, reescrita desde la tabla en la misma transacción del alta
--
-- Migración ADITIVA: no borra columnas (el retiro de las JSON es un change posterior,
-- cuando el backfill tenga ventana de verificación en producción).
--
-- Dialecto: este directorio de migraciones está fijado a SQLite (`migration_lock.toml:
-- provider = "sqlite"`), que es el motor del job `unit` del CI. La ruta PostgreSQL del
-- backfill —mismo resultado, dialecto distinto— vive en
-- `prisma/backfill/envio_destinatarios_co.pg.sql`.

-- CreateTable
CREATE TABLE "envio_destinatarios_co" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "envioId" TEXT NOT NULL,
    "personaId" TEXT NOT NULL,
    "unidadId" TEXT,
    "leidoEn" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "envio_destinatarios_co_envioId_fkey" FOREIGN KEY ("envioId") REFERENCES "envios_co" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "envio_destinatarios_co_envioId_personaId_key" ON "envio_destinatarios_co"("envioId", "personaId");

-- CreateIndex
CREATE INDEX "envio_destinatarios_co_personaId_idx" ON "envio_destinatarios_co"("personaId");

-- Backfill idempotente, en SQL puro (no depende de la aplicación).
--
--   · Una fila por cada elemento de `envios_co.destinatarios` (`personaId`, `unidadId`).
--   · `leidoEn` se marca para cada `personaId` presente en `envios_co.lecturas`.
--     El array `lecturas` nunca guardó la hora de la lectura (era `string[]`), así que
--     se conserva el `createdAt` del envío como cota inferior conocida: marcar
--     la hora de la migración inventaría un momento de lectura que no ocurrió.
--   · `INSERT OR IGNORE`: re-ejecutarlo no duplica (colisiona con la PK determinista o
--     con el índice único `envioId + personaId`). Es la idempotencia en SQLite; en
--     PostgreSQL el equivalente es `ON CONFLICT DO NOTHING`.
--
-- @backfill:start
INSERT OR IGNORE INTO "envio_destinatarios_co" ("id", "envioId", "personaId", "unidadId", "leidoEn", "createdAt")
SELECT
    'edc-' || e."id" || '-' || COALESCE(json_extract(d.value, '$.personaId'), ''),
    e."id",
    json_extract(d.value, '$.personaId'),
    json_extract(d.value, '$.unidadId'),
    CASE
        WHEN EXISTS (
            SELECT 1
            FROM json_each(COALESCE(e."lecturas", '[]')) AS l
            WHERE l.value = json_extract(d.value, '$.personaId')
        )
        THEN e."createdAt"
        ELSE NULL
    END,
    e."createdAt"
FROM "envios_co" AS e, json_each(COALESCE(e."destinatarios", '[]')) AS d
WHERE json_extract(d.value, '$.personaId') IS NOT NULL;
-- @backfill:end
