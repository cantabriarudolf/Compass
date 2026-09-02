# Proposal: FI Punto Cero histórico 2023-2024 (ETL + migración v27)

## Why

La comunidad "Edificio Plaza Central" arranca con 2 años de historia real dispersa en el libro INGvsEGR.xlsx (45 ingresos $45.408.317, 186 egresos $62.491.011, saldo CC cierre $0). Sin punto cero, los dashboards de FI reportan vacío y el saldo del fondo no cuadra con el libro. P2 convierte ese Excel en el nuevo estado base del sistema: un fondo "Cuenta Corriente" con apertura $17.082.694 y toda la historia cargada vía migración v27 idempotente.

## What Changes

- **ETL**: script one-off con `xlsx` (npm i -D xlsx) lee `Data/NSGC/ingresosvsegresos.23y24/INGvsEGR.xlsx` (3 hojas) y genera `k0mp4ss_fe/apps/web/data/finanzas/punto-cero-2324.json` versionado: `fondoCC` (id `fondo-cc-punto-cero`, nombre Cuenta Corriente, tipo gasto_comun, saldoInicial 17082694) + 186 egresos (fecha ISO, monto, concepto, familia, categoria mapeada, esRecurrente solo "Pago Administración") + 45 ingresos (fecha ISO, monto, concepto, familia) + 24 saldos CC. Fechas dd/mm/yyyy→ISO, IDs deterministas `fi-egr-hist-001..186` y `fi-ing-hist-001..045` ordenados por fecha ascendente. Validación ETL: totales y saldo final 0.
- **Migración v26→v27** (`lib/store.ts`): `migrate` aditiva e idempotente. Si no existe fondo `fondo-cc-punto-cero`, lo crea (saldoInicial 17.082.694) e inserta 186 egresos (folio `FE-####` continuo respetando contador `siguienteFolioFE` sin chocar con seed/TEST-*) y 45 ingresos (id `fi-ing-hist-*`). Re-ejecutar no duplica (chequeo por ids deterministas). No lee xlsx en runtime, importa el JSON.
- **Store/fixtures**: JSON commiteado como fixture canónico; `FondoFISchema` y `IngresoFISchema` ya existen (P1), solo se pueblan.
- **Tests migración**: v26 store con datos → fondo creado 1 vez, 186 egresos FE únicos, 45 ingresos, `saldoFondo("fondo-cc-punto-cero")===0`, totales por año coinciden con libro (egresos 2023 19.506.242 etc.), dashboards FI no rompen.
- **Compatibilidad**: convive con seed NSGC (3 fondos base) y datos `TEST-*`; folios históricos continúan secuencia del contador existente (documentado).

## Capabilities

### New Capabilities
- (ninguna nueva; se materializa el punto cero sobre FI existente)

### Modified Capabilities
- `FI-finanzas-morosidad`: ADDED Requirement "Punto cero histórico 2023-2024" — la comunidad arranca con historia real 2023-2024 cargada como línea base; migración v27 idempotente por IDs deterministas; el fondo Cuenta Corriente valida contra Saldo CC del libro (saldo 0 con apertura 17.082.694) y totales por año coinciden.
- `ST-capa-datos-persistente`: (no cambia schema; la migración v27 ahora sí puebla datos históricos del punto cero — documentado en FI; si se requiere delta separado se anota aquí).

## Impact

- `k0mp4ss_fe/apps/web/data/finanzas/punto-cero-2324.json` (nuevo fixture), `lib/store.ts` (migrate v27 con datos), `lib/finanzas-utils.ts` ya extendido (usa saldoInicial), tests nuevos `test/store-punto-cero.test.ts` + ajustes `test/*` si asumen seed sin fondo nuevo, `package.json` devDep `xlsx` para ETL one-off.
- Riesgo bajo: aditivo, ids deterministas, folios continuos, validación saldo 0.
- No rompe Prisma/BD (FI→Prisma es ST futuro).
