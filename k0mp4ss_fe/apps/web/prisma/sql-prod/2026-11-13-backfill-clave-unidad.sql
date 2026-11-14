-- Backfill de `acuerdos_votos.claveUnidad` — 2026-11-13
--
-- POR QUÉ EXISTE ESTE ARCHIVO
-- La migración `20261113070000_add_voto_clave_unidad` agregó la columna
-- `claveUnidad` (espejo de `unidadId`) y el índice único
-- `(acuerdoId, claveUnidad)`, que es lo que impide que una unidad pese DOS veces
-- en un acuerdo cuando dos de sus copropietarios votan al mismo tiempo.
--
-- El carril `db-prod` converge el esquema de Postgres con un diff: crea la columna
-- y el índice, pero NO ejecuta el `UPDATE` que llena la columna en las filas que ya
-- existían (ese `UPDATE` vive en la migración SQLite, que el carril no corre).
-- Sin este backfill, los votos anteriores al 2026-11-13 quedan con `claveUnidad`
-- NULL y **fuera del índice**: siguen protegidos por el chequeo del código, que
-- funciona en secuencia pero no ante dos votos simultáneos.
--
-- CÓMO SE APLICA (el carril no tiene modo para esto; ver nota al final)
--   psql "$DATABASE_URL_DE_PRODUCCION" -v ON_ERROR_STOP=1 -f <este archivo>
--
-- VERIFICACIÓN, ANTES Y DESPUÉS (la primera cifra debe dar 0 al terminar)
--   SELECT count(*) FROM "acuerdos_votos"
--    WHERE "unidadId" IS NOT NULL AND "claveUnidad" IS NULL;
--
-- ES IDEMPOTENTE: el `WHERE` excluye lo ya migrado, así que correrlo dos veces no
-- cambia nada. No borra ni reescribe ningún voto: sólo completa una columna vacía a
-- partir de un dato que ya está en la misma fila.

UPDATE "acuerdos_votos"
   SET "claveUnidad" = "unidadId"
 WHERE "unidadId" IS NOT NULL
   AND "claveUnidad" IS NULL;

-- NOTA SOBRE EL CARRIL
-- `.github/workflows/db-prod.yml` acepta `diagnostico | aplicar | aplicar-destructivo`:
-- `aplicar` aplica el diff del esquema y `aplicar-destructivo` exige una intención
-- commiteada para DROP/DELETE. Un `UPDATE` de backfill no entra en ninguno de los
-- tres. Cablearlo pide un modo nuevo (`aplicar-sql` con su propio archivo commiteado
-- y su verificación posterior) o correrlo una vez a mano con la sentencia de arriba.
