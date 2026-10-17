# Tasks: store-cobertura-fase-c

Ventana P5 de SERIE-DEUDA-1. Objetivo declarado: cerrar los 168 statements legacy de
`lib/store.ts` más los bordes de `lib/store/helpers.ts` y de los slices. Ejecutada **inline** por el
orquestador tras 3 intentos fallidos del ejecutor delegado (cortes de infraestructura).

- [x] **Medir primero**: reporte de cobertura de la suite vigente y lista real de statements sin
  cubrir por archivo, mapeada a la acción del store que la contiene (26 acciones; las 6 mayores
  concentraban el 53 % de los 168).
- [x] **Tests de bordes** (`test/store-cobertura-fase-c-bordes.test.ts`, 5 tests): `helpers.ts`
  (líneas 40, 98, 101-103) y slices (`ad-slice` 332/357, `ge-slice` 162/234/318).
- [x] **Tests legacy, bloque 1** (`test/store-cobertura-fase-c-legacy.test.ts`): `saveUnidad`
  (las 3 validaciones de FK de RG escritura + camino feliz), `aplicarInfraccionIN` (infracción
  inexistente, ya resuelta, tipo podado del catálogo, daño directo, sanción % GC contra el último
  gasto común, y cargo "pendiente" sin fondo activo) y `generarReporteRE` (bloques
  `bitacora_seguridad`, `morosidad` y `consumo_insumos` con su snapshot).
- [x] **Tests legacy, bloque 2**: `removeMaestro` (integridad referencial de `estadosOcupacion`,
  `categoriasUnidad`, `categoriasMacro`, `categoriasMicro`, `estadosInmobiliarios`) y
  `retenerGarantiaRA` (reserva inexistente, no confirmada, doble retención, motivo vacío, sin
  garantía, y retención con cargo real al fondo de amenities).
- [x] **Re-medir con la suite verde**: `lib/store.ts` 96.05 → **97.39**; `lib/store/helpers.ts`
  96.03 → **100 / 87.14**; slices 99.78 → **100 / 95.56**; `lib/**` 97.63 → **98.39/92.19/99.43/
  98.39**; global 91.09 → **93.70/84.77/93.28/93.70**.
- [x] **Re-baseline del ratchet** en `vitest.config.ts`: global 90/80/90/90 → **92/83/92/92** y
  `lib/**` 96/90/98/96 → **97/91/98/97** (medido − 1 pt; ningún piso baja), con fecha y contexto
  documentados en el comentario.
- [x] **Delta `MODIFIED`** del requirement "Gate de cobertura por área" en `DEV-qa-lab` con los 5
  escenarios vivos + el de esta fase; `check-delta-coverage` → 0 que romperían el archive.
- [x] **Avance NSGC** con cobertura antes/después y el **remanente declarado** con líneas y causa.
- [ ] **Remanente no cubierto** (deuda declarada para P7): **111 statements** en `lib/store.ts`,
  concentrados en `generarCertificadoCT` (15), `distribuirReporteRE` (13), `respaldarInfraccionIN`
  (8), `desestimarInfraccionIN` (8), `saveElementoRA` (7), `saveAdelantoPL` (6) y las ramas de
  arranque de `migrate` (4940-4941, 5127). Requieren fixtures de CT/RA/PL y de migración que no
  entraban en el presupuesto de esta sesión.
