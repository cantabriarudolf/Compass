# Serie Deuda 4 — Desbloquear y ejecutar el merge final

> Toda ventana DEBE leer este archivo al iniciar, marcar su fila **EN CURSO** y actualizarla antes de
> cerrar. **Modo**: delegado con workers desde el chat orquestador, una ventana a la vez; el
> orquestador pushea, archiva, observa el CI y **hace el merge**. El owner autorizó el merge del
> PR #3 y pidió ejecución autónoma.

| Ventana | Alcance | Estado | Commit final |
|---|---|---|---|
| F1 | `fix-vercel-data-ignore` — corregir el `.vercelignore` (bloqueante del deploy y del merge) | HECHA | `6585f48` + `5e938f2` + doc |
| F2 | `deuda-menor` — el último warning de lint (`packages/ui`) + robustez de 4 CLIs | HECHA | `4203b01` + `b31fdab` + `88a1f9e` + `89c1a2a` + `c5bcbeb` + doc |
| F3 | Cierre de la serie + readiness del merge | pendiente | — |

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
