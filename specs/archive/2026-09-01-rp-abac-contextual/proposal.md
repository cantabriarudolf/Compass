## Why

El motor RBAC puro `puede()` no modela los refinamientos contextuales hoy hardcodeados inline (vínculo vigente persona-unidad, privacidad `controlesPropiedad`, identidad propia). Formalizarlos como ABAC puro y testeable en `lib/authz.ts` permite auditar decisiones, documentar la matriz contextual y evitar regresiones, sin cambiar comportamiento actual (paridad 1:1).

## What Changes

- Añade `ContextoABAC` y `puedeContextual(rol, accion, recurso, contexto)` en `lib/authz.ts`: `puede()` base + refinamiento ABAC para recursos granulares (`:propios`, `:propia`, `:residencia`, `:al_dia`, privacidad). Recursos sin dimensión contextual delegan directo a `puede()`.
- Inventaría y documenta (design.md) cada check inline actual con archivo:línea y lógica actual antes de implementar la función.
- Migra los checks inline localizados a `puedeContextual()` donde es seguro sin cambio de comportamiento; los no migrables quedan inline con justificación en Bitácora.
- Añade ≥12 asserts de paridad en `lib/authz.test.ts` (o `puede-contextual.test.ts`) que reproducen la lógica antigua (propietario sí/de otra unidad no, conserje sin ficha, residente con morosidad oculta, etc.).

## Capabilities

### New Capabilities
- (ninguna — se extiende capability existente)

### Modified Capabilities
- `RP-roles-permisos`: ADDED requirement "Permisos Contextuales (ABAC)" — el sistema evalúa permisos con contexto (`puedeContextual(rol, accion, recurso, contexto)` donde contexto incluye `personaId`, `unidadId`, `unidadIdsVinculadas` y `privacidad`); MUST preservar menor privilegio y paridad 1:1 con decisiones actuales; la migración de checks no cambia decisiones.

## Impact

- Código: `k0mp4ss_fe/apps/web/lib/authz.ts`, `k0mp4ss_fe/apps/web/lib/authz.test.ts`, páginas/store con checks inline (migración puntual), `openspec/specs/RP-roles-permisos/spec.md` (delta).
- APIs/sistemas: ninguno externo; validación: `tsc --noEmit` 0, `lint` 0, `vitest run` (435 + nuevos), `openspec validate --all`, `playwright test e2e/crud/permisos.spec.ts` sin rotura.
- Riesgo: regresión si `puedeContextual` refina de más o de menos; mitigado con paridad testeada y regla behavior-preserving (si test existente falla, la migración está mal).
