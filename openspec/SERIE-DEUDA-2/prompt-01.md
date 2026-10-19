> **Este archivo ES tu prompt.** Ventana D1 de la serie deuda-2.
> Léelo completo (incluido `openspec/SERIE-DEUDA-2/00-plan.md`) y ejecutá sus bloques en orden.

## Contexto común (válido para TODA la serie deuda-2)

Proyecto Compass: Next 16 + TypeScript estricto + Prisma, monorepo `k0mp4ss_fe/` (app en
`k0mp4ss_fe/apps/web`). Tests: Vitest (`test/`, 1208 verdes con pisos por área) + Playwright
(`e2e/`, lanes crud/flujo/smoke/auth/a11y). Estado de partida: tip de SERIE-DEUDA-1 (`afe142a`,
apilado sobre `noche/serie-noche-3` `1b23219`): store con 7 slices, `STORE_VERSION = 28`, pisos
global **92/83/92/92** · `lib/**` **97/91/98/97** · `app/api/**` **87/74/88/87**. Tooling e2e ya
materializado por la serie anterior: `npm run e2e:fresh` (base descartable, paridad CI).
Node: `export PATH="$HOME/.nvm/versions/node/v24.21.0/bin:$PATH"`.

Método del proyecto: todo cambio → change openspec (propose → apply → archive). Antes de escribir
cualquier delta: leer `openspec/CONVENCION-DELTAS.md` y correr
`node openspec/scripts/check-delta-coverage.mjs <change>` hasta que dé `0 que romperían el archive`.
Commits convencionales en español, un commit por work-unit, automáticos al cerrar cada trabajo,
commiteando SOLO los archivos del cambio. Skill `nsgc-prepush` obligatoria antes de cada push
(avance en `Data/NSGC/docs/avances/`; manual de módulo si cambia comportamiento o estructura;
Trazabilidad si cambia un estado).

Reglas duras: `STORE_VERSION = 28` congelado; **nunca** tocar `prisma/dev.db` ni
`Data/NSGC/backups/`; nunca secretos en código ni docs; el término oficial es **comunidad**
("condominio" no se usa nunca, RG §4); **no le pidas confirmaciones al owner** (si un gate falla
dos veces: ventana BLOQUEADO con evidencia exacta y seguir).

**NO corras `git push` ni `gh pr edit`**: el harness les pide aprobación interactiva que no podés
contestar (así se colgaron 30 minutos ejecutores anteriores). Cerrá con todo commiteado y reportá
"sin pushear": el orquestador pushea, archiva y observa el CI.
**Commiteá por unidad**, no al final: si te cortás, el trabajo ya commiteado sobrevive.
Sé económico en turnos; las corridas largas van con
`nohup bash -lc '<cmd>' > /tmp/serie-deuda2-<n>-<nombre>.log 2>&1 &` + PID, esperando dentro del
mismo comando en bloques de 2-5 min. **Nunca bloquees un solo bash más de ~10 minutos** y no
poll-ees nada turno a turno.

Verificación por ventana: `cd k0mp4ss_fe/apps/web && npx tsc --noEmit && npm run lint && npm test`
(pisos por área) + `openspec validate --all` sin fallos + `check-delta-coverage` del change tocado.
e2e con paridad CI: `npm run e2e:fresh -- --no-build -- <specs>` y **nunca** corras el spec de
rate-limit antes de la lane (bloquea la IP 15 min y aborta `auth.setup`).

## Alcance de D1 — `test-db-descartable`: la suite deja de escribir en `prisma/dev.db`

Contexto (hallazgo de SERIE-DEUDA-1 P7): `k0mp4ss_fe/apps/web/test/setup.ts` hace

```ts
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = `file:${path.resolve(__dirname, "../prisma/dev.db")}`
}
```

O sea: cuando nadie exporta `DATABASE_URL`, **la suite entera escribe la base de desarrollo del
owner**. Los tests de integración (`test/api/**`) usan Prisma real, así que cualquier test nuevo
que no limpie ensucia datos reales.

**Tareas**:

1. **Reproducir con evidencia**: registrá el `mtime` de `prisma/dev.db`, corré `npm test`, y volvé
   a registrar el `mtime` (si cambió, el test tocó la base de desarrollo — eso es el defecto).
2. Change openspec `test-db-descartable` (propose → apply). Es tooling de tests: si no toca specs
   de producto, `.openspec.yaml` con `skip_specs: true` y su justificación.
3. Que la suite use una **base descartable** por defecto (por ejemplo `prisma/perf-test.db`),
   recreada y migrada de cero antes de la corrida; el patrón ya existe en
   `k0mp4ss_fe/apps/web/scripts/e2e-fresh.mjs` (`prisma migrate deploy --schema=prisma/schema.sqlite.prisma`).
   Si `DATABASE_URL` ya viene del entorno, **respetala**.
4. **Guarda dura**: si el destino resuelve a `prisma/dev.db` por cualquier vía, el setup debe
   **abortar** con mensaje explícito (mismo criterio que la guarda de `e2e-fresh.mjs`).
5. **Test que fija el contrato**: con `DATABASE_URL` apuntando a la base descartable, el setup no
   puede resolver a `dev.db`.
6. **Evidencia final**: `mtime` de `prisma/dev.db` **sin cambios** después de `npm test` completo,
   registrado en el avance.

**Gate**: `npx tsc --noEmit` 0 · `npm run lint` 0 · `npm test` verde con los pisos vigentes ·
`openspec validate --all` sin fallos · `check-delta-coverage` ok · **`prisma/dev.db` intacta**
(mtime antes/después en el avance).

**Archivos que podés tocar**: `k0mp4ss_fe/apps/web/test/setup.ts`,
`k0mp4ss_fe/apps/web/test/*.setup.ts` (nuevo, si hace falta un setup global),
`k0mp4ss_fe/apps/web/vitest.config.ts` (solo `setupFiles`/`globalSetup`/`test`; **no** los
`thresholds`), `k0mp4ss_fe/apps/web/scripts/**` (solo un helper de base si hace falta),
`k0mp4ss_fe/apps/web/package.json` (solo un script si hace falta),
`openspec/changes/test-db-descartable/**`, `Data/NSGC/docs/avances/**`,
`openspec/SERIE-DEUDA-2/00-plan.md`.

## Reporte final estandarizado (OBLIGATORIO — el owner lo copia al chat orquestador)

1. Ventana y estado (HECHA / PARCIAL / BLOQUEADO + motivo).
2. Commits (hash + subject) y confirmación de que **NO** pusheaste.
3. Specs creadas/modificadas + changes propuestos.
4. Números: tests X/Y, tsc/eslint OK, y las métricas propias de la ventana.
5. Desviaciones vs este prompt.
6. Pendientes heredados a la(s) ventana(s) siguiente(s).
7. Última línea exacta: `BITACORA_ENTRY: <resumen 2-3 líneas>`
