> **Este archivo ES tu prompt.** Ventana E4 de la serie deuda-3.
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

## Arranque: verificación de la ventana anterior (antes de tu alcance)

1. `git status` limpio y `git status -sb` sin "ahead" (todo pusheado) + `git log --oneline -8`.
2. **Fingerprint**: 7 slices, `STORE_VERSION = 28`, pisos global 93/84/92/93 · `lib/**` 98/93/98/98 ·
   `app/api/**` 87/74/88/87, suite ≥ 1299. Si falta, pará y reportá qué base encontraste.
3. **CI, archives y push los maneja el orquestador**: no poll-ees `gh`, no archives, no pushees.
4. `openspec validate --all` → sin fallos.
5. Contrastá con `openspec/SERIE-DEUDA-3/00-plan.md`: fila anterior `HECHA` → marcá la tuya
   `EN CURSO`; `PARCIAL`/`BLOQUEADO` → completá o documentá ese alcance antes del tuyo.
6. La suite completa se corre **una sola vez**, como gate al final.

## Alcance de E4 — `ci-db-descartable`: alinear el CI con la base descartable

Contexto: la ventana D1 de la serie anterior hizo que **la suite use una base descartable**
(`prisma/perf-test.db`, recreada y migrada por `globalSetup`) y agregó una **guarda dura** que aborta
si el destino resuelve a `prisma/dev.db`. Pero tuvo que dejar una **excepción**: el workflow
`ci.yml` exporta `DATABASE_URL: file:./dev.db` en sus jobs, así que en un runner efímero de CI la
guarda **redirige con aviso** en vez de abortar (`.github/workflows/ci.yml` no estaba entre los
archivos de esa ventana).

Esa excepción es deuda: mientras exista, la guarda no es absoluta y el workflow sigue nombrando una
base que la política del repo dice no usar.

**Tareas**:

1. **Alineá los 3 valores** de `DATABASE_URL: file:./dev.db` de `.github/workflows/ci.yml` (líneas
   ~32, ~112 y ~166) al nombre de la base descartable (`file:./perf-test.db`). Cada job migra su base
   antes de usarla (`prisma migrate deploy` / `prisma db push`), así que el nombre es intercambiable.
   **Leé cada job antes de tocarlo** y confirmá que no haya nada que dependa del nombre `dev.db`.
2. **Quitá la excepción** de `k0mp4ss_fe/apps/web/test/db-descartable.setup.ts` (o donde esté
   implementada) para que la guarda sea **absoluta**: si el destino resuelve a `dev.db`, **aborta
   siempre**, sin importar si corre en CI o local.
3. **Verificá la guarda**: `DATABASE_URL="file:./dev.db" npx vitest run test/health.test.ts` debe
   salir con **exit 1** y el banner de aborto, con `dev.db` sin cambios de `mtime`.
4. **Verificá que los tests sigan verdes** localmente con la base descartable y **sin** la excepción.
5. Change openspec `ci-db-descartable` (propose → apply) con `skip_specs: true` justificado.
6. Avance NSGC: los 3 valores antes/después, la excepción quitada y la evidencia de la guarda
   (exit 1 + banner).

**Riesgo declarado (por eso la ventana va sola)**: esto toca **config de CI (delivery)**. Si un job
del workflow no migrara su base antes de usarla, el cambio lo rompería. Verificá job por job y, si
alguno dependiera del nombre viejo, **no lo cambies**: documentalo y dejá ese job como estaba.

**Gate**: `npx tsc --noEmit` 0 · `npm run lint` 0 errores (sin warnings nuevos) · `npm test` verde
con los pisos vigentes · `openspec validate --all` sin fallos · `check-delta-coverage` ok · guarda
absoluta demostrada con exit 1.

**Archivos que podés tocar**: `.github/workflows/ci.yml`,
`k0mp4ss_fe/apps/web/test/db-descartable.setup.ts` (y/o el archivo de la guarda),
`openspec/changes/ci-db-descartable/**`, `Data/NSGC/docs/avances/**`,
`openspec/SERIE-DEUDA-3/00-plan.md`.

## Reporte final estandarizado (OBLIGATORIO — el owner lo copia al chat orquestador)

1. Ventana y estado (HECHA / PARCIAL / BLOQUEADO + motivo).
2. Commits (hash + subject) y confirmación de que **NO** pusheaste.
3. Specs creadas/modificadas + changes propuestos.
4. Números: tests X/Y, tsc/eslint OK, y las métricas propias de la ventana.
5. Desviaciones vs este prompt.
6. Pendientes heredados a la(s) ventana(s) siguiente(s).
7. Última línea exacta: `BITACORA_ENTRY: <resumen 2-3 líneas>`
