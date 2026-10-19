# Serie Deuda 2 — Saldar la deuda viva post-deuda-1

> Toda ventana DEBE leer este archivo al iniciar (bloque ARRANQUE), marcar su fila **EN CURSO** y
> actualizarla antes de cerrar. La Bitácora es el registro durable de la serie.
> **Modo de ejecución**: delegado con workers desde el chat orquestador (`serie-executor`), una
> ventana a la vez, con auditoría contra el repo al volver cada una. El orquestador hace los pushes,
> los archives y la observación del CI.

| Ventana | Alcance                                                                                                        | Estado    | Commit final                |
| ------- | -------------------------------------------------------------------------------------------------------------- | --------- | --------------------------- |
| D1      | `test-db-descartable` — la suite deja de escribir `prisma/dev.db` (base descartable + guarda dura)             | HECHA     | 4e818de · 6eff24f · c20989d |
| D2      | `am-emisores-1` — emisores server-side de `CF_UPDATE_PARAM`, `FI_INGRESO_REGISTRADO` y `GD_PERIODO_REGISTRADO` | HECHA     | `aca0ba1` · `823c245` · `87dc021` · `11039bf` |
| D3      | `am-emisores-2` — emisores de `IR_ASSET_REPAIR`, `CO_DOC_DOWNLOAD` y `PE_CIERRE_EDITADO`                       | HECHA     | `edf18c9` · `1ca7963` · `40a7cfb` · `736f59e` |
| D4      | `store-cobertura-fase-d` — las 6 acciones más descubiertas de `lib/store.ts` (~57 statements)                  | HECHA     | `c45d034` · `d79ccae` · `ee9c19d` · `6afd3b9` |
| D5      | `store-cobertura-fase-e` — remanente del store + ratchet final de `lib/**` y global                            | HECHA     | `40b5934` · `da5207f` · `e81db25` · `1dca20e` + ratchet y cierre |
| D6      | `lint-higiene` — bajar los ~6.700 warnings de ESLint (zona generada, producto y tests)                         | HECHA     | `0a3ce55` · `8bb12b0` · `384532c` · `616d845` + cierre |
| D7      | Cierre de la serie: auditoría integral, e2e final, PR y deuda post-serie                                       | HECHA     | `9674f1f` + commit de cierre |

**MÁXIMO: 7 ventanas.** Prohibido abrir ventanas fuera del cap: lo que no entre se declara como
deuda post-serie en el cierre (D7), no se improvisa.

## Prerrequisito de base

- **Tip de partida**: `afe142a`, el cierre de SERIE-DEUDA-1, que está **apilado** sobre
  `noche/serie-noche-3` (`1b23219`). Mientras el PR #2 (noche-3) siga sin mergear, el diff de esta
  rama contra `main` incluirá también aquellos commits (ruido de diff, no bloqueo).
- **Rama de trabajo: `serie/deuda-1`** — decisión del orquestador: esta serie **continúa la rama de
  deuda-1** en vez de abrir una cuarta capa apilada, así el **PR draft #3** sigue siendo el paraguas
  de todo el pago de deuda y el CI ya está cableado (el workflow `ci.yml` dispara en `pull_request`).
  El owner puede pedir una rama propia si prefiere separar los PRs.
- **Fingerprint** (lo verifica el ARRANQUE de cada ventana): pisos global **92/83/92/92** · `lib/**`
  **97/91/98/97** · `app/api/**` **87/74/88/87** en `vitest.config.ts`, **7 slices** en
  `lib/store/slices/`, `STORE_VERSION = 28` y suite **≥ 1208** tests (116 archivos).

## Reglas duras de la serie

1. **Rama `serie/deuda-1`**. Prohibido pushear a `main`; prohibido mergear (es decisión del owner).
2. **Un commit por work-unit**, estilo convencional en español, automático al cerrar cada trabajo,
   commiteando **solo** los archivos del cambio. **Commitear por unidad, no al final**: los
   ejecutores de la serie anterior murieron a los 12/30/51/82/90 turnos y solo sobrevivió el trabajo
   ya commiteado.
3. **Método openspec**: todo cambio va por `propose → apply → archive`. Para cada delta: leer
   `openspec/CONVENCION-DELTAS.md` y correr `node openspec/scripts/check-delta-coverage.mjs <change>`
   hasta que dé `0 que romperían el archive`.
