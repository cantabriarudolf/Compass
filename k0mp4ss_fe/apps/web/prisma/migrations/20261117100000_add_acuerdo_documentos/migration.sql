-- Acuerdo presencial · T2 — los papeles firmados se suben al archivo legal (S1/S3).
--
-- El cierre del acuerdo presencial ya exige el acta publicada en el libro, pero
-- el acta digital no es la firma: el sistema no la genera, la recibe. El acta
-- firmada se escanea y se SUBE al depósito privado como `Documento` legal con su
-- hash, igual que el papel firmado del convenio; la lista de asistencia y los
-- poderes respaldan la habilidad acreditada en la sala (S6) y se suben cuando
-- existen. Estas tres columnas son el vínculo desde el acuerdo hacia cada papel.
--
-- NO HAY BACKFILL, y es deliberado: los acuerdos que existieron antes de estas
-- columnas no tienen escaneo, y fabricar un documento con fecha de hoy declararía
-- una firma que nadie estampó. Cada papel se archiva cuando la administración lo
-- sube; las columnas siguen NULL hasta entonces. El cierre de un presencial sin
-- actaDocumentoId responde 409 (S1).
--
-- Campos tipados, no tabla puente — el precedente es `CorteServicio.documentoId`.
-- Aditiva: tres columnas nullable y sus índices. Ninguna fila existente cambia.
ALTER TABLE "acuerdos" ADD COLUMN "actaDocumentoId" TEXT;
ALTER TABLE "acuerdos" ADD COLUMN "asistenciaDocumentoId" TEXT;
ALTER TABLE "acuerdos" ADD COLUMN "poderesDocumentoId" TEXT;

-- La lectura inversa del archivo (qué acuerdo respalda este papel) al auditar;
-- sin estos índices esa lectura recorre la tabla entera.
CREATE INDEX "acuerdos_actaDocumentoId_idx" ON "acuerdos"("actaDocumentoId");
CREATE INDEX "acuerdos_asistenciaDocumentoId_idx" ON "acuerdos"("asistenciaDocumentoId");
CREATE INDEX "acuerdos_poderesDocumentoId_idx" ON "acuerdos"("poderesDocumentoId");
