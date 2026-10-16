> **Este archivo ES tu prompt.** Ventana P1 de la serie deuda-1.
> Léelo completo (incluido `openspec/SERIE-DEUDA-1/00-plan.md`) y ejecutá sus bloques en orden.

## Contexto común (válido para TODA la serie deuda-1)

Proyecto Compass: Next 16 + TypeScript estricto + Prisma, monorepo `k0mp4ss_fe/` (app en
`k0mp4ss_fe/apps/web`). Tests: Vitest (`test/`, 1078 verdes con pisos por área) + Playwright
(`e2e/`, lanes crud/flujo/smoke/auth/a11y). Estado de partida: rama `serie/deuda-1` cortada del
tip de SERIE-NOCHE-3 (`1b23219`): store de 5.219 líneas con 7 slices, `STORE_VERSION = 28`,
pisos global 90/80/90/90 · `lib/**` 96/90/98/96 · `app/api/**` 82/67/85/82.
Node: `export PATH="$HOME/.nvm/versions/node/v24.21.0/bin:$PATH"`.

Método del proyecto: todo cambio → change openspec (propose → apply → archive). Antes de escribir
cualquier delta: leer `openspec/CONVENCION-DELTAS.md` y correr
`node openspec/scripts/check-delta-coverage.mjs <change>` hasta que dé `0 que romperían el archive`.
Commits convencionales en español, un commit por work-unit, automáticos al cerrar cada trabajo,
commiteando SOLO los archivos del cambio. Skill `nsgc-prepush` obligatoria antes de cada push
(avance en `Data/NSGC/docs/avances/`; manual de módulo si cambia comportamiento o estructura;
Trazabilidad si cambia un estado).

Reglas duras: `STORE_VERSION = 28` congelado; nunca tocar `prisma/dev.db` ni `Data/NSGC/backups/`
(las corridas e2e usan bases descartables `prisma/perf*.db`); nunca secretos en código ni docs; el
término oficial es **comunidad** ("condominio" no se usa nunca, RG §4); **no le pidas
confirmaciones al owner** (si un gate falla dos veces: ventana BLOQUEADO con evidencia exacta y
seguir).

Verificación por ventana: `cd k0mp4ss_fe/apps/web && npx tsc --noEmit && npm run lint && npm test`
(pisos por área) + `openspec validate --all` sin fallos + `check-delta-coverage` del change tocado.
e2e con paridad CI: `npm run e2e:fresh` (lo crea esta ventana P1; imprime el comando Playwright
exacto) y **nunca** correr el spec de rate-limit antes de la lane (bloquea la IP 15 min y aborta
`auth.setup`).

## Prerrequisito de arranque (esta es la ventana 1: no hay ARRANQUE)

1. `git status` limpio y `git status -sb` sin "ahead" + `git log --oneline -8`. Rama esperada:
   `serie/deuda-1`.
2. Fingerprint de base: pisos `lib/**` 96/90/98/96 y global 90/80/90/90 en `vitest.config.ts`,
   7 slices en `lib/store/slices/` y suite ≥ 1078. Si falta, pará y reportá qué base encontraste
   (no improvises un rebase ni cambies la rama).
3. `openspec validate --all` → sin fallos. Marcá tu fila **P1 EN CURSO** en
   `openspec/SERIE-DEUDA-1/00-plan.md`.

## Alcance de P1 — `e2e-fresh`: script `npm run e2e:fresh` + timeout de la purga

Contexto: en SERIE-NOCHE-3 la receta e2e se replicó a mano 4 veces (migrate + reseed + build +
`CI=1 npx playwright test`) y el caso "cancelar" de `poblado-idempotente` espera 30 s cuando la
purga completa mide **38,7 s**. Esta ventana materializa la receta como script y corrige la espera.

**Tareas**:

1. Change openspec `e2e-fresh` (propose → apply). Es tooling puro: no toca specs de producto →
   `.openspec.yaml` con `skip_specs: true` y la justificación (ver `openspec/CONVENCION-DELTAS.md`).
2. Crear `k0mp4ss_fe/apps/web/scripts/e2e-fresh.mjs` (Node ESM, sin dependencias nuevas):
   - `export DATABASE_URL="file:./perf-e2e.db"` por defecto (o `--db <archivo>`); **jamás**
     `prisma/dev.db`.
   - Corre `npx prisma migrate deploy --schema=prisma/schema.sqlite.prisma`, luego
     `npm run e2e:reseed-base` y `npm run build` (salteable con `--no-build`).
   - Al final imprime un banner con: base usada, y el **comando exacto** de Playwright con paridad
     CI (`CI=1 npx playwright test <specs>`). Sin argumentos: los specs canónicos de la serie
     (`e2e/smoke` + los 9 crud de noche-3) — y el aviso de **no** correr el spec de rate-limit
     antes de la lane.
   - Todo lo que siga a `--` se pasa tal cual a Playwright (y con `--` corre el comando; sin `--`
     solo lo imprime).
   - Si el puerto 3000 está ocupado, matá el `next-server` huérfano antes de empezar (incidente de
     P4 de noche-3) y dejalo anotado en el avance.
3. Agregar `"e2e:fresh": "node scripts/e2e-fresh.mjs"` a `k0mp4ss_fe/apps/web/package.json`.
4. Subir la espera de `e2e/crud/poblado-idempotente.spec.ts:96` de 30 s a **120 s** (precedente:
   el test hermano usa 120 s).
5. **Verificación real**: correr `npm run e2e:fresh` completo con 2 specs dirigidos
   (`e2e/crud/poblado-idempotente.spec.ts` y `e2e/smoke`) con paridad CI sobre base descartable, y
   dejar el resultado (X/X verdes). Si un test cae por timeout de primer render, repetí la lane
   (el retry de CI lo tolera; no bajes expectativas).
6. Avance NSGC: documentar el script, la corrección de la espera y la evidencia de la lane (no hay
   manual de módulo: no cambia comportamiento ni estructura de la app).
7. Cerrar: commit(s) + push (con `nsgc-prepush`), fila **P1 HECHA** con el commit y entrada en la
   Bitácora.

**Gate de la ventana**: `npx tsc --noEmit` 0 · `npm run lint` 0 · `npm test` verde con los pisos
vigentes · lane e2e dirigida verde · `openspec validate --all` sin fallos · `check-delta-coverage`
ok para `e2e-fresh`.

**Archivos que podés tocar**: `k0mp4ss_fe/apps/web/scripts/e2e-fresh.mjs`,
`k0mp4ss_fe/apps/web/package.json`, `k0mp4ss_fe/apps/web/e2e/crud/poblado-idempotente.spec.ts`,
`openspec/changes/e2e-fresh/**`, `Data/NSGC/docs/avances/**`, `openspec/SERIE-DEUDA-1/00-plan.md`.

## Reporte final estandarizado (OBLIGATORIO — el owner lo copia al chat orquestador)

1. Ventana y estado (HECHA / PARCIAL / BLOQUEADO + motivo).
2. Commits (hash + subject) y push sí/no.
3. Specs creadas/modificadas + changes propuestos/archivados.
4. Números: tests X/Y, tsc/eslint OK, y las métricas propias de esta ventana: resultado de la lane
   e2e dirigida (specs y X/X verdes) y evidencia de que `dev.db` no se tocó.
5. Desviaciones vs este prompt.
6. Pendientes heredados a la(s) ventana(s) siguiente(s).
7. Última línea exacta: `BITACORA_ENTRY: <resumen 2-3 líneas>`
