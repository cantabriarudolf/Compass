> **Este archivo ES tu prompt.** Ventana P5 (cierre) de la serie noche-2.
> Leélo completo (incluido `openspec/SERIE-NOCHE-2/00-plan.md`) y ejecutá sus bloques en orden.
> Modo noche: **no pidas confirmaciones al owner**. Si un gate falla dos veces, marcalo BLOQUEADO
> con la evidencia, cerrá la serie con lo que esté sano y reportá.

## Contexto común (válido para TODA la serie noche-2)
Proyecto Compass: Next 16 + TypeScript estricto + Prisma en el monorepo `k0mp4ss_fe/` (app en
`k0mp4ss_fe/apps/web`, UI en `packages/ui`). Tests: Vitest (`test/`, 967 verdes con pisos de
cobertura por área) + Playwright (`e2e/`). Estado de partida: CI verde completo en el run
`38330292787` (HEAD `ba40be2`); changes `qlab-poblamiento-api-rest` y `ci-verde-ratchet-cobertura`
archivados; deuda viva en `openspec/BACKLOG-100.md` y en el avance
`Data/NSGC/docs/avances/avance - 2026-10-12 14-15.md`.
Node: `.nvmrc` = 24, `engines.node` = `>=24`, local 24.21.0 →
`export PATH="$HOME/.nvm/versions/node/v24.21.0/bin:$PATH"`.
Reglas permanentes del proyecto: toda feature/fix → change openspec (propose → apply → archive);
terminología RG §4 (el término oficial es **comunidad**, "condominio" no se usa nunca); commits
convencionales en español, automáticos al cerrar cada trabajo, commiteando solo los archivos del
cambio; skill `nsgc-prepush` obligatoria antes de cualquier push; nunca tocar
`prisma/dev.db` ni `Data/NSGC/backups/`; nunca secretos en código ni docs.
**Esta serie trabaja en la rama `noche/serie-noche-2`: nunca pushear ni mergear a `main`.**

## Arranque (verificación de la ventana anterior)
1. `git status` (tree limpio), `git status -sb` (sin "ahead") y `git log --oneline -12`.
2. `openspec validate --all` → sin fallos.
3. `cd k0mp4ss_fe/apps/web && npm test` → suite verde.
4. Contrastá con `00-plan.md`: si P4 quedó PARCIAL o BLOQUEADO, completá lo que se pueda (derivá de
   `prompt-04.md`, autocontenido) **y documentalo**; no marques EN CURSO si lo anterior no está
   cerrado. P5 no hereda alcance de producto: su trabajo es cerrar y auditar.

## Alcance de P5 — cierre, evidencia y handoff al owner
1. **Gate completo de la rama** (con paridad CI, base descartable fresca y build de producción):
   - `cd k0mp4ss_fe/apps/web && npx tsc --noEmit && npm test` (suite completa, pisos por área);
   - `openspec validate --all` y `node openspec/scripts/check-delta-coverage.mjs` sin fallos;
   - **lane e2e completa**: crear base descartable con
     `npx prisma migrate deploy --schema=prisma/schema.sqlite.prisma` + `npm run e2e:reseed-base`
     sobre `DATABASE_URL=file:./perf-cierre.db`, build de producción y
     `CI=1 … npx playwright test --reporter=list` (~25-35 min; **no** corras el spec de
     rate-limit: queda skipped, es correcto);
   - **lane de rate-limit aislada** al final, sobre OTRA base descartable fresca:
     `E2E_RATE_LIMIT=1 npx playwright test e2e/auth/rate-limit.spec.ts --reporter=list`
     (bloquea la IP 15 minutos: por eso va al final y en base propia).
   Si algo falla: arreglar con un commit `fix(...)` + test (máximo 2 intentos) y, si no cede,
   documentarlo como BLOQUEADO con el error textual.
2. **Push de la rama** y **PR draft** para que el CI corra sobre la rama (el workflow dispara en
   `pull_request`; pushear una rama sola NO dispara CI). Está autorizado por el owner al lanzar la
   serie:
   - `git push -u origin noche/serie-noche-2` (con `nsgc-prepush` hecho antes);
   - `gh pr create --draft --base main --head noche/serie-noche-2 --title "noche-2: purga bulk QA-Lab + higiene e2e" --body-file <archivo temporal con el resumen de la serie>`;
   - esperar el CI del PR: `gh pr checks --watch` (o `gh run list --branch noche/serie-noche-2`)
     y reportar el resultado por job. **No mergear**: el merge lo decide el owner.
   Si `gh` no está autenticado o el PR no se puede crear: dejá la rama pusheada y reportalo.
3. **Bitácora y cierre de la serie** en `openspec/SERIE-NOCHE-2/00-plan.md`: fila P5 a `HECHA`,
   y agregar al final una sección `## Cierre de la serie` con: qué se logró por ventana, número de
   commit de cada una, estado del CI del PR, lo que quedó **BLOQUEADO** con evidencia y la deuda
   viva (mínimo: `SERIE-NOCHE-3` = cobertura de `lib/store.ts` y de `app/api/**`; secrets de
   Vercel del owner; `GOOGLE_PROVIDER_DISABLED`).
4. **Avance NSGC final** (`Data/NSGC/docs/avances/avance - <fecha> <hh-mm>.md` o el de la noche):
   resumen por ventana + verificaciones + próxima acción recomendada (revisar el PR y mergear).
5. **Deuda restante** en `openspec/BACKLOG-100.md`: agregar/actualizar las filas que correspondan
   con estado real (sin borrar historia).

## Reporte final estandarizado (OBLIGATORIO — es el que lee el owner a la mañana)
1. Ventana y estado (HECHA/PARCIAL/BLOQUEADO). 2. Commits de TODA la serie (hash + subject) y si
   están pusheados. 3. Números: tests X/Y, tsc OK, e2e X/Y verde, rate-limit X/Y verde,
   `validate` N/N, purga antes/después (si P1 midió). 4. Estado del PR draft y de cada check del
   CI (unit, unit-pg, e2e, e2e-rate-limit). 5. Ventanas BLOQUEADAS con el error textual.
6. **Qué tiene que hacer el owner a la mañana** (revisar PR, mergear o pedir cambios, cargar
   secrets de Vercel, decidir `SERIE-NOCHE-3`). 7. Última línea exacta:
`BITACORA_ENTRY: <resumen 2-3 líneas>`
