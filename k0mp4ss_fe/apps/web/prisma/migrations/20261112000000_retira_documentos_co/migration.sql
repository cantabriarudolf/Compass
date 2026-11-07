-- F35 serie A (A5) — retira `documentos_co` DESPUÉS de mover sus filas.
--
-- `documentos_co` nació en `init` como los adjuntos de la consola de comunicación
-- (una fila = nombre + mime + tamaño + url + categoría libre, sólo con
-- `comunidadId`). El archivo de documentos (A1) la reemplazó con `documentos`, una
-- entidad con naturaleza (`legal` | `comunitario`), tipo documental de lista
-- cerrada, glosa, versión y vigencia. Desde A2 la pantalla lee `documentos`; la
-- tabla vieja quedó sin lectores y sus rutas `/api/co/documentos` quedaron
-- `@deprecated`.
--
-- Esta es la migración que el plan de la serie A dejó anotada como la única con
-- DATOS: mover y después soltar, nunca al revés. Hace las dos cosas en el mismo
-- archivo, y en este orden:
--
--   1. Copia cada fila de `documentos_co` a `documentos`.
--   2. Suelta `documentos_co`.
--
-- Mapeo, columna por columna, y por qué:
--
--   · `naturaleza` = 'comunitario'. Un adjunto de la consola de comunicación
--     nunca fue un documento legal: lo legal exige `referenciaAutentica`
--     (fojas/fecha/notaría o Conservador) y esa columna NO EXISTÍA en el modelo
--     viejo, así que no hay dato que inventar. Afirmar 'legal' sería inventar la
--     referencia auténtica de un documento que nadie autenticó.
--   · `tipoDocumental` = 'otros'. La `categoria` vieja era texto libre y no
--     coincide con la lista cerrada que manda la ley (art. 9). Mapearla a un tipo
--     legal por parecido sería afirmar que el documento es algo que nadie
--     declaró; `otros` es el cajón que el propio modelo define para lo
--     comunitario que la ley no nombra. **`categoria` se pierde**: no hay columna
--     destino para texto libre y agregarla es otra unidad. El respaldo previo a
--     esta migración (ver `odd/tasks/archivo-documentos-y-vigencia.md`) la
--     conserva con sus filas.
--   · `glosa` y `archivoNombre` = `nombre`. El nombre era a la vez «a qué
--     corresponde» y el nombre del archivo; las dos columnas nuevas se llenan con
--     él en vez de dejar una vacía.
--   · `archivoTipoMime`/`archivoTamanoKB`/`archivoUrl` = `tipoMime`/`tamanoKB`/`url`.
--   * `hash` y `subidoPorPersonaId` = NULL: no existían en el modelo viejo y no
--     se pueden reconstruir. NULL es la verdad; un valor inventado sería peor.
--   · `version` = número de orden de la fila DENTRO de su comunidad, por
--     `createdAt` y después por `id` (desempate determinista), **desplazado por
--     las versiones 'otros' que la comunidad ya tiene en el archivo**. Sin el
--     desplazamiento, todas las filas de una comunidad entrarían con `version`
--     1 y el índice único `(comunidadId, tipoDocumental, version)` abortaría la
--     migración: el mapeo trivial no puede representar más de un adjunto por
--     comunidad. Y con el desplazamiento calculado sobre cero, una comunidad que
--     ya tiene `otros/v1` en `documentos` choca igual —lo cazó el ensayo con
--     filas sintéticas—: por eso el desplazamiento se lee de la tabla destino, no
--     se asume vacía. Numerar así las conserva todas y las deja como versiones
--     sucesivas de 'otros', sin tocar las que ya estaban.
--   · `vigenteDesde` = fecha calendario de `createdAt`. `createdAt` es epoch en
--     milisegundos (INTEGER) en este esquema: `/1000` y `'unixepoch'` la
--     convierten sin depender de la zona del proceso.
--   · `createdAt` se copia tal cual: mover una fila no cambia cuándo entró.
--
-- Con la tabla vacía (el estado de `prisma/dev.db` al escribir esto) el INSERT no
-- inserta nada y el DROP deja todo igual salvo la tabla. La migración es la misma
-- para una base con filas: se probó con filas sintéticas antes de aplicarla.
--
-- Dialecto: SQLite, el que fija `migration_lock.toml` (dev, suite y job `unit`
-- del CI). `ROW_NUMBER()` y `strftime` existen en SQLite ≥ 3.25; la baseline PG
-- (`prisma db push` con `schema.prisma`) no ejecuta este archivo porque su modelo
-- ya no declara `DocumentoCO`.

-- 1) Mover las filas antes de soltar la tabla.
INSERT INTO "documentos" (
    "id",
    "comunidadId",
    "naturaleza",
    "tipoDocumental",
    "glosa",
    "referenciaAutentica",
    "archivoNombre",
    "archivoTipoMime",
    "archivoTamanoKB",
    "archivoUrl",
    "hash",
    "version",
    "vigenteDesde",
    "subidoPorPersonaId",
    "createdAt"
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
    strftime('%Y-%m-%d', viejo."createdAt" / 1000, 'unixepoch'),
    NULL,
    viejo."createdAt"
FROM "documentos_co" AS viejo;

-- 2) Recién ahora la tabla, sin filas que perder.
DROP TABLE "documentos_co";
