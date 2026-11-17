-- F29 (S1) — la anulación del convenio deja su marca en el libro de cargos.
--
-- Anular un convenio NO borra nada: las cuotas impagas pasan a `anulado` en
-- `convenios_pago_cuotas` (valor nuevo de la columna `estado`, no requiere
-- migración) y sus cargos FI quedan en el libro con la fecha en que se anuló el
-- convenio. Esta columna es esa fecha: sin ella, un cargo de cuota anulada sería
-- indistinguible de un cargo vigente para cualquier lectura posterior del libro.
--
-- NO HAY BACKFILL, y es deliberado: los convenios que existieron antes de esta
-- columna no se anulan retroactivamente y sus cargos no llevan marca.
--
-- Aditiva: una columna nullable. Ninguna fila existente cambia.

ALTER TABLE "cobros_fi" ADD COLUMN "anuladoEn" DATETIME;
