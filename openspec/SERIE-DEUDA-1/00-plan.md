# Serie Deuda 1 — Cierre de la deuda viva post-noche-3

> Toda ventana DEBE leer este archivo al iniciar (bloque ARRANQUE), marcar su fila **EN CURSO**
> y actualizarla antes del push final. La Bitácora es el registro durable de la serie.
> **Modo de ejecución**: manual (un chat nuevo por ventana con
> `Corré el archivo openspec/SERIE-DEUDA-1/prompt-NN.md`) o **delegado con workers** (un solo
> chat nuevo: *"corré la serie deuda-1"* — el orquestador lanza una ventana a la vez con el
> subagente `serie-executor` y audita cada retorno contra el repo). Ver § Modo delegado.

| Ventana | Alcance | Estado | Commit final |
|---|---|---|---|
| P1 | `e2e-fresh` — script `npm run e2e:fresh` + timeout de `poblado-idempotente` a 120 s | HECHA (lane dirigida 24/24 con paridad CI; ver Bitácora) | `adf932e` |
| P2 | `fix-put-merge-scope` — el 404 de MT **no se reproduce** (guard correcto): red de seguridad + deuda e2e reasignada a P7 | BLOQUEADO (gate e2e: timeout del spec, fuera de alcance — ver Bitácora) | `fa9196d` |
| P3 | `api-cobertura-fase3` — 3 carpetas API más bajas (fase 3) + ratchet `app/api/**` | HECHA (`qa-roadmap` 62.5 → 91.67, `emisiones-gc` 66.89 → 94.26, `vinculos` 69.2 → 94.93; `app/api/**` 83.69 → 85.75 con piso 84/70/87/84) | `03a7cdd` |
| P4 | `api-cobertura-fase4` — siguientes 3 carpetas API (fase 4) + ratchet `app/api/**` | HECHA (`fondos-fi` 71.16 → 89.66, `personas` 72.82 → 93.45, `cobros-fi` 74.43 → 91.48; `app/api/**` 85.75 → 88.39 con piso **87/74/88/87**) | `8c5a1e4` |
| P5 | `store-cobertura-fase-c` — fase C del store legacy: bordes + acciones más descubiertas + ratchet `lib/**`/global | **PARCIAL** (57 de 168 statements de `lib/store.ts` + los 10 bordes; `helpers.ts` y slices al 100 % de statements; pisos global **92/83/92/92** y `lib/**` **97/91/98/97**; remanente de 111 declarado para P7) | `85ed548` |
| P6 | `higiene-prosa-store-cleanup` — prosa de specs/manuales que nombra acciones podadas + `CF_UPDATE_PARAM` | pendiente | — |
| P7 | Cierre de la serie: auditoría integral, e2e final, PR draft y deuda post-serie | pendiente | — |

**MÁXIMO: 7 ventanas.** Prohibido abrir ventanas fuera del cap: lo que no entre se declara como
deuda post-serie en el cierre (P7), no se improvisa.

## Prerrequisito de base

- **Recomendado**: PR #2 (noche-3) mergeado a `main`. La rama `serie/deuda-1` está cortada del tip
  de noche-3 (`1b23219`), así que el trabajo es compatible; si el PR #2 no está mergeado al
  arrancar, la serie trabaja apilada sobre ese tip y su PR final se abrirá contra `main` mostrando
  también los commits de noche-3 hasta que aquel se mergee (ruido de diff, no bloqueo).
- **Fingerprint de base** (lo verifica el ARRANQUE de cada ventana): pisos `lib/**` **96/90/98/96**
  y global **90/80/90/90** en `vitest.config.ts`, **7 slices** en `lib/store/slices/`, suite
  ≥ **1078** tests.

## Reglas duras de la serie

1. **Rama de trabajo `serie/deuda-1`**. Prohibido pushear a `main`; prohibido mergear (mergear los
   PRs es decisión del owner). El PR #1 (`noche/serie-noche-2`, draft) es del ciclo anterior: **no
   se toca**.
