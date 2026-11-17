-- Acuerdo presencial: la modalidad y el resultado proclamado (S2/S4/S5).
--
-- El registro de acuerdos nació electrónico: el resultado se DEDUCE sumando
-- los `VotoAcuerdo` con la regla pura `resultadoDelAcuerdo`. Un acuerdo
-- presencial no tiene votos por persona —el resultado lo PROCLAMA la sala— y
-- cargado como está, la resolución lo leería como cero votos y lo dejaría
-- `pendiente` para siempre. Estas dos columnas son el modelo de lo proclamado:
--
--   `modalidad` — `electronica` | `presencial`. El default `electronica` es
--   aditivo puro (S4): todas las filas existentes nacen electrónicas y su
--   resolución sigue deduciéndose de los votos, exactamente como hoy. La
--   migración no cambia ningún comportamiento: solo agrega la columna.
--
--   `resultado` — el acta de lo proclamado, solo para `presencial` (null para
--   siempre en `electronica`): a favor, en contra, abstenciones, presentes y
--   si se alcanzó el quórum (la mayoría que exige la regla aplicada
--   `quorumRequerido`). La forma, la lectura y el contraste viven en
--   `lib/acuerdos.ts` (`esResultadoProclamado` / `resolucionPresencial`); la
--   escritura pasa por el cierre de `app/api/acuerdos/[id]/route.ts`, que
--   exige el acta firmada archivada (S1) y congela la fila resuelta (S5).
--
-- NO HAY BACKFILL, y es deliberado: los acuerdos que existieron antes de esta
-- columna son electrónicos por el default, y ninguna fila proclamada puede
-- inventarse desde la base — el resultado de una sala se registra cuando
-- ocurre, con su acta, nunca retroactivamente.
--
-- Aditiva: dos columnas en `acuerdos`, una con default y una nullable.
-- Ninguna fila existente cambia. El SQL es válido en SQLite y en PostgreSQL.

ALTER TABLE "acuerdos" ADD COLUMN "modalidad" TEXT NOT NULL DEFAULT 'electronica';

ALTER TABLE "acuerdos" ADD COLUMN "resultado" JSONB;
