## ADDED Requirements

### Requirement: Punto cero histórico 2023-2024
La comunidad SHALL arrancar con la historia real de ingresos y egresos 2023-2024 cargada como línea base: el sistema SHALL exponer el fixture `k0mp4ss_fe/apps/web/data/finanzas/punto-cero-2324.json` (derivado de `Data/NSGC/ingresosvsegresos.23y24/INGvsEGR.xlsx` sin leer el xlsx en runtime) con fondo `fondo-cc-punto-cero` (Cuenta Corriente, tipo gasto_comun, saldoInicial 17082694), 186 egresos (monto, fecha ISO, concepto, familia, categoria mapeada sueldos/mantencion/servicios/administracion/otro, esRecurrente solo "Pago Administración") y 45 ingresos (fecha ISO, monto, concepto, familia). La migración `STORE_VERSION 26→27` SHALL poblar estos datos de forma aditiva e idempotente por IDs deterministas `fondo-cc-punto-cero`, `fi-egr-hist-001..186` (orden fecha ascendente, folio `FE-####` continuo respetando el contador existente sin chocar con seed ni TEST-*) y `fi-ing-hist-001..045`; re-ejecutar la migración NO SHALL duplicar. Tras migrar, `saldoFondo("fondo-cc-punto-cero")` con `saldoInicial` SHALL ser 0 y los totales por año SHALL coincidir con el libro. La fixture y la migración SHALL convivir con el seed NSGC y con datos `TEST-*` sin romper dashboards FI.

#### Scenario: Fixture canónico versionado
- **WHEN** se inspecciona `data/finanzas/punto-cero-2324.json`
- **THEN** contiene `fondoCC` {id:"fondo-cc-punto-cero", nombre:"Cuenta Corriente", tipo:"gasto_comun", saldoInicial:17082694}, 186 egresos y 45 ingresos con fechas ISO, categorías mapeadas según familia y `esRecurrente` solo en "Pago Administración", y 24 entradas `saldoCC`; totales $62.491.011 egresos / $45.408.317 ingresos validados en ETL

#### Scenario: Migración v26→v27 puebla el punto cero de forma idempotente
- **WHEN** `migrate(persistedV26, 26)` corre sobre un store v26 sin el fondo histórico
- **THEN** crea `fondo-cc-punto-cero` con saldoInicial 17082694, inserta 186 egresos con folios `FE-####` únicos y continuos y 45 ingresos con ids `fi-ing-hist-*`; una segunda ejecución no crea duplicados ni nuevos folios

#### Scenario: Folios históricos continúan secuencia sin chocar con seed ni TEST-*
- **WHEN** el store v26 ya contiene egresos con folios `FE-*` (seed o TEST-*)
- **THEN** los 186 históricos usan el rango siguiente del contador `siguienteFolioFE` (max existente +1 .. max+186) sin colisionar y el decision log lo documenta

#### Scenario: Saldo del fondo Cuenta Corriente cuadra con el libro
- **WHEN** se calcula `saldoFondo("fondo-cc-punto-cero", {cobros:[], egresos:egresosHist, emisiones:[], ingresosFI:ingresosHist, saldoInicialPorFondo:{"fondo-cc-punto-cero":17082694}})` sobre el store migrado
- **THEN** retorna 0

#### Scenario: Totales por año coinciden con el libro
- **WHEN** se suman los montos migrados por año
- **THEN** egresos 2023 = 19.506.242, egresos 2024 = 42.984.769, ingresos 2023 = 13.309.017, ingresos 2024 = 32.099.300

#### Scenario: Dashboards FI no rompen tras el punto cero
- **WHEN** se renderizan morosidad/reportes y el store contiene el punto cero
- **THEN** los componentes consumen `fondosFI/egresosFI/ingresosFI` sin error y reflejan los montos históricos en sus agregados
