# Proposal: dev-rtl-msw — Cobertura UI flujo auth con RTL+MSW (B4)

## Why
El consolidado §3/B4 exige cobertura del flujo de sesión (página /ingresar, login/logout, /api/auth/session, proxy) y de `lib/auth.ts` antes de seguir con Prisma/Auth.js. Hoy no hay tests de componentes ni MSW instalado; riesgo de regresión en el único gate de seguridad pre-BD.

## What Changes
- **BREAKING**: No — solo test + tooling dev.
- Instalar devDeps `@testing-library/react`, `@testing-library/user-event`, `@testing-library/jest-dom`, `msw` y asegurar `vitest.config.ts` con `environment: jsdom` + `setupFiles: ["./test/setup.ts"]`.
- Añadir delta a capability `DEV-qa-lab`: requisito ADDED que garantiza cobertura UI del flujo de sesión y hooks compartidos con RTL+MSW (umbrales UI documentados, sin romper thresholds globales existentes).
- Tests obligatorios con RTL + MSW:
  - `app/ingresar/page.tsx`: validaciones, login exitoso (MSW POST /api/auth/login → cookie), login fallido (error visible), respeto de `?next=` safe vs externo, estados loading.
  - `app/api/auth/session` + `logout`: contrato JSON y borrado de cookie.
  - `hooks` compartido: `lib/store.ts:useStoreRehydrated` (hidratación, `hasHydrated`).
  - Unitario `lib/auth.ts`: `verificarToken` (expirado/firma inválida), `credencialesValidas`, `excedeIntentos`/`registrarFallo`.
- Tests deseables (si contexto alcanza): 1–2 componentes compartidos representativos (formulario persona con validación).
- `test/setup.ts`: import `jest-dom`, cleanup, eventual `server` MSW con `onUnhandledRequest: 'error'`.
- Ajustar `vitest.config.ts` thresholds UI solo si no rompen cobertura global existente; en caso contrario documentar en `design.md` el gap y plan de crecimiento.

## Capabilities
### New Capabilities
(none)

### Modified Capabilities
- `DEV-qa-lab`: nuevo requisito ADDED de cobertura UI del flujo de sesión y hooks con RTL+MSW.

## Impact
- `k0mp4ss_fe/apps/web/{vitest.config.ts,test/setup.ts,package.json,pnpm-lock}` — tooling de test.
- `k0mp4ss_fe/apps/web/{app/ingresar, app/api/auth, lib/auth, lib/store, hooks, components}` — bajo test (sin cambio funcional esperado salvo fix de bugs hallados).
- `openspec/specs/DEV-qa-lab/spec.md` — nuevo requisito al archivar.
- Sin bump de `STORE_VERSION` (no hay cambio de esquema).