2. **Un commit por work-unit**, estilo convencional en español, automático al cerrar cada trabajo,
   commiteando **solo** los archivos del cambio.
3. **Método openspec**: todo cambio va por `propose → apply → archive`. Para cada delta: leer
   `openspec/CONVENCION-DELTAS.md` y correr `node openspec/scripts/check-delta-coverage.mjs <change>`
   hasta que dé `0 que romperían el archive`.
4. **`nsgc-prepush` obligatorio antes de cada push** (avance en `Data/NSGC/docs/avances/`, manual de
   módulo si cambia comportamiento o estructura, Trazabilidad si cambia un estado).
5. **CI antes de archive**: cada ventana pushea y **no espera** el CI; la ventana siguiente
   (ARRANQUE) verifica el run anterior y, con CI verde **observada**, archiva lo que quedó completo.
   **Nunca se archiva sin CI verde observada.** Si la API de GitHub no responde: reintentar una vez y,
   si sigue caída, dejar constancia en la Bitácora y seguir.
6. **`STORE_VERSION = 28` congelado**: ningún cambio de la serie toca el shape persistido. Si algo lo
   exigiera, se marca BLOQUEADO en la tabla y se sigue.
7. **Nunca** tocar `k0mp4ss_fe/apps/web/prisma/dev.db` ni `Data/NSGC/backups/`: las corridas e2e usan
   bases descartables `prisma/perf*.db` (cubiertas por `*.db` en `.gitignore`).
8. **Nunca secretos** en código, docs ni commits.
9. **Gate por ventana**: `cd k0mp4ss_fe/apps/web && npx tsc --noEmit && npm run lint && npm test`
   (pisos por área), `openspec validate --all` sin fallos, `check-delta-coverage` del change tocado y
   la e2e dirigida de la ventana con paridad CI (usar `npm run e2e:fresh` desde P1).
10. **Si un gate falla dos veces**: marcar la ventana BLOQUEADO (tabla + Bitácora con la evidencia
    exacta), commitear lo que quede sano (o revertir lo roto) y **seguir** con la próxima ventana.
    Nunca quedarse reintentando ni pedir intervención al owner.
11. **Si el contexto se agota**: cerrar la tarea en curso, commitear, actualizar esta Bitácora con el
    estado exacto y avisar en una línea.
12. **Alcance cerrado**: cada ventana toca solo los archivos que declara su prompt.

## Modo de ejecución

### Manual (un chat por ventana)
El owner pega en un chat nuevo, en orden estricto:
`Corré el archivo openspec/SERIE-DEUDA-1/prompt-01.md`, luego 02 → 07. Al terminar cada ventana
copia su Reporte Final al chat orquestador (o alcanza con decir *"ya terminó prompt N"*: el
orquestador lee el estado del repo).

### Delegado con workers (recomendado — control en un solo chat)
En **un chat nuevo** el owner dice *"corré la serie deuda-1"* y no vuelve a intervenir hasta el
cierre (solo aprueba permisos si el harness los pide). El chat orquestador:

1. Carga la skill `serie-ventanas`, lee este `00-plan.md` y verifica el repo (rama, fingerprint,
   `git log`, suite).
2. Por cada ventana **EN ORDEN** lanza el subagente `serie-executor` con:
   *"Ejecutá de principio a fin `openspec/SERIE-DEUDA-1/prompt-NN.md` y devolvé el Reporte Final
   Estandarizado"*. **Una ventana a la vez; jamás en paralelo.**
3. Al retornar cada ventana **audita contra el repo** (no contra el reporte): `git log`/`git status`,
   fila y Bitácora del plan, gates de la ventana. Si falta algo menor, relanza la MISMA ventana con
   la corrección puntual; si el worker murió a mitad, verifica el estado parcial y completa lo que
   falte (precedente noche-3: el orquestador completó ventanas inline tras la muerte del ejecutor).
4. Nunca lanza la ventana N+1 sin verificar la N. No ejecuta alcances él mismo salvo el rescate
   descrito.
5. Al llegar a P7 presenta el cierre: estado por ventana con commits reales, números finales,
   evidencia de archives y **deuda post-serie**.
