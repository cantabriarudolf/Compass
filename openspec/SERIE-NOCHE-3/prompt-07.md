> **Este archivo ES tu prompt.** Ventana P7 de la serie noche-3.
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
   commit de P6 debe figurar `success` (el job de deploy puede figurar `skipped`). Si figura
   `failure`/`cancelled`: diagnosticá la causa, arreglala (commit `fix(...)` + test) y anotalo en
   la Bitácora **antes** de tu alcance. Si la API de GitHub no responde, reintentá una vez; si
   sigue caída, dejá constancia en la Bitácora y seguí (no bloquea tu alcance).
3. **Archives pendientes**: si alguna ventana anterior dejó un change completo con CI verde
   (`store-cleanup` de P1, `st-split-fase2` de P5), archivalo acá con `check-delta-coverage` →
   `openspec archive <change> --yes` → `openspec validate --all` → commit
   `docs(openspec): archiva <change> (CI verde <run>)` + push. **Nunca archives sin CI verde
   observada.**
4. `openspec validate --all` → sin fallos.
5. `cd k0mp4ss_fe/apps/web && npm test` → suite verde con los pisos por área.
6. Contrastá con `openspec/SERIE-NOCHE-3/00-plan.md`: fila P6 `HECHA` → marcá la tuya `EN CURSO`;
   `HECHA` pero con algo roto → arreglalo primero; `PARCIAL`/`BLOQUEADO` → completá o documentá ese
   alcance antes del tuyo.

## Alcance de P7 — `api-cobertura-fases`, fase 2 (cerrar el objetivo de la superficie API)
Continúa el change propuesto en P6 (misma capability, mismo `tasks.md`).

**Tareas**:
1. Medir la cobertura vigente: `cd k0mp4ss_fe/apps/web && npm test -- --coverage` y listar las
   carpetas de `app/api/**` que siguen por debajo del promedio (incluí las que P6 no llegó a tocar).
   Elegí las **siguientes 3-5 más bajas**.
2. Escribir tests reales para esas rutas con el mismo estándar de P6 (camino feliz, validación 400,
   guardias 401/403, 404 por scope de comunidad, casos borde propios del handler).
3. **Subir de nuevo los pisos** de `app/api/**` en `k0mp4ss_fe/apps/web/vitest.config.ts` con la
   regla del ratchet (medido − 1 punto) y **nunca bajar** un piso. Si el salto de cobertura del
   área deja el piso por debajo de lo medido, subilo también de forma proporcional (es el objetivo
   del cambio).
4. Si el objetivo declarado del change (fases 1+2) queda completo: marcá todas las tasks de
   `openspec/changes/api-cobertura-fases/tasks.md` y dejá anotado en la Bitácora que
   **el archive queda para el ARRANQUE de P8** (CI verde mediante). Si falta scope, declaralo
   explícitamente y dejá la fase 3 escrita en `tasks.md` para el cierre.
5. Anotar en el avance: cobertura `app/api/**` antes/después (de la serie completa), tests
   agregados por carpeta y pisos finales.

**Gate de la ventana**:
- `npx tsc --noEmit` 0 errores · `npm test` verde **con los pisos nuevos** ·
  `openspec validate --all` sin fallos · `check-delta-coverage` ok para `api-cobertura-fases`.
- Evidencia numérica: cobertura global y de `app/api/**` medidas (antes/después).

**Archivos que podés tocar**: `openspec/changes/api-cobertura-fases/**`,
`k0mp4ss_fe/apps/web/test/**`, `k0mp4ss_fe/apps/web/vitest.config.ts` (solo `thresholds`),
`Data/NSGC/docs/avances/**`, `openspec/SERIE-NOCHE-3/00-plan.md`.

**Cierre de la ventana**: commit + push (con `nsgc-prepush` hecho), fila P7 → `HECHA` con el commit
final y entrada en la Bitácora.

## Reporte final estandarizado (OBLIGATORIO — el owner lo copia al chat orquestador)
1. Ventana y estado (HECHA / PARCIAL / BLOQUEADO + motivo).
2. Commits (hash + subject) y push sí/no.
3. Specs creadas/modificadas + changes propuestos/archivados (incluye los archives hechos por
   P1/P5).
4. Números: tests X/Y, cobertura `app/api/**` y global antes/después, pisos finales, tsc/eslint OK.
5. Desviaciones vs este prompt.
6. Pendientes heredados a la(s) ventana(s) siguiente(s) (incluye: archivar `api-cobertura-fases` si
   quedó completo).
7. Última línea exacta: `BITACORA_ENTRY: <resumen 2-3 líneas>`
