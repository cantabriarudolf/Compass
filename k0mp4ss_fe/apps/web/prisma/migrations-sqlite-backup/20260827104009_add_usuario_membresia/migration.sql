-- CreateTable
CREATE TABLE "usuarios" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "personaId" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "membresias" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "usuarioId" TEXT NOT NULL,
    "comunidadId" TEXT NOT NULL,
    "rol" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "membresias_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "membresias_comunidadId_fkey" FOREIGN KEY ("comunidadId") REFERENCES "Comunidad" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_email_key" ON "usuarios"("email");

-- CreateIndex
CREATE INDEX "membresias_comunidadId_idx" ON "membresias"("comunidadId");

-- CreateIndex
CREATE INDEX "membresias_usuarioId_idx" ON "membresias"("usuarioId");

-- CreateIndex
CREATE UNIQUE INDEX "membresias_usuarioId_comunidadId_key" ON "membresias"("usuarioId", "comunidadId");
