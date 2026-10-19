> **Este archivo ES tu prompt.** Ventana E1 de la serie deuda-3.
> Léelo completo (incluido `openspec/SERIE-DEUDA-3/00-plan.md`) y ejecutá sus bloques en orden.

## Contexto común (válido para TODA la serie deuda-3)

Proyecto Compass: Next 16 + TypeScript estricto + Prisma, monorepo `k0mp4ss_fe/` (app en
`k0mp4ss_fe/apps/web`). Tests: Vitest (`test/`, **1299 verdes** en 126 archivos con pisos por área) +
Playwright (`e2e/`). Estado de partida: tip de SERIE-DEUDA-2 (`0740da9`, apilado sobre
`noche/serie-noche-3` `1b23219` y SERIE-DEUDA-1): 7 slices, `STORE_VERSION = 28`, pisos global
**93/84/92/93** · `lib/**` **98/93/98/98** · `app/api/**` **87/74/88/87**. `npm run lint` sale
**exit 0 con 35 warnings**. La suite usa la base descartable `prisma/perf-test.db` (globalSetup de
la serie anterior). Tooling e2e: `npm run e2e:fresh`.
Node: `export PATH="$HOME/.nvm/versions/node/v24.21.0/bin:$PATH"`.

Método del proyecto: todo cambio → change openspec (propose → apply → archive). Antes de escribir
cualquier delta: leer `openspec/CONVENCION-DELTAS.md` y correr
`node openspec/scripts/check-delta-coverage.mjs <change>` hasta que dé `0 que romperían el archive`.
Commits convencionales en español, un commit por work-unit, automáticos al cerrar cada trabajo,
commiteando SOLO los archivos del cambio. Skill `nsgc-prepush` obligatoria antes de cada push
(avance en `Data/NSGC/docs/avances/`).

Reglas duras: `STORE_VERSION = 28` congelado; **nunca** tocar `prisma/dev.db` ni
`Data/NSGC/backups/`; nunca secretos en código ni docs; el término oficial es **comunidad**
("condominio" no se usa nunca, RG §4); **no le pidas confirmaciones al owner** (si un gate falla
dos veces: ventana BLOQUEADO con evidencia exacta y seguir).

**NO corras `git push` ni `gh pr edit`**: el harness les pide aprobación interactiva que no podés
contestar (así se colgaron 30 minutos varios ejecutores). Cerrá con todo commiteado y reportá
"sin pushear": el orquestador pushea, archiva y observa el CI.
**Commiteá por unidad**, no al final: si te cortás, el trabajo ya commiteado sobrevive (pasó 5 veces
en las dos series anteriores).
Sé económico en turnos; las corridas largas van con
`nohup bash -lc '<cmd>' > /tmp/serie-deuda3-e<n>-<nombre>.log 2>&1 &` + PID, esperando en bloques de
2-5 min. **Nunca bloquees un solo bash más de ~10 minutos** y no poll-ees nada turno a turno.

Verificación por ventana: `cd k0mp4ss_fe/apps/web && npx tsc --noEmit && npm run lint && npm test`
(pisos por área) + `openspec validate --all` sin fallos + `check-delta-coverage` del change tocado.
e2e con paridad CI: `npm run e2e:fresh -- --no-build -- <specs>` y **nunca** corras el spec de
rate-limit antes de la lane (bloquea la IP 15 min y aborta `auth.setup`).

## Alcance de E1 — `lint-warnings-cero`: los 35 warnings a cero

Contexto (clasificación real medida por el orquestador, no estimada): los 35 warnings de `npm run
lint` (exit 0, 0 errores) tienen **3 causas raíz**:

