# Proposal: FI Ingreso manual a fondo + saldoInicial + STORE_VERSION 27

## Why

Hoy los ingresos FI solo nacen de cobros por unidad; los 45 ingresos históricos agregados mensuales (INGvsEGR.xlsx) exigen un concepto propio de ingreso directo a fondo. Además los fondos no tienen saldo de apertura, por lo que no se puede cuadrar el libro real (saldo CC cierre 0) sin un campo versátil. P1 deja la infraestructura lista (schema, store, saldo, UI, migración vacía) para que P2 cargue el punto cero.

## What Changes

- **Schema**: `IngresoFISchema` (id, fecha ISO, monto >0, concepto min1, fondoId, familia?) + `FondoFISchema.saldoInicial?: number` opcional. Deriva tipos `IngresoFI`.
- **Store**: nueva colección `ingresosFI: IngresoFI[]` (seed vacío, persist, zod), acción `registrarIngresoFI(input): StoreResult` con validación zod + fondoId existe, id `fi-ing-*`, evento `FI_INGRESO_REGISTRADO` categoría FI, y opcional `removeIngresoFI` si hay paridad con egresos (si egresos no permite eliminar, ingresos tampoco; revisar). `STORE_VERSION 26→27` + migración `migrate26a27` que asegura `ingresosFI: []` y no pierde `saldoInicial` (idempotente, sin carga de datos históricos aún).
- **saldoFondo**: `ContextoSaldoFondo` gana `saldoInicialPorFondo?: Record<string,number>` y suma `(ctx.saldoInicialPorFondo?.[fondoId] ?? 0)` a ingresosCobros + aportes − egresos. Sin romper call sites existentes (default 0). Actualizar call sites en `app/` pasando mapa desde store.
- **UI FI** (`app/finanzas/gastos-comunes/page.tsx`): form "Registrar ingreso a fondo" (fecha, monto, concepto, fondo) + lista ingresos recientes; form de fondo gana campo opcional "Saldo de apertura" que persiste `saldoInicial`. Labels accesibles, aria-label en selects.
- **Tests**: nuevos (registrar OK + saldo refleja, fondo inexistente→error, monto≤0→zod, evento, saldoInicial suma, migración idempotente) + actualizar tests fijados a 26→27.
- **No rompe 462 pruebas**: saldoInicial default 0.

## Capabilities

### New Capabilities
- (ninguna nueva; se extiende FI existente)

### Modified Capabilities
- `FI-finanzas-morosidad`: ADDED Requirement "Ingreso manual a fondo" (registro directo a fondo sin origen en cobros) + Requirement "Saldo de apertura de fondo" (fondos MAY tener saldoInicial que saldoFondo incorpora; con 0 fiel al flujo, ajustado cuadra libro). Folios no aplica a ingresos.
- `ST-capa-datos-persistente`: ADDED colección `ingresosFI` y campo `saldoInicial` en FondoFI, bump STORE_VERSION 26→27 con migrate, persist y validación zod.

## Impact

- `lib/schemas.ts` (FondoFI, nuevo IngresoFI), `lib/store.ts` (colección, acción, migrate, partialize, ESQUEMAS_COLECCION, persist version), `lib/finanzas-utils.ts` (ContextoSaldoFondo + saldoFondo), `app/finanzas/gastos-comunes/page.tsx` (forms + lista), `test/*` (nuevos + ajustes versión), e2e FI si corresponde.
- Sin impacto en Prisma/BD (sincronización FI→BD es ST futuro).
- Riesgo bajo: aditivo, default 0, migración idempotente.
