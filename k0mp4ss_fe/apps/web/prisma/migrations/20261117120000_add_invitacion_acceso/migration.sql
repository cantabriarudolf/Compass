-- F42 · T1 — la invitación de acceso: el administrador nunca conoce la contraseña.
--
-- Una tabla nueva, vacía. No hay backfill y es deliberado: las cuentas que ya
-- existen tienen su contraseña definida y no necesitan invitación; fabricarles
-- un enlace pendiente declararía una invitación que nadie emitió.
--
--   · `tokenHash`  SHA-256 hex del token en claro (32 bytes aleatorios). El token
--                  nunca se guarda, así que un backup de esta tabla no abre nada.
--                  El índice único es la regla del modelo: un token, una fila.
--   · `expiraEn` / `usadoEn`  los dos hechos que definen el estado (pendiente,
--                  usada, vencida). Sin columna de estado que los contradiga.
--   · `usuarioId`  la cuenta que el enlace habilita, creada en el mismo acto.
--   · `creadoPor`  el actor de la sesión que emitió la invitación (S5).
--
-- Aditiva: ninguna columna ni fila existente cambia.
CREATE TABLE "invitaciones_acceso" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "usuarioId" TEXT NOT NULL,
    "comunidadId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiraEn" DATETIME NOT NULL,
    "usadoEn" DATETIME,
    "creadoPor" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "invitaciones_acceso_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "invitaciones_acceso_comunidadId_fkey" FOREIGN KEY ("comunidadId") REFERENCES "Comunidad" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Un token, una invitación: el canje busca por hash y no puede encontrar dos filas.
CREATE UNIQUE INDEX "invitaciones_acceso_tokenHash_key" ON "invitaciones_acceso"("tokenHash");

-- Las dos lecturas que existen: el estado de la cuenta (por usuario) y el listado
-- acotado a la comunidad que muestra la pantalla de cuentas.
CREATE INDEX "invitaciones_acceso_usuarioId_idx" ON "invitaciones_acceso"("usuarioId");
CREATE INDEX "invitaciones_acceso_comunidadId_idx" ON "invitaciones_acceso"("comunidadId");
