# Serie Deuda 3 — Cerrar la deuda residual post-deuda-2

> Toda ventana DEBE leer este archivo al iniciar (bloque ARRANQUE), marcar su fila **EN CURSO** y
> actualizarla antes de cerrar. La Bitácora es el registro durable de la serie.
> **Modo de ejecución**: delegado con workers desde el chat orquestador (`serie-executor`), una
> ventana a la vez, con auditoría contra el repo al volver cada una. El orquestador hace los pushes,
> los archives y la observación del CI.

| Ventana | Alcance | Estado | Commit final |
|---|---|---|---|
| E1 | `lint-warnings-cero` — los 35 warnings de ESLint a cero (3 causas raíz) | HECHA | `6c05489` · `86e92cf` · `8db0f7a` · docs |
| E2 | `store-ramas-defensivas` — documentar los 2 fallbacks defensivos y declarar el techo del 99.95 % | HECHA | `3088318` · `8f51307` · `8dc103d` · docs |
| E3 | `flaky-pe-panels` — presupuesto explícito para el test flaky de retiro de encomienda | HECHA | `ceef821` · `8656835` · `224f406` + cierre |
| E4 | `ci-db-descartable` — alinear los 3 `DATABASE_URL` de `ci.yml` y quitar la excepción de la guarda | HECHA | `3b3147f` · `2a8dcb0` · `fc5b74e` · docs |
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

- [2026-10-18] **E1 HECHA**: `lint-warnings-cero` dejó `npx eslint` de la app en **exit 0 · 0 problems**
  (antes 35 warnings) cerrando las 3 causas raíz: 21 `turbo/no-undeclared-env-vars` con las 6 env vars en
  `globalEnv` de `turbo.json`; 13 de `scripts/*.mjs` con `globals.node` acotado a `files: ["**/*.mjs"]`
  (más el retiro de las 10 directivas que quedaban redundantes y del `catch (err)`); y 1
  `react-hooks/exhaustive-deps` en `app/visor-mensajes/page.tsx` estabilizado con `ref` y fijado por test
  (1 llamada al montar, +1 cada 30 s, 0 tras desmontar). Gates: `tsc` 0 · `npm test` **1300/1300 en 127
  archivos** (662 s) con cobertura 94.32/85.70/93.77/94.32 · `turbo run lint/typecheck/build` 2/2, 2/2, 1/1
  (7m42s) · `openspec validate --all` 40/0 · `check-delta-coverage` 0 que romperían el archive. Remanente
  declarado: **1** warning en `packages/ui/src/hooks/use-mobile.ts:14` (`set-state-in-effect`, fuera de
  `apps/web` y fuera de los 35 medidos; su arreglo cambia comportamiento). Commits `6c05489`, `86e92cf`,
  `8db0f7a` + docs. **Sin pushear** (el orquestador pushea, archiva y observa el CI).
- [2026-10-18] **E2 HECHA**: `store-ramas-defensivas` declaró el **techo de 99.95 %** de cobertura de
  `lib/store.ts` **por API pública**: los 2 statements sin cubrir son los `: []` de dos `flatMap`
  filtrados (`lib/store.ts:4323` firmantes del CT y `:5131` miembros del período inicial),
  inalcanzables con el invariante actual (`esMiembroDirectivaVigente` / `filter(datosGobernanza)`) y
  **conservados como defensa**; se documentaron con un comentario breve y se fijó el invariante con
  `test/store-ramas-defensivas.test.ts` (4 tests: firmantes poblados, filtro aguas arriba, período
  inicial poblado y caso sin fichas). Gates: `tsc` 0 · `npm run lint` **0 problemas** · `npm test`
  **1304/1304 en 128 archivos** (574.86 s) con cobertura 94.32/85.70/93.77/94.32 (global igual que E1,
  sin caída), `lib` 99.49 y `lib/store.ts` **99.95** con `4323,5131` sin cubrir · `openspec validate
  --all` 41/0 · `check-delta-coverage` 0 que romperían el archive. `vitest.config.ts` **sin tocar**.
  Commits `3088318`, `8f51307`, `8dc103d` + docs. **Sin pushear**.