4. **`nsgc-prepush` obligatorio antes de cada push** (avance en `Data/NSGC/docs/avances/`; manual de
   módulo si cambia comportamiento o estructura; Trazabilidad si cambia un estado).
5. **El orquestador pushea, archiva y observa el CI.** Los workers **nunca** corren `git push` ni
   `gh pr edit`: el harness les pide aprobación interactiva que no pueden contestar (así se colgaron
   30 minutos dos ejecutores de la serie anterior). Cierran con todo commiteado y reportan.
   **Nunca se archiva sin CI verde observada.**
6. **`STORE_VERSION = 28` congelado**: ningún cambio de la serie toca el shape persistido. Si algo lo
   exigiera, se marca BLOQUEADO en la tabla y se sigue.
7. **Nunca** tocar `k0mp4ss_fe/apps/web/prisma/dev.db` ni `Data/NSGC/backups/`. **D1 existe
   justamente porque hoy la suite sí escribe `dev.db`**: hasta que D1 cierre, correr `npm test` es
   un riesgo asumido y conocido.
8. **Nunca secretos** en código, docs ni commits. El término oficial es **comunidad** ("condominio"
   no se usa nunca, RG §4).
9. **Gate por ventana**: `cd k0mp4ss_fe/apps/web && npx tsc --noEmit && npm run lint && npm test`
   (pisos por área), `openspec validate --all` sin fallos y `check-delta-coverage` del change tocado.
   La suite completa se corre **una sola vez**, como gate al final de la ventana.
10. **Si un gate falla dos veces**: marcar la ventana BLOQUEADO (tabla + Bitácora con la evidencia
    exacta), commitear lo que quede sano (o revertir lo roto) y **seguir**. Nunca quedarse
    reintentando ni pedir intervención al owner.
11. **Alcance cerrado**: cada ventana toca solo los archivos que declara su prompt.
12. **Nunca correr el spec de rate-limit antes de la lane e2e** (bloquea la IP 15 min y aborta
    `auth.setup`).

## Modo de ejecución (delegado con workers)

El orquestador lanza **una ventana a la vez** con el subagente `serie-executor`:
_"Ejecutá de principio a fin `openspec/SERIE-DEUDA-2/prompt-NN.md` y devolvé el Reporte Final
Estandarizado"_, con el ARRANQUE pre-resuelto (git, fingerprint, CI, archives) para que el worker no
gaste turnos ahí. Al volver cada ventana el orquestador **audita contra el repo** (no contra el
reporte): `git log`/`git status`, la fila y la Bitácora del plan, y los gates de la ventana. Si
falta algo menor, relanza la MISMA ventana con la corrección puntual; si el worker murió a mitad,
verifica el estado parcial y completa lo que falte.

## Base de hechos (deuda declarada al cerrar deuda-1)

- **Cobertura**: 111 statements sin cubrir en `lib/store.ts` (P5 cubrió 57 de 168). Reparto al
  cierre: `generarCertificadoCT` 15 · `distribuirReporteRE` 13 · `respaldarInfraccionIN` 8 ·
  `desestimarInfraccionIN` 8 · `saveElementoRA` 7 · `saveAdelantoPL` 6 · ramas de arranque de
  `migrate` (4940-4941, 5127) · ramas sueltas de 14 acciones más. Detalle en
  `Data/NSGC/docs/avances/avance - 2026-10-17 16-05.md` § "Remanente declarado".
- **Eventos AM sin emisor server-side**: `CF_UPDATE_PARAM` (la ruta existe y no emite) y cinco
  eventos con **0 referencias en el código** — `FI_INGRESO_REGISTRADO`, `IR_ASSET_REPAIR`,
  `CO_DOC_DOWNLOAD`, `GD_PERIODO_REGISTRADO`, `PE_CIERRE_EDITADO`. El proyecto **sí tiene el
  patrón**: 13 rutas crean `prisma.eventoAuditoria` a mano (ejemplo canónico:
  `app/api/fondos-fi/[id]/retirar/route.ts`). Decisión del owner: **implementar los 6**.
- **Riesgo de datos en tests**: `k0mp4ss_fe/apps/web/test/setup.ts` cae a `prisma/dev.db` cuando
  `DATABASE_URL` no está exportada, así que **la suite entera escribe la base de desarrollo**.
- **Lint**: ~6.700 warnings con `exit 0` (`@typescript-eslint/no-explicit-any` en tests y en
  artefactos generados). Decisión del owner: incluirlos como ventana propia (D6).
