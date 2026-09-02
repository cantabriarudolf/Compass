> **Este archivo ES tu prompt.** Ventana 2 de la serie **punto-cero**. Lee
> `openspec/SERIE-PUNTO-CERO/00-plan.md` (ARRANQUE + decisiones + mapeos + datos verificados)
> y verifica en la Bitácora que P1 esté HECHA (git); si no, detente y repórtalo.

## Alcance P2 — ETL del punto cero + migración v27 con la historia 2023-2024

1. **ETL**: genera `k0mp4ss_fe/apps/web/data/finanzas/punto-cero-2324.json` a partir de
   `Data/NSGC/ingresosvsegresos.23y24/INGvsEGR.xlsx` usando el paquete `xlsx` (npm i -D xlsx
   o script one-off con node; el JSON resultante SE COMMITEA — el xlsx NO se lee en runtime):
   ```json
   {
     "fondoCC": { "id": "fondo-cc-punto-cero", "nombre": "Cuenta Corriente", "tipo": "gasto_comun", "saldoInicial": 17082694 },
     "egresos": [ { "fecha": "2023-01-31", "monto": 100000, "concepto": "Útiles de Aseo", "familia": "Útiles de Aseo", "categoria": "otro", "esRecurrente": false } ... ],
     "ingresos": [ { "fecha": "2024-02-28", "monto": 1758000, "concepto": "Gastos Comunes", "familia": "Contribuciones" } ... ],
     "saldoCC": [ { "fecha": "2023-01-31", "monto": 0 } ... ]
   }
   ```
   - Fechas dd/mm/yyyy → ISO. IDs deterministas: egresos `fi-egr-hist-001..186` (orden por
     fecha ascendente), ingresos `fi-ing-hist-001..045`.
   - Categorías según mapeo del 00-plan (sueldos/mantencion/servicios/administracion/otro);
     `esRecurrente: true` solo Concepto "Pago Administración".
   - **Validación del ETL** (en el script o test): 186 egresos, 45 ingresos, totales
     $62.491.011 / $45.408.317, y con apertura $17.082.694 el saldo final del fondo CC = 0.
2. **openspec-propose** `fi-punto-cero-2324`: capability `FI-finanzas-morosidad` (delta ADDED
   requirement "Punto cero histórico 2023-2024": la comunidad arranca con la historia real de
   ingresos/egresos cargada como línea base; migración v26→v27 idempotente por IDs
   deterministas; el fondo Cuenta Corriente valida contra el Saldo CC del libro).
3. **Migración v26→v27** (`lib/store.ts`): si no existen `fondos` con id
   `fondo-cc-punto-cero`: crea el fondo (saldoInicial 17.082.694), inserta los 186 egresos
   (folio FE-#### secuencia respetando el contador del store — revisa cómo se generan los
   folios y NO choques con folios existentes del seed) y los 45 ingresos. Idempotente.
4. **Tests**: migración v26→v27 sobre un store v26 con datos: fondo creado 1 vez (idempotente),
   186 egresos con folios únicos FE, 45 ingresos, `saldoFondo("fondo-cc-punto-cero") === 0`,
   totales por año coinciden con el libro (2023: egresos 19.506.242), dashboards de FI
   (morosidad/reportes) no rompen.
5. Si el store v26 ya tuviera folios FE-#### del seed (revisa seedData), los históricos usan
   el rango siguiente (p. ej. continúan el contador) — documenta la decisión.

## Verificación

`npx tsc --noEmit` (0) · `npm run lint` (0 warnings) · `npx vitest run` (462 + nuevos — número
REAL; los tests de FI existentes pueden necesitar ajuste por el fondo nuevo: si rompen,
evalúa si es regresión real o asunción de seed — arregla con criterio y anota) ·
`openspec validate --all` · commit · nsgc-prepush · push · archive (git status limpio) ·
Bitácora P2 HECHA con hash.
