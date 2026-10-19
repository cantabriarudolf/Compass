> **Este archivo ES tu prompt.** Ventana P1 de la serie noche-3.
> Leélo completo (incluido `openspec/SERIE-NOCHE-3/00-plan.md`) y ejecutá sus bloques en orden.
> Modo noche: **no le pidas confirmaciones al owner**. Si un gate falla dos veces, marcá la ventana
> BLOQUEADO en la tabla del plan con la evidencia y seguí.

## Contexto común (válido para TODA la serie noche-3)
Proyecto Compass: Next 16 + TypeScript estricto + Prisma, monorepo `k0mp4ss_fe/` (app en
`k0mp4ss_fe/apps/web`, UI en `packages/ui`). Tests: Vitest (`test/`, 993 verdes con pisos de
cobertura por área) + Playwright (`e2e/`, lanes crud/flujo/smoke/auth/a11y). Estado de partida:
rama `noche/serie-noche-3` (creada desde `main` `846e3e4`); PR #1 (`noche/serie-noche-2`, draft,
CI verde) es del ciclo anterior y **no se toca**; censo del store y deuda viva en
`openspec/BACKLOG-100.md` + memoria Engram obs. 205.
Node: `export PATH="$HOME/.nvm/versions/node/v24.21.0/bin:$PATH"`.
Método del proyecto: todo cambio → change openspec (propose → apply → archive). Antes de escribir
cualquier delta: leer `openspec/CONVENCION-DELTAS.md` y correr
`node openspec/scripts/check-delta-coverage.mjs <change>` hasta que dé
`0 que romperían el archive`. Commits convencionales en español, un commit por work-unit,
automáticos al cerrar cada trabajo, commiteando SOLO los archivos del cambio. Skill `nsgc-prepush`
obligatoria antes de cada push (avance en `Data/NSGC/docs/avances/`, manual de módulo si cambia
comportamiento o estructura, Trazabilidad si cambia un estado).
Reglas duras: `STORE_VERSION = 28` congelado (no se toca el shape persistido; si algo lo exigiera
se marca BLOQUEADO, no se improvisa); nunca tocar `prisma/dev.db` ni `Data/NSGC/backups/` (las
corridas usan bases descartables `prisma/perf*.db`); nunca secretos en código ni docs; el término
oficial es **comunidad** ("condominio" no se usa nunca, RG §4); **modo noche: no le pidas
confirmaciones al owner**.
Verificación por ventana: `cd k0mp4ss_fe/apps/web && npx tsc --noEmit && npm test` (pisos por área)
+ `openspec validate --all` sin fallos + `check-delta-coverage` del change que toques.
e2e con paridad CI: `npm run e2e:fresh` (crea base descartable, siembra e imprime el comando
Playwright exacto) y **nunca** correr el spec de rate-limit antes de la lane (bloquea la IP 15 min
y aborta `auth.setup`).

## Arranque (P1 — abre la serie)
1. `git status` limpio, `git status -sb` sin "ahead" y `git log --oneline -6`.
   **Si el commit de materialización de la serie (com 9b2433b, el que creó estos archivos) quedó
   local sin pushear** (la red de GitHub viene intermitente): pusheálo vos antes de tu alcance con
   `git push -u origin noche/serie-noche-3` (reintentá hasta 3 veces si falla; si sigue caída, dejá
   constancia en la Bitácora y seguí: el push de tu ventana lo reintenta de nuevo).
2. Confirmá que estás en la rama `noche/serie-noche-3` (la creó el orquestador al materializar la
   serie, desde `main`). Si no estás en ella: `git switch noche/serie-noche-3`.
3. `openspec validate --all` → sin fallos.
4. `cd k0mp4ss_fe/apps/web && npm test` → suite verde con los pisos por área. Si algo falla,
   ARREGLALO primero (commit `fix(...)`), anotalo en la Bitácora y recién después seguí.
5. Marcá tu fila P1 como `EN CURSO` en `openspec/SERIE-NOCHE-3/00-plan.md`.

## Alcance de P1 — `store-cleanup` (borrar lo que el store legacy ya no usa)
**Problema (medido, 2026-10-14)**: `lib/store.ts` (8.889 líneas) está marcado `@deprecated` pero
sigue **vivo**: de los 182 miembros de `CompassStore`, 107 los usa la app, 4 solo el QA-Lab y 21
solo tests; 1 está muerto (`toggleActivoTipoUnidad`). El BACKLOG prometía un `store-cleanup` que
"eliminará las acciones que ya nadie usa": esta ventana lo salda con evidencia, sin tocar lo que
sí se usa.