- **Fuera de alcance**: el merge de los PR (#3 deuda-1 y #2 noche-3) es decisión del owner; el "404
  de MT" de P2 quedó demostrado inexistente (el guard de scope es correcto y tiene red de seguridad
  en `test/api/put-merge-scope.test.ts`).

## Bitácora

(cada ventana agrega su entrada ANTES de que el orquestador pushee: `- [fecha] D<n> HECHA: resumen (commits)`)

- [2026-10-17] **D1 HECHA**: `test-db-descartable` — el defecto quedó reproducido con evidencia
  (`prisma/dev.db` mtime 20:37:08 → 22:55:36 tras `npm test`) y saldado: la suite usa por defecto la
  base descartable `prisma/perf-test.db`, recreada y migrada de cero por un `globalSetup`
  (`prisma migrate deploy`), con guarda dura que aborta si el destino resuelve a `dev.db` por
  cualquier vía y 12 tests que fijan el contrato. Gate con `prisma/dev.db` **intacta** (mtime
  1792288536 antes y después): `tsc` 0 · `lint` 0 errores · `npm test` **1220/1220** en 117 archivos
  (los 1208 previos + 12 nuevos) · `openspec validate --all` 40/0 · `check-delta-coverage` 1 ok/0.
  Cobertura sin re-baseline (global 93.70/84.76/93.28/93.70 · `lib/**` 98.39/92.18/99.44/98.39 ·
  `app/api/**` 88.39/75.82/89.22/88.39). Elegido **HECHA** con un desvío declarado: la guarda
  redirige (en vez de abortar) cuando `dev.db` viene del entorno de un runner efímero de CI, porque
  el job `unit` de `ci.yml` exporta `DATABASE_URL: file:./dev.db` y `ci.yml` está fuera de los
  archivos de la ventana; el orquestador puede cerrarlo cambiando ese valor a la base descartable.
  Commits: `4e818de` (change openspec + fila EN CURSO) · `6eff24f` (base descartable + guarda +
  cableado) · `c20989d` (contrato) · commit documental de cierre (avance + Bitácora). Sin pushear.

- [2026-10-17] **D2 HECHA**: `am-emisores-1` — los tres primeros emisores server-side de auditoría
  quedaron cableados con el patrón vigente (13 rutas): `CF_UPDATE_PARAM` en `PUT /api/configuracion`
  (`app/api/configuracion/route.ts:112-140`) **solo por delta real** de los cuatro parámetros legales, con old/new en la
  descripción y categoría `CF`; `FI_INGRESO_REGISTRADO` en `POST /api/ingresos-fi` (`app/api/ingresos-fi/route.ts:105-125`,
  categoría `FI`) y `GD_PERIODO_REGISTRADO` en `POST /api/periodos-directiva` (`app/api/periodos-directiva/route.ts:330-352`,
  categoría `GD`). La emisión va después de la escritura y en `try/catch` propio (la auditoría nunca
  bloquea la mutación, patrón de `personas`/`mis-datos`). Hallazgo: los specs vivos de
  `FI-finanzas-morosidad` y `GD-gestion-directiva` **ya exigían** la emisión (el código estaba en
  mora), así que el delta se limita a `ST-capa-datos-persistente` y `CF-configuracion-global` (los
  dos únicos que declaraban el gap en prosa). 10 tests nuevos (4 CF · 3 FI · 3 GD) que afirman
  categoría/`tipoAccion`/referencia y la **no emisión** en los caminos rojos (403/400/404). **Gate**:
  `tsc` 0 · `lint` 0 errores (6.702 warnings preexistentes) · `npm test` **1230/1230** en 117
  archivos · cobertura global 93.71/84.77/93.28/93.71 · `lib` 97.77/90.63/99.10/97.77 · pisos sin
  re-baseline · `openspec validate --all` 41/0 · `check-delta-coverage` 3 ok/0 · `prisma/dev.db`
  mtime 1792288536 intacta. Commits: `aca0ba1` (change openspec + fila EN CURSO) · `823c245`
  (`CF_UPDATE_PARAM`) · `87dc021` (`FI_INGRESO_REGISTRADO`) · `11039bf` (`GD_PERIODO_REGISTRADO`) ·
  commit documental de cierre (avance + Bitácora). Sin pushear.

