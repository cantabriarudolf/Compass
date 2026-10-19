# Serie Deuda 4 — Desbloquear y ejecutar el merge final

> Toda ventana DEBE leer este archivo al iniciar, marcar su fila **EN CURSO** y actualizarla antes de
> cerrar. **Modo**: delegado con workers desde el chat orquestador, una ventana a la vez; el
> orquestador pushea, archiva, observa el CI y **hace el merge**. El owner autorizó el merge del
> PR #3 y pidió ejecución autónoma.

| Ventana | Alcance | Estado | Commit final |
|---|---|---|---|
| F1 | `fix-vercel-data-ignore` — corregir el `.vercelignore` (bloqueante del deploy y del merge) | HECHA | `6585f48` + `5e938f2` + doc |
| F2 | `deuda-menor` — el último warning de lint (`packages/ui`) + robustez de 4 CLIs | HECHA | `4203b01` + `b31fdab` + `88a1f9e` + `89c1a2a` + `c5bcbeb` + doc |
| F3 | Cierre de la serie + readiness del merge | HECHA | doc (cierre + avance + plan) |

**MÁXIMO: 3 ventanas.** Lo que no entre se declara como deuda post-serie en F3.

## Prerrequisito de base

- **Tip de partida**: `e1b14a6` (cierre de SERIE-DEUDA-3) en la rama `serie/deuda-1`, **apilada** sobre
  `noche/serie-noche-3` y `noche/serie-noche-2`. `main` está en `846e3e4`.
- **Merge autorizado por el owner**: se mergea **solo el PR #3** (`serie/deuda-1` → `main`) con
  **merge commit** (preserva los commits por work-unit de las 19 ventanas; **no** squash), porque el
  #3 trae **los 132 commits** de las tres capas apiladas (noche-2 + noche-3 + deuda-1/2/3). Después se
  cierran el PR #1 y el #2 como superados.
- **Fingerprint**: pisos global **93/84/92/93** · `lib/**` **98/93/98/98** · `app/api/**`
  **87/74/88/87**; 7 slices; `STORE_VERSION = 28`; suite **≥ 1304** (128 archivos); `npx eslint` de
  `apps/web` **0 problemas**.

## Reglas duras

1. **Rama `serie/deuda-1`**. Prohibido pushear a `main` **desde un worker**; el merge lo ejecuta el
   orquestador con la autorización del owner.
2. **Un commit por work-unit**, en español, commiteando solo los archivos del cambio. **Commitear por
   unidad, no al final** (hubo 5 cortes de ejecutor en las series previas: solo sobrevivió lo
   commiteado).
3. **Método openspec** + `check-delta-coverage` en 0 para cada change.
4. **`nsgc-prepush`** antes de cada push (avance en `Data/NSGC/docs/avances/`).
5. **El orquestador pushea, archiva, observa el CI y mergea.** Los workers **nunca** corren
   `git push` ni `gh` que escriba (el harness les pide aprobación interactiva que no pueden contestar).
6. **`STORE_VERSION = 28` congelado**; **nunca** tocar `prisma/dev.db` ni `Data/NSGC/backups/`.
7. **Nunca secretos**; el término oficial es **comunidad** (RG §4).
8. **Gate por ventana**: `tsc` 0 · `lint` 0 problemas · `npm test` verde con los pisos vigentes ·
   `openspec validate --all` sin fallos · `check-delta-coverage` ok. La suite completa, una sola vez.
9. **Gate falla dos veces** → BLOQUEADO con evidencia exacta, commit de lo sano o revert, y seguir.
10. **Nunca el spec de rate-limit antes de la lane e2e** (bloquea la IP 15 min).

## Base de hechos (lo que desbloquea el merge)

- **El check de Vercel del PR #3 falla**: `Deployment has failed`. Causa ya diagnosticada en el change
  del owner `fix-vercel-data-ignore`: la línea 6 del `.vercelignore` de la raíz tiene `Data/` y el
  motor de ignore de Vercel matchea **sin distinguir mayúsculas y a cualquier profundidad**, así que
  también excluye `k0mp4ss_fe/apps/web/data/` (los seeds de la app) → 11 errores
  `Module not found: Can't resolve '@/data/...'`. `Data/` pesa **122 MB** (119 MB son los backups),
  así que excluir la documentación sigue siendo necesario.
