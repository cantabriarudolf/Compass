# Tasks: store-cobertura-fase-d

Ventana D4 de SERIE-DEUDA-2. Objetivo declarado: pagar los **57 statements** de las 6 acciones más
descubiertas de `lib/store.ts` con tests comportamentales contra la API pública. Medido: **56**
(ver "Medición" en el avance NSGC).

- [x] **Medir primero**: reporte de cobertura de la suite vigente y mapa acción → statements sin
  cubrir (script del prompt-04 sobre `coverage/coverage-final.json`). Las 6 acciones sumaban 56
  statements sin cubrir; el total de `lib/store.ts` era 111.
- [x] **Tests de `generarCertificadoCT` y `distribuirReporteRE`**
  (`test/store-cobertura-fase-d-ct-re.test.ts`, 11 tests): validaciones de tipo (residencia /
  estado de cuenta / al día / liquidación), marcador `—` sin propietario, saldo pendiente, fallback
  del trabajador, snapshot de directiva vigente, folio/código único ante colisión; reporte
  inexistente, segmentación sin destinatarios, alcance EF por micro/macro con las tres bandejas y
  snapshot vacío. `generarCertificadoCT` 15 → 1 · `distribuirReporteRE` 12 → 0.
- [x] **Tests de `respaldarInfraccionIN` y `desestimarInfraccionIN`**
  (`test/store-cobertura-fase-d-in.test.ts`, 9 tests): inexistente, resolución final, firmante no
  vigente, respaldo duplicado, respaldo efectivo con evento; desestimación sin justificación y
  desestimación efectiva con evento y justificación recortada. 8 → 0 ambas.
- [x] **Tests de `saveElementoRA` y `saveAdelantoPL`**
  (`test/store-cobertura-fase-d-ra-pl.test.ts`, 10 tests): schema, obligatoriedad de ubicación,
  sub-sector y activo IR inexistentes, upsert; monto no positivo, trabajador inexistente, sin ficha
  laboral de PE, alta con folio correlativo + notificación + evento y edición sin reemisión.
  `saveElementoRA` 7 → 0 · `saveAdelantoPL` 6 → 0.
- [x] **Delta `MODIFIED`** del requirement "Gate de cobertura por área" en `DEV-qa-lab` con los 7
  escenarios vivos + el de esta fase; `check-delta-coverage` → 0 que romperían el archive.
- [x] **Avance NSGC** con la cobertura por acción antes/después
  (`Data/NSGC/docs/avances/avance - 2026-10-18 08-45.md`) y el **remanente declarado** con líneas y
  causa: 56 statements (removeMaestro 14, migrate 4940-4941/5127, ramas sueltas de 12 acciones) más
  la rama inalcanzable `lib/store.ts:4321`.
- [x] **Gate final**: `npx tsc --noEmit` 0 · `npm run lint` 0 errores · `npm test` **1276/1276** en
  123 archivos con los pisos vigentes (sin re-baseline) · `openspec validate --all` 42/0.
- [ ] **Remanente para D5** (`store-cobertura-fase-e`): 56 statements en `lib/store.ts` y el ratchet
  final de `lib/**` y global con la medición acumulada (97.77/90.57 → 98.64/91.77 · global
  93.67/84.57 → 94/85.03).