| Warnings | Regla y zona |
|---|---|
| **21** | `turbo/no-undeclared-env-vars`: 11 en `test/` (ej. `test/proxy.header-selection.test.ts`), 8 en `scripts/`, 1 en `e2e/csp-modos.spec.ts`, 1 en `proxy.ts` |
| **13** | `scripts/*.mjs`: 11 `no-undef` (globales de Node: `process`), 1 `no-redeclare` (ej. `scripts/e2e-fresh.mjs`), 1 `@typescript-eslint/no-unused-vars` (ej. `scripts/migrate-sqlite-to-postgres.mjs`) |
| **1** | `react-hooks/exhaustive-deps` en `app/visor-mensajes/page.tsx` |

**Tareas**:

1. **`turbo.json`**: declarar las 6 variables de entorno que el linter reclama — `CSP_ENFORCEMENT`,
   `SQLITE_URL`, `POSTGRES_URL`, `DATABASE_URL_POSTGRES`, `COMUNIDAD_ID`, `SKIP_DATOS` — en el lugar
   que corres ponde del esquema de Turbo (`env`/`globalEnv` según cómo las consuma cada tarea; leé el
   `turbo.json` real y la doc del repo antes de escribirlo). Mata los 21 de una.
   **Verificá después que `turbo` siga funcionando** (si tocás `env` de una tarea, el cacheo puede
   cambiar de comportamiento: corré el build o la tarea que corresponda).
2. **`scripts/**/*.mjs`**: darles los globales de Node **acotado a esos archivos**. Ojo: el intento
   anterior de D6 aplicó globales de Node demasiado ancho y el efecto fue **peor** (8 `no-redeclare`
   nuevos + 2 directivas obsoletas) → **revertido**. Acotá el bloque a `files: ["**/*.mjs"]` (o al
   patrón exacto de `scripts/`), no al config global.
3. **`app/visor-mensajes/page.tsx`**: el `exhaustive-deps` de `caducarAvisosCV`. La solución honesta
   es **estabilizar la función con un `ref`** (o mover la caducidad a un hook), no `eslint-disable`.
   Cuidado: cambiar las deps puede cambiar el ciclo de vida de los `setInterval` de caducidad —
   **no cambies el comportamiento observable**, y si no podés demostrarlo con un test, dejalo
   declarado en vez de forzarlo.
4. Los 2 triviales de `scripts/` (`no-redeclare`, `no-unused-vars`).
5. Change openspec `lint-warnings-cero` (propose → apply) con `skip_specs: true` justificado.
6. Avance NSGC con la tabla **warnings antes/después por regla y archivo**.

**Gate**: `npx tsc --noEmit` 0 · `npm run lint` → **0 errores y 0 warnings** (o el remanente
declarado con su causa, si alguno no se puede cerrar sin cambiar comportamiento) · `npm test` verde
con los pisos vigentes · `openspec validate --all` sin fallos · `check-delta-coverage` ok.

**Archivos que podés tocar**: `turbo.json`, el config de ESLint (`k0mp4ss_fe/apps/web/eslint.config.*`
y/o el raíz), `k0mp4ss_fe/apps/web/scripts/**`, `k0mp4ss_fe/apps/web/app/visor-mensajes/page.tsx`,
`k0mp4ss_fe/apps/web/test/**` (solo si un warning lo exige), `openspec/changes/lint-warnings-cero/**`,
`Data/NSGC/docs/avances/**`, `openspec/SERIE-DEUDA-3/00-plan.md`. **No** toques `vitest.config.ts`.

## Reporte final estandarizado (OBLIGATORIO — el owner lo copia al chat orquestador)

1. Ventana y estado (HECHA / PARCIAL / BLOQUEADO + motivo).
2. Commits (hash + subject) y confirmación de que **NO** pusheaste.
3. Specs creadas/modificadas + changes propuestos.
4. Números: tests X/Y, tsc/eslint OK, y las métricas propias de la ventana.
5. Desviaciones vs este prompt.
6. Pendientes heredados a la(s) ventana(s) siguiente(s).
7. Última línea exacta: `BITACORA_ENTRY: <resumen 2-3 líneas>`
