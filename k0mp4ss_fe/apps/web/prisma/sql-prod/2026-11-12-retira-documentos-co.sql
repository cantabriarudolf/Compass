-- Retiro de `documentos_co` en la base REAL (Neon/PostgreSQL), con el mismo
-- orden que la migración de SQLite: mover las filas y recién después soltar.
--
-- Por qué este archivo existe aparte: el directorio `prisma/migrations` está
-- fijado a SQLite (`migration_lock.toml`), que es el motor de dev, de la suite y
-- del job `unit`. La base real se alinea con `prisma db push` sobre
-- `schema.prisma` (PostgreSQL), y el job «Esquema de la base (Neon)» se niega a
-- aplicar una deriva destructiva: al quitar `DocumentoCO` del schema, el diff
-- quedó en `DROP CONSTRAINT` + `DROP TABLE`, y eso lo decide una persona.
--
-- ⚠️ Este script DESTRUYE la tabla. Corré primero el paso 0 y mirá el número.
--
-- Uso (desde k0mp4ss_fe/apps/web, con la URL de Neon en el entorno):
--   psql "$DATABASE_URL" -f prisma/sql-prod/2026-11-12-retira-documentos-co.sql
-- y después volvé a correr el job «Esquema de la base (Neon)»: el diff queda
-- vacío, `destructivo=false` y el deploy sigue.

-- ── Paso 0 · ¿hay filas que perder? ────────────────────────────────────────
-- Si devuelve 0, el `db push --accept-data-loss` del job es equivalente y este
-- script no hace falta. Si devuelve > 0, seguí con el paso 1.
SELECT count(*) AS filas_en_documentos_co FROM "documentos_co";

BEGIN;

-- ── Paso 1 · mover las filas a `documentos` ────────────────────────────────
-- Mismo mapeo que la migración de SQLite: `categoria` (texto libre) no tiene
-- columna destino y se pierde; queda el respaldo de la base previo al cambio.
INSERT INTO "documentos" (
  "id", "comunidadId", "naturaleza", "tipoDocumental", "glosa",
  "referenciaAutentica", "archivoNombre", "archivoTipoMime", "archivoTamanoKB",
  "archivoUrl", "hash", "version", "vigenteDesde", "subidoPorPersonaId", "createdAt"
)
SELECT
  viejo."id",
  viejo."comunidadId",
  'comunitario',
  'otros',
  viejo."nombre",
  NULL,
  viejo."nombre",
  viejo."tipoMime",
  viejo."tamanoKB",
  viejo."url",
  NULL,
  ROW_NUMBER() OVER (
    PARTITION BY viejo."comunidadId", 'otros'
    ORDER BY viejo."createdAt", viejo."id"
  ) + (
    SELECT COALESCE(MAX(ya."version"), 0)
    FROM "documentos" AS ya
    WHERE ya."comunidadId" = viejo."comunidadId"
      AND ya."tipoDocumental" = 'otros'
  ),
  to_char(viejo."createdAt", 'YYYY-MM-DD'),
  NULL,
  viejo."createdAt"
FROM "documentos_co" AS viejo;

-- ── Paso 2 · soltar la tabla ───────────────────────────────────────────────
ALTER TABLE "documentos_co" DROP CONSTRAINT "documentos_co_comunidadId_fkey";
DROP TABLE "documentos_co";

COMMIT;

-- Verificación después de aplicar: la tabla no debe existir y `documentos`
-- debe haber crecido por el número del paso 0.
--   SELECT to_regclass('public.documentos_co');   -- null
--   SELECT count(*) FROM "documentos";
