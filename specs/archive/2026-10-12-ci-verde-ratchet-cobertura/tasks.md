# Tasks: ci-verde-ratchet-cobertura

## Fase 1 — Evidencia y reproducción

- [x] 1.1 Leer el log del run rojo (`38270687511`): los dos jobs de Vitest reportan
      **944/944 tests verdes** y sólo mueren por `ERROR: Coverage … does not meet global
      threshold`. Los `[auth][error] crypto.getRandomValues` son stderr de
      `test/proxy.nonce.test.ts` (parchea `globalThis.crypto` a propósito), no una falla.
- [x] 1.2 Reproducir en local (`npm test`): mismo resultado exacto que CI — 96 archivos,
      944/944 verdes, cobertura 80.93/72.87/87.69/80.93. **No hay diferencia de entorno.**
- [x] 1.3 Rastrear la historia del gate: `5948e0e` (2026-09-09) extendió `coverage.include` a 7
      `lib/*` + `app/api/**/route.ts`; el 2026-09-12 el job pasaba raspando (90.63 global) y
      después el crecimiento de `store.ts` y de la superficie API lo dejó inalcanzable.

## Fase 2 — Cobertura (subir el piso, no bajarlo)

- [x] 2.1 Smoke de guardias para las 19 rutas a 0%: `test/api/route-guard-smoke.test.ts`
      (23 tests) — 401 sin sesión antes de Prisma en 16 `[id]`, 204/200 en `csp-report`,
      404/401 en los guards de `qa-*` según `isWriteApiEnabled()`.
- [x] 2.2 Medir el efecto: `app/api/**` **73.09 → 79.40**; rutas a 0% **19 → 0**; global
      **80.93 → 83.79**; suite **944 → 967** tests.
- [x] 2.3 Ratchet por área en `vitest.config.ts`: global 82/72/87/82 · `lib/**` 86/78/94/86 ·
      `app/api/**` 78/63/82/78, con la fecha y el criterio (`medido − 1 pt`) documentados.
- [x] 2.4 Gate (evidencia del verificador): `npm test` → 967/967, `ERROR: Coverage` = 0,
      exit 0; `npx tsc --noEmit` → 0 errores con los thresholds tipados.

## Fase 3 — Infra del workflow

- [x] 3.1 `deploy` condicional a secrets: step que publica `present=true|false` +
      `::warning title=Deploy omitido::…` cuando falta `VERCEL_TOKEN`; los steps de Vercel corren
      sólo con secrets presentes.
- [x] 3.2 Actions al día y pinneadas: `checkout@v7.0.1`, `setup-node@v7.1.0`,
      `upload-artifact@v7.0.2` por SHA + `persist-credentials: false`; `permissions: contents: read`.
- [x] 3.3 `vercel@59.16.0` fijo (no `latest`); `.nvmrc` = `24`; `engines.node` `>=24`.

## Fase 3.5 — Lane e2e (reactivada: llevaba un mes sin correr)

- [x] 3.4 `/api/health` y `/api/csp-report` a `RUTAS_PUBLICAS` (401 → 200) con rate limit
      60 POST/min/IP en el sink + 8 tests nuevos (`test/api/csp-report.test.ts`, `test/auth/proxy.test.ts`).
- [x] 3.5 Familia CSP e2e consolidada: 4 specs que abortaban la lane en carga (y `csp-rollback`
      con `expect(true).toBe(true)`) → `e2e/csp-modos.spec.ts` mode-aware + `csp-report-endpoint.spec.ts`.
- [x] 3.6 Jobs `e2e` y `e2e-rate-limit` con `--schema=prisma/schema.sqlite.prisma` (corrían el
      schema PostgreSQL contra `file:./dev.db` → `P1012`; nunca se vio porque el job no corría).
- [x] 3.7 Tres specs flaky/rotos arreglados con evidencia en BD: `rate-limit` (contraseña que no
      pasaba la política → nunca registraba intentos), `visor` (re-submit duplicaba avisos en BD),
      `logs` (Radix Select no abre con `force:true`), `ciclo` (timeout de limpieza 30s → 120s).
- [x] 3.8 Lane completa medida en local con BD fresca (paridad CI): **99/104 verdes** y los 3
      fallos restantes eran exactamente 3.7, ya verdes en la re-corrida dirigida.

## Fase 4 — Cierre

- [x] 4.1 Node local al día: `nvm install 24.21.0` (LTS Krypton) + `nvm alias default 24`.
- [ ] 4.2 NSGC: avance de la sesión + nota en `runbook-operaciones.md` / `README-DEPLOY.md` sobre
      el deploy condicional.
- [ ] 4.3 Commit (`ci:`/`test:`) + push y vigilar el run hasta verde **completo** (unit,
      unit-pg, e2e, e2e-rate-limit, deploy).
- [ ] 4.4 Archivar `qlab-poblamiento-api-rest` (su 3.5 dependía de este CI verde).

## Pendientes para una ventana nueva (no bloquean este change)

- [ ] 5.0 **Barrido del patrón de re-submit** en los CRUD specs (varios usan "re-submitir
      mientras el dialog siga visible", que puede duplicar filas como en `visor`): extraer un
      helper compartido `e2e/helpers/form-dialog.ts` y migrarlos.

- [ ] 5.1 **`lib/store.ts`** (1.202 statements sin cubrir, 84.21%). Change `store-cobertura-fase-b`.
- [ ] 5.2 **Superficie API** (2.114 statements sin cubrir, 79.40%): change `api-cobertura-fases`
      empezando por `app/api/personas` (70.54%), `app/api/unidades`, `app/api/vinculos`.
- [ ] 5.3 **`e2e-rate-limit`** rojo desde el 2026-09-12: reproducir con
      `E2E_RATE_LIMIT=1 npx playwright test e2e/auth/rate-limit.spec.ts`.
- [ ] 5.4 **Secrets de Vercel** (owner): cargar los 3 y verificar que `deploy` pasa a ejecutarse.
- [ ] 5.5 **npm local** 12.2.0 vs 11.19 de CI: alinear con `nvm install 24.21.0`.
- [ ] 5.6 (Opcional) `npx tsc --noEmit` también en el job `unit-pg`.