- **Deuda menor declarada al cerrar deuda-3**: un warning de `react-hooks/set-state-in-effect` en
  `k0mp4ss_fe/packages/ui/src/hooks/use-mobile.ts`, y 4 hallazgos de robustez en CLIs de `scripts/`
  (`restore-db.mjs:84` `JSON.parse`, `deploy-migrar-datos.mjs:64` `execSync`, y `new URL(...)` en
  `security-recheck.mjs:21` y `check-headers.mjs:14`).
- **Deuda que NO se paga (decisión argumentada)**: el techo de **99.95 %** de cobertura del store por
  API pública, por las 2 ramas defensivas (`: []` de dos `flatMap` filtrados) documentadas en E2 de
  deuda-3. Borrarlas cambiaría robustez por un número.
- **PRs**: #3 (`serie/deuda-1`, el que se mergea) · #2 (`noche/serie-noche-3`) y #1
  (`noche/serie-noche-2`), que quedan superados por el #3 y se cierran después del merge.
- **`main` no tiene branch protection** (repo privado sin GitHub Pro): no hay checks obligatorios, así
  que el merge no depende de un gate de GitHub, pero el CI de `main` **sí** corre en `push` a `main`
  (es la verificación post-merge que hay que observar).

## Bitácora
(cada ventana agrega su entrada ANTES de que el orquestador pushee: `- [fecha] F<n> HECHA: resumen (commits)`)

- 2026-10-19 **F1 HECHA**: `fix-vercel-data-ignore` cerrado en causa raíz. El
  `.vercelignore` de la raíz ya estaba anclado (`/Data/`, `52b26b9`); el que faltaba era
  **`k0mp4ss_fe/.vercelignore`** (Root Directory, creado en `1406277`), con el mismo `Data/` sin
  anclar → excluía `apps/web/data/**` y rompía el build. Fix `/Data/` + comentario de advertencia,
  verificado con `ignore@7.0.5` (`ignorecase: true`): seeds **INCLUIDO**, `Data/NSGC/backups/` y
  `openspec/` **EXCLUIDO**; mismo archivo con el patrón viejo los excluía (reproducción del bug).
  Gates: `tsc` 0 · `lint` 0 problemas · `npm test` 1304/1304 (128 archivos, 506.52 s) ·
  `openspec validate --all` 39/39 · `check-delta-coverage` 0 que romperían el archive ·
  `npm run build` ✓ (91/91 páginas). Commits `6585f48` (ignores), `5e938f2` (change) y el de docs
  (avance + este plan). **Sin pushear**: el redeploy de Vercel y el archive los hace el orquestador.
- 2026-10-19 **F2 HECHA**: `deuda-menor` cerrado en las dos deudas declaradas por deuda-3. El último
  warning del monorepo (`react-hooks/set-state-in-effect` en `packages/ui/src/hooks/use-mobile.ts`)
  murió reescribiendo el hook con `useSyncExternalStore` (sin `eslint-disable`, con snapshot de
  servidor `false` = el valor inicial histórico; mismo cálculo, misma suscripción, mismo cleanup) y
  un test de fijación de 5 casos en `apps/web/test/use-mobile.test.tsx`. Los 4 CLIs de `scripts/`
  pasaron a **mismo contrato, mejor error**: `restore-db` nombra el manifest ilegible/incompleto,
  `deploy-migrar-datos` agrega qué paso del corte falló sin tapar el output real de la herramienta
  (`stdio: "inherit"`) y `security-recheck`/`check-headers` resuelven `WEB_ROOT` con
  `fileURLToPath` + guarda que aborta claro (antes: 5 FAIL engañosos y un **falso verde exit 0** con
  un espacio en la ruta, por el `%20` de `new URL().pathname`). Gates: `tsc` 0 (app y packages/ui) ·
  `eslint` **0 problemas** en app y packages/ui (antes 1 warning) · `npm test` **1309/1309 en 129
  archivos** (563.05 s) con global 94.32/85.71/93.77/94.32 · `openspec validate --all` 40/40 ·
  `check-delta-coverage` 0 que romperían el archive. Commits `4203b01`, `b31fdab`, `88a1f9e`,
  `89c1a2a`, `c5bcbeb` y el de docs. **Sin pushear**: el push, el CI y el archive los hace el
  orquestador.
