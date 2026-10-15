# Serie NOCHE-3 — Deuda del store: limpieza, split y cobertura

> Toda ventana DEBE leer este archivo al iniciar (bloque ARRANQUE), marcar su fila **EN CURSO**
> y actualizarla antes del push final. La Bitácora es el registro durable de la serie.
> **Esta serie corre sin el owner**: en modo delegado el chat orquestador lanza una ventana a la
> vez (subagente `serie-executor`, o un chat nuevo por ventana en modo manual) y nadie participa
> hasta que termine. Ninguna ventana le pregunta nada al owner: si un gate falla dos veces, se
> marca **BLOQUEADO** con la evidencia exacta y se sigue con la próxima ventana.

| Ventana | Alcance | Estado | Commit final |
|---|---|---|---|
| P1 | `store-cleanup` — censo fino por miembro (incluye uso intra-store) + borrado de lo muerto/solo-test + tests | HECHA (e2e: 1 caso preexistente, ver Bitácora) | `8e19565` (archive) |
| P2 | `st-split-fase2` slices **IR + MT** | HECHA (e2e MT: defecto API preexistente, ver Bitácora) | — |
| P3 | `st-split-fase2` slices **AD + PI/D3** | HECHA (e2e 9/9 con paridad CI; ver Bitácora) | `327b7af` |
| P4 | `st-split-fase2` slice **CO** | pendiente | — |
| P5 | `st-split-fase2` slices **GE + CV** (+ cierre de tasks del change: manual de arquitectura + avance) | pendiente | — |
| P6 | `api-cobertura-fases` fase 1 — rutas API más bajas + subir el piso `app/api/**` | pendiente | — |
| P7 | `api-cobertura-fases` fase 2 — resto de rutas bajas + subir el piso otra vez | pendiente | — |
| P8 | `store-cobertura-fase-b` — cobertura de `lib/store/**` (slices) + subir los pisos `lib/**` y global | pendiente | — |
| P9 | Cierre de la serie: cobertura pendiente, gates completos, auditoría integral, PR draft, deuda restante | pendiente | — |

**MÁXIMO: 9 ventanas.** Prohibido abrir ventanas fuera del cap: si algo no cabe, se declara como
deuda post-serie en P9 (replanteo con el owner), no se improvisa.

## Cómo se corre y cómo se reanuda
- **Modo manual** (chat nuevo por ventana): `Corré el archivo openspec/SERIE-NOCHE-3/prompt-01.md`
  y luego 02 → 09 en orden estricto.
- **Modo delegado (sin owner)**: en un chat orquestador, decir *"corré la serie noche-3"*: el
  orquestador lanza **una ventana a la vez** (nunca en paralelo) con el subagente
  `serie-executor`, audita cada retorno contra el repo y sigue con la siguiente.
- **Reanudación**: basta con decir "ya terminó prompt N". El estado se lee del repo
  (`00-plan.md` + `git log`), nunca de texto pegado de otro chat.

## Reglas duras de la serie (válidas en TODAS las ventanas)
1. **Rama de trabajo `noche/serie-noche-3`**, creada desde `main` (`846e3e4`) por el orquestador
   al materializar la serie. **Prohibido pushear a `main`; prohibido mergear.** El PR #1
   (`noche/serie-noche-2`, draft, CI verde) es del ciclo anterior: **no se toca**.
2. **Un commit por work-unit**, estilo convencional en español, automático al cerrar cada trabajo,
   commiteando **solo** los archivos del cambio (la suciedad ajena queda fuera).
3. **Método openspec**: todo cambio de código/spec va por `propose → apply → archive`.
   Para cada delta: leer `openspec/CONVENCION-DELTAS.md` y correr
   `node openspec/scripts/check-delta-coverage.mjs <change>` hasta que dé `0 que romperían el archive`.
4. **`nsgc-prepush` obligatorio antes de cada push** (avance en `Data/NSGC/docs/avances/`, manual
   de módulo si cambia comportamiento o estructura, Trazabilidad si cambia un estado).
5. **CI antes de archive (política de la serie)**: cada ventana pushea y **no espera** el CI; la
   ventana siguiente (bloque ARRANQUE) verifica el run anterior y, con CI verde **observada**,
   archiva lo que quedó completo. **Nunca se archiva sin CI verde observada.** El cierre (P9)
   audita todo y archiva lo pendiente con evidencia.
6. **`STORE_VERSION = 28` congelado**: ni el split ni la limpieza ni la cobertura cambian el shape
   persistido. Si algo lo exigiera, se marca **BLOQUEADO** en la tabla y se sigue (es decisión del
   owner, no se improvisa).