6. **Fallback**: si el subagente es inutilizable, el owner pasa a modo manual con las mismas líneas
   de handoff (los `prompt-NN.md` son idénticos para ambos modos).

## Base de hechos (arranque de la serie)

- Suite **1078 verdes** (107 archivos) con pisos por área en `vitest.config.ts`: global
  **90/80/90/90** · `lib/**` **96/90/98/96** · `app/api/**` **82/67/85/82**. Regla del ratchet:
  piso = **medido − 1 punto**, y **nunca se baja**.
- Cobertura de cierre de noche-3: global **91.09/81.40/91.94/91.09** · `lib/**`
  **97.63/91.11/99.44/97.63** (`lib/store.ts` legacy **96.06**, slices **99.78**) · `app/api/**`
  **83.69/68.70/86.99/83.69**.
- Deuda de cobertura exacta por ventana:
  - **API** (declarada al cierre de noche-3): `qa-roadmap` 62.5%, `emisiones-gc` 66.89%,
    `vinculos` 69.2%, `fondos-fi` 71.16%, `personas` 72.82% y el resto de carpetas bajo el promedio.
    Rige la **medición real** de cada fase (P3 y P4 miden primero y eligen las 3 más bajas).
  - **Store**: `lib/store.ts` **168 statements** sin cubrir (ramas de validación puntuales de
    acciones legacy + arranque/migraciones); `lib/store/helpers.ts` 5 (líneas 40, 98, 101-103);
    slices 5 (`ad-slice` 332/357; `ge-slice` 162/234/318).
- Deuda de tooling e2e: **`npm run e2e:fresh` no existe**. La receta manual verificada está en
  `openspec/SERIE-NOCHE-3/00-plan.md` § Base de hechos (migrate + `e2e:reseed-base` + build +
  `CI=1 npx playwright test`). El caso "cancelar" de `e2e/crud/poblado-idempotente.spec.ts:96`
  espera 30 s cuando la purga mide **38,7 s**.
- Defecto pendiente: el `PUT` de la página de MT (`/api/mt/trabajos/[id]`) responde **404 "Registro
  no encontrado"** por el chequeo de scope de `lib/api/put-merge.ts:53-57` aunque la fila exista
  (detectado en P2 de noche-3; el split lo sacó del camino del store, el defecto sigue vivo).
- Deriva documental: 11 specs vivas + 4 manuales NSGC nombran acciones podadas en `store-cleanup`
  (P1 de noche-3) y el evento `CF_UPDATE_PARAM` quedó **sin emisor** (gap preexistente de la
  migración CF→API).
- Node: `.nvmrc` = 24 · `engines.node` = `>=24` · local 24.21.0 →
  `export PATH="$HOME/.nvm/versions/node/v24.21.0/bin:$PATH"`.
- **Nunca** correr el spec de rate-limit antes de la lane e2e (bloquea la IP 15 min y aborta
  `auth.setup`).

## Bitácora
(cada ventana agrega su entrada ANTES del push final: `- [fecha] P<n> HECHA: resumen (commits)`)