- [2026-10-18] **D3 HECHA**: `am-emisores-2` — los tres emisores AM que quedaban sin emisor
  server-side quedaron cableados con el patrón vigente: `IR_ASSET_REPAIR` en `PUT /api/ir/recursos/[id]`
  (`app/api/ir/recursos/[id]/route.ts:52-101`, **solo transición real** a `reparacion`, con el estado
  anterior en la descripción), `CO_DOC_DOWNLOAD` en `GET /api/co/documentos/[id]`
  (`app/api/co/documentos/[id]/route.ts:34-75`; el documento CO es metadatos + URL D1 y no hay endpoint
  de descarga, así que abrir el documento es este GET; el listado paginado no emite) y
  `PE_CIERRE_EDITADO` en `PUT /api/pe/cierres-turno/[id]` (`app/api/pe/cierres-turno/[id]/route.ts:36-84`,
  con las novedades y el tamaño del historial preservado en la descripción). Las tres rutas son
  envoltorios genéricos (factory / put-merge) sin hook post-escritura, así que cada `route.ts` envuelve
  su handler y emite después, en `try/catch` con `logger.error` (la auditoría nunca bloquea la
  operación) y solo con `res.ok`. Hallazgo: los specs vivos de `IR-inventario-recursos`,
  `CO-comunicacion-vecinos` y `PE-personal-servicios` **ya exigían** las tres emisiones (el código
  estaba en mora) y `AM-auditoria-metricas` no declara emisores faltantes → **sin deltas**
  (`skip_specs: true` en `openspec/changes/am-emisores-2/.openspec.yaml`). 16 tests nuevos (6 IR · 6 CO
  · 4 PE) que afirman categoría/`tipoAccion`/referencia/usuario y la **no emisión** en los caminos
  rojos (400/403/404), en el re-guardado sin transición y en el listado paginado. **Gate**: `tsc` 0 ·
  `lint` 0 errores (6.702 warnings preexistentes) · `npm test` **1246/1246** en 120 archivos ·
  cobertura global 93.67/84.56/93.77/93.67 · `lib` 97.77/90.57/99.1/97.77 · pisos sin re-baseline ni
  fallo de umbral · `openspec validate --all` 41/0 · `check-delta-coverage` 1 ok/1 info/0 ·
  `prisma/dev.db` mtime 1792288536 intacta. Commits: `edf18c9` (change openspec + fila EN CURSO) ·
  `1ca7963` (`IR_ASSET_REPAIR`) · `40a7cfb` (`CO_DOC_DOWNLOAD`) · `736f59e` (`PE_CIERRE_EDITADO`) ·
  commit documental de cierre (avance + Bitácora). Sin pushear.

- [2026-10-18] **D4 HECHA**: `store-cobertura-fase-d` — la mitad grande de la deuda de cobertura del
  store quedó pagada: las **6 acciones con más statements sin cubrir** de `lib/store.ts`
  (`generarCertificadoCT`, `distribuirReporteRE`, `respaldarInfraccionIN`, `desestimarInfraccionIN`,
  `saveElementoRA`, `saveAdelantoPL`) pasaron de **56 → 1** statements sin cubrir (medido dentro de
  los rangos de cada acción; el prompt declaraba 57 y el mapeo grueso sumaba la línea 971, de otro
  helper `CF`, y 13 a RE cuando en su rango eran 12). La única línea que queda (`lib/store.ts:4321`)
  es **inalcanzable por la API pública** y quedó declarada con su causa: `: []` del `flatMap` de
  `directivaRef.firmantes`, cuyo filtro previo (`esMiembroDirectivaVigente`) ya exige
  `datosGobernanza`. 30 tests comportamentales nuevos en 3 archivos por par de acciones (11 CT+RE ·
  9 IN · 10 RA+PL), todos contra `useCompassStore` afirmando `StoreResult`, estado resultante,
  validaciones, folios correlativos y eventos. `lib/store.ts` 111 → **56** statements sin cubrir
  (97.39 → **98.68** %); `lib` 97.77/90.57 → **98.64/91.77**; global 93.67/84.57 → **94/85.03**; sin
  tocar `vitest.config.ts` ni el shape persistido (`STORE_VERSION = 28` intacto). **Gate**: `tsc` 0 ·
  `lint` 0 errores (6.702 warnings preexistentes) · `npm test` **1276/1276** en 123 archivos (1246 +
  30) con los pisos vigentes sin fallo ni re-baseline · `openspec validate --all` 42/0 ·
  `check-delta-coverage store-cobertura-fase-d` 1 ok/0 · delta `MODIFIED` con los 7 escenarios vivos
  + el de la fase D · `prisma/dev.db` mtime 1792288536 intacta. Flaky preexistente observado y no del
  alcance: `pe-panels` (timeout 30 s bajo carga; pasó en las corridas siguientes). Commits: `c45d034`
  (change openspec + fila EN CURSO) · `d79ccae` (`generarCertificadoCT`+`distribuirReporteRE`) ·
  `ee9c19d` (`respaldarInfraccionIN`+`desestimarInfraccionIN`) · `6afd3b9` (`saveElementoRA`+
  `saveAdelantoPL`) · commit documental de cierre (avance + Bitácora). Sin pushear.

