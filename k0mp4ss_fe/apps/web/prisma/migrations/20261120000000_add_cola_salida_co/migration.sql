-- CO — la cola de salida del correo de las difusiones masivas (S2/S3/S4/S6).
--
-- Aditiva: SOLO crea una tabla y sus índices. No toca `envios_co`, ni
-- `envio_destinatarios_co`, ni `notificaciones`: la notificación in-app con canal
-- `email_simulado` (S1) sigue naciendo exactamente como hoy. Sin backfill: la
-- tabla nace vacía y un envío anterior a esta migración no declara correos que
-- nadie encoló.
--
-- Por qué una cola y no un envío dentro de la request: el envío masivo guarda
-- (`EnvioCO` + `EnvioDestinatarioCO` + esta cola, en la MISMA transacción) y un
-- proceso explícito drena el lote después (S2). Sin invocación no sale un solo
-- correo: no hay `setInterval` ni envío al importar el módulo (S6).
--
--   · `estado`       `pendiente` | `enviado` | `fallido`. NUNCA `entregado`: esa
--                    palabra es del visor, que prueba su hecho con una
--                    `Notificacion`. `enviado` sólo cuando el servidor SMTP
--                    aceptó el mensaje; `pendiente` cuando falta el emisor
--                    (condición de configuración, no envío fallido, y no se abre
--                    ninguna conexión); `fallido` cuando se intentó y rebotó.
--   · `intentos`     intentos REALES. Un `pendiente` no lo incrementa: no hubo
--                    envío. Un `fallido` se vuelve a tomar hasta el tope del
--                    proceso y el contador suma, no se reinicia.
--   · `ultimoError`  el motivo del último desenlace que no fue `enviado`: el
--                    motivo del servidor cuando rebotó, el rechazo local del
--                    destinatario, o `MOTIVO_SIN_SMTP` cuando no hay emisor.
--   · `enviadoEn`    cuándo salió. NULL en `pendiente` y en `fallido`: no se
--                    fecha como enviado lo que no salió.
--   · `envioId`      referencia al envío masivo que ya existe. El índice único
--                    `(envioId, personaId)` es la idempotencia: reenviar el
--                    mismo alta no duplica filas y no reescribe las que ya
--                    salieron.
CREATE TABLE "cola_salida_co" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "comunidadId" TEXT NOT NULL,
    "envioId" TEXT NOT NULL,
    "personaId" TEXT NOT NULL,
    "destinatario" TEXT,
    "asunto" TEXT NOT NULL,
    "cuerpo" TEXT NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'pendiente',
    "intentos" INTEGER NOT NULL DEFAULT 0,
    "ultimoError" TEXT,
    "creadoEn" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "enviadoEn" DATETIME,
    CONSTRAINT "cola_salida_co_comunidadId_fkey" FOREIGN KEY ("comunidadId") REFERENCES "Comunidad" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "cola_salida_co_envioId_fkey" FOREIGN KEY ("envioId") REFERENCES "envios_co" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Un destinatario, una fila por envío: es la invariante de idempotencia.
CREATE UNIQUE INDEX "cola_salida_co_envioId_personaId_key" ON "cola_salida_co"("envioId", "personaId");

-- La lectura que hace el drenaje (por comunidad y estado) y la métrica de la consola.
CREATE INDEX "cola_salida_co_comunidadId_estado_idx" ON "cola_salida_co"("comunidadId", "estado");
