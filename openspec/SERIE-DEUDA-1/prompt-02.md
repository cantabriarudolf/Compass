> **Este archivo ES tu prompt.** Ventana P2 de la serie deuda-1.
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
e2e con paridad CI: `npm run e2e:fresh` (lo crea esta ventana P1 de la serie; imprime el comando
Playwright exacto) y **nunca** correr el spec de rate-limit antes de la lane (bloquea la IP 15 min
y aborta `auth.setup`).

## Arranque: verificación de la ventana anterior (antes de tu alcance)

1. `git status` limpio y `git status -sb` **sin "ahead"** (todo pusheado) + `git log --oneline -8`.
2. **Fingerprint de base**: pisos `lib/**` 96/90/98/96 y global 90/80/90/90 en
   `vitest.config.ts`, 7 slices en `lib/store/slices/` y suite ≥ 1078. Si falta, pará y reportá
   qué base encontraste (no improvises un rebase).
3. **CI del push anterior**: `gh run list --branch serie/deuda-1 --limit 3` → el run del commit de
   P1 debe figurar `success` (deploy `skipped` es esperado). Si figura `failure`/`cancelled`:
   diagnosticá la causa, arreglala (commit `fix(...)` + test) y anotalo en la Bitácora **antes** de
   tu alcance. Si la API de GitHub no responde, reintentá una vez; si sigue caída, dejá constancia
   en la Bitácora y seguí (no bloquea tu alcance).
4. **Archives pendientes**: archivá `e2e-fresh` con CI verde observada
   (`check-delta-coverage` → `openspec archive e2e-fresh --yes` → `openspec validate --all` →
   commit `docs(openspec): archiva e2e-fresh (CI verde <run>)` + push). **Nunca archives sin CI
   verde observada**; si quedó incompleto, no lo archives: declaralo como deuda con su estado.
5. `openspec validate --all` → sin fallos.
6. `cd k0mp4ss_fe/apps/web && npm test` → suite verde con los pisos vigentes.
7. Contrastá con `openspec/SERIE-DEUDA-1/00-plan.md`: fila P1 `HECHA` → marcá la tuya `EN CURSO`;
   `HECHA` pero con algo roto → arreglalo primero; `PARCIAL`/`BLOQUEADO` → completá o documentá ese
   alcance antes del tuyo.

## Alcance de P2 — `fix-put-merge-scope`: reproducir y arreglar el 404 de MT

Contexto: en SERIE-NOCHE-3 P2 se detectó que el `PUT` de la página de MT
(`/api/mt/trabajos/[id]`) responde **404 "Registro no encontrado"** aunque la fila exista en la
base, por el chequeo de scope de `lib/api/put-merge.ts:53-57`. El split sacó esa página del camino
del store, pero el defecto **sigue vivo** y afecta a cualquier entidad que use el merge.

**Tareas**:

1. **Reproducir primero (RED)**: escribir un test de integración en `test/api/` (molde del
   directorio, Prisma real contra la BD de test) que haga el `PUT` sobre una fila existente y
   **falle** con el 404 actual. Antes de tocar código, correr el test y registrar la evidencia RED.
2. Diagnosticar la causa exacta del chequeo de scope (comunidad/param/fila) y corregir el punto
   correcto con el cambio **mínimo**, sin romper las guardias de scope de las otras entidades. Cada
   comportamiento que toques lleva su test: el nuevo (caso que fallaba) **y** uno que pruebe que el
   scope ajeno sigue devolviendo 404/403.
3. Change openspec `fix-put-merge-scope` (propose → apply). Delta `MODIFIED` solo si la spec viva
   describe la regla de scope; si no la describe, `skip_specs: true` con la justificación (leé
   `CONVENCION-DELTAS.md` y la spec de MT/API afectada). `check-delta-coverage` hasta 0.
4. **e2e dirigida con paridad CI**: `npm run e2e:fresh -- e2e/crud/proyectos.spec.ts` (el paso
   "Iniciar" era el que fallaba) y dejá el resultado (X/X verdes).
5. Avance NSGC: defecto, causa raíz, fix, tests RED→GREEN y evidencia e2e.
6. Cerrar: commit(s) + push (con `nsgc-prepush`), fila **P2 HECHA** con el commit y entrada en la
   Bitácora.

**Gate de la ventana**: test RED observado antes del fix · `npx tsc --noEmit` 0 · `npm run lint` 0 ·
`npm test` verde · e2e `proyectos` verde · `openspec validate --all` sin fallos ·
`check-delta-coverage` ok.

**Archivos que podés tocar**: `k0mp4ss_fe/apps/web/lib/api/put-merge.ts`,
`k0mp4ss_fe/apps/web/test/api/**`, `openspec/changes/fix-put-merge-scope/**`,
`Data/NSGC/docs/avances/**`, `openspec/SERIE-DEUDA-1/00-plan.md`.

## Reporte final estandarizado (OBLIGATORIO — el owner lo copia al chat orquestador)

1. Ventana y estado (HECHA / PARCIAL / BLOQUEADO + motivo).
2. Commits (hash + subject) y push sí/no.
3. Specs creadas/modificadas + changes propuestos/archivados.
4. Números: tests X/Y, tsc/eslint OK, y las métricas propias de esta ventana: evidencia RED del
   test, causa raíz y resultado de la e2e `proyectos` (X/X verdes).
5. Desviaciones vs este prompt.
6. Pendientes heredados a la(s) ventana(s) siguiente(s).
7. Última línea exacta: `BITACORA_ENTRY: <resumen 2-3 líneas>`
