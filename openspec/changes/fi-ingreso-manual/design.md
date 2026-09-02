## Context

FI hoy solo registra ingresos vía `cobrosFI.pagos`; no existe concepto de ingreso directo a fondo. `FondoFISchema` no tiene `saldoInicial`. `saldoFondo()` computa `ingresosCobros + aportes - egresos` sin parámetro opcional. Store en `STORE_VERSION=26` con migrate hasta v26. UI FI vive en `app/finanzas/gastos-comunes/page.tsx`. Ver proposal Why.

## Goals / Non-Goals

**Goals:**
- Schema `IngresoFI` con validación zod y colección `ingresosFI` persistida.
- `FondoFISchema.saldoInicial?` opcional y su flujo UI.
- `saldoFondo` extendido con `saldoInicialPorFondo?` sin romper 462 tests.
- Acción `registrarIngresoFI` con evento `FI_INGRESO_REGISTRADO`.
- STORE_VERSION 27 con migrate idempotente vacía de datos (P2 carga histórica).
- UI FI con form ingreso + lista + campo saldo apertura accesible.

**Non-Goals:**
- Carga de datos históricos punto cero (P2, fixture + migrate con datos).
- Sincronización FI→Prisma/BD (ST futuro).
- Folios para ingresos (inmutabilidad de folios no aplica).
- Reglas de negocio de familias de ingreso más allá de campo opcional.

## Decisions

- **IngresoFI shape**: `{id, fecha ISO, monto>0, concepto min1, fondoId, familia?}`. Minimal, valida lo pedido; familia opcional para familias Contribuciones/Otros/Multas/Fondo Reserva en P2.
- **Fondo saldoInicial opcional**: `z.number().min(0).optional()` en schema; default 0 en migrate/calc para compatibilidad. Alternativa requerido rompería stores existentes.
- **saldoFondo param**: `saldoInicialPorFondo?: Record<string,number>` en Contexto, suma `??0`. Mantiene firma compatible; call sites pasan mapa desde `fondosFI`. Alternativa mutar cálculo dentro de store rompería pureza.
- **Store migrate**: clonar patrón v25→v26 (`if ((version??0)<27)`) que asegura `ingresosFI: []` si ausente. No tocar fondos salvo preservar `saldoInicial`. Alternativa re-seed completo innecesario.
- **ID ingresos**: `fi-ing-${Date.now()}-${rand}` idempotente por alta; P2 usará `fi-ing-hist-NNN` determinista para idempotencia histórica.
- **Remove paridad**: si `removeEgresoFI` existe, añadir `removeIngresoFI` simétrico; si egresos no permite eliminar, ingresos tampoco (revisar paridad antes).
- **UI ubicación**: `page.tsx` en tab Fondos/Ingresos; reutiliza patrones de `saveEgresoFI`/`saveFondoFI`. Labels asociados + aria-label en selects (lección avance 05-30).
- **Eventos**: `FI_INGRESO_REGISTRADO` categoría FI, en `MAX_EVENTOS` 500.

## Risks / Trade-offs

- [Migración rompe persist] → migrar aditiva, saneo zod, tests de idempotencia.
- [saldoFondo cambia resultados existentes] → default 0, tests de regresión con fixtures existentes.
- [Tests fijados a 26 fallan] → actualizar a 27 en tests que asertan versión.
- [UI sin a11y] → labels htmlFor, aria-label, seguir estándares avance 05-30.
- [Duplicación ingreso manual] → validación monto/concepto/fondo, sin folio secuencial requerido.

## Migration Plan

1. Bump `STORE_VERSION` 26→27.
2. Añadir `IngresoFISchema`, extender `FondoFISchema`, tipos.
3. Añadir colección `ingresosFI` en `CompassData`, `ESQUEMAS_COLECCION`, `seedData`, `partialize`.
4. Acción `registrarIngresoFI` (+ `removeIngresoFI` si paridad).
5. `ContextoSaldoFondo` + `saldoFondo` + actualizar call sites.
6. UI forms + lista.
7. Tests nuevos + actualizar versión en tests existentes.
8. Validar tsc/lint/Vitest/e2e/openspec validate.
9. Commit 27 + nsgc-prepush + push + archive.

Rollback: revert commit; stores en 27 rehidratan con migrate idempotente sin pérdida.

## Open Questions

- ¿`removeIngresoFI` debe existir si `removeEgresoFI` es borrable? Se dejará simétrico si removeEgreso existe; si no, ingresos tampoco (validar en tarea).
