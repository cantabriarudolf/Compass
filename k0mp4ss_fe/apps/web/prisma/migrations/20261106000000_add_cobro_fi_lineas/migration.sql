-- T5 cobro-gastos-comunes-parametrico — el cobro FI expresa conceptos (S5).
--
-- `lineas` guarda la lista de conceptos del cobro (gasto común, recargo al
-- fondo de reserva, multa, interés, prima de seguro, cuota de convenio), cada
-- uno con su monto y —cuando corresponde— el fondo de imputación. El cobro
-- conserva `montoBase` como total exigible y esta lista lo desglosa.
--
-- NULLABLE y SIN DEFAULT, a propósito: los cobros ya emitidos no se reescriben
-- y siguen siendo válidos como un cobro de una sola línea (su `concepto` por
-- `montoBase`). No hay backfill y ningún lector de `montoBase` cambia en este
-- corte; `lineasDeCobro` sintetiza la línea histórica cuando la columna es
-- NULL.
--
-- ADITIVA: SOLO agrega una columna. Ninguna fila existente se toca y ninguna
-- emisión se recalcula.

-- AlterTable
ALTER TABLE "cobros_fi" ADD COLUMN "lineas" JSONB;
