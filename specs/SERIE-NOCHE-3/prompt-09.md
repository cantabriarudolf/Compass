> **Este archivo ES tu prompt.** Ventana P9 de la serie noche-3 (cierre de la serie).
> Leélo completo (incluido `openspec/SERIE-NOCHE-3/00-plan.md`) y ejecutá sus bloques en orden.
> Modo noche: **no le pidas confirmaciones al owner**. Si un gate falla dos veces, marcá la ventana
> BLOQUEADO en la tabla del plan con la evidencia y seguí con el cierre documental.

## Contexto común (válido para TODA la serie noche-3)
Proyecto Compass: Next 16 + TypeScript estricto + Prisma, monorepo `k0mp4ss_fe/` (app en
`k0mp4ss_fe/apps/web`, UI en `packages/ui`). Tests: Vitest (`test/`, ~993 verdes con pisos de
cobertura por área) + Playwright (`e2e/`, lanes crud/flujo/smoke/auth/a11y). Estado de partida:
rama `noche/serie-noche-3` (creada desde `main` `846e3e4`); PR #1 (`noche/serie-noche-2`, draft,
CI verde) es del ciclo anterior y **no se toca** (mergear es decisión del owner); censo del store y
deuda viva en `openspec/BACKLOG-100.md` + memoria Engram obs. 205.
Node: `export PATH="$HOME/.nvm/versions/node/v24.21.0/bin:$PATH"`.
Método del proyecto: todo cambio → change openspec (propose → apply → archive). Antes de escribir
cualquier delta: leer `openspec/CONVENCION-DELTAS.md` y correr
`node openspec/scripts/check-delta-coverage.mjs <change>` hasta que dé
`0 que romperían el archive`. Commits convencionales en español, un commit por work-unit,
automáticos al cerrar cada trabajo, commiteando SOLO los archivos del cambio. Skill `nsgc-prepush`
obligatoria antes de cada push (avance en `Data/NSGC/docs/avances/`, manual de módulo si cambia
comportamiento o estructura, Trazabilidad si cambia un estado).
Reglas duras: `STORE_VERSION = 28` congelado (no se toca el shape persistido); nunca tocar
`prisma/dev.db` ni `Data/NSGC/backups/`; nunca secretos en código ni docs; el término oficial es
**comunidad** ("condominio" no se usa nunca, RG §4); **modo noche: no le pidas confirmaciones al
owner**.
Verificación por ventana: `cd k0mp4ss_fe/apps/web && npx tsc --noEmit && npm test` (pisos por área)
+ `openspec validate --all` sin fallos + `check-delta-coverage` del change que toques.
e2e con paridad CI: `npm run e2e:fresh` (crea base descartable, siembra e imprime el comando
Playwright exacto) y **nunca** correr el spec de rate-limit antes de la lane (bloquea la IP 15 min
y aborta `auth.setup`).

## Arranque: verificación de la ventana anterior (antes de tu alcance)
1. `git status` limpio y `git status -sb` **sin "ahead"** (todo pusheado) + `git log --oneline -8`.
2. **CI del push anterior**: `gh run list --branch noche/serie-noche-3 --limit 3` → el run del
   commit de P8 debe figurar `success` (el job de deploy puede figurar `skipped`). Si figura
   `failure`/`cancelled`: diagnosticá la causa, arreglala (commit `fix(...)` + test) y anotalo en
   la Bitácora **antes** de tu alcance.
3. **Archives pendientes (obligatorio)**: `store-cleanup`, `st-split-fase2`, `api-cobertura-fases`
   y `store-cobertura-fase-b` deben quedar archivados con CI verde observada. Por cada uno que
   siga activo y completo: `check-delta-coverage` → `openspec archive <change> --yes` →
   `openspec validate --all` → commit `docs(openspec): archiva <change> (CI verde <run>)` + push.
   **Nunca archives sin CI verde observada.** Si un change quedó incompleto, **no** lo archives:
   declaralo como deuda post-serie con su estado exacto.
4. `openspec validate --all` → sin fallos.
5. `cd k0mp4ss_fe/apps/web && npm test` → suite verde con los pisos vigentes.
6. Contrastá con `openspec/SERIE-NOCHE-3/00-plan.md`: fila P8 `HECHA` → marcá la tuya `EN CURSO`;
   `PARCIAL`/`BLOQUEADO` → completá o documentá ese alcance antes del tuyo.