- [2026-10-16] **P1 HECHA** (`e2e-fresh`): la receta e2e con paridad CI que se replicaba a mano
  queda como script reproducible `npm run e2e:fresh` (`scripts/e2e-fresh.mjs`, Node ESM sin
  dependencias nuevas): base descartable por defecto `prisma/perf-e2e.db` (`--db`, `--keep-db`),
  **guarda dura** que aborta si el destino es `prisma/dev.db`, saneo del puerto 3000 (mata el
  `next-server` huérfano del incidente P4 de NOCHE-3), `migrate deploy` + `e2e:reseed-base` +
  `build` (`--no-build`), banner con el comando Playwright exacto y aviso de no correr el spec de
  rate-limit antes de la lane; el passthrough tras `--` se pasa tal cual a Playwright y dispara la
  corrida. Además la purga del caso "cancelar" de `poblado-idempotente` sube de 30 s a **120 s**.
  **Ventana reanudada** sobre el estado parcial de un intento muerto por reinicio de máquina: se
  auditó contra el prompt y se corrigió un defecto real — la corrida de Playwright no exportaba
  `CI=1` (habría usado `next dev` + `reuseExistingServer` + Chrome del sistema, sin paridad CI).
  **Gates**: `tsc` 0 · `lint` 0 · `npm test` **1078/1078** (107 archivos) con los pisos vigentes
  (global 90/80/90/90 · `lib/**` 96/90/98/96 · `app/api/**` 82/67/85/82) · `openspec validate --all`
  40 passed / 0 failed · `check-delta-coverage e2e-fresh` 1 ok · **0 que romperían el archive**.
  **Lane dirigida** (`npm run e2e:fresh -- -- e2e/crud/poblado-idempotente.spec.ts e2e/smoke`) sobre
  `prisma/perf-e2e.db`: **24/24 verdes** (JUnit `tests="24" failures="0" errors="0" skipped="0"`,
  `.last-run.json` `passed`, **0 reintentos**) = `auth.setup` 6 · `crud/poblado-idempotente` 2 ·
  `smoke/modulos` 8 · `smoke/modulos-mobile` 8; `prisma/dev.db` intacta (mtime anterior a la lane).
  Change `e2e-fresh` (tooling puro, `skip_specs: true`) queda 🔵 En Proceso hasta archivarlo con CI
  verde observada (commits: `adf932e` tooling + spec · cierre documental en el mismo push).

