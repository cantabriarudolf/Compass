# Design: dev-rtl-msw (B4)

## Context
Serie Plataforma P1 cubre el hallazgo TST-003-UI del consolidado 2026-08-24-b. Existe `lib/auth.ts:1`, `app/ingresar/page.tsx:1`, `app/api/auth/{login,session,logout}/route.ts` y `lib/store.ts:useStoreRehydrated` sin tests RTL. `vitest.config.ts:11` ya usa `jsdom` y `setupFiles: ["./test/setup.ts"]` pero el setup solo limpia `localStorage`. No hay MSW ni jest-dom matchers. Los thresholds vigentes (`k0mp4ss_fe/apps/web/vitest.config.ts:22`) miden solo `lib/store.ts` y no deben romperse.

## Goals / Non-Goals
**Goals:**
- Cobertura crítica de sesión con RTL+MSW sin degradar cobertura global (`94.1/78.35/94.8/94.1` actual, 311 tests).
- Mantener `STORE_VERSION=25` sin cambios de esquema.

**Non-Goals:**
- 80% global de UI en esta ventana (se deja gap documentado para P2+).
- Authz/B3, Prisma, CSP — quedan en P2-P7.
- Tests E2E Playwright (RTL ciñe §3/B4).

## Decisions
- **RTL + userEvent + jest-dom/vitest**: estándar indicado en el prompt. Alternativa Enzyme descartada (obsoleta). `userEvent.setup()` por test, queries por `role/label` (no `container.querySelector`).
- **MSW 2 (http, HttpResponse, setupServer) en setup.ts + helpers por test**: capa de red idéntica a prod. `onUnhandledRequest: 'error'` para fallar si queda fetch sin mock. Handlers default vacíos, cada test hace `server.use(http.post('/api/auth/login', ...))`. Alternativa `vi.mock('next/navigation')` sigue necesaria para `router.push` (no hay servidor Next en jsdom).
- **setup.ts** importa `@testing-library/jest-dom/vitest` (inyecta matchers `toBeInTheDocument` etc sin interferir con `globals:false`). `beforeAll(listen) / afterEach(reset) / afterAll(close)` según skill.
- **Mock de next/navigation** via `vi.mock('next/navigation', () => ({ useRouter:..., useSearchParams:... }))`. No usar `MemoryRouter` porque el page es App Router.
- **Coverage**: mantener `include: ["lib/store.ts"]` y `thresholds` actuales. No añadir `app/**` a coverage.include (rompería threshold al medir UI sin alcanzar 80%). Dejar constancia: P2+ abrirá `include: ["lib/**","app/**","components/**"]` y fijará thresholds UI `branches>=70, lines>=80` una vez haya masa crítica. Diseño documenta gap.
- **Ubicación tests**: `k0mp4ss_fe/apps/web/test/auth/` (mismo `include` que `test/**/*.test.{ts,tsx}`) separado por dominio: `lib-auth.test.ts`, `ingresar-page.test.tsx`, `api-auth.test.ts` (usa `next/server` real + env), `use-store-rehydrated.test.tsx`. Deseable: `components/persona-form.test.tsx` si alcanza tiempo.

## Risks / Trade-offs
- [MSW no intercepta `next/server` en route handlers] → Mitigación: tests de rutas invocan handlers directamente, no MSW; MSW solo para `/ingresar` (fetch).
- [jsdom sin layout] → No probar estilos; validar comportamiento accesible.
- [Flaky por `localStorage` compartido] → `beforeEach(()=>localStorage.clear())` ya existe, reutilizar `resetStore`.
- [Version drift msw 2.14 vs 2.15] → fijar `^2.15.0` en web/package.json; ambos compatibles con `setupServer`.

## Migration Plan
1. `npm --prefix k0mp4ss_fe install` ya hecho (ver propuesta).
2. Actualizar `vitest.config.ts` si falta `jsdom` → ya OK, solo asegurar `setupFiles` apunta a `./test/setup.ts`.
3. Ampliar `test/setup.ts` con jest-dom + MSW server base.
4. Añadir suites bajo `test/auth/` + hook test. Validar `npm test` sigue 311+ nuevos verdes y thresholds OK.
5. `openspec validate --all --strict` verde.

## Open Questions
- Ninguna bloqueante. Si queda capacidad, ¿cuál formulario representa mejor validación compartida? Respuesta: `Persona` (`MP`) por RG de RUT + validación D1 media por referencia.

## Gap tras P1 y plan de crecimiento
- Actual (pre-P1): `include=["lib/store.ts"]` thresholds `90/75/85/90` solo para store (real 94.1/78.35/94.8).
- Post-P1: mantener mismos thresholds/include. UI medida ad-hoc (este change añade ~8-12 tests UI) pero no gateada por threshold para no romper pipeline. Próximas ventanas: cuando P4/P5 toquen UI nueva, abrir coverage a `app/**, components/**` y subir thresholds progresivos `lines 80, branches 70, statements 80` según skill.