**Tareas**:
1. Change openspec `store-cleanup` (propose → apply) con delta `MODIFIED` en la capability viva
   `ST-capa-datos-persistente` (el requirement que describe el store legacy / las acciones
   deprecadas). Leé `openspec/CONVENCION-DELTAS.md` ANTES de escribirlo (trampa 1: el delta debe
   arrastrar **todos** los escenarios vigentes del requirement; trampa 3: la prosa debe ser la
   misma que la de la spec viva).
2. **Censo fino por miembro** (script ad-hoc, no versionado): para cada miembro de la interface
   `CompassStore` de `lib/store.ts`, contar referencias en cuatro lugares separados:
   (a) el propio `lib/store.ts` (uso **intra-store**: acciones que llaman a otras acciones o leen
   otros campos), (b) `app/**` + `lib/**` sin el store (uso real de la app), (c) `test/**`,
   (d) `e2e/**`. Excluí de los conteos `prisma/**`, `lib/schemas.ts` y `*.md` (colisión de nombres:
   una colección se llama igual que un campo de Prisma). Salida: tabla `miembro → clasificación`
   (`muerto` / `solo-test` / `qa-lab` / `app` / `intra-store`).
3. **Borrar**: los `muerto` y los `solo-test` **que tampoco se usen intra-store**, junto con su
   línea de interface y sus tests dedicados. **NO borrar**: campos de estado persistidos
   (`CompassData` y los `*IR/*MT/...` del shape), nada usado por la app o el QA-Lab, nada que
   aparezca en una migración de Prisma, y ninguna acción que otra acción del store llame.
4. **Guardas de la limpieza**: el shape persistido **no cambia** (`STORE_VERSION` sigue 28, no se
   toca ninguna migración ni `lib/store/migrations`), `useCompassStore` sigue exportando lo mismo
   que la app consume, y el conteo de tests que baje (los borrados) queda documentado en el avance.
5. Documentar en el avance NSGC: miembros antes/después, líneas de `lib/store.ts` antes/después y
   la lista de lo borrado con su clasificación.

**Gate de la ventana**:
- `npx tsc --noEmit` 0 errores · `npm test` verde con los pisos por área (anotá el conteo nuevo) ·
  `openspec validate --all` sin fallos · `check-delta-coverage` ok para `store-cleanup`.
- e2e dirigida con paridad CI (toca el store de punta a punta):
  `e2e/crud/poblado-idempotente.spec.ts` + `e2e/flujo/poblado.spec.ts`
  → verde, sin flaky, sobre base descartable fresca (`npm run e2e:fresh`).

**Archivos que podés tocar**: `openspec/changes/store-cleanup/**`,
`openspec/specs/ST-capa-datos-persistente/spec.md` (solo vía archive),
`k0mp4ss_fe/apps/web/lib/store.ts`, `k0mp4ss_fe/apps/web/test/**` (solo tests del store),
`Data/NSGC/docs/avances/**`, `openspec/BACKLOG-100.md`, `openspec/SERIE-NOCHE-3/00-plan.md`.

**Cierre de la ventana**: commit + push (con `nsgc-prepush` hecho), marcar tu fila P1 `HECHA` con
el commit final y agregar tu entrada a la Bitácora. **El archive del change lo hace el ARRANQUE de
P2** cuando el CI de tu push esté verde (no esperes el run desde acá).

## Reporte final estandarizado (OBLIGATORIO — el owner lo copia al chat orquestador)
1. Ventana y estado (HECHA / PARCIAL / BLOQUEADO + motivo).
2. Commits (hash + subject) y push sí/no.
3. Specs creadas/modificadas + changes propuestos/archivados.
4. Números: `STORE_VERSION`, tests X/Y, tsc/eslint OK, miembros y líneas de `lib/store.ts`
   antes/después, e2e verde (specs y resultado).
5. Desviaciones vs este prompt.
6. Pendientes heredados a la(s) ventana(s) siguiente(s).
7. Última línea exacta: `BITACORA_ENTRY: <resumen 2-3 líneas>`
