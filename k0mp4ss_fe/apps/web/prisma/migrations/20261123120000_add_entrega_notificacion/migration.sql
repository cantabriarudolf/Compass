-- T1 — el camino de entrega: la constancia de cada intento de entrega (S3).
--
-- Aditiva: SOLO crea una tabla y sus índices. No toca `notificaciones` ni
-- ninguna otra tabla: el aviso in-app sigue naciendo exactamente como hoy y esta
-- fila es su constancia de entrega. Sin backfill: la tabla nace vacía, y las
-- entregas anteriores a esta migración no declaran un desenlace que nadie midió.
--
-- Por qué una tabla y no columnas en `notificaciones`: los canales son varios
-- (`visor` | `email`) y los intentos se repiten (un correo sin emisor queda
-- `pendiente` y se reintenta). Una columna por canal obligaría a agregar una
-- columna por cada canal nuevo; una fila por intento no. Además el visor tiene su
-- propio estado (`entregado`, el único que prueba una `Notificacion`) y el correo
-- no (`enviado` sólo con la aceptación del servidor): son hechos distintos.
--
--   · `notificacionId` nullable y `ON DELETE SET NULL`: el aviso in-app SIEMPRE
--     se escribe (S6), y el intento de correo lo referencia igual. Si la
--     notificación se borra, la constancia de la entrega NO se borra con ella:
--     deja de apuntar al mensaje, pero el intento ocurrió y queda registrado.
--   · `canal`    `visor` | `email`, DECLARADO por el llamador (S2). No se hereda
--                del `@default("email_simulado")` de `Notificacion`: ese valor es
--                el canal de la constancia in-app, no el de la entrega.
--   · `estado`   los cuatro del catálogo único (`ESTADOS_ENTREGA_CORREO`, en
--                `lib/schemas.ts`): `entregado` lo prueba la fila in-app;
--                `enviado` exige la aceptación del servidor SMTP; `pendiente` es
--                falta de emisor (condición de configuración, no envío fallido);
--                `fallido` es el intento que rebotó y SIEMPRE lleva motivo.
--   · `motivo`   `MOTIVO_SIN_DESTINATARIO` / `MOTIVO_SIN_SMTP` (los que ya
--                existen en `lib/entrega-aviso.ts`), el rebote del servidor o el
--                motivo del fallo inesperado del transporte. NULL en `entregado`
--                y en `enviado`, que no tienen nada que explicar.
--   · `intentos` intentos REALES de esa fila: el puente crea una fila por
--                intento y registra 1. Nunca se pisa el contador de un intento
--                anterior; un reintento es otra fila. El DEFAULT 0 queda para una
--                fila que nace sin intento (no la crea el puente).
--   · `enviadoEn` cuándo salió el correo. NULL en `pendiente` y en `fallido` —no
--                se fecha como enviado lo que no salió— y en el visor, cuya fecha
--                de entrega es `creadoEn`.
CREATE TABLE "entregas_notificacion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "comunidadId" TEXT NOT NULL,
    "notificacionId" TEXT,
    "canal" TEXT NOT NULL,
    "estado" TEXT NOT NULL,
    "motivo" TEXT,
    "intentos" INTEGER NOT NULL DEFAULT 0,
    "creadoEn" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "enviadoEn" DATETIME,
    CONSTRAINT "entregas_notificacion_comunidadId_fkey" FOREIGN KEY ("comunidadId") REFERENCES "Comunidad" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "entregas_notificacion_notificacionId_fkey" FOREIGN KEY ("notificacionId") REFERENCES "notificaciones" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- La lectura por comunidad (bandeja de constancias) y por aviso.
CREATE INDEX "entregas_notificacion_comunidadId_idx" ON "entregas_notificacion"("comunidadId");
CREATE INDEX "entregas_notificacion_notificacionId_idx" ON "entregas_notificacion"("notificacionId");

-- La métrica honesta de la entrega: cuántos avisos quedaron en cada estado.
CREATE INDEX "entregas_notificacion_comunidadId_estado_idx" ON "entregas_notificacion"("comunidadId", "estado");
