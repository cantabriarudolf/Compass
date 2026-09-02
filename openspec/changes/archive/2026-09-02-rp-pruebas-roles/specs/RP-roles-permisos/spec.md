## ADDED Requirements

### Requirement: Verificación E2E por cuenta

El plan de pruebas MUST incluir login y journeys reales por cada rol estándar, afirmando accesos permitidos y denegaciones contra las guardas server-side como fuente de verdad. La infraestructura multi-cuenta loguea los 5 roles del seed (`admin@test.cl`, `comite@test.cl`, `conserjeria@test.cl`, `residente@test.cl`, `mantencion@test.cl` — `PASSWORD_TEST=test1234`) a `e2e/.auth/<rol>.json`; los specs eligen cuenta con `test.use({ storageState: "e2e/.auth/<rol>.json" })` sin crear 5 proyectos en `playwright.config.ts`.

#### Scenario: Infra multi-cuenta genera storageStages por rol

- **WHEN** se ejecuta `npx playwright test --project setup` (auth.setup parametriizado)
- **THEN** el sistema MUST producir `e2e/.auth/admin.json`, `comite.json`, `conserjeria.json`, `residente.json`, `mantencion.json` con cookies válidas y MUST excluirlos del repo vía `k0mp4ss_fe/apps/web/e2e/.auth/` en `.gitignore`.

#### Scenario: Matriz rol×accesos verificada con storageState

- **WHEN** se ejecuta `e2e/auth/roles-accesos.spec.ts` con `test.use({ storageState: "e2e/.auth/<rol>.json" })` para cada rol no-admin (`comite`, `conserjeria`, `residente`, `mantencion`)
- **THEN** MUST afirmar grupos visibles/ocultos del sidebar según la matriz ampliada (Intersección declarada vs unión de membresías) y MUST afirmar denegaciones server-side reales vía `fetch("/api/admin/usuarios?comunidadId=comunidad-a")` → `403` para roles sin `admin:usuarios` (`comite`, `residente`, `conserjeria`, `mantencion`), mientras `admin@test.cl` recibe `200`.

#### Scenario: Journeys felices por rol no-admin

- **WHEN** se ejecuta `e2e/crud/roles-journeys.spec.ts` con el `storageState` correspondiente
- **THEN** cada rol MUST completar 1 journey feliz contra datos del seed verificados y sin contaminar suites existentes (entidades `TEST-*` nuevas, sin confirmar retiros/pagos del seed): `conserjeria` registra visita en `/operaciones/bitacora`; `residente` crea reserva RA y solicita certificado CT de su unidad; `comite` lista Finanzas/Sistema sin errores y no puede crear gasto; `mantencion` ve MT y registra incidente IR si el store lo permite — cada test MUST finalizar con `expect(errores).toEqual([])`.

#### Scenario: Regresión del menú con storageStates

- **WHEN** se ejecuta `e2e/auth/roles-menu.spec.ts` tras la ampliación de `data.navMain`
- **THEN** MUST seguir verde con la matriz ampliada (`comite` 4/8, `mantencion` 3/8, `conserjeria` 3/8, `residente` 4/8, `administrador` 8/8) y granularidad de items (`Remuneraciones:["administrador"]` oculto para no-admin; `Recursos y EPP`/`Mantenimiento` visibles para `mantencion`).

