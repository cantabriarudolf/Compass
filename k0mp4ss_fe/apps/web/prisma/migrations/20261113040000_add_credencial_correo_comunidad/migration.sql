-- F33 — credencial de correo POR COMUNIDAD, cifrada en la base.
--
-- Aditiva: una tabla nueva, sin tocar `configuracion_global` ni ninguna otra.
-- La `SMTP_PASSWORD` global sigue siendo el camino por defecto de los envíos
-- existentes; esta tabla agrega el secreto de cada comunidad para el día en que
-- un despliegue sirva a más de un buzón.
--
--   · `secretoCifrado` + `iv` + `authTag`  el paquete AES-256-GCM completo. La
--                                          clave maestra NO está acá: vive solo
--                                          en `CLAVE_MAESTRA_SECRETOS`, en el
--                                          entorno del servidor, así que un
--                                          backup de esta base no abre nada.
--   · `version`                            versión del paquete cifrado (hoy 1).
--   · `actualizadoPor`/`actualizadoEn`     quién rotó la credencial y cuándo.
--
-- El índice único sobre `comunidadId` es la regla del modelo: una credencial por
-- comunidad, sin dos filas que se contradigan.

-- CreateTable
CREATE TABLE "credenciales_correo_comunidad" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "comunidadId" TEXT NOT NULL,
    "host" TEXT NOT NULL,
    "puerto" INTEGER NOT NULL,
    "usuario" TEXT NOT NULL,
    "secretoCifrado" TEXT NOT NULL,
    "iv" TEXT NOT NULL,
    "authTag" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "actualizadoPor" TEXT NOT NULL,
    "actualizadoEn" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "credenciales_correo_comunidad_comunidadId_fkey" FOREIGN KEY ("comunidadId") REFERENCES "Comunidad" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "credenciales_correo_comunidad_comunidadId_key" ON "credenciales_correo_comunidad"("comunidadId");

-- CreateIndex
CREATE INDEX "credenciales_correo_comunidad_comunidadId_idx" ON "credenciales_correo_comunidad"("comunidadId");
