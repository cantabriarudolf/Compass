## Why

El motor ABAC `puedeContextual()` ya existe (P4) pero es invisible para operadores: la matriz RBAC en `/admin/permisos` no muestra qué recursos tienen refinamiento contextual ni su condición legible. Hacerlo visible cierra la auditoría del modelo de permisos completo sin exponer datos de usuarios.

## What Changes

- Añade helper puro `reglasContextuales(): EntradaABAC[]` en `lib/authz.ts` derivado del código de `puedeContextual` (constante de módulo, como `matrizPermisos()`), con snapshot completo de reglas ABAC del sistema (incluidas las 3 inline no migradas en P4).
- Añade sección read-only "Permisos contextuales (ABAC)" en `app/admin/permisos/page.tsx` entre la matriz RBAC y membresías: por rol, recurso + condición legible (badge) + descripción + dónde se aplica (badge "motor" / "check local"). Mantiene badge "solo lectura" y cero mutaciones.
- Amplía `lib/authz.test.ts` con suite `reglasContextuales()` (≥6 asserts: reglas por rol, condiciones legibles, donde).
- Amplía `e2e/crud/permisos.spec.ts` con sección ABAC (heading + ≥3 reglas visibles + 0 pageerror, sin mutaciones).

## Capabilities

### New Capabilities
- (ninguna)

### Modified Capabilities
- `RP-roles-permisos`: ADDED requirement "Matriz Contextual visible" — `/admin/permisos` MUST mostrar las reglas ABAC por rol con condición legible y read-only, reflejando el snapshot de `lib/authz.ts` (`reglasContextuales()`); MUST mantener modo solo lectura.

## Impact

- Código: `k0mp4ss_fe/apps/web/lib/authz.ts`, `k0mp4ss_fe/apps/web/app/admin/permisos/page.tsx`, `k0mp4ss_fe/apps/web/lib/authz.test.ts`, `k0mp4ss_fe/apps/web/e2e/crud/permisos.spec.ts`, `openspec/specs/RP-roles-permisos/spec.md` (delta).
- Validación: `npx tsc --noEmit` 0, `npm run lint` 0 errores, `npx vitest run` 447 + nuevos, `npx playwright test e2e/crud/permisos.spec.ts` verde, `openspec validate --all` passed.
- Riesgo: desincronización vista vs motor — mitigado al derivar `reglasContextuales()` del mismo código que `puedeContextual` (nunca datos duros en la vista).
