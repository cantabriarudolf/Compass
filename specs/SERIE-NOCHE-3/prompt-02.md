> **Este archivo ES tu prompt.** Ventana P2 de la serie noche-3.
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
   commit de P1 debe figurar `success` (el job de deploy puede figurar `skipped`). Si figura
   `failure`/`cancelled`: diagnosticá la causa, arreglala (commit `fix(...)` + test) y anotalo en
   la Bitácora **antes** de tu alcance. Si la API de GitHub no responde, reintentá una vez; si
   sigue caída, dejá constancia en la Bitácora y seguí (no bloquea tu alcance).
3. **Archives pendientes**: si P1 dejó un change completo (tasks 100%, delta listo) y su CI está
   verde: `node openspec/scripts/check-delta-coverage.mjs store-cleanup` →
   `openspec archive store-cleanup --yes` → `openspec validate --all` → commit
   `docs(openspec): archiva store-cleanup (CI verde <run>)` + push. **Nunca archives sin CI verde
   observada.**
4. `openspec validate --all` → sin fallos.
5. `cd k0mp4ss_fe/apps/web && npm test` → suite verde con los pisos por área.
6. Contrastá con `openspec/SERIE-NOCHE-3/00-plan.md`: fila P1 `HECHA` → marcá la tuya `EN CURSO`;
   `HECHA` pero con algo roto → arreglalo primero; `PARCIAL`/`BLOQUEADO` → completá o documentá ese
   alcance antes del tuyo.

## Alcance de P2 — `st-split-fase2`: slices **IR** (Inventario y Recursos) + **MT** (Mantenimiento y Proyectos)
El change `st-split-fase2` ya está propuesto (proposal + design + tasks, 0/19). Esta ventana avanza
las tasks del slice IR (1.1–1.7) y del slice MT (2.1–2.3). **No lo archives** (lo cierra P5; lo
archiva el ARRANQUE de P6 con CI verde).

**Patrón obligatorio** (el del proposal): cada slice es una factory zustand
`export const irSlice: StateCreator<CompassStore, [], [], IRSlic> = (set, get) => ({ ... })` en
`lib/store/slices/<x>-slice.ts`, combinada en `lib/store.ts` con spread. Sacá `set`/`get` del
estado global como hoy; los helpers puros ya viven en `lib/store/helpers.ts` (importalos, no los
dupliques). Tipos compartidos: `import type { CompassStore } from "../store"` (type-only: sin ciclo
runtime, igual que `helpers.ts`). Si un tipo del slice no está exportado desde `types/` ni
`lib/schemas.ts`, movelo al slice; si lo comparten dos slices, a `lib/store/slices/types.ts`.

**Tareas**:
1. `lib/store/slices/ir-slice.ts` — estado `activosIR`, `solicitudesInsumoIR`, `entregasEPP` + sus
   9 acciones (tasks 1.1–1.2).
2. `lib/store/slices/mt-slice.ts` — estado `trabajosMT`, `proyectosMT` + sus 6 acciones (task 2.1).
3. `lib/store.ts`: importar ambos slices y combinarlos con spread; **remover** de `lib/store.ts` el
   código movido (estado + acciones + tipos locales que ya no se usan allí) (tasks 1.3–1.4, 2.2).
4. **Es un MOVE, no un refactor**: comportamiento idéntico, mismas firmas, mismos nombres, mismos
   mensajes de error. No renombres nada, no cambies `STORE_VERSION`, no toques migraciones ni el
   shape persistido. El diff debe leerse como movimiento puro.
5. Anotar en el avance: líneas de `lib/store.ts` antes/después y líneas de cada slice nuevo.
6. Actualizar los checkboxes de `openspec/changes/st-split-fase2/tasks.md` (1.1–1.7 y 2.1–2.3).

**Gate de la ventana**:
- `npx tsc --noEmit` 0 errores · `npm test` verde con pisos por área (incluye
  `test/store-recursos.test.ts` y `test/store-mantenimiento.test.ts`) · `openspec validate --all`
  sin fallos.
- e2e con paridad CI de los dos módulos: `e2e/crud/recursos.spec.ts` y `e2e/crud/proyectos.spec.ts`
  → verdes sobre base descartable fresca (`npm run e2e:fresh`).
- Verificación estructural: `grep -c "activosIR" lib/store.ts` (el estado ya no se declara ahí),
  `lib/store.ts` más chico que antes y `lib/store/slices/{ir,mt}-slice.ts` presentes.

**Archivos que podés tocar**: `k0mp4ss_fe/apps/web/lib/store/slices/**` (nuevo),
`k0mp4ss_fe/apps/web/lib/store.ts`, `k0mp4ss_fe/apps/web/test/**` (solo imports/ajustes mecánicos),
`k0mp4ss_fe/apps/web/e2e/**` (solo si un import lo exige), `openspec/changes/st-split-fase2/tasks.md`,
`Data/NSGC/docs/avances/**`, `openspec/SERIE-NOCHE-3/00-plan.md`.

**Cierre de la ventana**: commit + push (con `nsgc-prepush` hecho), fila P2 → `HECHA` con el commit
final y entrada en la Bitácora.

## Reporte final estandarizado (OBLIGATORIO — el owner lo copia al chat orquestador)
1. Ventana y estado (HECHA / PARCIAL / BLOQUEADO + motivo).
2. Commits (hash + subject) y push sí/no.
3. Specs creadas/modificadas + changes propuestos/archivados.
4. Números: `STORE_VERSION`, tests X/Y, tsc/eslint OK, líneas de `lib/store.ts` antes/después,
   líneas por slice nuevo, e2e verde (specs y resultado).
5. Desviaciones vs este prompt.
6. Pendientes heredados a la(s) ventana(s) siguiente(s).
7. Última línea exacta: `BITACORA_ENTRY: <resumen 2-3 líneas>`
