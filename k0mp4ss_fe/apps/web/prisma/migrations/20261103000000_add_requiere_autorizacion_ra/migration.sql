-- RA-reservas — autorización del administrador por elemento.
--
-- Decisión (2026-11-03): hay elementos cuya reserva no debe nacer confirmada,
-- porque el recinto necesita aprobación (por ejemplo el salón de eventos). En
-- esos casos la reserva nace en estado «solicitada» y el administrador la
-- autoriza o la rechaza.
--
-- La columna es aditiva y con valor por defecto falso: ningún elemento
-- existente cambia de comportamiento y ninguna reserva histórica se mueve.
-- Un elemento sin la marca sigue creando reservas confirmadas como hasta hoy.

ALTER TABLE "elementos_ra" ADD COLUMN "requiereAutorizacion" BOOLEAN NOT NULL DEFAULT false;
