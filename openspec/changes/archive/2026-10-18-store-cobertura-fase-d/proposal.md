# Proposal: store-cobertura-fase-d — las 6 acciones más descubiertas del store

## Contexto

Al cierre de SERIE-DEUDA-1 (P5, change `store-cobertura-fase-c`) quedaron **111 statements sin
cubrir** en `lib/store.ts`. Las 6 acciones con más deuda concentraban **57** de esos statements:
`generarCertificadoCT` (15), `distribuirReporteRE` (13), `respaldarInfraccionIN` (8),
`desestimarInfraccionIN` (8), `saveElementoRA` (7) y `saveAdelantoPL` (6). Los pisos vigentes al
abrir la ventana son global **92/83/92/92** · `lib/**` **97/91/98/97`** · `app/api/**` **87/74/88/87**.

## Objetivo

Subir la cobertura **real** de `lib/store.ts` pagando la mitad grande de la deuda declarada, con
tests **comportamentales** contra la API pública (`useCompassStore`) para las 6 acciones más
descubiertas de la medición vigente.

## Alcance

1. Tests comportamentales nuevos en `k0mp4ss_fe/apps/web/test/store-cobertura-fase-d*.test.ts` para
   las 6 acciones con más statements sin cubrir, afirmando el `StoreResult`, el estado resultante,
   las validaciones y los cargos materiales en el libro FI cuando corresponda.
2. Delta `MODIFIED` del requirement "Gate de cobertura por área" en `DEV-qa-lab` con la **unión** de
   los escenarios vivos (el último archive gana) más el de esta fase.
3. Avance NSGC con la cobertura por acción antes/después y el remanente declarado con líneas y causa.

## Fuera de alcance

- **Tocar los `thresholds` de `vitest.config.ts`**: el ratchet final lo hace D5 con la medición
  acumulada.
- Editar `lib/store.ts`, los slices o los handlers para hacerlos testeables.
- Cambiar el shape persistido: **`STORE_VERSION = 28` congelado**.
- Forzar ramas inalcanzables por la API pública con mocks de módulo o tests de internals: se
  declaran con su línea y causa en el avance NSGC.

## Criterios de aceptación

- `npx tsc --noEmit` → 0 errores (corrido **después** de agregar los tests); `npm run lint` → 0
  errores; `npm test` → verde con los pisos vigentes sin re-baseline; `openspec validate --all` sin
  fallos; `check-delta-coverage store-cobertura-fase-d` → `0 que romperían el archive`.
- El remanente sin cubrir queda documentado con su línea y su causa en el avance NSGC.
