> **Este archivo ES tu prompt.** Ventana 3 (cierre) de la serie **punto-cero**. Lee
> `openspec/SERIE-PUNTO-CERO/00-plan.md` y verifica en la Bitácora que P1 y P2 estén HECHAS
> (git); si no, detente y repórtalo.

## Alcance P3 — e2e del punto cero + cierre integral de la serie

1. **e2e** `e2e/crud/punto-cero.spec.ts` (read-oriented, cuenta admin):
   - `/finanzas/gastos-comunes` (o la vista FI con la lista de egresos): afirma que existen
     egresos históricos con folio FE y descripciones del libro ("Útiles de Aseo", "Pago
     Administración", "Cotizaciones Previsionales") — la vista debe paginar o filtrar para
     encontrarlos (usa los filtros reales de la UI).
   - Lista de ingresos manuales visible con "Gastos Comunes"/"Aporte Cerco Electrico".
   - Saldo del fondo "Cuenta Corriente" visible en la UI de fondos (= 0 con apertura cuadrada).
   - `expect(errores).toEqual([])`.
2. **Dashboards**: `/admin/metricas` y la reportería reflejan la historia sin errores
   (smoke de esas rutas ya existe — verifica que no rompa; si hay KPIs de FI, añade
   afirmación de que muestran datos 2023-2024).
3. **Validación completa** (NÚMEROS REALES): tsc 0 · lint 0 warnings · `npx vitest run`
   (total real) · `npx playwright test e2e/crud/` (todos) · `e2e/flujo/ e2e/smoke/
   e2e/auth/ e2e/a11y/` verdes · `openspec validate --all` 32/32.
4. **Documentación:** avance NSGC de cierre (`Data/NSGC/docs/avances/`), manual
   `12 - FI - Finanzas y Morosidad.md` (nueva feature ingreso manual + saldo de apertura +
   punto cero 2023-2024), fila P3 HECHA con hash, Bitácora "SERIE COMPLETA" + hashes P1-P3,
   y nota en `openspec/BACKLOG-100.md` de que la sincronización FI→BD sigue pendiente para
   ST (el punto cero vive en store v27).
5. Commits → nsgc-prepush → push. Si algo está rojo: arréglalo ANTES del cierre.

## Reporte final

Feature ingreso manual + saldoInicial + migración v27 con la historia cargada (números del
libro vs sistema), e2e punto cero, totales de cada suite, commits con hash, avance creado,
confirmación "SERIE COMPLETA".