- 2026-10-19 **F3 HECHA**: serie cerrada y repo dejado **mergeable**. Gates del tip `e3b0255`:
  `npx tsc --noEmit` **0** en app y en `packages/ui` · `npm run lint` **0 problemas** (exit 0) en app y
  `npx eslint .` **0 problemas** (exit 0) en `packages/ui` · `npm test` **1309/1309 en 129 archivos**
  (501.03 s, exit 0) con global **94.32/85.70/93.77/94.32** (piso 93/84/92/93), `lib/**`
  **99.63/94.03/99.44/99.63** (piso 98/93/98/98) y `app/api/**` **88.44/75.67/90.07/88.44** (piso
  87/74/88/87) · `openspec validate --all` **40/40** · `check-delta-coverage` **0 que romperían el
  archive** · **e2e de la serie 24/24** (`e2e/smoke` + `e2e/crud/poblado-idempotente.spec.ts`, JUnit
  `test-results/junit.xml` con `tests="24" failures="0" errors="0"` y `.last-run.json`
  `{"status":"passed","failedTests":[]}`). Auditoría: fingerprint intacto (7 slices,
  `STORE_VERSION = 28`), `prisma/dev.db` con el mismo md5 que al abrir la ventana
  (`96736f425f9d680038b29bc89b8f02d3`), `Data/NSGC/backups/` intactos (119 MB, 19 entradas) y `main`
  **ancestro** de HEAD (142 commits, merge sin conflictos). Commits de cierre (doc de F3: plan +
  avance).
  **Sin pushear y sin tocar el PR #3**: el push, el archive, el merge y el CI los hace el orquestador.

---

## Cierre de la serie deuda-4

**Objetivo único de la serie: desbloquear el merge final del PR #3 y dejarlo mergeable.** Cumplido: el
bloqueante (check de Vercel en rojo) se corrigió en causa raíz en F1, la deuda menor se pagó en F2 y F3
cerró la serie con todos los gates verdes y el repo listo para el merge.

### Estado por ventana

| Ventana | Alcance | Estado | Commits |
|---|---|---|---|
| — | Materialización de la serie (plan + 3 prompts) | — | `199de2c` |
| F1 | `fix-vercel-data-ignore` — `.vercelignore` del Root Directory | HECHA | `6585f48`, `5e938f2`, `b3ed17a` |
| F2 | `deuda-menor` — último warning de lint + robustez de 4 CLIs | HECHA | `4203b01`, `b31fdab`, `88a1f9e`, `89c1a2a`, `c5bcbeb`, `e3b0255` |
| F3 | Cierre + readiness del merge | HECHA | cierre documental (este commit) |

Total: **10 commits** desde el tip de partida `e1b14a6`, más el commit de cierre de F3.

### Números finales (tip de la serie, medidos en F3)

| Gate / métrica | Resultado | Piso |
|---|---|---|
| `npx tsc --noEmit` (`apps/web`) | **0 errores** | 0 |
| `npx tsc --noEmit` (`packages/ui`) | **0 errores** | 0 |
| `npm run lint` (`apps/web`) | **0 problemas** (exit 0) | 0 |
| `npx eslint .` (`packages/ui`) | **0 problemas** (exit 0) | 0 |
| `npm test` | **1309/1309** en **129 archivos** (501.03 s) | ≥ 1304 · 128 arch |
| Cobertura global | **94.32 / 85.70 / 93.77 / 94.32** | 93/84/92/93 |
| `lib/**` | **99.63 / 94.03 / 99.44 / 99.63** | 98/93/98/98 |
| `app/api/**` | **88.44 / 75.67 / 90.07 / 88.44** | 87/74/88/87 |
| `lib/store.ts` | **99.95 / 93.84 / 100 / 99.95** (`:4323`, `:5131`) | — |
| `lib/store/slices` (7 slices) | **100 / 95.55 / 100 / 100** | — |
| `openspec validate --all` | **40 passed, 0 failed** | 0 fallos |
| `check-delta-coverage` | **0 que romperían el archive** (6 changes · 9 ok · 3 info) | 0 |
| e2e de la serie | **24/24 verdes** (286.86 s de JUnit) | 24/24 |
| `STORE_VERSION` | **28** (congelado, sin cambios en toda la serie) | 28 |
| `prisma/dev.db` | **intacto** (md5 `96736f425f9d680038b29bc89b8f02d3`, mtime 2026-10-17 22:55) | intacto |
| `Data/NSGC/backups/` | **intacto** (119 MB, 19 entradas) | intacto |

