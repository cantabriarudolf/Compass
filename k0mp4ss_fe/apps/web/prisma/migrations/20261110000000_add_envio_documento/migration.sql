-- F35 serie A (A3) — la ENTREGA de un documento legal y su constancia (S7/S8).
--
-- Aditiva: SOLO crea una tabla y sus índices. No altera `documentos` (la entidad
-- de A1) ni ninguna otra columna existente: la relación inversa
-- `Documento.envios` es VIRTUAL y no genera columna. Sin backfill: la tabla
-- nace vacía y no se toca `documentos_co`.
--
-- Una fila por (documento, persona, canal):
--   · canal  `visor` | `email`
--   · estado `entregado` | `pendiente` | `fallido`
--   · motivo el porqué de un estado que no es `entregado` (sin emisor SMTP,
--            sin correo cargado, rebote del servidor)
--   · notificacionId la fila de `notificaciones` que prueba la entrega al visor
--
-- Qué significa `entregado` en cada canal (no se confunden entre sí):
--   · visor: la `Notificacion` del destinatario se creó en la MISMA transacción
--            que esta fila y `notificacionId` apunta a ella. Es la entrega, no
--            un aviso de que hubo entrega.
--   · email: el servidor SMTP ACEPTÓ el mensaje (250 al final del DATA, F4).
--            Sin emisor configurado queda `pendiente` con su motivo; si se
--            intentó y rebotó queda `fallido` con el motivo redactado. Nunca se
--            escribe `entregado` sin la aceptación del servidor.
--
-- Lo comunitario NO produce filas acá (S8): se publica al visor de toda la
-- comunidad y su constancia es "publicado", no una entrega por persona; la ruta
-- de envío responde 409. Lo legal conserva la constancia por destinatario.
--
-- El índice único `(comunidadId, claveEnvio)` es el invariante de idempotencia:
-- entregar el mismo documento a la misma persona por el mismo canal no crea una
-- fila nueva; el reenvío explícito agrega un sufijo `:reenvio:<epoch>` a la
-- clave, igual que `envios_aviso_cobro` y `envios_cobranza_fi`. Dos corridas
-- iguales (aunque manden N destinatarios) no duplican ni un registro.

-- CreateTable
CREATE TABLE "envios_documento" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "comunidadId" TEXT NOT NULL,
    "documentoId" TEXT NOT NULL,
    "personaId" TEXT NOT NULL,
    "canal" TEXT NOT NULL,
    "estado" TEXT NOT NULL,
    "fecha" TEXT NOT NULL,
    "motivo" TEXT,
    "notificacionId" TEXT,
    "claveEnvio" TEXT NOT NULL,
    "reenvio" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "envios_documento_comunidadId_fkey" FOREIGN KEY ("comunidadId") REFERENCES "Comunidad" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "envios_documento_documentoId_fkey" FOREIGN KEY ("documentoId") REFERENCES "documentos" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "envios_documento_comunidadId_idx" ON "envios_documento"("comunidadId");

-- CreateIndex
CREATE INDEX "envios_documento_documentoId_idx" ON "envios_documento"("documentoId");

-- CreateIndex
CREATE INDEX "envios_documento_personaId_idx" ON "envios_documento"("personaId");

-- CreateIndex — el invariante de idempotencia por (documento, persona, canal).
CREATE UNIQUE INDEX "envios_documento_comunidadId_claveEnvio_key" ON "envios_documento"("comunidadId", "claveEnvio");
