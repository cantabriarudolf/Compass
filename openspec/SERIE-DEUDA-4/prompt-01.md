> **Este archivo ES tu prompt.** Ventana F1 de la serie deuda-4.
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

## Alcance de F1 — `fix-vercel-data-ignore`: desbloquear el deploy de Vercel

Contexto: el check de Vercel del PR #3 **falla** (`Deployment has failed`) y es el bloqueante real del
merge. La causa **ya está diagnosticada** en el change que dejó el owner,
`openspec/changes/fix-vercel-data-ignore/` (**leé su `proposal.md`, `design.md` y `tasks.md`
completos**): la línea 6 del `.vercelignore` de la raíz tiene `Data/`, y el motor de ignore de Vercel
matchea **sin distinguir mayúsculas y a cualquier profundidad**, así que también excluye
`k0mp4ss_fe/apps/web/data/` (los seeds de la app) → 11 errores `Module not found: Can't resolve
'@/data/...'` en `lib/store.ts` y `app/finanzas/gastos-comunes/page.tsx`.

**Tareas**:
1. Leé el change del owner y **seguí su plan** (ya eligió el enfoque). Si discrepas del enfoque por
   algo que encontrás en el código, documentá la discrepancia y elegí la alternativa mínima segura.
2. Corregí lo que corresponda en `.vercelignore` (raíz y, si aplica, `k0mp4ss_fe/.vercelignore` — son
   **dos archivos distintos**, revisá ambos) para que `k0mp4ss_fe/apps/web/data/` **sí** se suba y la
   documentación pesada (`Data/`, `openspec/`, backups) **siga** excluida.
3. **Verificá el efecto real, no la intención**: reproducí el matching con el paquete `ignore` (el
   change documenta la versión y el método) o con el build local, y demostrá que
   `k0mp4ss_fe/apps/web/data/` queda incluido y `Data/NSGC/backups/` sigue excluido.
4. Verificá que `npm run build` de `k0mp4ss_fe/apps/web` siga verde (es lo que corre Vercel).
5. Completá el `tasks.md` del change, escribí el avance NSGC con la evidencia, marcá la fila **F1
   HECHA** + Bitácora en `openspec/SERIE-DEUDA-4/00-plan.md`.
6. **No podés verificar el deploy de Vercel vos**: el orquestador lo hará después del push. Enfocate en
   la causa raíz y en la evidencia local del matching.

**Gate**: `npx tsc --noEmit` 0 · `npm run lint` 0 problemas · `npm test` verde con los pisos vigentes ·
`openspec validate --all` sin fallos · `check-delta-coverage` ok · `npm run build` verde · evidencia del
matching (incluido/excluido).

**Archivos que podés tocar**: `.vercelignore`, `k0mp4ss_fe/.vercelignore`,
`openspec/changes/fix-vercel-data-ignore/**`, `Data/NSGC/docs/avances/**`,
`openspec/SERIE-DEUDA-4/00-plan.md`. Nada más.

## Reporte final estandarizado (OBLIGATORIO)

1. Ventana y estado (HECHA / PARCIAL / BLOQUEADO + motivo).
2. Commits (hash + subject) y confirmación de que **NO** pusheaste.
3. Specs/changes propuestos.
4. Números: tests X/Y, tsc/eslint, y las métricas propias de la ventana.
5. Desviaciones vs este prompt.
6. Pendientes heredados.
7. Última línea exacta: `BITACORA_ENTRY: <resumen 2-3 líneas>`
