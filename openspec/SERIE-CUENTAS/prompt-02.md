> **Este archivo ES tu prompt.** Ventana 2 de la serie **cuentas**. Lee
> `openspec/SERIE-CUENTAS/00-plan.md` (ARRANQUE + base de hechos) y verifica en la Bitácora
> que P1 esté HECHA (git); si no, detente y repórtalo.

## Alcance P2 — Fase 2 (infra multi-cuenta) + Fase 3 (accesos por rol + journeys)

### Fase 2 — infra multi-cuenta

1. **`e2e/auth.setup.ts`** parametrizado: función `crearSesion(page, email, archivo)` —
   para cada uno de los 5 roles del seed (admin@test.cl, comite@test.cl, conserjeria@test.cl,
   residente@test.cl, mantencion@test.cl — password `test1234`): login real por form →
   guardar `e2e/.auth/<rol>.json`. Conservar la resiliencia actual (si sesión vigente
   redirige, conservar storageState). Si un rol ya tiene storageState vigente, saltar su
   login (patrón actual de detección con waitFor).
2. **`.gitignore`**: añadir `k0mp4ss_fe/apps/web/e2e/.auth/` (cookies de sesión — nunca
   commitear).
3. **Patrón de uso**: en los specs por rol, `test.use({ storageState: "e2e/.auth/residente.json" })`
   (patrón Playwright multi-auth). NO crear 5 proyectos en la config (mantener 1 chromium):
   la elección de cuenta es por spec. Documenta el patrón en el design.md del change.

### Fase 3 — change `rp-pruebas-roles` (accesos por rol + journeys)

1. **openspec-propose** `rp-pruebas-roles`: capability `RP-roles-permisos` (delta ADDED
   requirement "Verificación E2E por cuenta": el plan de pruebas incluye login y journeys
   reales por cada rol estándar, afirmando accesos permitidos y denegaciones — las guardas
   server-side son la verdad). (Infra de verificación: si prefieres sin change, documéntalo
   en la Bitácora como las series anteriores — decide y anota.)
2. **`e2e/auth/roles-accesos.spec.ts`**: por rol no-admin (comite, conserjeria, residente,
   mantencion), afirmar:
   - Menú sin los grupos prohibidos (continuidad de P1, ahora con storageState).
   - Denegaciones server-side reales vía API client-side: ej. como comite,
     `fetch("/api/admin/usuarios?comunidadId=comunidad-a")` → 403 (con sesión); como
     residente, ídem. (La página puede renderizar — la verdad de los datos es la API.)
3. **`e2e/crud/roles-journeys.spec.ts`**: 1 journey feliz por rol no-admin, con `test.use`
   del storageState correspondiente y datos del seed verificados ANTES de afirmar (lee
   `lib/store.ts seedData` y el QA Lab si necesitas datos gated — evita gated salvo que el
   journey lo exija):
   - **conserjeria**: registrar visita (panel de `/operaciones/bitacora` o `/operaciones/
     accesos`) → fila visible; cierre de turno visible (no ejecutar si muta estado global
     del seed — decide según código).
   - **residente**: crear reserva de amenity (RA) → fila; solicitar certificado de su
     unidad (CT) → registro en historial; NO ve FI en menú.
   - **comite**: ve FI (balance/Centro de Mando RE) sin errores; NO puede crear gasto
     (verifica qué muestra la UI — botón ausente o acción denegada).
   - **mantencion**: ve MT (tareas) + puede registrar incidente (si el form lo permite como
     mantencion — verifica en el código, quizá es admin-only: si el store lo deniega,
     afirma la denegación).
   - Cada journey: `expect(errores).toEqual([])`.
4. Los journeys NO deben contaminar suites existentes: usa entidades TEST-* nuevas y no
   confirmes retiros/pagos de datos del seed.

## Verificación

`npx tsc --noEmit` (0) · `npm run lint` (0 errores) · `npx vitest run` (455/455 REAL) ·
`npx playwright test auth/roles-accesos.spec.ts` + `crud/roles-journeys.spec.ts` +
`auth/roles-menu.spec.ts` (regresión P1 con storageStates) verdes · `openspec validate
--all` · commit · nsgc-prepush · push · archive (git status limpio) · Bitácora P2 HECHA
con hash.
