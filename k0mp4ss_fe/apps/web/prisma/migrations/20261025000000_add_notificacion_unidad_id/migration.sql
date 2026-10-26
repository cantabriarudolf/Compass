-- Change pe-avisos (F5 + F13) — unidad del destinatario en `notificaciones`.
--
-- F5 (asesoría normativa 2026-10-25, minimización y finalidad — Ley 19.628 art. 9 y
-- Ley 21.719 art. 14 b): una difusión al rol la ve hoy TODA la comunidad con ese rol.
-- La columna `unidadId` segmenta el aviso a la unidad que corresponde; `null` =
-- difusión de rol sin unidad (comportamiento histórico, se conserva).
--
-- Migración ADITIVA: solo agrega una columna opcional y su índice; no borra filas
-- ni migra datos. El SQL es portable a SQLite y PostgreSQL (mismo dialecto para
-- ALTER TABLE + CREATE INDEX); el `@@map("notificaciones")` fija el nombre físico.
--
-- Dialecto: este directorio está fijado a SQLite (`migration_lock.toml`) porque es
-- el motor de dev, de la suite y del job `unit` del CI. La forma del ALTER es
-- idéntica en PostgreSQL, así que la baseline PG (`prisma db push` con
-- schema.prisma) no necesita un script aparte.

ALTER TABLE "notificaciones" ADD COLUMN "unidadId" TEXT;
CREATE INDEX "notificaciones_unidadId_idx" ON "notificaciones"("unidadId");
