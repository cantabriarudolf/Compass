## Context

Store en `STORE_VERSION 27` con migración `v26→v27` vacía (solo `ingresosFI: []`) dejada por P1. `saldoFondo()` ya acepta `saldoInicialPorFondo`. El libro INGvsEGR.xlsx tiene 3 hojas con 186 egresos / 45 ingresos validados en análisis. Ver proposal — Why.

## Goals / Non-Goals

**Goals:**
- Materializar el punto cero: JSON canónico versionado + migración idempotente que deja el fondo Cuenta Corriente en saldo 0.
- No chocar con seed NSGC ni TEST-* (folios continuos).
- Validación inquebrantable por totales anuales.

**Non-Goals:**
- Sincronización FI→Prisma (ST futuro).
- UI nueva (eso es P3).
- Re-parsear xlsx en runtime.

## Decisions

- **ETL one-off con `xlsx` en `/tmp` o devDep**: lee Excel fuera de app, escribe `data/finanzas/punto-cero-2324.json` commiteado. Alternativa `exceljs` descartada por peso; `xlsx` ya validado en análisis.
- **IDs deterministas `*-hist-*` + check por `id`**: migración es idempotente sin state extra; si ids existen, skip. Folios `FE-####` no son ids: se asignan continuando `max(FE)` del store en ese momento. Documenta que históricos usan siguiente rango.
- **Import estático del JSON en `store.ts`**: `import puntoCero from "@/data/finanzas/punto-cero-2324.json"` (resolveJsonModule true). Evita fetch/fetch runtime y mantiene tipos. Alternativa inline gigante descartada por diff ilegible.
- **Categoria via map cerrado de familias**: map literal validado en ETL (throw si familia sin mapeo). `esRecurrente` solo trim "Pago Administración".
- **Sort estable por fecha ISO asc + idx**: genera IDs deterministas estables aunque el Excel cambie orden intra-día.

## Risks / Trade-offs

- **Folio gap si otro cambio inserta FE entre migraciones** → Mitigación: idempotencia por id, folios se fijan la primera vez; re-migración no reasigna.
- **JSON grande en bundle (~40KB)** → Mitigación: solo se usa en migración (import tree-shakable) y es histórico frío; aceptable.
- **`xlsx` devDep en apps/web** → Mitigación: instalar como devDep solo para ETL, no incluido en production bundle.

## Migration Plan

1. ETL genera JSON, commit.
2. `store.ts` `migrate` caso `v26→v27`: si `fondosFI` no tiene `fondo-cc-punto-cero`, push fondo + 186 egresos (con folio continuo) + 45 ingresos; si ya existe, noop.
3. bump `FONDOS_FI_SEED`? No, seedData ya tiene 3 fondos; punto cero es migración, no seed (fresh install también corre migrate desde 0→27? Fresh install usa seedData directo, sin migrate. Decisión: fresh install también debe tener punto cero. Por tanto, seedData debe incluir punto cero O migrate desde fresh? Zig: fresh install no pasa por migrate (version === STORE_VERSION). Por consistencia, añadir fondo-cc-punto-cero a FONDOS_FI_SEED? Pero spec dice migración. Para cubrir fresh install, la migración también debe correr vía `onRehydrateStorage` saneo? Mejor: seedData incluye fondo punto cero y los arrays históricos? Decisión final: mantener seedData sin históricos para no inflar seed, pero `onRehydrateStorage` ensure? Revisar: `onRehydrateStorage` sanea pero no migra. fresh install leería seed vacío. P2 debe también poblar seedData? Evaluado: P2 poblará seedData + migrate para ambos caminos. Documentado en tasks.

## Open Questions

- ¿Próximo punto cero 2025 se versiona como nuevo JSON o delta? Fuera de alcance.