- [2026-10-18] **E3 HECHA**: `flaky-pe-panels` cerró el flaky preexistente de
  `test/componentes/pe-panels.test.tsx > retiro de encomienda` con un presupuesto explícito por caso:
  `PRESUPUESTO_CARGA = 120_000` en el objeto de opciones de los **7** casos del archivo (el hermano
  que tenía `{ timeout: 20_000 }` pasa a la misma constante, así que criterio y valor quedan
  alineados; **no** se usó `test.use({ timeout })`, que Vitest ignora en silencio). Reproducción: en
  aislamiento el caso mide **4.90 s** y pasa; con carga media (`2× yes`) sube a **26.81 s**; con carga
  alta (`16× yes`) se provoca el rojo con **`Error: Test timed out in 30000ms.`** (31.09 s) y 5 fallos
  de 7. Diagnóstico confirmado: **presupuesto, no comportamiento** — el componente y los paneles no se
  tocaron y `vitest.config.ts` tampoco. Verificación con **3 corridas 7/7 verdes**: aislado **5.25 s**,
  carga alta **67.67 s** (antes timeout) y aislado **4.97 s**; sin procesos huérfanos (`pgrep -x yes`
  → 0). Gates: `tsc` 0 · `npm run lint` **0 problemas** · `npm test` **1304/1304 en 128 archivos**
  (482.07 s) con cobertura global 94.32/85.71/93.77/94.32, `lib` 99.49 y `lib/store.ts` **99.95** con
  `4323,5131` sin cubrir · `openspec validate --all` **41/0** · `check-delta-coverage flaky-pe-panels`
  0 que romperían el archive. Commits `ceef821`, `8656835`, `224f406` + cierre. **Sin pushear**.
  Remanente declarado: un `console.log("DBG onError:"…)` de depuración en el caso de visitas del mismo
  archivo (fuera del alcance de presupuesto), candidato a limpieza en E5.
- [2026-10-18] **E4 HECHA**: `ci-db-descartable` alineó los **3** `DATABASE_URL: file:./dev.db` del
  workflow a `file:./perf-test.db` (job `unit` línea ~32, `e2e` línea ~112, `e2e-rate-limit` línea
  ~166) y quitó la **excepción** de la guarda dura, que vuelve a ser **absoluta** (aborta siempre ante
  un destino `dev.db`, también con `CI=true`). Lectura job por job: los **3 jobs tocados migran su
  base antes de usarla** (`prisma migrate deploy` / `db push` + seed antes de los tests), así que el
  nombre es intercambiable; `unit-pg` (PostgreSQL) y `deploy` quedaron intactos. Grep de control en
  `.github/`: `dev.db` solo en comentarios. Evidencia de la guarda:
  `DATABASE_URL="file:./dev.db" npx vitest run test/health.test.ts` → **exit 1** con el banner
  `test-db-descartable — ABORTADO: la suite escribiría la base de desarrollo.` y `mtime` de
  `prisma/dev.db` idéntico antes/después (`2026-10-17 22:55:36.837707123 -0300`). Gates: `tsc` 0 ·
  `npm run lint` **0 problemas** · `npm test` **1304/1304 en 128 archivos** (579.80 s) con cobertura
  global 94.32/85.70/93.77/94.32, `lib` 99.49 y `lib/store.ts` **99.95** con `4323,5131` sin cubrir ·
  `openspec validate --all` **40/0** · `check-delta-coverage ci-db-descartable` `1 ok · 1 info · 0 que
  romperían el archive`. Commits `3b3147f`, `2a8dcb0`, `fc5b74e` + avance. **Sin pushear** (el
  orquestador pushea, archiva tras CI verde y observa el workflow).
