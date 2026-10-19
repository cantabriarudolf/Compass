> **Este archivo ES tu prompt.** Ventana F3 de la serie deuda-4.
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

## Alcance de F3 — cierre de la serie deuda-4 y readiness del merge

**Tareas**:

1. **Gates completos**: `npx tsc --noEmit` 0 · `npm run lint` **0 problemas** (app y `packages/ui`) ·
   `npm test` verde con los pisos finales (tests X/Y y cobertura por área) · `openspec validate --all`
   sin fallos.
2. **e2e de la serie**: `npm run e2e:fresh -- --no-build -- e2e/smoke e2e/crud/poblado-idempotente.spec.ts`,
   con el JUnit (`test-results/junit.xml`) y `.last-run.json` como evidencia (X/X verdes).
3. **Auditoría integral desde el repo**: `git log --oneline -40` vs las filas del plan; confirmá
   `STORE_VERSION = 28`, 7 slices, `prisma/dev.db` y `Data/NSGC/backups/` intactos, y que **no quede
   ningún change de esta serie activo**.
4. **Readiness del merge**: verificá que el repo quede en estado mergeable — `git status` limpio,
   rama sincronizada, `openspec validate --all` sin fallos, y que **el `.vercelignore` de F1 esté
   commiteado** (el orquestador hará el merge del PR #3 y observará el check de Vercel). Dejá en el
   avance **la lista de lo que el orquestador debe verificar después** (check de Vercel verde, CI del
   PR verde, CI de `main` post-merge).
5. **Cierre documental**: sección **"Cierre de la serie deuda-4"** en `openspec/SERIE-DEUDA-4/00-plan.md`
   (estado por ventana con commits, números finales, deuda post-serie); avance NSGC de cierre;
   `mem_save` en Engram (tipo `decision`, `topic_key: compass/serie-deuda-4`). Fila **F3 HECHA**.
6. **PR**: **no lo crees, no lo edites y NO lo mergees** — el merge lo hace el orquestador con
   autorización explícita del owner. Dejá el texto propuesto para la descripción final si algo cambió.

**Deuda post-serie a declarar** (lo que sobreviva): el techo del **99.95 %** de cobertura del store
por API pública (2 ramas defensivas por diseño) y cualquier cosa que hayas revertido por riesgo.

**Gate**: todos los gates del punto 1 en verde + la evidencia e2e + plan y avance escritos.

**Archivos que podés tocar**: `test/**`, `vitest.config.ts` (solo `thresholds`), `openspec/**`,
`Data/NSGC/docs/avances/**`.

## Reporte final estandarizado (OBLIGATORIO)

1. Ventana y estado (HECHA / PARCIAL / BLOQUEADO + motivo).
2. Commits (hash + subject) y confirmación de que **NO** pusheaste.
3. Specs/changes propuestos.
4. Números: tests X/Y, tsc/eslint, y las métricas propias de la ventana.
5. Desviaciones vs este prompt.
6. Pendientes heredados.
7. Última línea exacta: `BITACORA_ENTRY: <resumen 2-3 líneas>`
