# Proposal: store-cobertura-fase-b — cobertura real de `lib/store/**`

## Contexto

El change archivado `2026-10-12-ci-verde-ratchet-cobertura` dejó la deuda escrita en su
`design.md § Deuda`: `lib/store.ts` acumulaba **1.202 statements sin cubrir** (84.21% de
statements) y era el archivo más pesado de la deuda de cobertura del repo.

Tras el split `st-split-fase2` (SERIE-NOCHE-3 P2–P5) esa cobertura ya no vive en un solo
archivo: ahora se reparte entre `lib/store.ts` y los **7 slices** de
`lib/store/slices/**` más `lib/store/helpers.ts`. Pero el `coverage.include` de
`vitest.config.ts` **solo instrumenta `lib/store.ts`**: el interior de `lib/store/**` no se
mide, así que la deuda real del store está subestimada y el piso `lib/**` vigente
(86/78/94/86) protege una foto incompleta.

## Objetivo

Cerrar la deuda de cobertura del store con **tests reales y comportamentales**:

1. Extender el `coverage.include` de `vitest.config.ts` a `lib/store/**` (slices +
   helpers) y **medir primero** el estado real de la suite verde.
2. Cubrir con tests comportamentales, contra la API pública del store
   (`useCompassStore`: acciones y selectores), los archivos con más statements sin
   cubrir; cada test afirma el efecto observable (estado resultante, `StoreResult`,
   validaciones y errores), nunca detalles internos ni líneas.
3. Re-baselinear los pisos `lib/**` y global con la regla del ratchet
   (**medido − 1 punto**, nunca bajar) documentando fecha y medición en
   `vitest.config.ts`.
4. Actualizar la spec viva del ratchet (`DEV-qa-lab`, `MODIFIED` del requirement
   "Gate de cobertura por área") para que el interior de `lib/store/**` quede vigilado y
   la cobertura del store sea una fase más del ratchet.

## Alcance

### Fase 1 (esta ventana — SERIE-NOCHE-3 P8)

1. `coverage.include` + `lib/store/**` y medición de arranque (global, `lib/**` y ranking
   por archivo de `lib/store/**` + `lib/store.ts` por statements sin cubrir).
2. Tests comportamentales nuevos en `k0mp4ss_fe/apps/web/test/**`, siguiendo el molde de
   los `test/store-*.test.ts` existentes (`resetStore` + `useCompassStore.getState()`).
3. Re-baseline de los pisos `lib/**` y global en `vitest.config.ts` (medido − 1 pt; los
   pisos nunca bajan).
4. Avance NSGC con cobertura antes/después, tests agregados y pisos nuevos.

## No-goals

- No se toca el código de `lib/store.ts` ni de los slices (solo tests y `thresholds`/
  `coverage.include` de `vitest.config.ts`).
- No se cambia el shape persistido: `STORE_VERSION = 28` queda **congelado**.
- No se baja ningún piso existente: si la medición con el include extendido dejara un
  área por debajo de su piso, se cubre con tests y, si el objetivo no cabe en la ventana,
  se reporta al owner sin tocar el piso.

## Medición de arranque

> Se completa en `design.md § D1` con la medición real del 2026-10-16 (suite verde
> completa, `coverage/coverage-final.json`), antes de escribir los tests.

## Riesgos

- **Bajo**: los tests nuevos no cambian comportamiento; el único cambio de producción
  posible es la configuración de cobertura, que no afecta runtime.
- El riesgo real es de **proceso**: medir dos veces (include extendido y reconteo tras los
  tests) para no fijar un piso sobre una foto incompleta. La regla del ratchet se aplica
  sobre la última medición verde.
