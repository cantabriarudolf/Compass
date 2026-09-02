## 1. Hallazgo P1 — ampliar app-sidebar para comite/mantencion

- [x] 1.1 Actualizar `k0mp4ss_fe/apps/web/components/app-sidebar.tsx`: grupos `Inicio` (+comite,mantencion), `Operaciones` (+mantencion), `Finanzas` (+comite), `Comunidad` (+comite), `Inventario` (+mantencion con granularidad items), `Sistema` (+comite con granularidad items); `Personas` queda admin-only (menor privilegio `mp:propios`) — documentado en design.
- [x] 1.2 Verificar `npx tsc --noEmit` (0) y que sidebar filtra por `roles.includes` sin dejar secciones vacías.

## 2. Infra multi-cuenta (Fase 2)

- [x] 2.1 Parametrizar `k0mp4ss_fe/apps/web/e2e/auth.setup.ts`: función `crearSesion(page,email,archivo)` + iteración sobre 5 cuentas (`admin@test.cl`, `comite@test.cl`, `conserjeria@test.cl`, `residente@test.cl`, `mantencion@test.cl` — `test1234`) guardando `e2e/.auth/<rol>.json`; conservar resiliencia (si `/ingresar` redirige a `/admin`, conservar `storageState`).
- [x] 2.2 Verificar `.gitignore` contiene `k0mp4ss_fe/apps/web/e2e/.auth/` (y `**/e2e/.auth/` ya en web), no duplicar.
- [x] 2.3 Ejecutar `npx playwright test --project setup` y validar que se generan 5 `*.json` (existencia y no vacuidad).

## 3. E2E roles-accesos (Fase 3)

- [x] 3.1 Crear `k0mp4ss_fe/apps/web/e2e/auth/roles-accesos.spec.ts`: `test.use({ storageState })` por rol no-admin; afirmar grupos visibles/ocultos según matriz ampliada (comite 4/8, mantencion 3/8, conserjeria 2/8, residente 4/8) + denegaciones API `GET /api/admin/usuarios?comunidadId=comunidad-a` → 403 (admin 200).
- [x] 3.2 Ejecutar `npx playwright test e2e/auth/roles-accesos.spec.ts` verde (sin `pageerror`).

## 4. E2E roles-journeys — 1 feliz por rol no-admin

- [x] 4.1 Crear `k0mp4ss_fe/apps/web/e2e/crud/roles-journeys.spec.ts` con `test.use storageState` por rol y datos `TEST-*` nuevos (verificar `seedData` en `lib/store.ts` antes de afirmar): conserjeria visita en `/operaciones/bitacora`; residente RA+CT; comite FI/RE lectura; mantencion MT/IR; `expect(errores).toEqual([])` por journey, sin confirmar retiros/pagos seed.
- [x] 4.2 Ejecutar `npx playwright test e2e/crud/roles-journeys.spec.ts` verde.

## 5. Regresión y validación integral

- [x] 5.1 Ejecutar `npx playwright test e2e/auth/roles-menu.spec.ts` (regresión P1 con storageStates/mapping ampliado) verde.
- [x] 5.2 Ejecutar `npx tsc --noEmit` (0), `npm run lint` (0), `npx vitest run` (455/455), `openspec validate --all` (32/32) en verde.
- [x] 5.3 Actualizar `openspec/SERIE-CUENTAS/00-plan.md` fila P2 EN CURSO→HECHA y Bitácora con mapping antes/después, hashes, verificaciones reales.

## 6. Cierre

- [x] 6.1 Commit conventional español + `nsgc-prepush` + push a `origin/main`.
- [ ] 6.2 `openspec archive rp-pruebas-roles` (git status limpio).
