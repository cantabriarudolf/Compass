> **Este archivo ES tu prompt.** Ventana P7 de la serie deuda-1 (cierre de la serie).
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
confirmaciones al owner** (si un gate falla dos veces: ventana BLOQUEADO con evidencia exacta).

Verificación por ventana: `cd k0mp4ss_fe/apps/web && npx tsc --noEmit && npm run lint && npm test`
(pisos por área) + `openspec validate --all` sin fallos + `check-delta-coverage` del change tocado.
e2e con paridad CI: `npm run e2e:fresh` (creado por la ventana 1 de la serie; imprime el comando
Playwright exacto) y **nunca** correr el spec de rate-limit antes de la lane (bloquea la IP 15 min
y aborta `auth.setup`).

## Arranque: verificación de la ventana anterior (antes de tu alcance)

1. `git status` limpio y `git status -sb` **sin "ahead"** (todo pusheado) + `git log --oneline -8`.
2. **Fingerprint de base**: pisos `lib/**` 96/90/98/96 y global 90/80/90/90 en
   `vitest.config.ts` (o los finales que la serie haya dejado), 7 slices en `lib/store/slices/` y
   suite ≥ 1078. Si falta, pará y reportá qué base encontraste.
3. **CI del push anterior**: `gh run list --branch serie/deuda-1 --limit 3` → el run del commit de
   P6 debe figurar `success` (deploy `skipped` es esperado). Si figura `failure`/`cancelled`:
   diagnosticá la causa, arreglala (commit `fix(...)` + test) y anotalo en la Bitácora **antes** de
   tu alcance. Si la API de GitHub no responde, reintentá una vez; si sigue caída, dejá constancia
   en la Bitácora y seguí.
4. **Archives pendientes (obligatorio)**: `e2e-fresh`, `fix-put-merge-scope`,
   `api-cobertura-fase3`, `api-cobertura-fase4` y `store-cobertura-fase-c` **ya quedaron
   archivados por el orquestador con CI verde observado** (ver la Bitácora del plan). Solo puede
   seguir activo `higiene-prosa-store-cleanup` (P6). Por cada uno que siga activo y completo:
   `check-delta-coverage` → `openspec archive <change> --yes` →
   `openspec validate --all` → commit `docs(openspec): archiva <change> (CI verde <run>)` + push.
   **Nunca archives sin CI verde observada**; si un change quedó incompleto, no lo archives:
   declaralo como deuda post-serie con su estado exacto.
5. `openspec validate --all` → sin fallos.
6. `cd k0mp4ss_fe/apps/web && npm test` → suite verde con los pisos vigentes.
7. Contrastá con `openspec/SERIE-DEUDA-1/00-plan.md`: fila P6 `HECHA` → marcá la tuya `EN CURSO`;
   `PARCIAL`/`BLOQUEADO` → completá o documentá ese alcance antes del tuyo.

## Alcance de P7 — cierre de la serie deuda-1

**Tareas**:

1. **Terminar lo pendiente** de P1–P6 si alguna ventana dejó fase abierta (mismo estándar y sin
   comprimir). **Excepción explícita y decidida por el owner**: los **111 statements** que P5 dejó
   sin cubrir en `lib/store.ts` **NO se pagan en esta ventana**. Se declaran como deuda post-serie
   citando `Data/NSGC/docs/avances/avance - 2026-10-17 16-05.md` § "Remanente declarado" (tabla de
   acciones y líneas). No abras una octava ventana ni comprimas este alcance.
