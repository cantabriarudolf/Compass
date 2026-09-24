---
name: test-catalogo
description: "Trigger: qué tests hay, qué pruebas tengo, inventario de tests, qué corro, cuánto tarda, qué miro. Informa a Ricardo el catálogo de pruebas: cantidades, para qué sirve cada tipo, costo en tokens, tiempo estimado y qué requiere revisión visual."
license: Apache-2.0
metadata:
  author: gentleman-programming
  version: "1.0"
---

## Activation Contract

Use when the owner asks what tests exist, what to run, how long it takes, or what needs visual review. Read-only: never execute suites here unless explicitly asked.

## Procedure

1. Count without running: `grep` scripts in `k0mp4ss_fe/apps/web/package.json`, list `e2e/*` lanes, count `*.test.ts` in `lib/**` and `test/**`, read `playwright.config.ts` and coverage thresholds in `vitest.config.ts`.
2. Report to Ricardo in this shape, compact, Spanish rioplatense, no jargon unexplained:

```text
Ricardo, tenemos N tests en total:
- Unit/integración (vitest, M archivos): para esto. Costo bajo, ~X min. Cantidad exacta: contar, no estimar.
- E2E (playwright, carriles smoke/auth/crud/flujo/a11y): para esto. Costo alto, ~X min, requiere servidor + navegadores.
- Estáticos (tsc, eslint): para esto. Costo bajo, ~X min.
- Scripts (check:headers, rechecks, health): para esto. Costo bajo.
Visual (mirar con ojos): [playwright-report HTML | coverage HTML | headed mode] — decir QUÉ mirar en cada uno.
Recomendación: qué correr según el caso (cambio chico → archivo puntual; ventana completa → suite; pre-push → todo + e2e).
```

## Handoff

- This skill owns INFORMAR (inventory, costs, visual flags). It never executes suites.
- If the owner chooses to run: hand off execution + result recording to the
  `pruebas` skill (owns EJECUTAR: load-aware estimates, staged runs, baselines).
- Nota (2026-09-23): el arnés opencode fue retirado del repo (incluía `qa-config.json`
  y la skill `pruebas`); el handoff de ejecución queda pendiente de redefinir en el harness activo.

## Hard Rules

- Quantities from repo reads, never invented. If unsure, say "revisar" not a number.
- Time estimates from series history (vitest full ~5 min, file ~30 s, tsc+lint ~2 min, e2e ~10-20 min); adjust if hardware differs.
- Cost labels: bajo (<1 min agente, salida a archivo+tail), medio (suite completa redirigida), alto (e2e con servidor vivo).
- Visual flag only for: headed/trace viewer, HTML reports, screenshots diffs. State exactly what to look at.
- Keep the report under 200 words unless asked for detail.