- [2026-10-18] **D5 HECHA**: `store-cobertura-fase-e` — cerró el remanente de cobertura del store:
  las ramas sueltas de 14 acciones (`saveMaestro`, `savePersona`, `saveVinculo`, `removeMaestro`,
  `apelarInfraccionIN`, `respaldarInfraccionIN`, `desestimarInfraccionIN`, `removeTipoInfraccionIN`,
  `saveReservaRA`, `removeCertificadoCT`, `removeElementoRA`, `removeAdelantoPL` y las de personal,
  reportería y remuneraciones) y las de arranque de `migrate` (4940-4941), con **23 tests
  comportamentales** nuevos en 3 archivos por bloque. **`lib/store.ts` 98.68 → 99.95**: solo quedan
  dos statements, **ambos inalcanzables por la API pública y declarados con su causa** — `:4321`
  (declarada en D4) y `:5127` (declarada acá). `lib/**` 98.64/91.77/99.1/98.64 →
  **99.63/94.03/99.43/99.63** y global 94/85.03/93.77/94 → **94.32/85.70/93.77/94.32**.
  **Ratchet** (medido − 1 pt, ningún piso baja): global 92/83/92/92 → **93/84/92/93** y `lib/**`
  97/91/98/97 → **98/93/98/98**; `app/api/**` sin cambios. **Gate verificado por el orquestador**
  (el worker no alcanzó a correrlo): `npm test` **1299/1299 en 126 archivos**, **exit 0**, con los
  pisos nuevos aplicados · `tsc` 0 · `lint` 0 errores · `openspec validate --all` 40/0 ·
  `check-delta-coverage store-cobertura-fase-e` 1 ok/0 · `prisma/dev.db` mtime 1792288536 intacta.
  Commits: `40b5934` (change openspec + fila EN CURSO) · `da5207f` · `e81db25` · `1dca20e` (los 3
  bloques de tests) + el commit del ratchet y del cierre documental. *Nota de ejecución*: el worker
  **se colgó** (`stalled for 4 min after: edit`) justo **después de escribir** `vitest.config.ts` y
  **antes** de commitearlo, documentar y correr el gate; el orquestador auditó el estado, verificó el
  ratchet contra una corrida completa (exit 0) y completó el cierre. Es el quinto corte de ejecutor
  de la serie: lo commiteado sobrevive, y lo que falta lo cierra el orquestador.

