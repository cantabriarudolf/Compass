-- Change co-lectura-residente, tarea 1.1 — backfill de `envio_destinatarios_co` en PostgreSQL.
--
-- Por qué este archivo existe aparte de la migración:
--   `prisma/migrations/` está fijado a SQLite (`migration_lock.toml: provider = "sqlite"`) y
--   es el motor con el que el CI crea la base de la suite. En PostgreSQL este proyecto NO
--   tiene migraciones versionadas: el esquema lo crea `prisma db push` y los datos los
--   migra `scripts/migrate-sqlite-to-postgres.mjs` (ver job `unit-pg` de `.github/workflows/ci.yml`).
--   Por eso el backfill de cada motor se resuelve con su dialecto explícito:
--     · SQLite      → `prisma/migrations/20261024000000_add_envio_destinatarios_co/migration.sql`
--     · PostgreSQL  → este archivo
--
-- Uso (después de `prisma db push`, con la base ya migrada desde SQLite):
--   psql "$DATABASE_URL" -f prisma/backfill/envio_destinatarios_co.pg.sql
--
-- Idempotente: `ON CONFLICT DO NOTHING` sobre la PK determinista y sobre el índice único
-- (`envioId`, `personaId`). Correrlo dos veces no duplica filas.
--
-- `leidoEn`: el array `lecturas` nunca guardó la hora de la lectura, así que se conserva
-- el `createdAt` del envío como cota inferior conocida. No se marca la hora de la
-- migración: eso inventaría un momento de lectura que no ocurrió.

INSERT INTO "envio_destinatarios_co" ("id", "envioId", "personaId", "unidadId", "leidoEn", "createdAt")
SELECT
    'edc-' || e."id" || '-' || COALESCE(d.value ->> 'personaId', ''),
    e."id",
    d.value ->> 'personaId',
    d.value ->> 'unidadId',
    CASE
        WHEN EXISTS (
            SELECT 1
            FROM jsonb_array_elements_text(COALESCE(e."lecturas", '[]'::jsonb)) AS l(value)
            WHERE l.value = (d.value ->> 'personaId')
        )
        THEN e."createdAt"
        ELSE NULL
    END,
    e."createdAt"
FROM "envios_co" AS e
CROSS JOIN LATERAL jsonb_array_elements(COALESCE(e."destinatarios", '[]'::jsonb)) AS d(value)
WHERE (d.value ->> 'personaId') IS NOT NULL
ON CONFLICT DO NOTHING;
