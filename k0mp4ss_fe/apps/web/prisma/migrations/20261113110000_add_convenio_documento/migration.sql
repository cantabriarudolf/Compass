-- V5 · F29 — el convenio de pago sube su papel firmado al archivo legal.
--
-- La ley manda celebrar el convenio por escrito, con la firma del deudor (Ley
-- 21.442 art. 6 inc. 4; Reglamento art. 9), y el sistema sólo registraba el
-- trámite. El papel se firma A MANO y la administración lo escanea: el sistema no
-- lo puede generar, así que lo recibe como PDF, lo guarda en el depósito privado
-- y lo archiva como `Documento` legal. Esta columna es el vínculo desde el
-- convenio hacia ese papel.
--
-- NO HAY BACKFILL, y es deliberado: los convenios suscritos antes de esta columna
-- no tienen un escaneo, y fabricar uno con fecha de hoy declararía una firma que
-- nadie estampó. Esos convenios quedan como están —su papel se sube cuando la
-- administración lo escanee— y la columna sigue NULL hasta entonces.
--
-- Aditiva: una columna nullable y su índice. Ninguna fila existente cambia.
ALTER TABLE "convenios_pago" ADD COLUMN "documentoId" TEXT;

-- El vínculo se lee en el sentido inverso (qué convenio tiene este papel) al
-- auditar el archivo; sin este índice esa lectura recorre la tabla entera.
CREATE INDEX "convenios_pago_documentoId_idx" ON "convenios_pago"("documentoId");
