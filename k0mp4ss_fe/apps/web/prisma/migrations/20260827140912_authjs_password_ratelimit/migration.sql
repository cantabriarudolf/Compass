-- AlterTable
ALTER TABLE "usuarios" ADD COLUMN "passwordHash" TEXT;

-- CreateTable
CREATE TABLE "rate_limit_attempts" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clave" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "rate_limit_attempts_clave_createdAt_idx" ON "rate_limit_attempts"("clave", "createdAt");