7. **Nunca** tocar `k0mp4ss_fe/apps/web/prisma/dev.db` ni `Data/NSGC/backups/`: las corridas e2e
   usan bases descartables `prisma/perf*.db` (cubiertas por `*.db` en `.gitignore`).
8. **Nunca secretos** en código, docs ni commits.
9. **Gate por ventana**: `cd k0mp4ss_fe/apps/web && npx tsc --noEmit && npm test` (pisos por área),
   `openspec validate --all` sin fallos, `check-delta-coverage` del change tocado y la e2e dirigida
   de la ventana con paridad CI (si el alcance toca comportamiento o estructura del store).
10. **Si un gate falla dos veces**: marcar la ventana **BLOQUEADO** (tabla + Bitácora con la
    evidencia exacta), `git commit` de lo que quede sano (o revertir lo roto) y **seguir** con la
    próxima ventana. Nunca quedarse reintentando ni pedir intervención.
11. **Si el contexto se agota**: cerrar la tarea en curso, commitear, actualizar esta Bitácora con
    el estado exacto y avisar en una línea.
12. **Alcance cerrado**: cada ventana toca solo los archivos que declara su prompt.

## Base de hechos (arranque de la serie)
- Suite **993 verdes** (último conteo conocido) con pisos por área en `vitest.config.ts`:
  global **82/72/87/82** · `lib/**` **86/78/94/86** · `app/api/**` **78/63/82/78**.
  Regla del ratchet: piso = **medido − 1 punto**, y **nunca se baja** un piso existente.
- `lib/store.ts`: 8.889 líneas, `@deprecated` pero **vivo** (no muerto). Censo 2026-10-14 de los
  **182 miembros** de `CompassStore`: **107** usados por la app · **4** solo por el QA-Lab ·
  **21** solo por tests · **1 muerto** (`toggleActivoTipoUnidad`). Fuente: Engram obs. 205 y
  `openspec/BACKLOG-100.md`.
- `lib/store/` hoy solo tiene `helpers.ts` (Fase 1 del split, `eff32c3`). Los 7 slices hoja y su
  orden de riesgo creciente están en `openspec/changes/st-split-fase2/proposal.md`.
- Deuda de cobertura: `lib/store.ts` **1.202 statements** sin cubrir (84.21%) y superficie API
  **2.114 statements** (79.40%; las más bajas: `app/api/personas` 70.54%, `app/api/unidades`,
  `app/api/vinculos`). Fuente: `openspec/changes/archive/2026-10-12-ci-verde-ratchet-cobertura/design.md` (§Deuda).
- Node: `.nvmrc` = 24 · `engines.node` = `>=24` · local 24.21.0 →
  `export PATH="$HOME/.nvm/versions/node/v24.21.0/bin:$PATH"`.
- Lane e2e: **`npm run e2e:fresh` NO existe todavía** (lo prometía P3 de `SERIE-NOCHE-2` y nunca
  se creó; queda como deuda explícita para P9 — ver más abajo). Receta equivalente, verificada en
  P3, dentro de `k0mp4ss_fe/apps/web`:
  ```bash
  export DATABASE_URL="file:./perf-<ventana>.db"
  npx prisma migrate deploy --schema=prisma/schema.sqlite.prisma
  npm run e2e:reseed-base            # seed:authz + seed:mocks --comunidad-id=comunidad-a
  npm run build && npm run start     # paridad CI: rutas calientes
  npx playwright test <specs de la ventana>
  ```
  El shell env gana sobre `.env` (Next sólo setea variables ausentes de `process.env`), las bases
  son descartables (`prisma/perf*.db`, gitignored) y nunca se toca `prisma/dev.db`.
  **Contra `next dev` el gate es poco fiable**: es *latency-bound* y los primeros renders/requests
  de rutas frías se pasan de los 15 s de `expect` y de los 30 s de `APIRequestContext` (medido en
  P3: 6/9 y 8/9 con dev vs **9/9** con build + `next start`). Si una ventana corre igual contra
  `next dev`, no marque BLOQUEADO por esos timeouts: repita con paridad CI.
  **Nunca** correr el spec de rate-limit antes de la lane (bloquea la IP 15 min y aborta
  `auth.setup`).

## Bitácora
(cada ventana agrega su entrada ANTES del push final: `- [fecha] P<n> HECHA: resumen (commits)`)

