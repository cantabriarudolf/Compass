> **Este archivo ES tu prompt.** Ventana P3 de la serie deuda-1.
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
e2e con paridad CI: `npm run e2e:fresh` (lo crea la ventana 1 de la serie; imprime el comando
Playwright exacto) y **nunca** correr el spec de rate-limit antes de la lane (bloquea la IP 15 min
y aborta `auth.setup`).

## Arranque: verificación de la ventana anterior (antes de tu alcance)

1. `git status` limpio y `git status -sb` **sin "ahead"** (todo pusheado) + `git log --oneline -8`.
2. **Fingerprint de base**: pisos `lib/**` 96/90/98/96 y global 90/80/90/90 en
   `vitest.config.ts`, 7 slices en `lib/store/slices/` y suite ≥ 1078. Si falta, pará y reportá qué
   base encontraste (no improvises un rebase).
3. **CI del push anterior**: `gh run list --branch serie/deuda-1 --limit 3` → el run del commit de
   P2 debe figurar `success` (deploy `skipped` es esperado). Si figura `failure`/`cancelled`:
   diagnosticá la causa, arreglala (commit `fix(...)` + test) y anotalo en la Bitácora **antes** de
   tu alcance. Si la API de GitHub no responde, reintentá una vez; si sigue caída, dejá constancia
   en la Bitácora y seguí (no bloquea tu alcance).
4. **Archives pendientes**: archivá `fix-put-merge-scope` con CI verde observada
   (`check-delta-coverage` → `openspec archive fix-put-merge-scope --yes` → `openspec validate --all`
   → commit `docs(openspec): archiva fix-put-merge-scope (CI verde <run>)` + push). **Nunca archives
   sin CI verde observada**; si quedó incompleto, no lo archives: declaralo como deuda con su estado.
5. `openspec validate --all` → sin fallos.
6. `cd k0mp4ss_fe/apps/web && npm test` → suite verde con los pisos vigentes.
7. Contrastá con `openspec/SERIE-DEUDA-1/00-plan.md`: fila P2 `HECHA` → marcá la tuya `EN CURSO`;
   `HECHA` pero con algo roto → arreglalo primero; `PARCIAL`/`BLOQUEADO` → completá o documentá ese
   alcance antes del tuyo.

## Alcance de P3 — `api-cobertura-fase3`: 3 carpetas API más bajas (fase 3)

Contexto: al cierre de noche-3 quedaron como candidatas `qa-roadmap` 62.5%, `emisiones-gc` 66.89%
y `vinculos` 69.2% (statements). Rige la **medición real** de esta ventana.

**Tareas**:

1. Change openspec `api-cobertura-fase3` (propose → apply) con delta `MODIFIED` del requirement
   "Gate de cobertura por área" en la capability viva `DEV-qa-lab` (incluir **todos** los
   escenarios existentes con sus nombres exactos más uno nuevo de esta fase; leer
   `openspec/CONVENCION-DELTAS.md`). `check-delta-coverage` hasta `0 que romperían el archive`.
2. **Medir primero**: `cd k0mp4ss_fe/apps/web && npm test -- --coverage` y obtener el ranking real
   por carpeta de `app/api/**`. Elegir las **3 más bajas de la medición vigente** (las candidatas
   declaradas son solo una pista).
3. Tests reales por carpeta contra la **interfaz pública de los handlers exportados** (molde de
   `test/api/`): camino feliz, 400 de validación, 401 sin sesión, 403 por rol y 404 por scope.
   Prisma real contra la BD de test, **sin mocks de Prisma**, único mock `next/headers`, sin tocar
   handlers para hacerlos testeables.
4. Re-medir con la suite verde y **re-baselinear el piso `app/api/**`** en `vitest.config.ts`
   (medido − 1 pt; **nunca bajar**), documentando fecha y carpetas cubiertas.
5. Avance NSGC: cobertura por carpeta antes/después, tests agregados y piso nuevo.
6. Cerrar: commit(s) + push (con `nsgc-prepush`), fila **P3 HECHA** con el commit y entrada en la
   Bitácora.

**Gate de la ventana**: `npx tsc --noEmit` 0 (corrido **después** de agregar los tests — lección de
noche-3 P7) · `npm run lint` 0 · `npm test` verde **con los pisos nuevos aplicados** ·
`openspec validate --all` sin fallos · `check-delta-coverage` ok. e2e no aplica: tests y
configuración de cobertura, sin cambio de comportamiento.

**Archivos que podés tocar**: `k0mp4ss_fe/apps/web/test/api/**`,
`k0mp4ss_fe/apps/web/vitest.config.ts` (solo `thresholds`),
`openspec/changes/api-cobertura-fase3/**`, `Data/NSGC/docs/avances/**`,
`openspec/SERIE-DEUDA-1/00-plan.md`.

## Reporte final estandarizado (OBLIGATORIO — el owner lo copia al chat orquestador)

1. Ventana y estado (HECHA / PARCIAL / BLOQUEADO + motivo).
2. Commits (hash + subject) y push sí/no.
3. Specs creadas/modificadas + changes propuestos/archivados.
4. Números: tests X/Y, tsc/eslint OK, y las métricas propias de esta ventana: cobertura por carpeta
   antes/después, `app/api/**` antes/después y piso final.
5. Desviaciones vs este prompt.
6. Pendientes heredados a la(s) ventana(s) siguiente(s).
7. Última línea exacta: `BITACORA_ENTRY: <resumen 2-3 líneas>`
