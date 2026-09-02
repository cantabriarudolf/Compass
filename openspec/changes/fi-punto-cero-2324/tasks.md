## 1. ETL y fixture

- [ ] 1.1 Generar `k0mp4ss_fe/apps/web/data/finanzas/punto-cero-2324.json` desde INGvsEGR.xlsx con script one-off `xlsx` (fechas ISO, categorías mapeadas, esRecurrente solo "Pago Administración", ids orden fecha asc)
- [ ] 1.2 Validar fixture: 186 egresos $62.491.011, 45 ingresos $45.408.317, totales por año (egresos 2023 19.506.242 etc.), saldo 0 con apertura 17.082.694, 24 saldos CC

## 2. Migración v26→v27 con datos históricos

- [ ] 2.1 Extender `FONDOS_FI_SEED` / `seedData()` para incluir `fondo-cc-punto-cero` en fresh installs (o documentar que fresh install también migra) y asegurar `fondosFI` contiene Cuenta Corriente
- [ ] 2.2 Reescribir `migrate` caso `v26→v27` para importar el JSON y, si no existe `fondo-cc-punto-cero`, crear fondo + 186 egresos (folio FE-#### continuo vía `siguienteFolioFE` virtual) + 45 ingresos idempotente por ids deterministas
- [ ] 2.3 Documentar decisión de folios continuos (rango siguiente) y garantir no choque con TEST-* / seed

## 3. Tests y validación

- [ ] 3.1 Crear `test/store-punto-cero.test.ts`: migración v26→v27 sobre store v26 con datos, idempotencia, 186 folios FE únicos, 45 ingresos, `saldoFondo("fondo-cc-punto-cero")===0`, totales por año
- [ ] 3.2 Ajustar tests existentes de FI si asumen seed sin fondo nuevo (asunción de seed → ajustar, regresión real → arreglar) y anotar en Bitácora

## 4. Verificación y cierre

- [ ] 4.1 `npx tsc --noEmit` 0, `npm run lint` 0 warnings, `npx vitest run` (462+ nuevos total real), `openspec validate --all` verde
- [ ] 4.2 Commit + nsgc-prepush + push + archivar change (git status limpio), actualizar 00-plan Bitácora P2 HECHA con hash