- [2026-10-14] **P1 HECHA** (`store-cleanup`): censo fino por miembro con la API de TS en 5 zonas
  (intra-store / app catch-all / QA-Lab / tests / e2e) → 180 miembros = 79 app · 71 QA-Lab ·
  26 solo-test · 2 muerto · 2 intra-store. Poda de **28 acciones** sin consumidor
  (2 muerto + 26 solo-test sin uso intra-store): `lib/store.ts` 8.890 → 7.621 líneas; 473 líneas de
  test removidas en 16 archivos (casos con sujeto podado) y 10 archivos con *setup* adaptado a
  siembra directa de estado. Guardas: `STORE_VERSION` **28**, `CompassData` y `partialize`
  **idénticos**, `tsc` 0 errores, `eslint` 0 errores, `npm test` **936 tests verdes** con cobertura
  84/73.12/88.39/84 sobre pisos 82/72/87/82, `openspec validate --all` 41 passed / 0 failed,
  `check-delta-coverage` **0 que romperían el archive** (3 MODIFIED en ST).
  **Incidente**: la v1 del censo dejó `components/**` fuera de la zona app → el `tsc` destapó 3
  acciones con consumidor real en `components/pe/*`; la lista se corrigió de 31 a 28 y el censo v2
  usa zona catch-all. **Deriva declarada** (fuera del alcance de la ventana): 11 specs vivas +
  `ST` ya cubierta por delta, y 4 manuales NSGC nombran acciones podadas; el evento
  `CF_UPDATE_PARAM` queda sin emisor (gap preexistente de la migración CF→API). **e2e dirigida**:
  `auth.setup` 6/6 y el test principal de `poblado-idempotente.spec.ts` **verde** sobre base
  descartable fresca (`prisma/perf-e2e.db`); el caso "cancelar" (`:96`) falla en su espera de
  30 s — la purga completa mide **38,7 s** en el log del dev server (el test hermano usa 120 s) —
  flujo API/Prisma que **no depende del store** (el QA-Lab no usa ninguno de los 28 miembros, no
  hay acceso dinámico y ninguna ruta `app/api/**` importa `lib/store.ts`). Deuda accionable:
  subir esa espera a 120 s. Commit: ver fila P1.

- [2026-10-14] **P2 HECHA** (`st-split-fase2` slices IR + MT): movimiento puro del monolito a
  factories zustand en `lib/store/slices/{ir,mt}-slice.ts` (649 y 411 líneas). `lib/store.ts`
  **7.621 → 6.618 líneas** (−1.003); `STORE_VERSION` sigue **28** y el shape persistido no cambia.
  Verificación de movimiento puro: **15/15 cuerpos de acción byte-idénticos a HEAD** (comparados
  por script), `tsc` 0 errores, `eslint` 0, suite completa **exit 0** (cobertura `lib` sube a
  89.78/81.16/96.57/89.78 y `store.ts` a 86.5/80.17/96.42/86.5), `openspec validate --all` 41/0.
  `registrarEvento` (+`MAX_EVENTOS`, `SetStateFn`) se movió a `lib/store/helpers.ts` para que los
  slices lo importen sin ciclo runtime; `CompassStore`/`StoreResult` entran type-only.
  **ARRANQUE**: la API de GitHub no responde (reintento incluido) y, además, el workflow sólo
  dispara en `push` a `main` o `pull_request`, así que **el push de P1 no generó run de CI** y no
  hay PR para esta rama → por la regla "nunca archivar sin CI verde observada", `store-cleanup`
  **quedó sin archivar** (pendiente del ARRANQUE de P3 o de que exista un PR).
  **e2e**: `e2e/crud/recursos.spec.ts` (IR) **verde** sobre base descartable fresca
  (`prisma/perf-p2.db`); `e2e/crud/proyectos.spec.ts` (MT) falla en el paso "Iniciar" porque el
  `PUT` de la página (`/api/mt/trabajos/[id]`) responde **404 "Registro no encontrado"** por el
  chequeo de scope de `lib/api/put-merge.ts:53-57` aunque la fila existe en la base — defecto
  **preexistente de la capa API**, fuera del camino del store (la página usa sólo hooks de API) y
  fuera del alcance de archivos de la ventana. Queda registrado como deuda accionable.

