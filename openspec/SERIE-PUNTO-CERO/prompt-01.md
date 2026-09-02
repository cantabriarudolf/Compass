> **Este archivo ES tu prompt.** Ventana 1 de la serie **punto-cero**.

## Contexto común (válido para TODA la serie)

- Proyecto Compass. Front: `k0mp4ss_fe/apps/web`. Estado: Vitest 462/462, lint 0/0, CI verde,
  repo limpio en main. Lee SIEMPRE `openspec/SERIE-PUNTO-CERO/00-plan.md` (decisiones, datos
  verificados, mapeos, roadmap, bitácora).
- Método por ventana: openspec change completo (propose → apply → validate) → commit
  conventional español → nsgc-prepush → push → archive (git status LIMPIO tras archive) →
  fila HECHA + Bitácora con hash. Validación: tsc 0 · lint 0 warnings · Vitest completo con
  número REAL · e2e de la ventana · `openspec validate --all`.
- STORE_VERSION: esta serie sube 26 → 27 (P1). Sin romper las 462 pruebas: los tests que
  usan STORE_VERSION 26 se actualizan a 27 y la migración v26→v27 se testea.
- Confía en el CÓDIGO sobre el plan si un label difiere; anota desviaciones en la Bitácora.
- Si el contexto se agota: cierra la tarea en curso, commitea y deja el estado exacto en 00-plan.md.
- Reporta al final: cambios, verificaciones con NÚMEROS REALES, commits con hash, pendientes.

## Arranque (Ventana 1: lectura inicial)

1. Lee `openspec/SERIE-PUNTO-CERO/00-plan.md` completo (decisiones, datos verificados, mapeos).
2. Estudia el dominio FI: `lib/schemas.ts` (FondoFISchema, EgresoFISchema, EmisionGCSchema,
   CobroFISchema — líneas ~700-800), `lib/finanzas-utils.ts` (`saldoFondo` + ContextoSaldoFondo),
   acciones FI en `lib/store.ts` (saveFondoFI, saveEgresoFIcon folio FE-####), página
   `app/finanzas/gastos-comunes/page.tsx` (UI FI actual).
3. Verifica repo: `git status` limpio y pusheado, Vitest 462/462. Marca P1 EN CURSO en 00-plan.md.

## Alcance P1 — Feature "Ingreso manual a fondo" + saldoInicial + STORE_VERSION 27

1. **openspec-propose** `fi-ingreso-manual`: capability `FI-finanzas-morosidad` (delta ADDED:
   requirement "Ingreso manual a fondo" — el sistema permite registrar ingresos directos a un
   fondo (fecha, monto, concepto, fondoId) sin origen en cobros; requirement "Saldo de
   apertura de fondo" — los fondos MAY tener saldoInicial opcional que el cálculo de saldo
   incorpora; inmutabilidad de folios no aplica a ingresos).
2. **Schemas** (`lib/schemas.ts`):
   - `IngresoFISchema = { id, fecha (ISO), monto > 0, concepto: string min 1, fondoId, familia?: string }`.
   - `FondoFISchema` += `saldoInicial: z.number().optional()` (default 0 en migración).
3. **Store** (`lib/store.ts`):
   - Nueva colección `ingresosFI: IngresoFI[]` (seed vacío, persist, zod en el schema de datos).
   - Acción `registrarIngresoFI(input): StoreResult` — valida zod, valida fondoId existe,
     agrega con id `fi-ing-<ts>-<rand>`, registra evento `FI_INGRESO_REGISTRADO` (categoría FI).
   - `removeIngresoFI?(id)` opcional si el patrón de egresos lo tiene (revisa paridad con
     removeEgresoFI; si egresos no permite eliminar, ingresos tampoco).
   - **STORE_VERSION = 27** + migración `migrate26a27` (por ahora: asegurar
     `ingresosFI: []` y `fondos` sin perder saldoInicial — la carga de datos históricos es P2).
   - Revisa el patrón de migraciones existente (v25→v26) y clónalo.
4. **saldoFondo()** (`lib/finanzas-utils.ts`): `ContextoSaldoFondo` gana
   `saldoInicialPorFondo?: Record<string, number>` y el cálculo suma
   `(ctx.saldoInicialPorFondo?.[fondoId] ?? 0)` a ingresosCobros + aportes − egresos.
   Actualiza los call sites (buscar `saldoFondo(` en app/) pasando el nuevo campo desde el
   store (fondos con saldoInicial).
5. **UI** en `app/finanzas/gastos-comunes/page.tsx` (o sección FI que corresponda — revisa el
   layout): form "Registrar ingreso a fondo" (fecha, monto, concepto, fondo) + lista de
   ingresos recientes; el form de fondo gana campo opcional "Saldo de apertura" que persiste
   `saldoInicial`. Labels accesibles (aria-label en selects, lecciones del avance 05-30).
6. **Tests** (`test/store-finanzas.test.ts` o nuevo `test/store-ingresos-fi.test.ts`):
   registrar ingreso OK (+saldoFondo refleja), fondo inexistente → error, monto ≤ 0 → error
   zod, evento FI_INGRESO_REGISTRADO, saldoInicial suma al saldo, migración v26→v27 idempotente.
   Actualiza tests que fijen STORE_VERSION 26 → 27.

## Verificación

`npx tsc --noEmit` (0) · `npm run lint` (0 warnings) · `npx vitest run` (462 + nuevos — número
REAL) · e2e sanity de FI (`e2e/crud/gastos-comunes.spec.ts`) verde · `openspec validate --all`
· commit · nsgc-prepush · push · archive (git status limpio) · Bitácora P1 HECHA con hash.