- [2026-10-16] **P2 BLOQUEADA** (`fix-put-merge-scope`): el defecto declarado al cierre de NOCHE-3
  ("el `PUT` de `/api/mt/trabajos/[id]` responde 404 aunque la fila exista, por el scope de
  `lib/api/put-merge.ts:53-57`") **no se reproduce**: con fila propia y sesión de esa comunidad el
  `PUT` responde **200** y muta la fila. Las tres hipótesis quedaron refutadas — comunidad (H1),
  param (H2) y fila (H3): los **24** modelos detrás de `createPutMerge` declaran `id` +
  `comunidadId` (24/24 OK). **Decisión: no se toca `lib/api/put-merge.ts`** — el guard es correcto y
  necesario, y "arreglarlo" para que no devuelva 404 degradaría el aislamiento multi-tenant (fuga
  cross-comunidad). Se entrega red de seguridad `test/api/put-merge-scope.test.ts` (4 casos, Prisma
  real: propia → 200 con mutación en BD · ajena → 404 mismo mensaje que id inexistente y sin mutar ·
  rol sin `mt:editar` → 403 sin mutar · id inexistente → 404) y el change `fix-put-merge-scope` con
  `skip_specs: true` justificado. **Causa real del rojo**: `playwright.config.ts` fija
  `timeout: CI ? 30_000 : 120_000` y `e2e:fresh` corre con `CI=1` ⇒ **30 s** de presupuesto para el
  test entero, mientras el spec hace ~40 interacciones de UI; muere rellenando el formulario,
  **antes** del paso "Iniciar" (el `PUT` que la deuda señalaba). **Gate e2e NO cumplido**:
  `e2e/crud/proyectos.spec.ts` rojo 3/3 por timeout de test, archivo **fuera del alcance declarado**
  de P2 (regla 12) ⇒ por **regla 10** la ventana queda BLOQUEADA con la evidencia y la deuda
  **reasignada a P7**: agregar `test.use({ timeout: 120_000 })` en `proyectos.spec.ts` o alinear el
  `timeout` de CI en `playwright.config.ts`. **Gates que sí pasaron**: `tsc` 0 · `lint` 0 errores ·
  `npm test` **1082/1082** (108 archivos = 1078 de base + los 4 nuevos) con los pisos vigentes ·
  `openspec validate --all` 39/0 · `check-delta-coverage fix-put-merge-scope` 0 que romperían el
  archive. Commit `fa9196d`. *Nota de ejecución*: el ejecutor delegado murió a los 82 turnos
  (`capacity quarantined`) dejando el trabajo sin commitear; el orquestador lo auditó contra el repo
  y completó el cierre (avance, fila, Bitácora y commits). El intento anterior de la misma ventana
  había muerto a los 30 turnos esperando el CI: el ARRANQUE con espera larga quema la ventana.

- [2026-10-16] **P3 HECHA** (`api-cobertura-fase3`): fase 3 del ratchet API sobre las **3 carpetas
  más bajas de la medición real** (arranque: suite **1082/1082** verdes, 108 archivos; `app/api/**`
  **83.69/68.70/86.99/83.69** con 1.260 statements sin cubrir de 7.726). El ranking agregado por
  carpeta confirmó las candidatas declaradas: `qa-roadmap` 62.5%, `emisiones-gc` 66.89% y
  `vinculos` 69.2%. Se agregaron **49 tests** en 3 archivos nuevos con el molde de `test/api/`
  (interfaz pública de los handlers exportados, Prisma real contra la BD de test, **único mock
  `next/headers`**, sin mocks de Prisma y sin editar handlers): `qa-roadmap` (guard 404 de entorno,
  401, 400 de alcance, 200 con alcance explícito y default), `emisiones-gc` (GET factory + POST de
  emisión GC con 400 de validación y de reglas, 409 de período duplicado y 201 en modo fijo y
  variable con la transacción de cobros + aporte al fondo de reserva; GET_ONE / PUT con
  revalidación del merge / DELETE con 409 por cobros pagados y 200 borrando cobros + emisión) y
  `vinculos` (GET paginado scoped, POST sobre `ejecutarUpsertVinculo` con persona inactiva/bloqueada
  —D6—, duplicado, exclusividad de propietario y arrendatario, anti-autosolapamiento y cierre del
  tramo anterior; GET / PUT / DELETE con la guarda 409 de ControlPropiedad). **Salto medido**:
  `qa-roadmap` 62.5 → **91.67**, `emisiones-gc` 66.89 → **94.26**, `vinculos` 69.2 → **94.93**
  (statements). **Re-baseline**: `app/api/**` 83.69/68.70/86.99/83.69 →
  **85.75/71.50/88.48/85.75** ⇒ piso **84/70/87/84** (sube de 82/67/85/82; ninguna métrica baja),
  con fecha y carpetas documentadas en `vitest.config.ts`. **Gates**: `tsc --noEmit` 0 · `npm run
  lint` 0 errores · `npm test` **1131/1131** (111 archivos = 1082 + 49) **con los pisos nuevos
  aplicados** · `openspec validate --all` 41 passed / 0 failed · `check-delta-coverage
  api-cobertura-fase3` 1 ok · **0 que romperían el archive**. Change `api-cobertura-fase3`
  (proposal/design/tasks + delta `MODIFIED` del requirement "Gate de cobertura por área" en
  `DEV-qa-lab` con los 4 escenarios vivos + el de la fase) queda 🔵 En Proceso hasta archivarlo con
  CI verde observada (ARRANQUE de P4). Commits: `693943b` (change) · `d902f0f` (qa-roadmap) ·
  `cc4f49b` (emisiones-gc) · `a955e0f` (vinculos) · `03a7cdd` (ratchet) · cierre documental en el
  mismo push. *Nota*: e2e no aplica (tests + thresholds, sin cambio de comportamiento); la rama
  queda **sin pushear** (el push lo hace el orquestador).

- [2026-10-16] **P4 HECHA** (`api-cobertura-fase4`): fase 4 de la superficie API. Medición real de
  arranque (1131/1131): `app/api/**` **85.75/71.50/88.48/85.75** con 1.101 statements sin cubrir;
  ranking de carpetas más bajas `fondos-fi` 71.16 · `personas` 72.82 · `cobros-fi` 74.43 · `backup`
  75 · `controles-propiedad` 75.4. Se cubrieron las 3 más bajas con **50 tests nuevos** en 3
  archivos contra la interfaz pública de los handlers (Prisma real, sin mocks de Prisma, único mock
  `next/headers`, sin editar handlers): `fondos-fi` **71.16 → 89.66** · `personas` **72.82 → 93.45**
  · `cobros-fi` **74.43 → 91.48**. `app/api/**` queda **88.39/75.82/89.22/88.39** (297 statements
  sin cubrir menos: 1.101 → **897** de 7.726) y el piso se re-baselinea a **87/74/88/87** (medido −
  1 pt, sube desde 84/70/87/84, ninguna métrica baja). Change con delta `MODIFIED` del requirement
  "Gate de cobertura por área" que cubre **los 5 escenarios vivos** de `DEV-qa-lab`.
  **Gates**: `tsc` 0 · `lint` 0 errores · `npm test` **1181/1181** (114 archivos = 1131 + 50
  nuevos) **con los pisos nuevos aplicados** · `openspec validate --all` 40/0 ·
  `check-delta-coverage` 0 que romperían el archive. e2e no aplica. Commits `2dec53b` (propuesta) +
  `3c5f006` (fondos-fi) + `ddba331` (personas) + `92ae766` (cobros-fi) + `8c5a1e4` (ratchet).
  *Nota de ejecución*: el ejecutor delegado murió a los **90 turnos / 107 tool calls** después de
  commitear el alcance pero antes del cierre documental y del gate final; el orquestador auditó,
  corrió la suite completa con los pisos nuevos (exit 0) y completó el cierre.

- [2026-10-17] **P5 PARCIAL** (`store-cobertura-fase-c`): fase C del store legacy. Se cubrieron
  **57 de los 168** statements de `lib/store.ts` y los **10** bordes de `lib/store/helpers.ts` y de
  los slices (líneas 40, 98, 101-103 · `ad-slice` 332/357 · `ge-slice` 162/234/318), con **27 tests
  comportamentales** contra `useCompassStore` y el `StoreResult` observable: `saveUnidad` (3 FKs de
  RG escritura), `aplicarInfraccionIN` (inexistente · ya resuelta · tipo podado · daño directo ·
  sanción **% GC contra el último gasto común** con cobro material en el libro FI · cargo
  `"pendiente"` sin fondo activo), `generarReporteRE` (bloques bitácora de seguridad, morosidad y
  consumo de insumos con su `payloadSnapshot`), `removeMaestro` (integridad referencial de las 5
  colecciones) y `retenerGarantiaRA` (5 rechazos + retención con cargo `garantia_ra` al fondo de
  amenities). **Cobertura antes → después**: `lib/store.ts` 96.05 → **97.39** · `helpers.ts` 96.03 →
  **100/87.14** · slices 99.78 → **100/95.56** · `lib/**` 97.63 → **98.39/92.19/99.43/98.39** ·
  global 91.09 → **93.70/84.77/93.28/93.70**. **Ratchet** (medido − 1 pt, ningún piso baja):
  global 90/80/90/90 → **92/83/92/92** · `lib/**` 96/90/98/96 → **97/91/98/97** · `app/api/**` sin
  cambios. Change con delta `MODIFIED` del requirement "Gate de cobertura por área" que cubre los
  **6 escenarios vivos** de `DEV-qa-lab`. **Gates**: `tsc` 0 (detectó y se corrigieron 8 accesos a
  índice opcional en el test nuevo) · `lint` 0 errores · `npm test` verde **con los pisos nuevos
  aplicados** · `openspec validate --all` 40/0 · `check-delta-coverage` 0 que romperían el archive.
  Commit `85ed548`. **Remanente declarado para P7**: 111 statements de `lib/store.ts`
  (`generarCertificadoCT` 15, `distribuirReporteRE` 13, `respaldarInfraccionIN` 8,
  `desestimarInfraccionIN` 8, `saveElementoRA` 7, `saveAdelantoPL` 6, ramas de arranque de `migrate`
  4940-4941/5127 y ramas sueltas de 12 acciones más), con su línea y causa en el avance NSGC.
  *Nota de ejecución*: los **tres** intentos del ejecutor delegado murieron por infraestructura
  (51 y 12 turnos, sin archivos; el subsistema llegó a fallar con un brief de 10 statements), así
  que la ventana se completó **inline** — el rescate previsto por el plan.
