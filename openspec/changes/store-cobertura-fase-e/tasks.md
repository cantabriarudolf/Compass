# Tasks: store-cobertura-fase-e

Ventana D5 de SERIE-DEUDA-2 (última ventana de cobertura). Objetivo declarado: pagar el
**remanente de 56 statements** de `lib/store.ts` que dejó la fase D y aplicar el **ratchet final** de
`lib/**` y global. Medido al abrir: 56 statements (98.68 % de `lib/store.ts`).

- [x] **Medir primero**: mapa acción → statements sin cubrir con el script del prompt-05 sobre
  `coverage/coverage-final.json` de la suite vigente (reporte de la ventana D4, 1276 tests). Las
  líneas objetivo eran 56, con el reparto declarado por D4.
- [x] **Tests de MA/VU/MP** (`test/store-cobertura-fase-e-ma-vu-pm.test.ts`, 8 tests): guardas de
  hidratación de `saveMaestro`/`removeMaestro`, integridad de `categoriasUnidad` por etiqueta de
  unidad y de `contratistas` por ingreso PE, condición especial inexistente en `savePersona`,
  unidad inexistente y solapamiento de propietario en `saveVinculo`, y vínculo huérfano en
  `removeVinculo` (referencia con el `unidadId`).
- [x] **Tests de IN/RA/PL/CT/FI** (`test/store-cobertura-fase-e-in-ra-pl.test.ts`, 9 tests):
  `apelarInfraccionIN` inexistente y con otros registros en el `map`,
  `removeTipoInfraccionIN` exitoso, `saveReservaRA` con solicitante inexistente,
  `cancelarReservaRA` inexistente, `retenerGarantiaRA` sin fondo de amenities (sin cargo FI),
  `removeAdelantoPL` inexistente, `removeCertificadoCT` inexistente y `emitirGastoComun` sin
  aporte al fondo de reserva.
- [x] **Tests de PE/RE/migrate** (`test/store-cobertura-fase-e-pe-re-migrate.test.ts`, 6 tests):
  `ingresarBitacoraVisitaPE`, `registrarRetiroEncomiendaPE` y `confirmarIngresoContratistaPE` con
  otros registros en el `map`, `generarReporteRE` con novedades sin incidencias, `mergeById` del
  `migrate` v22 con colección previa y `repararDocumentos` (DV de RUT + comunidad sin RUT).
- [x] **Ratchet final**: re-baseline de los pisos `lib/**` y global en `vitest.config.ts` (medido −
  1 pt, nunca bajar) con fecha y contexto en el comentario.
- [x] **Delta `MODIFIED`** del requirement "Gate de cobertura por área" en `DEV-qa-lab` con los 8
  escenarios vivos + el de esta fase; `check-delta-coverage` → 0 que romperían el archive.
- [x] **Avance NSGC** con la cobertura antes/después, las acciones cubiertas, los pisos nuevos y el
  **remanente final declarado** con línea y causa (`lib/store.ts:4321` de D4 y
  `lib/store.ts:5127`).
- [ ] **Gate final** (correr después de los tests, con los pisos nuevos aplicados): `npx tsc --noEmit`
  0 · `npm run lint` 0 errores · `npm test` verde · `openspec validate --all` 42/0 ·
  `check-delta-coverage store-cobertura-fase-e` 1 ok/0.