- [2026-10-15] **P3 HECHA** (`st-split-fase2` slices AD + PI/D3): AD movió
  `controlesPropiedades` + `actasGD` + **6 acciones** (`saveControlPropiedad`,
  `removeControlPropiedad`, `saveActaGD`, `removeActaGD`, `aprobarActaGD` y `publicarActaEnCV`,
  que en el monolito vivía en el bloque CV) a `lib/store/slices/ad-slice.ts` (369 líneas);
  PI/D3 movió `publicacionesPortal`, `leadsPortal` y `notificaciones` + **3 acciones**
  (`removePublicacionPortal`, `syncPublicacionesDesdeVinculos`, `notify`) a `pi-slice.ts`
  (183 líneas). Son 3 y no 6 porque P1 podó `savePublicacionPortal`, `saveLeadPortal` y
  `marcarNotificacionLeida`. `lib/store.ts` **6.618 → 6.130 líneas** (−488); `STORE_VERSION`
  sigue **28** y `CompassData`/`seedData`/`partialize`/migraciones quedaron intactos.
  **Cross-write declarado**: `publicarActaEnCV` muta `avisosCV` (dominio CV, todavía en el
  monolito) con `get()`/`set()` y un comentario en el slice para que P5 lo respete.
  **Helpers GD movidos**: `periodoDirectivaVigente` y `esMiembroDirectivaVigente` pasaron a
  `lib/store/helpers.ts` (misma razón que `registrarEvento` en P2: evitar el ciclo runtime
  slice→store) y `lib/store.ts` los re-exporta, así que `@/lib/store` no cambia para la app.
  **Verificación de movimiento puro**: **9/9 cuerpos de acción byte-idénticos a HEAD** (script
  sobre la API de TS) y 0 acciones movidas que sigan en el monolito; `tsc` 0, `eslint` 0 (se
  removieron 2 imports de arrastre: `OperacionPortal`, `MAX_EVENTOS`), suite **936/936 exit 0**
  (cobertura `lib` 90.1/80.9/97.74/90.1 y `store.ts` 86.67/79.78/97.97/86.67), `openspec validate
  --all` 41/0, `check-delta-coverage` 1 ok · 0 que romperían el archive.
  **ARRANQUE**: la API de GitHub volvió a caer (dos intentos, `dial tcp` timeout) y el workflow
  sigue disparándose sólo en `push` a `main` o `pull_request`, así que **no hay run de CI
  observable** para esta rama y `store-cleanup` (P1) **sigue sin archivar** (regla: nunca archivar
  sin CI verde observada). **`npm run e2e:fresh` no existe**: P3 de NOCHE-2 nunca creó
  `scripts/e2e-fresh.mjs`, así que se replicó el procedimiento a mano (`migrate deploy` +
  `e2e:reseed-base` sobre `prisma/perf-p3.db`). **e2e**: los tres specs de la ventana
  (`directiva`, `gestion`, `portal`) dieron **9/9 verdes con paridad CI** (build de producción +
  `next start`, el camino del job `e2e`) sobre base fresca; las dos corridas previas contra
  `next dev` fallaron (6/9 y 8/9) por **latencia de compilación en frío**, siempre en el primer
  render/primera request de una ruta fría (heading no visible en 15 s con sólo el shell de la app
  en el snapshot, y `Timeout 30000ms` en el `GET /api/publicaciones-portal?pageSize=100` del
  helper de setup — ruta que **no importa el store**: usa `createCrudHandlers` + Prisma).
  **Incidente de entorno** (preexistente, no del cambio): `tsc --noEmit` fallaba en local por
  artefactos `.next` obsoletos (`.next/types/validator.ts` referenciando `app/api/qa-lab/purga-test`
  y `.next/dev/types/routes.d.ts` truncado); movidos a `/tmp`, `tsc` volvió a 0 — en CI el
  checkout no tiene `.next`. Deuda declarada en el avance: script `e2e:fresh`, archive de P1 y
  CO/GE/CV pendientes (P4/P5).

- [2026-10-15] **Archive pendiente saldado (post-P3)**: se abrió el **PR #2 (draft)** de
  `noche/serie-noche-3` — el workflow sólo dispara en `push` a `main` o `pull_request`, así que era
  la única forma de tener un run observable. Su run **38750846445** quedó **verde**: unit Vitest,
  unit PostgreSQL, **e2e completo con build de producción** y e2e rate-limit en `success` (deploy
  `skipped` por falta de secrets, esperado). Con esa CI **observada** se archivó `store-cleanup` →
  `openspec/changes/archive/2026-10-15-store-cleanup` (commit `8e19565`), aplicando sus 3
  requirements MODIFIED a `ST-capa-datos-persistente` (`check-delta-coverage` 3 ok;
  `openspec validate --all` 40 passed / 0 failed). Esto **anula** el "sin archivar" que registraron
  P2 y P3. Además se corrigió en este plan la lane e2e: **`npm run e2e:fresh` no existe** (deuda
  diferida a P9) y queda escrita la receta real con paridad CI (`migrate deploy` + `reseed-base` +
  `npm run build` + `npm run start` + Playwright), porque contra `next dev` la lane es
  *latency-bound* y da falsos rojos por compilación en frío.
