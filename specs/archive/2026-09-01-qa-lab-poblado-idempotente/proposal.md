# Proposal: qa-lab-poblado-idempotente — Guard QA Lab idempotente con confirmación

## Why

El guard clean-first de `app/admin/qa-lab/page.tsx` bloquea la segunda corrida de "Poblar todo de una vez" cuando existen datos TEST-* con un error. Para flujo QA diario el owner quiere idempotencia desde la UI sin tocar `lib/store.ts`: al detectar TEST-* el botón debe ofrecer "Limpiar y poblar de una vez" via confirmación, ejecutando `limpiar()` + `runFase("todo")` automáticamente.

## What Changes

- **BREAKING**: No.
- El `runFase` en `k0mp4ss_fe/apps/web/app/admin/qa-lab/page.tsx` deja de abortar con `setMsg("Existen datos TEST-*...")`: al detectar `tieneDatosTest(...)` abre `Dialog` de confirmación con mensaje "Existen datos TEST-* — ¿Limpiar y poblar de una vez?" y botones "Limpiar y poblar" y "Cancelar".
- Al confirmar: ejecuta la misma secuencia de `limpiar()` (incluido esperar "TEST-* limpio correctamente") y luego `runFase("todo")` reutilizando funciones existentes. Al cancelar: no muta nada y cierra el dialog.
- Sin datos TEST-*: comportamiento intacto (pobla directo, sin dialog).
- Nuevo e2e `k0mp4ss_fe/apps/web/e2e/crud/poblado-idempotente.spec.ts` que valida idempotencia: poblar → dialog → confirmar → limpiar+poblar con 22/22 fases 🟢 y cancelar no muta.
- No se toca `k0mp4ss_fe/apps/web/lib/store.ts` ni `STORE_VERSION`.

## Capabilities

### New Capabilities
(none)

### Modified Capabilities
- `DEV-qa-lab`: ADDED requirement "Poblado idempotente" — idempotencia UI del poblado completo via confirmación de limpiar+poblar cuando existen datos TEST-*.

## Impact

- `k0mp4ss_fe/apps/web/app/admin/qa-lab/page.tsx` — guard → dialog confirmación + orquestación limpiar+poblar.
- `k0mp4ss_fe/apps/web/e2e/crud/poblado-idempotente.spec.ts` — nuevo spec e2e de idempotencia.
- `openspec/specs/DEV-qa-lab/spec.md` — delta ADDED al archivar.
- Sin cambios en `lib/store.ts`, sin bump de `STORE_VERSION`, sin migraciones.
- Suites existentes `e2e/flujo/poblamiento.spec.ts` y `e2e/flujo/ciclo.spec.ts` siguen válidas (flujo limpiar→poblar explícito no toca el dialog cuando no hay TEST-*).