Detalle de la lane e2e (`npm run e2e:fresh -- --no-build -- e2e/smoke
e2e/crud/poblado-idempotente.spec.ts`, `CI=1`, base descartable `prisma/perf-e2e.db` recreada de
cero): `auth.setup.ts` 6/6 · `crud/poblado-idempotente.spec.ts` 2/2 · `smoke/modulos.spec.ts` 8/8 ·
`smoke/modulos-mobile.spec.ts` 8/8. El spec de rate-limit **no se corrió** (regla dura: bloquea la IP
15 min).

### Changes de esta serie

- `fix-vercel-data-ignore` (F1) y `deuda-menor` (F2): **completos**, con solo la casilla del
  orquestador/owner abierta (push + redeploy/CI + archive). Ningún otro change de la serie queda
  activo.
- Los otros 4 changes activos del repo (`a11y-p3-reservas-recursos`, `au-google-sso`,
  `e2e-higiene-determinismo`, `e2e-rojos-flujo-a11y-smoke`) son de series anteriores y **no** forman
  parte del alcance de deuda-4.

### Readiness del merge (estado dejado al orquestador)

- **Rama sincronizada en local, sin pushear**: `serie/deuda-1` queda **7 commits adelante** de
  `origin/serie/deuda-1` — los **6 de F2** (`4203b01`…`e3b0255`) y el **cierre de F3**; lo de F1 y la
  materialización ya están pusheados. El push lo hace el orquestador.
- **`main` es ancestro de HEAD**: `git log --oneline HEAD..main` = **0 commits**, `main..HEAD` = **142
  commits** ⇒ el merge del PR #3 no tiene conflictos ni divergencia.
- **`git status` limpio** al cierre (solo quedan las bases `prisma/perf-*.db` y `test-results/`, ambas
  gitignored).
- **Los dos `.vercelignore` están commiteados y sin diferencias contra HEAD**: `.vercelignore` (raíz) y
  `k0mp4ss_fe/.vercelignore` (Root Directory) con `/Data/` anclado — el fix de F1 está en el tip.
- **Verificaciones que debe hacer el orquestador DESPUÉS del merge** (en este orden):
  1. **Push** de `serie/deuda-1` a origin (con `nsgc-prepush` ya satisfecho por los avances de F1/F2/F3).
  2. **CI del PR #3 verde** (`ci.yml` sobre el PR) **antes** de mergear.
  3. **Check de Vercel verde** en el PR #3 (ya verde tras el fix de F1) — no debe volver a rojo.
  4. **Archive** de los dos changes (`fix-vercel-data-ignore`, `deuda-menor`) tras el CI verde.
  5. **Merge del PR #3 → `main`** con **merge commit** (no squash: preserva los commits por work-unit de
     las 19 ventanas / 142 commits).
  6. **CI post-merge**: el workflow de CI **sí corre en `push` a `main`** (no hay branch protection en
     el repo privado, así que es la única verificación automática del merge) → debe quedar **verde**.
  7. **Cerrar los PR #1 y #2** como superados por el #3.
  8. Post-merge opcional: redeploy de Vercel sobre `main` (mismo `.vercelignore` corregido).

### Deuda post-serie declarada

1. **Techo del 99.95 % de cobertura de `lib/store.ts`** por API pública: quedan **2 ramas/ramas
   defensivas por diseño** sin cubrir, en `lib/store.ts:4323` y `lib/store.ts:5131` (los `: []` de dos
   `flatMap` filtrados). Fue decisión argumentada en la serie deuda-2 (E2 `store-ramas-defensivas`):
   borrarlas cambiaría robustez por un punto de cobertura. **No se paga.**
2. **Nada se revirtió por riesgo** en deuda-4: los 10 commits de la serie están en el tip (F1: 3, F2: 6,
   materialización: 1). No hubo gates rojos ni rollbacks.
3. Deuda menor residual **no** cubierta por deuda-4 (fuera de alcance, sin cambio de estado): los 4
   CLIs de `scripts/` ahora fallan claro, pero `deploy-vercel.mjs` y `sync-schema.mjs` no fueron
   revisados en la ventana F2 (solo los 4 hallazgos declarados).
4. Los 4 changes activos de series anteriores siguen sin archivar (fuera del alcance de deuda-4).
