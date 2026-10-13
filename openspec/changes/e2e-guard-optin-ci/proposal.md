# Proposal: e2e-guard-optin-ci

## Problema
El CI del PR #1 (run 38396862941) tiene el job "E2E Playwright (build producción)" rojo de
forma determinista (3/3 intentos): `e2e/crud/poblado-idempotente.spec.ts:84` no ve
`getByText(/TEST-\* limpio correctamente/)` dentro de los 120 s estrictos. Causa raíz: la
lane sirve el build de producción (`playwright.config.ts` webServer CI = `npm run start` →
`NODE_ENV=production`), e `isWriteApiEnabled()` (`lib/env-guard.ts`) exige
`NODE_ENV=development|test`; con el guard apagado, `limpiar()` (`app/admin/qa-lab/page.tsx`)
cae al fallback O(n) por entidad (una request HTTP por lote), y en el runner supera los
120 s. En dev el guard está ON y el endpoint bulk `POST /api/qa-lab/purga-test` (change
`qlab-purga-bulk`) hace 1 request (~4 s). El build de CI ya setea
`NEXT_PUBLIC_APP_ENV=development` precisamente para intentar habilitar las APIs, pero desde
el endurecimiento de SERIE-PRODUCCION P2 eso ya no basta: el candado `NODE_ENV` corta.

## Propuesta
1. Opt-in explícito `E2E_ALLOW_WRITE_APIS=1` en `isWriteApiEnabled()` con **doble candado**:
   solo habilita escrituras si además `getAppEnv() === "development"`. Producción/Vercel
   queda igual que hoy: un deploy con `NEXT_PUBLIC_APP_ENV=production` sigue bloqueado
   aunque el opt-in esté seteado.
2. Cablear el opt-in SOLO en el env del job `e2e` de `.github/workflows/ci.yml` (con
   comentario que explique que es exclusivo de la lane de pruebas y por qué).
3. Tests TDD `test/env-guard.test.ts`: opt-in + `NODE_ENV=production` +
   `NEXT_PUBLIC_APP_ENV=development` → true; sin opt-in → false (hoy); opt-in +
   `NEXT_PUBLIC_APP_ENV=production` → false; `NODE_ENV=development` sin cambios → true.
4. Documentar el opt-in en `docs/runbook-operaciones.md`: es solo para el entorno de
   pruebas/e2e; producción no debe setearlo.

## No-objetivos
- Cambiar el comportamiento en producción/Vercel (sigue bloqueado con o sin opt-in si el
  entorno efectivo es producción).
- Cablear el opt-in en otros jobs de CI (`e2e-rate-limit`, `unit`) ni en `.env.example`
  como default recomendado.
- Archivar el change en esta unidad (lo decide el owner; el archive aplica el delta a
  `openspec/specs/SG-hardening-despliegue/spec.md`).
