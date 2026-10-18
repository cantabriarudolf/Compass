# Tasks: store-cobertura-fase-d

Ventana D4 de SERIE-DEUDA-2. Objetivo declarado: pagar los **57 statements** de las 6 acciones más
descubiertas de `lib/store.ts` con tests comportamentales contra la API pública.

- [ ] **Medir primero**: reporte de cobertura de la suite vigente y mapa acción → statements sin
  cubrir (script del prompt-04 sobre `coverage/coverage-final.json`).
- [ ] **Tests de `generarCertificadoCT`** (`test/store-cobertura-fase-d.test.ts`): validaciones de
  tipo (residencia / estado de cuenta / al día / liquidación), folio correlativo, snapshot de
  directiva vigente y evento CT.
- [ ] **Tests de `distribuirReporteRE`**: reporte inexistente, ya distribuido, alcance EF por
  micro/macro, segmentación sin destinatarios y distribución real con notificaciones.
- [ ] **Tests de `respaldarInfraccionIN`**: infracción inexistente, resolución final, firmante no
  vigente, respaldo duplicado y respaldo efectivo con evento IN.
- [ ] **Tests de `desestimarInfraccionIN`**: inexistente, resolución final, justificación vacía y
  desestimación efectiva con evento IN.
- [ ] **Tests de `saveElementoRA`**: schema, sin ubicación, sub-sector inexistente, activo IR
  inexistente y upsert efectivo.
- [ ] **Tests de `saveAdelantoPL`**: folio correlativo, trabajador inexistente, sin ficha laboral y
  alta efectiva con evento PL + notificación.
- [ ] **Delta `MODIFIED`** del requirement "Gate de cobertura por área" en `DEV-qa-lab` con los 7
  escenarios vivos + el de esta fase; `check-delta-coverage` → 0 que romperían el archive.
- [ ] **Avance NSGC** con la cobertura por acción antes/después y el **remanente declarado** con
  líneas y causa.
- [ ] **Gate final**: `npx tsc --noEmit` 0 · `npm run lint` 0 errores · `npm test` verde con los
  pisos vigentes · `openspec validate --all` sin fallos.
