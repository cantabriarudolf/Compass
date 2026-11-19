-- F43 · T3 — la constancia del correo de bienvenida, en la fila de la invitación.
--
-- Por qué en `invitaciones_acceso` y no en una tabla de envíos: reenviar la
-- invitación emite una fila NUEVA (F42), así que la cadena de invitaciones ES el
-- historial de envíos y ningún intento puede pisar a otro. Tres columnas NULL:
--
--   · `envioEstado`  `enviado` | `pendiente` | `fallido`. `enviado` sólo cuando el
--                    servidor SMTP aceptó el mensaje; `pendiente` cuando la
--                    comunidad no tiene emisor configurado (no se abre conexión);
--                    `fallido` cuando el envío se intentó y rebotó. Nunca
--                    `entregado`: esa palabra es de la entrega por el visor, que
--                    prueba su hecho con una notificación.
--   · `envioMotivo`  el motivo textual del desenlace (el del servidor cuando
--                    rebotó). El token en claro no se escribe acá: el llamador
--                    redacta el enlace y el token antes de persistir.
--   · `envioEn`      cuándo se envió. NULL en `pendiente` y en `fallido`: no se
--                    fecha como enviado lo que no salió.
--
-- Aditiva: tres columnas nullable. Ninguna fila existente cambia y las
-- invitaciones emitidas antes de esta columna quedan sin constancia (NULL), que
-- es la verdad: nadie intentó mandarles correo.
ALTER TABLE "invitaciones_acceso" ADD COLUMN "envioEstado" TEXT;
ALTER TABLE "invitaciones_acceso" ADD COLUMN "envioMotivo" TEXT;
ALTER TABLE "invitaciones_acceso" ADD COLUMN "envioEn" DATETIME;