2. **Gates completos de la serie**:
   - `cd k0mp4ss_fe/apps/web && npx tsc --noEmit` (0) y `npm run lint` (0).
   - `npm test` con los pisos finales: anotá tests X/Y y la cobertura final por área
     (global · `lib/**` · `app/api/**`).
   - `openspec validate --all` sin fallos + `check-delta-coverage` de cada change tocado.
   - **e2e de la serie** con `npm run e2e:fresh`: lane smoke completa + los cruds afectados por la
     serie (`poblado-idempotente`, `proyectos` y los que las ventanas hayan tocado) sobre base
     descartable fresca. Si algo falla: arreglalo antes de cerrar (es la única causa admitida para
     no cerrar).
   - **Deuda heredada de P2 — arreglar en esta ventana**: `e2e/crud/proyectos.spec.ts` necesita
     `test.use({ timeout: 120_000 })`. Con `CI=1` el presupuesto del test es de **30 s** para ~40
     interacciones de UI, así que muere rellenando el formulario, **antes** del paso "Iniciar". Es
     el mismo tipo de arreglo que P1 hizo en `poblado-idempotente` (y es la causa real del rojo que
     P2 reportó como "404 de MT": ese 404 no existe, ver la Bitácora de P2). Estás autorizado a
     tocar ese spec: después corré `npm run e2e:fresh -- --no-build -- e2e/crud/proyectos.spec.ts`
     y registrá el X/X.
3. **Auditoría integral desde el repo** (la verdad es el repo, no la Bitácora):
   - `git log --oneline -40` vs las filas de `00-plan.md` (hashes reales) y corregí el plan si algo
     discrepa; `git status -sb` sin "ahead".
   - `ls openspec/changes/` → no debe quedar ningún change propio de la serie activo (los del owner
     sí pueden quedar).
   - Confirmá los invariantes: `STORE_VERSION = 28`, `lib/store/slices/` con 7 slices,
     `prisma/dev.db` y `Data/NSGC/backups/` intactos.
4. **PR**: el PR **draft #3** `serie/deuda-1` → `main` **ya está abierto** (lo abrió el orquestador
   en P2, porque `ci.yml` solo dispara en `push` a `main` y en `pull_request`: sin PR, los pushes
   de la serie no generaban CI y la regla dura 5 quedaba insatisfacible). **No lo crees**: verificá
   con `gh pr view 3` y **actualizá su descripción** con un resumen honesto: qué
   cambió (tooling e2e, fix del 404 MT, cobertura API y del store, prosa), números (tests,
   cobertura por área, pisos), qué quedó fuera y la nota de que **el merge es decisión del owner**.
   No mergees, no pushees a `main`.
5. **Cierre documental**:
   - Escribí en `openspec/SERIE-DEUDA-1/00-plan.md` la sección **"Cierre de la serie"** (fecha,
     estado por ventana con commits, números finales, evidencia de los archives y **deuda
     post-serie** con lo que quedó fuera).
   - Avance NSGC de cierre en `Data/NSGC/docs/avances/`.
   - `mem_save` en Engram: tipo `decision`, título con el resultado de la serie, contenido
     What/Why/Where/Learned/Verificación y `topic_key: compass/serie-deuda-1`.
6. Marcar tu fila **P7 HECHA** con el commit final.

**Gate de la ventana**: todos los gates del punto 2 en verde + los archives con CI verde observada +
PR draft creado + plan y avance escritos.

**Archivos que podés tocar**: lo necesario para terminar lo pendiente (`test/**`,
`vitest.config.ts` solo `thresholds`), `openspec/**`, `Data/NSGC/docs/avances/**`. Nada de producto
fuera del alcance de la serie.

## Reporte final estandarizado (OBLIGATORIO — el owner lo copia al chat orquestador)

1. Ventana y estado (HECHA / PARCIAL / BLOQUEADO + motivo) y **estado final de la serie**.
2. Commits (hash + subject) y push sí/no.
3. Specs creadas/modificadas + changes archivados + lo que quedó activo.
4. Números finales: `STORE_VERSION`, tests X/Y, cobertura por área (global · `lib/**` ·
   `app/api/**`), pisos finales, e2e verde (specs y resultado) y URL del PR draft.
5. Desviaciones vs el plan de la serie (ventana por ventana).
6. **Deuda post-serie** declarada (lo que el owner debe decidir o lo que quedó fuera del cap).
7. Última línea exacta: `BITACORA_ENTRY: <resumen 2-3 líneas>`
