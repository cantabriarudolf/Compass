# Serie Deuda 3 — Cerrar la deuda residual post-deuda-2

> Toda ventana DEBE leer este archivo al iniciar (bloque ARRANQUE), marcar su fila **EN CURSO** y
> actualizarla antes de cerrar. La Bitácora es el registro durable de la serie.
> **Modo de ejecución**: delegado con workers desde el chat orquestador (`serie-executor`), una
> ventana a la vez, con auditoría contra el repo al volver cada una. El orquestador hace los pushes,
> los archives y la observación del CI.

| Ventana | Alcance | Estado | Commit final |
|---|---|---|---|
| E1 | `lint-warnings-cero` — los 35 warnings de ESLint a cero (3 causas raíz) | pendiente | — |
| E2 | `store-ramas-defensivas` — documentar los 2 fallbacks defensivos y declarar el techo del 99.95 % | pendiente | — |
| E3 | `flaky-pe-panels` — presupuesto explícito para el test flaky de retiro de encomienda | pendiente | — |
| E4 | `ci-db-descartable` — alinear los 3 `DATABASE_URL` de `ci.yml` y quitar la excepción de la guarda | pendiente | — |
| E5 | Cierre de la serie: auditoría integral, e2e final, PR y deuda post-serie | pendiente | — |

**MÁXIMO: 5 ventanas.** Prohibido abrir ventanas fuera del cap: lo que no entre se declara como
deuda post-serie en el cierre (E5), no se improvisa.

## Prerrequisito de base

- **Tip de partida**: `0740da9`, el cierre de SERIE-DEUDA-2, que está **apilado** sobre
  `noche/serie-noche-3` (`1b23219`) y SERIE-DEUDA-1. Mientras el PR #2 (noche-3) siga sin mergear,
  el diff contra `main` incluirá también aquellos commits (ruido de diff, no bloqueo).
- **Rama de trabajo: `serie/deuda-1`** — se continúa la rama para que el **PR draft #3** siga siendo
  el paraguas de todo el pago de deuda y el CI ya esté cableado. El owner puede pedir una rama
  propia si prefiere separar los PRs.
- **Fingerprint** (lo verifica el ARRANQUE de cada ventana): pisos global **93/84/92/93** · `lib/**`
  **98/93/98/98** · `app/api/**` **87/74/88/87** en `vitest.config.ts`, **7 slices** en
  `lib/store/slices/`, `STORE_VERSION = 28`, suite **≥ 1299** tests (126 archivos) y
  `npm run lint` **exit 0 con 35 warnings**.

## Reglas duras de la serie

1. **Rama `serie/deuda-1`**. Prohibido pushear a `main`; prohibido mergear (es decisión del owner).
2. **Un commit por work-unit**, estilo convencional en español, automático al cerrar cada trabajo,
   commiteando **solo** los archivos del cambio. **Commitear por unidad, no al final**: en las dos
   series anteriores hubo **5 cortes de ejecutor** y solo sobrevivió el trabajo ya commiteado.
3. **Método openspec**: todo cambio va por `propose → apply → archive`. Para cada delta: leer
   `openspec/CONVENCION-DELTAS.md` y correr `node openspec/scripts/check-delta-coverage.mjs <change>`
   hasta que dé `0 que romperían el archive`.
4. **`nsgc-prepush` obligatorio antes de cada push** (avance en `Data/NSGC/docs/avances/`).
5. **El orquestador pushea, archiva y observa el CI.** Los workers **nunca** corren `git push` ni
   `gh pr edit`: el harness les pide aprobación interactiva que no pueden contestar (así se colgaron
   30 minutos varios ejecutores). **Nunca se archiva sin CI verde observada.**
6. **`STORE_VERSION = 28` congelado**: ningún cambio de la serie toca el shape persistido.
7. **Nunca** tocar `k0mp4ss_fe/apps/web/prisma/dev.db` ni `Data/NSGC/backups/`. Desde D1 la suite usa
   la base descartable `prisma/perf-test.db`.
8. **Nunca secretos** en código, docs ni commits. El término oficial es **comunidad** ("condominio"
   no se usa nunca, RG §4).
9. **Gate por ventana**: `cd k0mp4ss_fe/apps/web && npx tsc --noEmit && npm run lint && npm test`
   (pisos por área), `openspec validate --all` sin fallos y `check-delta-coverage` del change tocado.
   La suite completa se corre **una sola vez**, como gate al final.
10. **Si un gate falla dos veces**: BLOQUEADO (tabla + Bitácora con la evidencia exacta), commit de lo
    sano o revert de lo roto, y **seguir**. Nunca quedarse reintentando ni pedir intervención.
11. **Alcance cerrado**: cada ventana toca solo los archivos que declara su prompt.
12. **Nunca correr el spec de rate-limit antes de la lane e2e** (bloquea la IP 15 min y aborta
    `auth.setup`).

## Base de hechos (deuda declarada al cerrar deuda-2)

- **35 warnings de lint** con `exit 0`, en **3 causas raíz** medidas por el orquestador:
  **21** `turbo/no-undeclared-env-vars` (11 en `test/`, 8 en `scripts/`, 1 en `e2e/`, 1 en
  `proxy.ts`) que se cierran declarando `CSP_ENFORCEMENT`, `SQLITE_URL`, `POSTGRES_URL`,
  `DATABASE_URL_POSTGRES`, `COMUNIDAD_ID` y `SKIP_DATOS` en `turbo.json`; **13** en `scripts/*.mjs`
  (11 `no-undef` de globales de Node, 1 `no-redeclare`, 1 `no-unused-vars`) —el intento de D6 de
  arreglarlos con globales anchos fue un **anti-fix** y se revirtió: hay que acotarlo a `files`—; y
  **1** `react-hooks/exhaustive-deps` en `app/visor-mensajes/page.tsx`.
- **2 statements sin cubrir** en `lib/store.ts` (`:4321` y `:5127`): los `: []` de dos `flatMap`
  filtrados. **Son defensa a propósito** (el filtro aguas arriba garantiza hoy que no salen vacíos):
  decisión tomada — **no se borran**, se documentan y se fija el invariante con un test. El techo de
  cobertura del store **por API pública** es **99.95 %** por diseño.
- **Flaky preexistente** `test/componentes/pe-panels.test.tsx > retiro de encomienda`: timeout de
  30 s bajo carga, verde en aislamiento y en re-corridas. Misma familia que los timeouts de
  `poblado-idempotente` (P1) y `proyectos` (P7), ya corregidos.
- **CI desalineado**: `.github/workflows/ci.yml` exporta `DATABASE_URL: file:./dev.db` en **3 jobs**
  (líneas ~32, ~112 y ~166), así que la guarda dura de D1 tuvo que dejar una **excepción** para no
  abortar el job `unit` en un runner efímero. E4 alinea los 3 valores y quita la excepción.
- **Fuera de alcance**: el merge de los PR (#3 deuda-1 y #2 noche-3) es decisión del owner.

## Bitácora
(cada ventana agrega su entrada ANTES de que el orquestador pushee: `- [fecha] E<n> HECHA: resumen (commits)`)
