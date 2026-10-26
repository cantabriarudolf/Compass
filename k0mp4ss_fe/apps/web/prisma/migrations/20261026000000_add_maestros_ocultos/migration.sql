-- F20 fase 1 — ocultamiento de catálogos nacionales por comunidad.
--
-- Decisión del owner (2026-10-26): los maestros nacionales (bancos, AFP,
-- previsión de salud, mutuales/cajas, feriados, índices de ajuste, cajas de
-- fondos y unidades de medida) quedan de SOLO LECTURA: la comunidad puede
-- ocultar las filas que no usa y agregar las propias, pero nunca editarlas ni
-- borrarlas (el administrador hoy puede renombrarlas o borrarlas, rompiendo la
-- referencia nacional). Esta tabla guarda la MARCA de ocultamiento: la fila
-- nacional sigue existiendo en su tabla de maestro, intacta.
--
-- Migración ADITIVA: solo crea una tabla nueva con su índice único compuesto
-- (comunidadId, tipo, maestroId) y el índice por comunidad; no toca datos
-- existentes. El SQL es portable a SQLite y PostgreSQL (mismo dialecto para
-- CREATE TABLE + CREATE INDEX); el `@@map("maestros_ocultos")` fija el nombre
-- físico. Fase 2, diferida: las filas nacionales se moverían a una tabla
-- global compartida y dejarían de duplicarse por comunidad.

-- CreateTable
CREATE TABLE "maestros_ocultos" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "comunidadId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "maestroId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "maestros_ocultos_comunidadId_fkey" FOREIGN KEY ("comunidadId") REFERENCES "Comunidad" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "maestros_ocultos_comunidadId_tipo_maestroId_key" ON "maestros_ocultos"("comunidadId", "tipo", "maestroId");

-- CreateIndex
CREATE INDEX "maestros_ocultos_comunidadId_idx" ON "maestros_ocultos"("comunidadId");
