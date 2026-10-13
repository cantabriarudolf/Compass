> **Este archivo ES tu prompt.** Ventana P3 de la serie noche-2.
> Leélo completo (incluido `openspec/SERIE-NOCHE-2/00-plan.md`) y ejecutá sus bloques en orden.
> Modo noche: **no pidas confirmaciones al owner**. Si un gate falla dos veces, marcá la ventana
> BLOQUEADO en la tabla del plan con la evidencia y seguí.

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
Verificación por ventana: `cd k0mp4ss_fe/apps/web && npx tsc --noEmit && npm test` +
`openspec validate --all` + `node openspec/scripts/check-delta-coverage.mjs`.
Regla de la lane e2e: base fresca y **nunca** correr el spec de rate-limit antes de la lane.

## Arranque (verificación de la ventana anterior)
1. `git status` (tree limpio), `git status -sb` (sin "ahead") y `git log --oneline -8`.
2. `openspec validate --all` → sin fallos.
3. `cd k0mp4ss_fe/apps/web && npm test` → suite verde.
4. Contrastá con `00-plan.md`: si P2 quedó PARCIAL o BLOQUEADO, completala antes (derivá de
   `prompt-02.md`, autocontenido). Nunca marques EN CURSO si lo anterior no está cerrado.

## Alcance de P3 — higiene chica (3 ítems, todos verificables)
1. **`tsc` también en el job PostgreSQL.** En `.github/workflows/ci.yml`, el job `unit-pg` corre
   `npm test` pero no `npx tsc --noEmit` (el job SQLite sí). Agregalo después de `npx prisma db
   push`, con el mismo `working-directory`. Verificá que el YAML siga válido
   (`python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml'))"`).
2. **npm local vs CI.** El Node 24.21.0 trae npm 11.19.0; cualquier local con npm 12 sigue siendo
   compatible (`lockfileVersion: 3`, comprobado). Decidí y aplicá **una** de estas, con evidencia:
   (a) declarar `engines.npm` (`>=11`) en `k0mp4ss_fe/package.json` y documentarlo; o
   (b) documentar la regla en `README-DEPLOY.md`/runbook. No cambies el lockfile.
3. **Script `npm run e2e:fresh`.** Creá `k0mp4ss_fe/apps/web/scripts/e2e-fresh.mjs` que:
   (a) recree una base descartable desde el schema SQLite
   (`prisma migrate deploy --schema=prisma/schema.sqlite.prisma` con `DATABASE_URL=file:./<nombre>.db`),
   (b) corra `npm run e2e:reseed-base` contra esa base,
   (c) **imprima en grande** las dos advertencias operativas: base fresca por corrida y
   "NO corras primero el spec de rate-limit: bloquea la IP 15 minutos", y
   (d) imprima el comando Playwright exacto con paridad CI.
   Agregá el script a `k0mp4ss_fe/apps/web/package.json` y documentalo en
   `k0mp4ss_fe/apps/web/docs/runbook-operaciones.md`. Que el script **no** toque `prisma/dev.db`.

**Gate de la ventana**:
- `npx tsc --noEmit` 0 errores y `npm test` verde (sin cambios esperados en la suite).
- YAML válido y `openspec validate --all` sin fallos.
- El script nuevo funciona de punta a punta: corré `npm run e2e:fresh` y verificá que crea la base
  descartable, siembra y muestra las advertencias (pegá su salida en el reporte).

## Cierre de la ventana
- `nsgc-prepush`: avance de la serie + manual/runbook afectado (`docs/runbook-operaciones.md`,
  `README-DEPLOY.md`) + Trazabilidad si cambia un estado.
- Commits por ítem (uno por work-unit) y push de la rama.
- Actualizar la fila P3 del plan a `HECHA` + Bitácora, y commitear ese cambio.

## Reporte final estandarizado (OBLIGATORIO)
1. Ventana y estado. 2. Commits (hash + subject) y push sí/no. 3. Archivos tocados.
4. Números: tests X/Y, tsc OK, salida de `npm run e2e:fresh` (resumida), engines finales.
5. Desviaciones vs este prompt. 6. Pendientes heredados. 7. Última línea exacta:
`BITACORA_ENTRY: <resumen 2-3 líneas>`