## Alcance de P9 — cierre de la serie
**Tareas**:
1. **Terminar la cobertura pendiente** del objetivo de la serie si P8 dejó fase abierta (mismo
   estándar que P8: tests comportamentales + pisos con la regla del ratchet, nunca bajar un piso).
2. **Gates completos de la serie**:
   - `cd k0mp4ss_fe/apps/web && npx tsc --noEmit` (0 errores) y `npm run lint` (0 errores).
   - `npm test` completo con los pisos finales; anotá tests X/Y y la cobertura final por área
     (global · `lib/**` · `app/api/**`).
   - `openspec validate --all` sin fallos.
   - `node openspec/scripts/check-delta-coverage.mjs <change>` para cada change tocado.
   - **e2e de la serie** con paridad CI sobre base descartable fresca (`npm run e2e:fresh`):
     lane `smoke` completa + los crud de los módulos refactorizados
     (`recursos`, `proyectos`, `directiva`, `gestion`, `portal`, `comunicacion`, `solicitudes`,
     `visor`, `poblado-idempotente`) → verdes, sin flaky. Si algo falla: es la única causa
     admitida para no cerrar la serie (arreglá antes de cerrar).
3. **Auditoría integral desde el repo** (la verdad es el repo, no la Bitácora):
   - `git log --oneline -40` vs las filas de `00-plan.md` (hashes reales) y corregí el plan si algo
     discrepa; `git status -sb` sin "ahead".
   - `ls openspec/changes/` → no debe quedar ningún change propio de la serie activo (los del owner
     sí pueden quedar, p. ej. `au-google-sso`).
   - Confirmá los invariantes: `STORE_VERSION = 28`, `prisma/dev.db` y `Data/NSGC/backups/`
     intactos (una corrida e2e nunca los toca) y `lib/store/slices/` con los 7 slices.
4. **PR**: creá (o actualizá si ya existe) el PR **draft** de `noche/serie-noche-3` → `main` con un
   resumen honesto: qué cambió (limpieza del store, split en 7 slices, cobertura API y del store),
   números (tests, cobertura por área, líneas de `lib/store.ts` antes/después), qué quedó fuera y la
   nota de que **el merge es decisión del owner**. No mergees, no pushees a `main`.
5. **Cierre documental**:
   - Escribí en `openspec/SERIE-NOCHE-3/00-plan.md` la sección **"Cierre de la serie"** (fecha,
     estado por ventana con commits, números finales, evidencia de los archives y **deuda
     post-serie** con lo que quedó fuera: cobertura restante, pergaminos del owner, etc.).
   - Avance NSGC de cierre en `Data/NSGC/docs/avances/` (con el antes/después de la estructura del
     store y la cobertura).
   - `mem_save` en Engram: tipo `decision`, título con el resultado de la serie, contenido
     What/Why/Where/Learned/Verificación y `topic_key: compass/serie-noche-3`.
6. Marcar tu fila P9 `HECHA` con el commit final.

**Gate de la ventana**: todos los gates del punto 2 en verde + los archives con CI verde observada +
PR draft creado + plan y avance escritos.

**Archivos que podés tocar**: lo necesario para terminar la cobertura pendiente
(`test/**`, `vitest.config.ts` solo `thresholds`), `openspec/**` (archives, plan de la serie),
`Data/NSGC/docs/{avances,manuales}/**`. Nada de producto fuera del alcance de la serie.

## Reporte final estandarizado (OBLIGATORIO — el owner lo copia al chat orquestador)
1. Ventana y estado (HECHA / PARCIAL / BLOQUEADO + motivo) y **estado final de la serie**.
2. Commits (hash + subject) y push sí/no.
3. Specs creadas/modificadas + changes archivados (los 4 propios de la serie) y lo que quedó activo.
4. Números finales: `STORE_VERSION`, tests X/Y, cobertura por área (global · `lib/**` ·
   `app/api/**`), líneas de `lib/store.ts` antes (8.889) y después, slices creados, e2e verde
   (specs y resultado), URL del PR draft.
5. Desviaciones vs el plan de la serie (ventana por ventana).
6. **Deuda post-serie** declarada (lo que el owner debe decidir o lo que quedó fuera del cap).
7. Última línea exacta: `BITACORA_ENTRY: <resumen 2-3 líneas>`
