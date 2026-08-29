---
name: pruebas
description: Corre y visualiza las pruebas del proyecto (Vitest unit/integración y E2E Playwright con navegador real). Use when the user asks to "correr pruebas", "ver pruebas", "visualizar pruebas", "mostrar tests", "reporte de tests", "e2e", "vitest", "playwright", "headed", "abrir navegador de pruebas", or wants to watch the E2E browser live or open the HTML test report.
---

# Skill: Pruebas (Vitest + E2E Playwright)

Todas las rutas relativas al repo: `k0mp4ss_fe/apps/web/` (usar `workdir` ahí).

## Decisiones previas (estados, no preguntas)

- **Tipo**: `unit` = Vitest con mocks (rápido, sin navegador). `e2e` = Playwright con Chrome real (levanta `next dev` solo, ~2-4 min). Si el usuario no especifica, preguntar solo si la duda es real; si dice "pruebas" a secas, correr unit y ofrecer e2e.
- **Visualización** (solo aplica a e2e):
  - `--headed` — Chrome se abre VISIBLEMENTE en la máquina del usuario y hace login/navegación solo. Es el "wow" para corroborar el flujo con los propios ojos.
  - `npx playwright test --ui` — debugger interactivo (time-travel, pasos).
  - `npx playwright show-report` — reporte HTML del ÚLTIMO run (pasos, screenshots, videos de fallos).

## Comandos validados

```bash
# UNIT (Vitest)
npx vitest run                                  # suite completa, rápido
npx vitest run test/store-finanzas.test.ts      # un archivo
npx vitest run --coverage                       # como CI (con umbrales)

# E2E (Playwright) — workdir k0mp4ss_fe/apps/web
npx playwright test                             # headless (lo mismo que CI)
npx playwright test --headed                    # VER el navegador en vivo
npx playwright test --headed --slow-mo=800      # en cámara lenta para observar
npx playwright test e2e/smoke/modulos.spec.ts   # solo smoke de módulos
npx playwright test --ui                        # debugger interactivo
npx playwright show-report                      # reporte HTML del último run
```

## Advertencias obligatorias

1. **NUNCA correr `e2e/auth/rate-limit.spec.ts` local sin permiso explícito**: bloquea la IP 15 minutos (rate limit persistente SG D-v). Solo corre con `E2E_RATE_LIMIT=1` y en CI aislado (job propio del workflow).
2. `--headed` y `show-report` son comandos que **quedan vivos**: correrlos con timeout generoso y avisar al usuario que la sesión queda abierta hasta que la cierre. Para `show-report`, lanzar en background (`nohup ... &`) y dar la URL `http://localhost:9323`, indicando cómo detenerlo.
3. Si hay un `next dev` propio del usuario corriendo en :3000, Playwright lo reutiliza (`reuseExistingServer`) — no matarlo.
4. Video/screenshot de fallos quedan en `test-results/`; el snapshot de error útil es `test-results/**/error-context.md`.

## Formato de reporte al usuario

Tras correr, resumir en 2-4 líneas: total passed/failed/skipped, duración, y si hubo fallos: archivo + test + causa raíz (leer el `error-context.md` del fallo antes de diagnosticar). Con fallos, proponer fix (no arreglar sin confirmación salvo que sea obvio y de una línea).

## Mapa de la suite

- `test/` — 38 archivos / 413 tests Vitest (stores, auth, seguridad, migraciones). Lane de unidad/integración con mocks.
- `e2e/` — Playwright: `auth.setup.ts` (login real 1 vez → storageState compartido), `auth/ingresar.spec.ts` (3 flujos), `smoke/modulos.spec.ts` (8 módulos, 0 pageerror), `auth/rate-limit.spec.ts` (GATED).
- CI (`.github/workflows/ci.yml`): jobs `unit`, `e2e` (build producción, Node 24), `e2e-rate-limit` (aislado). Corrida de referencia: verde 3/3.
- Contexto de decisiones: `Data/NSGC/docs/avances/avance - 2026-08-28 12-52.md` (por qué Playwright y no Cypress/TestSprite).