- [2026-10-18] **D6 HECHA**: `lint-higiene` — los warnings de ESLint bajaron de **6.702 a 35**
  (−99,48 %, **0 errores**, `exit 0`). La medición de apertura (`eslint --format json`: 97 archivos
  con mensajes) mostró que **6.602 de los 6.702 (98,5 %) eran ruido de un artefacto generado**: el
  bundle de deploy que Vercel deja en `.vercel/` (`.vercel/node` + 7,5 M de `output/`), que el ignore
  compartido (`dist/**`, `.next/**`, `**/.turbo/**`, `**/coverage/**`) **no** cubría → una línea de
  config en `apps/web/eslint.config.js` (`ignores: [".vercel/**"]`) borró 6.602 warnings sin tocar
  código. Después, **código de producto** (11 `no-unused-vars` + 2 directivas `eslint-disable`
  obsoletas, sin cambio de comportamiento: imports/destructures/parámetros muertos en
  `dev-dashboard`, `liquidaciones`, `reportes-re/[id]`, `vinculos`, `comunicacion`, `multas` y
  `lib/api/crud-factory.ts` — `limpiarPayload` copia y borra `id`/`comunidadId` en vez de destructurar
  bindings muertos —, más la directiva `set-state-in-effect` de `remuneraciones` **movida** a la línea
  que reporta la regla, sin supresión nueva, y la `react-hooks/purity` obsoleta de
  `personas/[id]` eliminada). **Tests**: 47 → **0** `no-explicit-any` (los tres tests de `proxy`
  invocaban el default export con `(proxy as any)(req as any, undefined as never)`; la firma real ya
  es `(req: NextRequest, evento?: unknown) => Response | Promise<Response>`, así que se reemplazó por
  un helper `pedirProxy()` tipado) y 6 `no-unused-vars` menos (helper `url()` muerto, `decoded`/`iat`
  en `session-maxage` — el `encode()` de Auth.js re-emite `exp` desde `maxAge`, así que el boundary se
  afirma aritméticamente —, imports de tipo muertos en las fases B y C). **Declarado y no forzado**
  (los 35 restantes): 21 `turbo/no-undeclared-env-vars` (la solución honesta es declarar
  `CSP_ENFORCEMENT`, `SQLITE_URL`, `POSTGRES_URL`, `DATABASE_URL_POSTGRES`, `COMUNIDAD_ID` y
  `SKIP_DATOS` en `turbo.json`, fuera de los archivos de la ventana), 11 `no-undef` + 1 `no-redeclare`
  + 1 `no-unused-vars` en `scripts/*.mjs` (se probó darles `globals.node` en el config y el efecto fue
  neutro/peor: 8 `no-redeclare` nuevos y 2 directivas obsoletas → revertido) y 1
  `react-hooks/exhaustive-deps` en `visor-mensajes` (agregar `caducarAvisosCV` a las deps cambiaría el
  ciclo de vida de los `setInterval` de caducidad). **Gate**: `tsc` 0 · `lint` **exit 0 con 35
  warnings** · `npm test` **1299/1299 en 126 archivos** con los pisos vigentes (cobertura
  94.32/85.70/93.77/94.32, idéntica a D5: `vitest.config.ts` sin tocar) · `openspec validate --all`
  42/0 · `check-delta-coverage lint-higiene` 1 ok/1 info/0 (`skip_specs: true`) ·
  `prisma/dev.db` mtime 1792288536 intacta. Commits: `0a3ce55` (change openspec + fila EN CURSO) ·
  `8bb12b0` (ignore de `.vercel`) · `384532c` (app + lib) · `616d845` (tests) · commit documental de
  cierre (avance + Bitácora). Sin pushear.

- [2026-10-18] **D7 HECHA**: cierre de la serie — auditoría integral contra el repo, gates finales y
  e2e de paridad CI, sin tocar código de producto (`test/**`, `vitest.config.ts`, `openspec/**` y
  `Data/NSGC/docs/avances/**` intactos salvo la documentación de cierre). **Gates**: `npx tsc
  --noEmit` **0** · `npm run lint` **exit 0 · 0 errores · 35 warnings** · `npm test`
  **1299/1299 en 126 archivos** (`exit 0`, 625,89 s) con los pisos finales (global **93/84/92/93** ·
  `lib/**` **98/93/98/98** · `app/api/**` **87/74/88/87**) y cobertura medida **94.32/85.71/93.77/
  94.32** global · **99.63/94.04/99.44/99.63** `lib/**` · **88.44/75.68/90.07/88.44** `app/api/**`
  (agregado por glob sobre `coverage-summary.json`) · `openspec validate --all` **40 passed / 0
  failed**. **e2e** (`npm run e2e:fresh -- --no-build -- e2e/smoke e2e/crud/poblado-idempotente.spec.ts`):
  **24/24 verdes, 0 fallos, 0 skipped, `exit 0`** en 284,25 s — `auth.setup` 6, `crud/poblado-idempotente`
  2, `smoke/modulos` 8, `smoke/modulos-mobile` 8 — con `test-results/junit.xml`
  (`tests="24" failures="0" skipped="0" errors="0"`) y `.last-run.json` (`{"status":"passed",
  "failedTests":[]}`) como evidencia. **Integridad**: `prisma/dev.db` mtime **1792288536** intacta
  antes y después de la suite y de la lane e2e · `Data/NSGC/backups/` 906 archivos / 113.614.407
  bytes, sin cambios · `STORE_VERSION = 28` · 7 slices en `lib/store/slices/` · ningún change de esta
  serie activo salvo `lint-higiene` (los 5 restantes de `openspec/changes/` son anteriores a la serie
  y creados el 2026-10-14: `a11y-p3-reservas-recursos`, `au-google-sso`,
  `e2e-higiene-determinismo`, `e2e-rojos-flujo-a11y-smoke`, `fix-vercel-data-ignore`). Commit:
  `9674f1f` (fila D7 EN CURSO) + el commit documental de cierre.
  Sin pushear (el push, el archive de `lint-higiene` y la descripción del PR #3 los hace el
  orquestador).

