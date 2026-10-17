# Tasks: higiene-prosa-store-cleanup

- [x] Diagnóstico real: censo con `rg` de las 28 acciones podadas en `openspec/specs/**` y
      `Data/NSGC/docs/manuales/**` (lista exacta en el avance y en la Bitácora de la serie)
- [x] Reescribir la prosa de las specs vivas al estado actual (API REST server-side)
- [x] Un delta `MODIFIED` por requirement tocado, con todos los escenarios vivos y sus nombres exactos
- [x] `check-delta-coverage higiene-prosa-store-cleanup` → 0 que romperían el archive
- [x] Decisión `CF_UPDATE_PARAM`: deuda declarada con referencia exacta (sin cablear emisión AM nueva)
- [x] Manuales NSGC (4) con `nsgc-prepush` + Trazabilidad si cambia un estado
- [x] Avance NSGC de la ventana + fila P6 HECHA + entrada en la Bitácora
- [x] Gates: `openspec validate --all` 0 fallos · `npx tsc --noEmit` 0 · `npm run lint` 0 errores ·
      `npm test` verde con los pisos vigentes (sin re-baseline)
