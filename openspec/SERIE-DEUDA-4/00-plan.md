# Serie Deuda 4 — Desbloquear y ejecutar el merge final

> Toda ventana DEBE leer este archivo al iniciar, marcar su fila **EN CURSO** y actualizarla antes de
> cerrar. **Modo**: delegado con workers desde el chat orquestador, una ventana a la vez; el
> orquestador pushea, archiva, observa el CI y **hace el merge**. El owner autorizó el merge del
> PR #3 y pidió ejecución autónoma.

| Ventana | Alcance | Estado | Commit final |
|---|---|---|---|
| F1 | `fix-vercel-data-ignore` — corregir el `.vercelignore` (bloqueante del deploy y del merge) | pendiente | — |
| F2 | `deuda-menor` — el último warning de lint (`packages/ui`) + robustez de 4 CLIs | pendiente | — |
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
