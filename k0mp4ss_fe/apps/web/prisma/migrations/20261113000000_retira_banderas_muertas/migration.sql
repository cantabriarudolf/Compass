-- Retira `residenteVeMorosidad` y `alertasResidentesActivas` de los dos controles.
--
-- Las dos banderas se retiraron de la superficie el 2026-11-07 (UI, contrato zod y
-- lista blanca de la API) y desde entonces no las lee ni las escribe nadie: la única
-- bandera de privacidad viva es `residenteVeActas`, que se obedece por unidad desde el
-- 2026-11-08. Quedaron como deuda declarada y este es el pago.
--
-- Lo que se pierde: dos booleanos por control —«el residente ve morosidad» y «recibe
-- alertas»— que ninguna ruta consultaba. En producción son datos de prueba (decisión
-- del owner, 2026-11-08); en dev hay 1 control vigente y 0 archivados. El run del
-- carril `db-prod` imprime el conteo antes de aplicar.
--
-- Dialecto SQLite: se reconstruyen las dos tablas (patrón RedefineTables) porque SQLite
-- no permite `DROP COLUMN` con FKs e índices en juego. Se copian todas las filas, así
-- que no se pierde nada más que las dos columnas.

PRAGMA foreign_keys=OFF;

-- ── controles_propiedad ───────────────────────────────────────────────────────
CREATE TABLE "nuevo_controles_propiedad" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "comunidadId" TEXT NOT NULL,
    "unidadId" TEXT NOT NULL,
    "residenteVeActas" BOOLEAN NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'vigente',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "controles_propiedad_comunidadId_fkey" FOREIGN KEY ("comunidadId") REFERENCES "Comunidad" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "nuevo_controles_propiedad" ("id","comunidadId","unidadId","residenteVeActas","estado","createdAt","updatedAt")
SELECT "id","comunidadId","unidadId","residenteVeActas","estado","createdAt","updatedAt" FROM "controles_propiedad";
DROP TABLE "controles_propiedad";
ALTER TABLE "nuevo_controles_propiedad" RENAME TO "controles_propiedad";
CREATE INDEX "controles_propiedad_comunidadId_idx" ON "controles_propiedad"("comunidadId");
CREATE INDEX "controles_propiedad_unidadId_idx" ON "controles_propiedad"("unidadId");

-- ── controles_propiedad_archivados ────────────────────────────────────────────
CREATE TABLE "nuevo_controles_propiedad_archivados" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "comunidadId" TEXT NOT NULL,
    "unidadId" TEXT NOT NULL,
    "residenteVeActas" BOOLEAN NOT NULL,
    "motivo" TEXT,
    "actorUsuarioId" TEXT NOT NULL,
    "archivadaEn" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "nuevo_controles_propiedad_archivados" ("id","comunidadId","unidadId","residenteVeActas","motivo","actorUsuarioId","archivadaEn","createdAt","updatedAt")
SELECT "id","comunidadId","unidadId","residenteVeActas","motivo","actorUsuarioId","archivadaEn","createdAt","updatedAt" FROM "controles_propiedad_archivados";
DROP TABLE "controles_propiedad_archivados";
ALTER TABLE "nuevo_controles_propiedad_archivados" RENAME TO "controles_propiedad_archivados";
CREATE INDEX "controles_propiedad_archivados_comunidadId_idx" ON "controles_propiedad_archivados"("comunidadId");

PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;
