-- Rename rutCondominio → rutComunidad (RG §4: término oficial "comunidad").
-- Preserva datos: RENAME COLUMN no toca valores.
ALTER TABLE "configuracion_global" RENAME COLUMN "rutCondominio" TO "rutComunidad";
