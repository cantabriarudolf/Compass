-- Aviso de cobro mensual — el PAPEL con el que se cobra (S1, S4, S7).
--
-- Una fila por unidad y período. `contenido` es el documento CONGELADO: los
-- conceptos del período (gasto común, recargo al fondo de reserva, multas,
-- intereses a la fecha de emisión, pagado y total adeudado, línea por línea),
-- la copia de los parámetros del reglamento con los que se calculó y el detalle
-- de lo que la ley exige y no se pudo computar. `totalesComunidad` guarda los
-- tres números del art. 31 (ingresos, egresos y saldo de caja al cierre del
-- período) tal como los devolvió `cargarResumenMensual` ese día.
--
-- Por qué se copian y no se recalculan: el aviso es el documento que funda el
-- plazo de pago y el título ejecutivo. Si el cargo se corrige o la caja se
-- mueve después, el aviso emitido NO cambia — eso es exactamente lo que lo
-- hace cobrable. Por eso tampoco hay backfill: la tabla nace vacía.
--
-- ADITIVA: SOLO crea una tabla y sus índices. No altera ninguna columna de otra
-- tabla ni reescribe datos existentes.
--
-- Los tres índices únicos son invariantes, no optimizaciones:
--   · (comunidadId, folio)                    folio AC-#### correlativo
--   · (comunidadId, codigoVerificacion)       código de verificación
--   · (comunidadId, unidadId, periodo)        una unidad cobra una vez el mes

-- CreateTable
CREATE TABLE "avisos_cobro" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "comunidadId" TEXT NOT NULL,
    "unidadId" TEXT NOT NULL,
    "periodo" TEXT NOT NULL,
    "folio" TEXT NOT NULL,
    "codigoVerificacion" TEXT NOT NULL,
    "fechaEmision" TEXT NOT NULL,
    "vencimiento" TEXT,
    "contenido" JSONB NOT NULL,
    "totalesComunidad" JSONB NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "avisos_cobro_comunidadId_fkey" FOREIGN KEY ("comunidadId") REFERENCES "Comunidad" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "avisos_cobro_comunidadId_idx" ON "avisos_cobro"("comunidadId");

-- CreateIndex
CREATE INDEX "avisos_cobro_unidadId_idx" ON "avisos_cobro"("unidadId");

-- CreateIndex
CREATE INDEX "avisos_cobro_periodo_idx" ON "avisos_cobro"("periodo");

-- CreateIndex
CREATE UNIQUE INDEX "avisos_cobro_comunidadId_folio_key" ON "avisos_cobro"("comunidadId", "folio");

-- CreateIndex
CREATE UNIQUE INDEX "avisos_cobro_comunidadId_codigoVerificacion_key" ON "avisos_cobro"("comunidadId", "codigoVerificacion");

-- CreateIndex
CREATE UNIQUE INDEX "avisos_cobro_comunidadId_unidadId_periodo_key" ON "avisos_cobro"("comunidadId", "unidadId", "periodo");
