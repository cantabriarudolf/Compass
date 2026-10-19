> **Este archivo ES tu prompt.** Ventana P5 de la serie noche-3.
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
   commit de P4 debe figurar `success` (el job de deploy puede figurar `skipped`). Si figura
   `failure`/`cancelled`: diagnosticá la causa, arreglala (commit `fix(...)` + test) y anotalo en
   la Bitácora **antes** de tu alcance. Si la API de GitHub no responde, reintentá una vez; si
   sigue caída, dejá constancia en la Bitácora y seguí (no bloquea tu alcance).
3. **Archives pendientes**: si alguna ventana anterior dejó un change completo con CI verde
   (`store-cleanup` de P1), archivalo acá con `check-delta-coverage` → `openspec archive <change> --yes`
   → `openspec validate --all` → commit `docs(openspec): archiva <change> (CI verde <run>)` + push.
   **Nunca archives sin CI verde observada.**
4. `openspec validate --all` → sin fallos.
5. `cd k0mp4ss_fe/apps/web && npm test` → suite verde con los pisos por área.
6. Contrastá con `openspec/SERIE-NOCHE-3/00-plan.md`: fila P4 `HECHA` → marcá la tuya `EN CURSO`;
   `HECHA` pero con algo roto → arreglalo primero; `PARCIAL`/`BLOQUEADO` → completá o documentá ese
   alcance antes del tuyo.

## Alcance de P5 — `st-split-fase2`: slices **GE** + **CV** y cierre del change
Última ventana del split: al terminarla el change `st-split-fase2` queda **19/19** (lo archiva el
ARRANQUE de P6 con CI verde).

**Tareas**:
1. `lib/store/slices/ge-slice.ts` — estado `solicitudesGE` + sus 4 acciones (task 4.3).
2. `lib/store/slices/cv-slice.ts` — estado `avisosCV`, `plantillasCV` + sus 5 acciones (task 4.4).
   **Importante**: `publicarActaEnCV` (slice AD de P3) muta `avisosCV`; cuando muevas CV verificá
   que ese camino siga funcionando con `get()`/`set()` y corré su test dedicado.
3. Combinar ambos en `lib/store.ts` con spread, remover el código movido y **verificar el estado
   final del split**: en `lib/store.ts` no debe quedar declarado el estado de ningún slice; los 7
   slices viven en `lib/store/slices/**` (task 4.5).
4. Movimiento puro (mismos nombres, firmas, mensajes y comportamiento). No tocar `STORE_VERSION`
   ni migraciones.
5. **Cerrar las tasks 5.1 y 5.2 del change**: documentar la estructura nueva
   (`lib/store.ts` + `lib/store/slices/<x>-slice.ts` combinados por spread, con los helpers puros en
   `lib/store/helpers.ts`) en el manual de arquitectura del proyecto (buscá el manual correcto en
   `Data/NSGC/docs/manuales/`) y escribir el avance NSGC de la serie con: líneas de `lib/store.ts`
   antes (8.889) y después, y una línea por slice.
6. Marcar los checkboxes 4.3–4.5 y 5.1–5.2 de `openspec/changes/st-split-fase2/tasks.md` (el change
   completo queda 19/19).

**Gate de la ventana**:
- `npx tsc --noEmit` 0 errores · `npm test` verde con pisos por área (incluye
  `test/store-solicitudes.test.ts`, `test/store-visor.test.ts` y los de AD/CO que tocan CV) ·
  `openspec validate --all` sin fallos.
- e2e con paridad CI: `e2e/crud/solicitudes.spec.ts`, `e2e/crud/visor.spec.ts` y
  `e2e/crud/directiva.spec.ts` (publicar acta) → verdes sobre base descartable fresca.
- Verificación estructural: `ls lib/store/slices/` = 7 slices; `lib/store.ts` con el estado de los
  slices fuera; `grep -c "avisosCV" lib/store.ts` = 0 en declaraciones.

**Archivos que podés tocar**: `k0mp4ss_fe/apps/web/lib/store/slices/**`, `lib/store.ts`,
`test/**` (solo imports/ajustes mecánicos), `e2e/**` (solo si un import lo exige),
`openspec/changes/st-split-fase2/tasks.md`, `Data/NSGC/docs/manuales/**`,
`Data/NSGC/docs/avances/**`, `openspec/SERIE-NOCHE-3/00-plan.md`.

**Cierre de la ventana**: commit + push (con `nsgc-prepush` hecho), fila P5 → `HECHA` con el commit
final y entrada en la Bitácora. Dejá anotado en la Bitácora que `st-split-fase2` queda 19/19 y
**pendiente de archive en el ARRANQUE de P6**.

## Reporte final estandarizado (OBLIGATORIO — el owner lo copia al chat orquestador)
1. Ventana y estado (HECHA / PARCIAL / BLOQUEADO + motivo).
2. Commits (hash + subject) y push sí/no.
3. Specs creadas/modificadas + changes propuestos/archivados.
4. Números: `STORE_VERSION`, tests X/Y, tsc/eslint OK, líneas de `lib/store.ts` antes/después,
   slices creados, e2e verde (specs y resultado).
5. Desviaciones vs este prompt.
6. Pendientes heredados a la(s) ventana(s) siguiente(s) (incluye: archivar `st-split-fase2`).
7. Última línea exacta: `BITACORA_ENTRY: <resumen 2-3 líneas>`
