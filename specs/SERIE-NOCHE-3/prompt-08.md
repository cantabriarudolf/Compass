> **Este archivo ES tu prompt.** Ventana P8 de la serie noche-3.
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

## Arranque: verificación de la ventana anterior (antes de tu alcance)
1. `git status` limpio y `git status -sb` **sin "ahead"** (todo pusheado) + `git log --oneline -8`.
2. **CI del push anterior**: `gh run list --branch noche/serie-noche-3 --limit 3` → el run del
   commit de P7 debe figurar `success` (el job de deploy puede figurar `skipped`). Si figura
   `failure`/`cancelled`: diagnosticá la causa, arreglala (commit `fix(...)` + test) y anotalo en
   la Bitácora **antes** de tu alcance. Si la API de GitHub no responde, reintentá una vez; si
   sigue caída, dejá constancia en la Bitácora y seguí (no bloquea tu alcance).
3. **Archives pendientes**: archivalo acá con CI verde observada —
   `store-cleanup` (P1), `st-split-fase2` (P5), `api-cobertura-fases` (P6+P7, si quedó completo):
   por cada uno `check-delta-coverage` → `openspec archive <change> --yes` →
   `openspec validate --all` → commit `docs(openspec): archiva <change> (CI verde <run>)` + push.
4. `openspec validate --all` → sin fallos.
5. `cd k0mp4ss_fe/apps/web && npm test` → suite verde con los pisos por área.
6. Contrastá con `openspec/SERIE-NOCHE-3/00-plan.md`: fila P7 `HECHA` → marcá la tuya `EN CURSO`;
   `HECHA` pero con algo roto → arreglalo primero; `PARCIAL`/`BLOQUEADO` → completá o documentá ese
   alcance antes del tuyo.

## Alcance de P8 — `store-cobertura-fase-b`: cobertura real de `lib/store/**`
Contexto: el store es el archivo más pesado de cobertura del repo (`lib/store.ts` con ~1.202
statements sin cubrir según `openspec/changes/archive/2026-10-12-ci-verde-ratchet-cobertura/design.md`).
Tras el split (P2–P5) esa cobertura ahora se reparte entre `lib/store.ts` y los 7 slices de
`lib/store/slices/**`. Este es el change propio que la deuda pedía.

**Tareas**:
1. Change openspec `store-cobertura-fase-b` (propose → apply) con delta `MODIFIED` en la misma
   capability viva del ratchet (la del change archivado `ci-verde-ratchet-cobertura`).
2. **Medir de verdad**: `cd k0mp4ss_fe/apps/web && npm test -- --coverage` y obtener el detalle por
   archivo de `lib/**`. Listá los archivos de `lib/store/**` (slices + helpers) y `lib/store.ts`
   con más statements sin cubrir.
3. Escribir tests **comportamentales** sobre la API pública del store (`useCompassStore` /
   `CompassStore`: acciones y selectores), siguiendo el molde de los `test/store-*.test.ts`
   existentes: cada test afirma el efecto observable de la acción (estado resultante, `StoreResult`,
   validaciones y errores), nunca detalles internos ni líneas. Priorizá las acciones con más
   statements sin cubrir de los slices.
4. **Subir los pisos** en `k0mp4ss_fe/apps/web/vitest.config.ts`: `lib/**` con la regla del ratchet
   (medido − 1 punto) y el piso global si la medición global también subió. **Nunca bajar** un piso.
5. Anotar en el avance: cobertura `lib/**` antes/después, tests agregados y pisos nuevos. Si el
   objetivo declarado no cabe en la ventana, dejá la fase siguiente escrita en el `tasks.md` del
   change para el cierre (P9) — **no comprimas la ventana**.
6. Actualizar `openspec/changes/store-cobertura-fase-b/tasks.md`.

**Gate de la ventana**:
- `npx tsc --noEmit` 0 errores · `npm test` verde **con los pisos nuevos** aplicados ·
  `openspec validate --all` sin fallos · `check-delta-coverage` ok para `store-cobertura-fase-b`.
- Evidencia numérica: cobertura `lib/**` y global antes/después.

**Archivos que podés tocar**: `openspec/changes/store-cobertura-fase-b/**`,
`k0mp4ss_fe/apps/web/test/**`, `k0mp4ss_fe/apps/web/vitest.config.ts` (solo `thresholds`),
`Data/NSGC/docs/avances/**`, `openspec/SERIE-NOCHE-3/00-plan.md`.

**Cierre de la ventana**: commit + push (con `nsgc-prepush` hecho), fila P8 → `HECHA` con el commit
final y entrada en la Bitácora.

## Reporte final estandarizado (OBLIGATORIO — el owner lo copia al chat orquestador)
1. Ventana y estado (HECHA / PARCIAL / BLOQUEADO + motivo).
2. Commits (hash + subject) y push sí/no.
3. Specs creadas/modificadas + changes propuestos/archivados (incluye los archives que hayas hecho).
4. Números: tests X/Y, cobertura `lib/**` y global antes/después, pisos finales, tsc/eslint OK.
5. Desviaciones vs este prompt.
6. Pendientes heredados a la(s) ventana(s) siguiente(s) (incluye lo que el cierre debe terminar).
7. Última línea exacta: `BITACORA_ENTRY: <resumen 2-3 líneas>`
