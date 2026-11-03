-- GD-actas — folio del libro de actas (Ley 21.442, art. 15: libro de actas foliado).
--
-- Contexto (asesoría normativa 2026-11-04): el acta tenía fecha, aprobaciones,
-- contenido y estado de publicación, pero ningún folio, así que no se podía
-- citar como se cita un libro foliado. La columna es ADITIVA y NULLABLE: toda
-- acta existente queda en NULL sin cambiar de comportamiento, y el folio se
-- asigna después con `scripts/backfill-folio-actas.ts` (idempotente, nunca
-- renumera un folio ya asignado — el folio, una vez asignado, es la cita del
-- acta).
--
-- Formato: `AD-<año>-<correlativo de 4 dígitos>`, correlativo por comunidad y
-- año, asignado por el POST del servidor (nunca por el cliente).
--
-- El índice único `(comunidadId, folio)` es la garantía dura contra la carrera
-- de dos altas que leen el mismo máximo: la segunda choca con P2002 y el handler
-- reintenta con el número siguiente (mismo patrón que certificados CT). Los
-- NULL quedan fuera del índice, así que las filas sin folio conviven sin
-- conflicto en SQLite y PostgreSQL.
--
-- Aditiva: SOLO agrega columnas y un índice; ninguna fila existente se reescribe.

-- AlterTable
ALTER TABLE "actas_gd" ADD COLUMN "folio" TEXT;

-- AlterTable
ALTER TABLE "actas_gd_archivadas" ADD COLUMN "folio" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "actas_gd_comunidadId_folio_key" ON "actas_gd"("comunidadId", "folio");
