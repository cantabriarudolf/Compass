-- S8 · F28 — el corte de servicios emite su requerimiento escrito.
--
-- Hasta acá el preaviso REGISTRABA la orden y no producía el escrito: existía el
-- acto administrativo y no el papel que el art. 20 N°9 de la Ley 21.442 exige
-- para avisar al deudor. El alta del preaviso ahora emite el `Documento` legal del
-- archivo de la comunidad (con sus bytes reales de PDF) y la constancia de entrega
-- en `envios_documento`; esta columna es el vínculo desde el trámite hacia ese
-- papel, y su `referenciaAutentica` apunta de vuelta al corte.
--
-- NO HAY BACKFILL, y es deliberado: los cortes preavisados antes de esta columna
-- no tienen requerimiento escrito, y fabricar uno con fecha de hoy declararía un
-- aviso que nunca se cursó. Esos cortes quedan como están: el hecho y su fecha son
-- los reales.
--
-- Aditiva: una columna nullable y su índice. Ninguna fila existente cambia.
ALTER TABLE "cortes_servicio" ADD COLUMN "documentoId" TEXT;

-- El vínculo se lee en el sentido inverso (qué corte emitió este documento) al
-- auditar el archivo; sin este índice esa lectura recorre la tabla entera.
CREATE INDEX "cortes_servicio_documentoId_idx" ON "cortes_servicio"("documentoId");
