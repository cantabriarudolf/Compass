-- F32 · S7 — la cuota del reparto apunta a la deuda que produjo.
--
-- El reparto por sector dejó de ser sólo un documento: al emitirse imputa la cuota
-- de cada unidad INCLUIDA como deuda cobrable del período, con el mismo mecanismo
-- que la emisión de gasto común (un `CobroFI` por unidad, con su período, su fondo
-- de gasto común activo y `origenRef` al reparto). El vínculo desde el cobro ya
-- existía (`cobros_fi.origenRef`); desde la cuota hacia su cobro no, así que la
-- pantalla podía mostrar el reparto y no la deuda.
--
-- `cobroId` NULL significa dos cosas, y ninguna es un error:
--   · la cuota quedó en CERO —el monto no alcanzó para todas las unidades del
--     sector— y un cobro con monto base cero no es una deuda cobrable (el contrato
--     FI exige un monto base positivo), así que no se crea;
--   · el reparto se emitió ANTES de esta columna. Esos repartos NO tienen deuda.
--
-- NO HAY BACKFILL, y es deliberado: reconstruir las deudas de los repartos viejos
-- inventaría un cobro con un fondo, un período y una fecha que nadie eligió, y los
-- metería en la cobranza del mes en curso como si se hubieran emitido hoy. Un
-- reparto emitido antes de esta migración vale como documento y no como deuda: eso
-- es lo que de verdad pasó, y así queda escrito.
--
-- Aditiva: una columna nullable y su índice. Ninguna fila existente cambia.
ALTER TABLE "cuotas_reparto_sector" ADD COLUMN "cobroId" TEXT;

-- El vínculo se lee en el sentido inverso (qué cuota produjo este cobro) al
-- conciliar; sin este índice esa lectura recorre la tabla entera.
CREATE INDEX "cuotas_reparto_sector_cobroId_idx" ON "cuotas_reparto_sector"("cobroId");