## Cierre de la serie deuda-2

> Serie completa: 7 ventanas (D1–D7), 33 commits sobre `serie/deuda-1`, apertura en `9002680` y
> cierre documental en este commit. La rama **no** se mergea: el merge de los PR es decisión del
> owner.

### 1. Estado por ventana (hashes reales del repo)

| Ventana | Change | Commits (en orden) | Resultado |
| --- | --- | --- | --- |
| D1 | `test-db-descartable` | `4e818de` · `6eff24f` · `c20989d` · `ede8ac0` | La suite deja de escribir `prisma/dev.db`: base descartable `prisma/perf-test.db` recreada por `globalSetup` + guarda dura. 1208 → 1220 tests. |
| D2 | `am-emisores-1` | `aca0ba1` · `823c245` · `87dc021` · `11039bf` · `b042548` | Emisores server-side `CF_UPDATE_PARAM`, `FI_INGRESO_REGISTRADO`, `GD_PERIODO_REGISTRADO`. +10 tests (1230). |
| D3 | `am-emisores-2` | `edf18c9` · `1ca7963` · `40a7cfb` · `736f59e` · `d0d81f9` | Emisores `IR_ASSET_REPAIR`, `CO_DOC_DOWNLOAD`, `PE_CIERRE_EDITADO` (sin deltas: los specs ya los exigían). +16 tests (1246). |
| D4 | `store-cobertura-fase-d` | `c45d034` · `d79ccae` · `ee9c19d` · `6afd3b9` · `45e2d6c` | Las 6 acciones más descubiertas del store: 56 → 1 statements sin cubrir. +30 tests (1276). |
| D5 | `store-cobertura-fase-e` | `40b5934` · `da5207f` · `e81db25` · `1dca20e` · `e89fa15` | Remanente del store (14 acciones + arranque de `migrate`) y ratchet de pisos. +23 tests (1299). `lib/store.ts` 99.95 %. |
| D6 | `lint-higiene` | `0a3ce55` · `8bb12b0` · `384532c` · `616d845` · `08d41cb` | ESLint 6.702 → **35** warnings, 0 errores (−99,48 %). Sin cambio de comportamiento. |
| D7 | — (cierre) | `9674f1f` + commit documental | Auditoría integral, gates finales, e2e 24/24 y este cierre. |

Commits del orquestador dentro de la serie: `9002680` (materializa `SERIE-DEUDA-2`) y los tres
archives del punto 3.

### 2. Números finales (apertura → cierre)

| Métrica | Apertura (tip de deuda-1, `afe142a`) | Cierre (D7) |
| --- | --- | --- |
| Tests | 1208 en 116 archivos | **1299 en 126 archivos** (+91 tests, +10 archivos) |
| Cobertura global (st/br/fn/ln) | 93.70 / 84.76 / 93.28 / 93.70 | **94.32 / 85.71 / 93.77 / 94.32** |
| Cobertura `lib/**` | 98.39 / 92.18 / 99.44 / 98.39 | **99.63 / 94.04 / 99.44 / 99.63** |
| Cobertura `app/api/**` | 88.39 / 75.82 / 89.22 / 88.39 | **88.44 / 75.68 / 90.07 / 88.44** |
| `lib/store.ts` (st) | 97.39 (111 statements sin cubrir) | **99.95** (2 sin cubrir, ambos inalcanzables por la API pública) |
| Pisos (`vitest.config.ts`) | global 92/83/92/92 · lib 97/91/98/97 · api 87/74/88/87 | **global 93/84/92/93 · lib 98/93/98/98 · api 87/74/88/87** (ninguno bajó) |
| Warnings de ESLint | 6.702 (exit 0) | **35** (exit 0, 0 errores) |
| Eventos AM sin emisor server-side | 6 | **0** |
| `npx tsc --noEmit` | 0 | **0** |
| `openspec validate --all` | sin fallos | **40 passed / 0 failed** |
| e2e (paridad CI) | — | **24/24 verdes, 0 fallos, 0 skipped** |

`STORE_VERSION = 28` **congelado** durante las 7 ventanas: ningún change tocó el shape persistido.

### 3. Evidencia de los archives

