-- F29 · el prorrateo de una unidad se cuenta UNA vez, y lo garantiza la base.
--
-- El voto inmutable guardaba la unidad en `unidadId`, pero la unicidad se
-- sostenía sólo en el chequeo de la ruta: dos copropietarios de la MISMA unidad
-- que votaran a la vez pasaban los dos el chequeo y dejaban dos votos con el
-- mismo `unidadId`, o sea el prorrateo de la unidad contado DOS veces en el
-- resultado (doble influencia en un acuerdo que obliga, como un presupuesto).
-- Prisma no puede expresar un índice único parcial, así que la unicidad se lleva
-- a una columna propia:
--
--   `claveUnidad` guarda el `unidadId` cuando el voto está atado a una unidad y
--   queda NULL en los votos que no lo están (voto de comité, o persona que vota
--   con varias unidades y cuyo peso es la SUMA de sus prorrateos). En SQLite y
--   en PostgreSQL los NULL no colisionan en un índice único: muchos votos sin
--   unidad conviven en el mismo acuerdo y la unidad repetida no entra.
--
-- Aditiva. La columna nace NULL y se rellena con el `unidadId` de las filas que
-- ya existían (backfill), que es exactamente lo que la ruta escribe desde ahora.
-- Los votos sin unidad quedan en NULL, que es su valor correcto.
ALTER TABLE "acuerdos_votos" ADD COLUMN "claveUnidad" TEXT;

-- Backfill: cada voto ya registrado con unidad conserva la unicidad de esa unidad.
UPDATE "acuerdos_votos" SET "claveUnidad" = "unidadId" WHERE "unidadId" IS NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "acuerdos_votos_acuerdoId_claveUnidad_key" ON "acuerdos_votos"("acuerdoId", "claveUnidad");
