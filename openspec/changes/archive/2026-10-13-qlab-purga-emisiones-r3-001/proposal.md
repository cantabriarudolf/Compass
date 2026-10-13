# Proposal: qlab-purga-emisiones-r3-001 (hallazgo R3-001)

## Problema

Hallazgo CRITICAL R3-001 del review RDD de la porción 1 (SERIE-NOCHE-2): el paso
`emisiones-gc` de `POST /api/qa-lab/purga-test` (archivado `qlab-purga-bulk`) borraba
**toda** emisión de gasto común de la comunidad cuyo `periodo` estuviera en
`PERIODOS_FI_TEST` (`2019-01`, `2019-03`), sin exigir rastro TEST alguno en sus líneas.
El bucle legado de fallback (`app/admin/qa-lab/page.tsx`) sí exigía
`lineas.some(l => l.unidadId.startsWith("test-"))`. Riesgo determinista: si una comunidad
real tuviera una emisión en esos períodos (catastralmente posible aunque fuera improbable
por calendario), la purga del QA-Lab la destruiría junto al residuo TEST. El criterio de
borrado debe ser procedencia TEST, no el mero período.

## Propuesta

1. Helper `tieneLineaUnidadTest(lineas)` en `app/api/qa-lab/purga-test/route.ts`: recorre
   el JSON `lineas` en memoria y responde `true` si alguna línea tiene `unidadId` string
   con prefijo `test-` (semántica idéntica al bucle legado).
2. El paso 2 (`emisiones-gc`) consulta las candidatas (`id test-*` OR `periodo` en
   `PERIODOS_FI_TEST`), filtra en memoria —SQLite no puede filtrar el JSON `lineas`— y
   borra solo los ids que son `test-*` **o** tienen al menos una línea de unidad `test-*`.
3. Tests de regresión en `test/api/qa-lab-purga.test.ts`: 2 fixtures nuevos
   (`purga-em-periodo-real`, emisión real en período TEST sin líneas test → sobrevive;
   `purga-em-proc-test`, id sin prefijo + período TEST + línea de unidad `test-` → se
   borra) y aserciones dedicadas. Evidencia RED→GREEN: con el código viejo 1 test falla
   (la emisión real se destruía); con el fix 6/6 verdes.

## No-objetivos

- Rediseñar la semántica de la purga (solo se estrecha el paso `emisiones-gc` al rastro
  TEST real; el resto de los ~26 pasos queda intacto).
- Tocar el store legacy ni el fallback del bucle cliente (ya tenían la semántica correcta).
- Archivar el change en esta ventana (lo decide el orquestador tras CI verde del PR).