| Commit | Changes archivados | Evidencia |
| --- | --- | --- |
| `c2dcfed` | `test-db-descartable` | CI verde **39090208473** |
| `afabf77` | `am-emisores-1`, `am-emisores-2` | CI verde **39121387608** |
| `494b499` | `store-cobertura-fase-d`, `store-cobertura-fase-e` | CI verde **39132587349** |
| pendiente (orquestador) | `lint-higiene` | archivado por el orquestador **con CI verde observada**; D7 no archiva |

Estado de `openspec/changes/` al cerrar: **6 changes activos**, de los cuales solo `lint-higiene`
es de esta serie; los otros cinco (`a11y-p3-reservas-recursos`, `au-google-sso`,
`e2e-higiene-determinismo`, `e2e-rojos-flujo-a11y-smoke`, `fix-vercel-data-ignore`) son anteriores
(2026-10-14) y ajenos a deuda-2.

### 4. Gates de cierre (D7, textual)

- `npx tsc --noEmit` → `TSC_EXIT=0`.
- `npm run lint` → `LINT_EXIT=0`, `✖ 35 problems (0 errors, 35 warnings)`.
- `npm test` → `TEST_EXIT=0`, `Test Files 126 passed (126)` · `Tests 1299 passed (1299)` ·
  `Duration 625.89s`; cobertura `All files 94.32 | 85.71 | 93.77 | 94.32`.
- `openspec validate --all` → `Totals: 40 passed, 0 failed (40 items)`.
- `npm run e2e:fresh -- --no-build -- e2e/smoke e2e/crud/poblado-idempotente.spec.ts` → `E2E_EXIT=0`,
  JUnit `tests="24" failures="0" skipped="0" errors="0" time="284.246"`, `.last-run.json`
  `{"status":"passed","failedTests":[]}`.
- Integridad: `prisma/dev.db` mtime `1792288536` (2026-10-17 22:55:36) idéntica antes y después de
  `npm test` y de la lane e2e · `Data/NSGC/backups/` 906 archivos / 113.614.407 bytes sin cambios ·
  7 slices · `STORE_VERSION = 28`.

### 5. Deuda post-serie (declarada, NO pagada)

1. **35 warnings de ESLint** (D6 los clasificó y los dejó declarados): **21**
   `turbo/no-undeclared-env-vars` — se matan declarando `CSP_ENFORCEMENT`, `SQLITE_URL`,
   `POSTGRES_URL`, `DATABASE_URL_POSTGRES`, `COMUNIDAD_ID` y `SKIP_DATOS` en `turbo.json`, que está
   fuera del alcance de la serie; **13** en `scripts/*.mjs` (11 `no-undef` + 1 `no-redeclare` + 1
   `no-unused-vars` de globals de Node — el intento de arreglarlos en `eslint.config.js` fue un
   anti-fix: 8 `no-redeclare` nuevos y 2 directivas obsoletas, y se revirtió); **1**
   `react-hooks/exhaustive-deps` en `app/visor-mensajes/page.tsx`, cuyo arreglo cambiaría el ciclo de
   vida de los `setInterval` de caducidad (cambio de comportamiento, prohibido en la serie).
2. **2 statements inalcanzables** en `lib/store.ts` (`:4321`, declarada en D4, y `:5127`, declarada
   en D5): ambas ramas exigen un estado que la API pública no puede producir, así que son el **techo
   real** de la cobertura del store. No se fuerza cobertura artificial ni se excluyen del reporte.
3. **Flaky preexistente** `test/componentes/pe-panels.test.tsx` (`EncomiendasPanel` / retiro de
   encomienda): timeout de 30 s bajo carga; pasa en aislamiento y en re-corridas. Candidato a
   presupuesto explícito (`test.setTimeout`), no a "fix" de producto.
4. **CI**: el job `unit` de `.github/workflows/ci.yml` exporta `DATABASE_URL: file:./dev.db`; la
   guarda de D1 redirige ese caso a la base descartable, pero el valor del workflow puede alinearse
   en una ventana de CI (fuera del alcance de la serie).
5. **PR #3** (`serie/deuda-1` → `main`): la descripción la actualiza el orquestador con el texto
   propuesto en el avance de D7; el **merge es decisión del owner**.

### 6. Texto propuesto para la descripción del PR draft #3

Vive en `Data/NSGC/docs/avances/avance - 2026-10-18 11-53.md` (§ "Texto propuesto para el PR #3"),
listo para copiar/pegar. D7 **no** creó ni editó el PR.
