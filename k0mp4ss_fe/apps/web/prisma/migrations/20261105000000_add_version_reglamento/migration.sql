-- T3 cobro-gastos-comunes-parametrico — versión vigente del reglamento (S1/S2/S3).
--
-- Cada comunidad declara con qué instrumento se reparte el gasto común y desde
-- qué período rige; los números del cobro (días de pago, reserva, mora, corte,
-- IPC) viven en los parámetros de esa versión y ya no en el código. Una versión
-- nueva no reescribe las anteriores: la emisión guarda copia de los valores con
-- los que calculó (S4), así que cambiar un parámetro no mueve lo ya emitido.
--
-- ADITIVA: SOLO crea una tabla nueva. Ninguna columna de ninguna otra tabla se
-- altera y ninguna emisión ni cobro existente se reescribe.
--
-- BACKFILL: materializa el comportamiento de hoy en la versión 1 de cada
-- comunidad con `configuracion_global`. La fuente es `migracion_automatica`,
-- que NO habilita la emisión: la comunidad tiene que declarar de dónde sale su
-- forma de contribución antes de volver a emitir (S1). Los valores migrados son
-- los que el código usaba hasta hoy: 30 días de pago, mora 1% mensual con tope
-- 50%, cuotas de corte según `limiteMesesAvisoCorte`, 5 días de preaviso, sin
-- reajuste IPC y reserva según el fondo de reserva activo (0 si no hay).
--
-- Idempotente: `WHERE NOT EXISTS` salta toda comunidad que ya tenga una versión,
-- así que correrla dos veces no duplica ni renumera nada.

-- CreateTable
CREATE TABLE "versiones_reglamento" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "comunidadId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "vigenteDesde" TEXT NOT NULL,
    "fuenteInstrumento" TEXT NOT NULL,
    "actaRef" TEXT,
    "formaContribucion" TEXT NOT NULL,
    "parametros" JSONB NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "versiones_reglamento_comunidadId_fkey" FOREIGN KEY ("comunidadId") REFERENCES "Comunidad" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "versiones_reglamento_comunidadId_version_key" ON "versiones_reglamento"("comunidadId", "version");

-- CreateIndex
CREATE INDEX "versiones_reglamento_comunidadId_idx" ON "versiones_reglamento"("comunidadId");

-- Backfill: una versión 1 por comunidad configurada, con el comportamiento de
-- hoy. El JSON se arma con concatenación portable (sin funciones de JSON de un
-- motor) y el id es determinista para que la corrida repetida sea reconocible.
INSERT INTO "versiones_reglamento" (
    "id",
    "comunidadId",
    "version",
    "vigenteDesde",
    "fuenteInstrumento",
    "actaRef",
    "formaContribucion",
    "parametros",
    "createdAt"
)
SELECT
    'reglamento-' || cfg."comunidadId" || '-v1',
    cfg."comunidadId",
    1,
    COALESCE(
        (
            SELECT MIN(e."periodo")
            FROM "emisiones_gc" e
            WHERE e."comunidadId" = cfg."comunidadId"
        ),
        '2026-01'
    ),
    'migracion_automatica',
    NULL,
    CASE cfg."modoCalculoGC"
        WHEN 'fijo' THEN 'monto_por_tipo'
        ELSE 'coeficiente'
    END,
    '{"porcentajeReserva":'
        || CAST(COALESCE(
            (
                SELECT f."porcentajeAporte"
                FROM "fondos_fi" f
                WHERE f."comunidadId" = cfg."comunidadId"
                  AND f."tipo" = 'reserva'
                  AND f."activo"
                ORDER BY f."id"
                LIMIT 1
            ),
            0
        ) AS TEXT)
        || ',"diasPagoGc":30,"tasaMoraMensualPct":1,"topeMoraPct":50,"cuotasCorte":'
        || CAST(cfg."limiteMesesAvisoCorte" AS TEXT)
        || ',"diasPreavisoCorte":5,"ipcActivo":false}',
    CURRENT_TIMESTAMP
FROM "configuracion_global" cfg
WHERE NOT EXISTS (
    SELECT 1
    FROM "versiones_reglamento" v
    WHERE v."comunidadId" = cfg."comunidadId"
);
