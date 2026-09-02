## Why

Fase 1 dejó el menú filtrado por unión de roles pero `comite`/`mantencion` siguen viendo 0/8 grupos y no existe verificación E2E por cuenta (solo admin). Sin infra multi-cuenta ni journeys por rol, la matriz RP no se prueba en navegador real ni se cubren denegaciones server-side — el plan de pruebas no demuestra menor privilegio por rol.

## What Changes

- **Infra multi-cuenta**: `e2e/auth.setup.ts` parametrizado para 5 roles (admin/comite/conserjeria/residente/mantencion) con `PASSWORD_TEST=test1234`, guarda `e2e/.auth/<rol>.json`; `.gitignore` ya cubre `e2e/.auth/`; patrón `test.use({storageState})` por spec sin crear 5 proyectos en `playwright.config.ts`.
- **Hallazgo heredado P1**: `components/app-sidebar.tsx` declara `comite`/`mantencion` en grupos/items según `lib/authz.ts` MATRIZ (Finanzas→comite, Sistema/RE→comite, Inventario/MT→mantencion, Personas decide menor privilegio) y filtra con granularidad por items.
- **Verificación por rol**: `e2e/auth/roles-accesos.spec.ts` afirma menú permitido/oculto + denegaciones API (`GET /api/admin/usuarios?comunidadId=comunidad-a` → 403) por rol no-admin con `storageState`.
- **Journeys felices**: `e2e/crud/roles-journeys.spec.ts` 1 journey por rol no-admin con datos `TEST-*` sin contaminar seed (conserjeria: bitácora visita; residente: RA+CT; comite: FI/RE lectura; mantencion: MT/IR), `expect(errores).toEqual([])`.

## Capabilities

### New Capabilities
- (ninguna nueva; se amplía verificación existente)

### Modified Capabilities
- `RP-roles-permisos`: ADDED Requirement "Verificación E2E por cuenta" — el plan de pruebas incluye login y journeys reales por cada rol estándar, afirmando accesos permitidos y denegaciones; las guardas server-side son la verdad.
- `UI-navegacion-lateral`: amplía matriz rol×grupos/items para `comite` (Finanzas,Sistema,Comunidad) y `mantencion` (Inventario,Operaciones/Inventario) según MATRIZ; documenta mapping antes/después en design.

## Impact

- Código: `k0mp4ss_fe/apps/web/e2e/auth.setup.ts`, `e2e/auth/roles-accesos.spec.ts`, `e2e/crud/roles-journeys.spec.ts`, `components/app-sidebar.tsx`, `app/layout.tsx` (sin cambios), `playwright.config.ts` (doc patrón sin nuevo proyecto).
- Tests: `npx playwright test auth/roles-accesos + crud/roles-journeys + auth/roles-menu (regresión)` verdes; `npx vitest run` 455/455 sin regresión.
- Seguridad: sin cambios — guardas `puede()` intactas.
