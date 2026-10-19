# Tasks: e2e-rojos-flujo-a11y-smoke

- [x] Change `e2e-rojos-flujo-a11y-smoke` (proposal + tasks)
- [x] ARRANQUE: reseed P1/P2 + lane `e2e/crud` no-GATED (40 pass / 4 failcon causa)
- [x] Fix TDZ `editandoProvId` en `app/operaciones/proveedores/page.tsx`
  (useState declarado DESPUÉS de su uso en `rutProvDuplicado`: crasheaba al
  tipear RUT con lista no-vacía; latente porque con lista vacía `.some()` no
  ejecuta el callback). Test: e2e proveedores en verde.
- [x] Fix banner cookies en `e2e/auth.setup.ts` (click pre-hidratación se
  perdía, flag no persistía en storageState, banner tapaba triggers al fondo
  → dropdown B de permisos nunca abría). Ahora verifica el flag con reintento.
  Test: e2e permisos en verde (15s).
- [x] Fix `e2e/crud/permisos.spec.ts` paso 5 (evaluate-click + reintento,
  espejo del paso 3) + higiene BD `scripts/higiene-qa-test.mjs` (`e2e:higiene`):
  el backup P3 trae leftovers TEST (solicitudes abría detalle de fila stale).
- [ ] Fix `e2e/crud/roles-journeys.spec.ts` conserjería (re-activar tab Visitas
  + re-fill ante re-mount por skeleton `cargandoAPI`) — EN VERIFICACIÓN
- [ ] Triage poblamiento ×2 + fix (independizar de QA-Lab, datos TEST propios)
- [ ] Triage flujo/personas + fix (determinismo + cleanup)
- [ ] Re-chequeo a11y ×2 + smoke-mobile (fix mínimo solo si violación real)
- [ ] Verde: lanes `e2e/flujo` + `e2e/a11y` + `e2e/smoke` en una corrida + tsc 0 + lint 0 + validate OK
- [ ] Commit + fila P3 y Bitácora en `00-plan.md` de la serie
