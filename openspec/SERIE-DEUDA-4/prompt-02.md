> **Este archivo ES tu prompt.** Ventana F2 de la serie deuda-4.
> Léelo completo (incluido `openspec/SERIE-DEUDA-4/00-plan.md`) y ejecutá sus bloques en orden.

## Contexto común (válido para TODA la serie deuda-4)

Compass: Next 16 + TypeScript estricto + Prisma, monorepo `k0mp4ss_fe/` (app en `k0mp4ss_fe/apps/web`).
Rama `serie/deuda-1` (apilada sobre noche-3 y noche-2), tip `e1b14a6`: 7 slices, `STORE_VERSION = 28`,
pisos global **93/84/92/93** · `lib/**` **98/93/98/98** · `app/api/**` **87/74/88/87**, suite
**1304/1304** en 128 archivos, `npx eslint` de la app **0 problemas**. La suite usa la base descartable
`prisma/perf-test.db`. Node: `export PATH="$HOME/.nvm/versions/node/v24.21.0/bin:$PATH"`.

**Esta serie desbloquea el merge final del PR #3 a `main`.**

Método: change openspec (propose → apply → archive); antes de un delta leer `openspec/CONVENCION-DELTAS.md`
y correr `node openspec/scripts/check-delta-coverage.mjs <change>` hasta `0 que romperían el archive`.
Commits convencionales en español, uno por work-unit, commiteando SOLO los archivos del cambio; skill
`nsgc-prepush` antes de cada push. Reglas duras: `STORE_VERSION = 28` congelado; **nunca** tocar
`prisma/dev.db` ni `Data/NSGC/backups/`; nunca secretos; el término oficial es **comunidad**
("condominio" nunca, RG §4); **no le pidas confirmaciones al owner** (gate falla dos veces → BLOQUEADO
con evidencia exacta y seguir).

**NO corras `git push` ni `gh` que escriba** (el harness pide aprobación interactiva que no podés
contestar): cerrá con todo commiteado y reportá "sin pushear"; el orquestador pushea, archiva, observa
el CI y hace el merge. **Commiteá por unidad** (5 cortes de ejecutor en las series anteriores: solo
sobrevivió lo commiteado). Sé económico en turnos; corridas largas con
`nohup bash -lc '<cmd>' > /tmp/serie-deuda4-f<n>-<nombre>.log 2>&1 &` + PID esperando en bloques de
2-5 min; **nunca** bloquees un bash más de ~10 min. Verificación: `cd k0mp4ss_fe/apps/web && npx tsc
--noEmit && npm run lint && npm test` + `openspec validate --all` + `check-delta-coverage`. La suite
completa, una sola vez al final. **Nunca** corras el spec de rate-limit antes de la lane e2e.

## Arranque: verificación de la ventana anterior (antes de tu alcance)

1. `git status` limpio y `git status -sb` sin "ahead" + `git log --oneline -8`.
2. **Fingerprint**: 7 slices, `STORE_VERSION = 28`, pisos global 93/84/92/93 · `lib/**` 98/93/98/98 ·
   `app/api/**` 87/74/88/87, suite ≥ 1304, `npx eslint` 0 problemas. Si falta, pará y reportá.
3. **CI, archives, push y merge los maneja el orquestador**: no poll-ees `gh`, no archives, no pushees.
4. `openspec validate --all` sin fallos.
5. Contrastá con `openspec/SERIE-DEUDA-4/00-plan.md`: fila anterior `HECHA` → marcá la tuya `EN CURSO`.

## Alcance de F2 — `deuda-menor`: el último warning y la robustez de los CLIs

Dos deudas chicas y acotadas que quedaron declaradas al cerrar deuda-3.

**Tareas**:

1. **El último warning de lint**: `k0mp4ss_fe/packages/ui/src/hooks/use-mobile.ts` —
   `react-hooks/set-state-in-effect` (hoy `use-mobile.ts:14`). El hook usa `useState` + `useEffect`
   para detectar mobile. La solución honesta es la que evita el `setState` dentro del efecto (por
   ejemplo inicializar desde el media query con el patrón de `useSyncExternalStore`, o el que
   corresponda **sin cambiar el comportamiento observable del hook**: mismo valor inicial, misma
   reacción al cambio de viewport, mismo cleanup). **No uses `eslint-disable`.** Si cambiás el hook,
   dejá un test que fije el comportamiento (valor inicial y reacción al `matchMedia`).
   Verificá con `npx eslint .` desde `k0mp4ss_fe/packages/ui` **y** desde `k0mp4ss_fe/apps/web`.
2. **Robustez de los 4 CLIs** en `k0mp4ss_fe/apps/web/scripts/`: los hallazgos son
   `restore-db.mjs:84` (`JSON.parse` del manifest), `deploy-migrar-datos.mjs:64` (`execSync`),
   `security-recheck.mjs:21` y `check-headers.mjs:14` (`new URL(import.meta.url)`).
   Criterio: **mismo contrato, mejor error** — hoy un input inválido explota con un stack sin
   atrapar; el objetivo es que **falle claro** (mensaje que diga qué falta o qué está mal) y **salga
   con exit code ≠ 0**. No cambies lo que el script hace cuando todo está bien, ni agregues
   comportamiento nuevo.
   **Ojo con la trampa**: `deploy-migrar-datos.mjs` envuelve `execSync` dentro de un helper `correr()`
   que **ya** corre con `stdio: "inherit"`; el manejo tiene que dejar pasar el error del comando
   (que el usuario vea el output real de la herramienta) y solo agregar contexto si aporta.
3. Change openspec `deuda-menor` (propose → apply) con `skip_specs: true` justificado.
4. Avance NSGC con la tabla antes/después (warning y los 4 CLIs) y marcá la fila **F2 HECHA** +
   Bitácora.

**Gate**: `npx tsc --noEmit` 0 · `npm run lint` **0 problemas en la app y en packages/ui** · `npm test`
verde con los pisos vigentes · `openspec validate --all` sin fallos · `check-delta-coverage` ok ·
evidencia del CLI fallando claro (comando + salida + exit code).

**Archivos que podés tocar**: `k0mp4ss_fe/packages/ui/src/hooks/use-mobile.ts`,
`k0mp4ss_fe/packages/ui/src/**` (solo si el hook lo exige),
`k0mp4ss_fe/apps/web/scripts/{restore-db,deploy-migrar-datos,security-recheck,check-headers}.mjs`,
`k0mp4ss_fe/apps/web/test/**` (el test del hook), `openspec/changes/deuda-menor/**`,
`Data/NSGC/docs/avances/**`, `openspec/SERIE-DEUDA-4/00-plan.md`.

## Reporte final estandarizado (OBLIGATORIO)

1. Ventana y estado (HECHA / PARCIAL / BLOQUEADO + motivo).
2. Commits (hash + subject) y confirmación de que **NO** pusheaste.
3. Specs/changes propuestos.
4. Números: tests X/Y, tsc/eslint, y las métricas propias de la ventana.
5. Desviaciones vs este prompt.
6. Pendientes heredados.
7. Última línea exacta: `BITACORA_ENTRY: <resumen 2-3 líneas>`
