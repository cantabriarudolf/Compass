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
| P4 | `st-split-fase2` slice **CO** | HECHA (e2e 8/8 con paridad CI) | `e140cbe` |
| P5 | `st-split-fase2` slices **GE + CV** (+ cierre de tasks del change: manual de arquitectura + avance) | HECHA (e2e 9/9 con paridad CI; el ejecutor delegado falló 2 veces y la ventana se completó inline) | `dc24e33` |
| P6 | `api-cobertura-fases` fase 1 — rutas API más bajas + subir el piso `app/api/**` | HECHA (973/973 con los pisos nuevos; el ejecutor delegado falló y la ventana se completó inline) | `377abc2` |
| P7 | `api-cobertura-fases` fase 2 — resto de rutas bajas + subir el piso otra vez | HECHA (1024/1024 con los pisos nuevos; el escritor delegado falló y la ventana se completó inline) | `eebde6d` |
| P8 | `store-cobertura-fase-b` — cobertura de `lib/store/**` (slices) + subir los pisos `lib/**` y global | HECHA (slices 80.65 → 99.78 st; pisos `lib/**` 92/85/98/92 y global 87/77/90/87; e2e no aplica: sin cambio de runtime) | `3123111` |
| P9 | Cierre de la serie: cobertura pendiente, gates completos, auditoría integral, PR draft, deuda restante | HECHA (store.ts 96.06; suite 1078/1078; e2e 32/32 con paridad CI; 4/4 changes archivados; PR draft #2) | `bb7fc48` |

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

- [2026-10-15] **P4 HECHA** (`st-split-fase2` slice CO): movimiento puro del bloque
  **Comunicación con Vecinos** a `lib/store/slices/co-slice.ts` (397 líneas): estado
  `plantillasCO`/`enviosCO`/`mensajesBuzonCO`/`documentosCO` + sus **10 acciones** (el proposal
  contaba 8; el bloque real tenía 10 y las 10 se movieron). `plantillasCO` se siembra en el slice
  con el mismo módulo seed que `seedData()`; `resolverVariablesCO`/`rolDestinatarioCO` se importan
  desde `lib/store/helpers.ts` sin duplicarlos; CO **no tiene cross-write** (sólo lee otros
  dominios por `get()`). `lib/store.ts` **6.130 → 5.795 líneas** (−335); `STORE_VERSION` sigue
  **28** y `CompassData`/`seedData`/`partialize`/migraciones quedaron intactos. Verificación:
  **10/10 cuerpos de acción byte-idénticos a HEAD** (script sobre la API de TS) y 0 acciones CO
  implementadas en el monolito; `tsc` 0, `eslint` 0, suite **936/936 exit 0** (cobertura global
  84.65/72.28/88.23/84.65, `lib` 90.49/81.1/98.36/90.49, `store.ts` 87/79.94/98.86/87), `openspec
  validate --all` 40/0, `check-delta-coverage` **0 que romperían el archive**. **e2e con paridad
  CI**: `comunicacion.spec.ts` + `visor.spec.ts` + `auth.setup` = **8/8 verdes** sobre base
  fresca `prisma/perf-p4.db` con `CI=1` (webServer `npm run start` tras build de producción); el
  intento 1 de comunicacion cayó por `Test timeout of 30000ms` en el primer render de ruta fría y
  quedó verde en retry (retries=2 en CI, aceptado). **Incidente de entorno**: el puerto 3000
  estaba ocupado por un `next-server` huérfano (pid 444789, leftover de la lane de P3) — terminado
  antes de la lane. Pendientes para P5: slices GE y CV, cierre del change (manual de arquitectura
  + avance); `e2e:fresh` sigue como deuda a P9. Commits: `e140cbe` (código) + cierre documental.

- [2026-10-15] **P5 HECHA** (`st-split-fase2` slices GE + CV + cierre del change): GE movió
  `solicitudesGE` + **6 acciones** (el prompt contaba 4) a `lib/store/slices/ge-slice.ts` (409
  líneas) y CV movió `avisosCV` + `plantillasCV` + **4 acciones** (contaba 5; P1 ya había podado
  `removeAvisoCV`, `archivarAvisoCV`, `savePlantillaCV` y `removePlantillaCV`) a `cv-slice.ts` (228
  líneas). `lib/store.ts` **5.795 → 5.219 líneas** (−576); `STORE_VERSION` sigue **28** y el shape
  persistido quedó intacto. **Cierre del split**: 7 slices en `lib/store/slices/`
  (`ir`/`mt`/`ad`/`pi`/`co`/`ge`/`cv`), ninguna acción de los dominios movidos queda implementada
  en el monolito y la serie completa bajó el store de **8.889 a 5.219 líneas** (−41%).
  **Cross-write verificado**: `publicarActaEnCV` (slice AD) sigue escribiendo `avisosCV` (ahora en
  el slice CV) sobre el store combinado → tests dedicados **36/36** (`store-directiva`,
  `store-visor`, `store-solicitudes`) más el e2e de directiva (paso "Publicar acta"). **Movimiento
  puro**: **GE 6/6 y CV 4/4 cuerpos de acción byte-idénticos a HEAD** y 0 residuos. Gates: `tsc` 0,
  `eslint` 0, suite **936/936 exit 0** (global 84.59/72.18/87.92/84.59; `lib`
  90.86/81.72/98.21/90.86; `store.ts` 87.11/80.51/98.71/87.11), `validate --all` 40/0,
  `check-delta-coverage` 0 que romperían el archive y **e2e con paridad CI 9/9** (`auth.setup` 6/6 +
  `directiva` + `solicitudes` + `visor`) con build de producción sobre `prisma/perf-p5.db` (puerto
  3000 liberado al cerrar, sin huérfanos). **Incidente de ejecución**: el subagente `serie-executor`
  falló **dos veces** a mitad de turno ("assistant reported an error") *después* de escribir los dos
  slices y re-cablear el monolito; el orquestador verificó el estado parcial (byte-identidad, `tsc`
  0, 0 residuos) y completó la ventana **inline** — el código del split es de la corrida delegada,
  los gates y el cierre son del orquestador. Manual de arquitectura documentado
  (`33 - ST - Capa de Datos Persistente.md`) y tasks 4.3–4.5 + 5.1–5.2 cerradas: el change queda
  **19/19** y lo archiva el ARRANQUE de P6 con la CI verde de este push. Commits: `dc24e33` (código)
  + cierre documental.

- [2026-10-15] **P6 HECHA** (`api-cobertura-fases` fase 1): se propuso el change (delta `ADDED` en
  la capability viva del ratchet, `DEV-qa-lab`) y se cubrieron con tests reales las **3 carpetas
  API más bajas** medidas sobre la suite verde: `admin/usuarios` (51.53% → **96.92%** statements),
  `qa-estado` (45.65% → **95.65%**) y `dev-dashboard` (31.25% → **88.54%**), con **37 tests nuevos**
  (936 → **973**) contra la interfaz pública de los handlers (camino feliz, 400 de validación y
  guardias 401/403/404), Prisma real contra la BD de test, sin mocks de Prisma y sin tocar ningún
  handler. `app/api/**` (126 handlers) subió de **79.45/64.31/83.64/79.45** a
  **81.53/66.20/85.13/81.53** y el **piso del área** pasó de 78/63/82/78 a **80/65/84/80**
  (medido − 1 pt, con la fecha y el commit de medición documentados en `vitest.config.ts`); los
  pisos global y `lib/**` quedaron **intactos** (sus re-baselines son P8). Gates: `tsc` 0, `eslint` 0
  (tests nuevos + config), suite **973/973 exit 0 CON los pisos nuevos aplicados**, `openspec
  validate --all` 40/0 y `check-delta-coverage api-cobertura-fases` ok. **ARRANQUE**: se archivó
  `st-split-fase2` (19/19) con la CI verde **observada** del push de P5 (run 38780510532) →
  `openspec/changes/archive/2026-10-15-st-split-fase2`. **Incidente de ejecución**: el subagente
  `serie-executor` falló por **tercera vez consecutiva** (P5 ×2 y P6 ×1) a mitad de turno — acá
  *después* de archivar el split, proponer el change y escribir los 3 archivos de tests, pero
  *antes* de correrlos, medir, subir el piso y commitear; el orquestador verificó ese estado (37/37
  en corrida aislada), completó la medición, aplicó el ratchet, documentó y cerró la ventana
  **inline**. El subagente queda reportado como **indisponible** (no como bloqueo de la serie).
  Commits: `2dbfa47` (archive) · `1110f02` (proposal) · `377abc2` (tests + pisos) + cierre
  documental. Pendiente para P7: la **fase 2** ya declarada en `tasks.md` (candidatas de hoy:
  `micro-sectores` 58.44%, `ingresos-fi` 54.07%, `egresos-fi` 57.81%, `emisiones-gc` 66.89%,
  `vinculos` 69.20%).

- [2026-10-15] **P7 HECHA** (`api-cobertura-fases` fase 2): re-medición real de `app/api/**`
  (81.53 tras la fase 1) y elección de las 3 carpetas más bajas → `ingresos-fi` 54.07%,
  `egresos-fi` 57.81% y `micro-sectores` 58.44%. Se cubrieron con **51 tests reales** (3 archivos,
  1075 líneas) contra la interfaz pública de los handlers, con Prisma real contra la BD de test,
  único mock `next/headers` y sin tocar handlers: camino feliz, 400 de validación, 401 sin sesión,
  403 por rol y 404 por scope, más bordes del dominio FI (folio correlativo `FE-0001`/`FE-0002`,
  fondo inexistente o **inactivo**, macro sector inexistente y **409** al borrar un sub-sector con
  unidad asociada). Cobertura por carpeta: `ingresos-fi` → **92.59%**, `egresos-fi` → **93.75%**,
  `micro-sectores` → **88.31%**. `app/api/**` (126 handlers) subió de 81.53/66.20/85.13/81.53 a
  **83.69/68.70/86.99/83.69** (+4.29 pts sobre el 79.40% de la deuda original) y el **piso del
  área** pasó de 80/65/84/80 a **82/67/85/82** (medido − 1 pt, con fecha y carpetas cubiertas
  documentadas en `vitest.config.ts`); los pisos global y `lib/**` quedaron **intactos** (su
  re-baseline es P8). Gates: `tsc` 0, `eslint` 0 (tests nuevos + config), suite **1024/1024 exit 0
  CON los pisos nuevos aplicados** (104 archivos), `openspec validate --all` 40/0 y
  `check-delta-coverage` ok. **Defecto de autoría corregido**: el test de paginación de
  micro-sectores asertaba un `total` exacto sobre una **BD de test compartida** (falló con 3 en
  lugar de 2) → se reemplazó por lo que la regla exige, verificación de **scope por comunidad**
  (las filas propias presentes con `arrayContaining` y la de otra comunidad ausente). **Fallback de
  delegación**: el escritor `gentle-ai-worker` murió *después* de escribir los 3 archivos y *antes*
  de correrlos y medir; el orquestador completó gates, medición, ratchet y cierre **inline**. Con
  esto la delegación queda **indisponible** en la sesión (`serie-executor` ×3 + `gentle-ai-worker`
  ×1, siempre el mismo error del asistente y siempre con el trabajo pesado ya en disco). Commits:
  `eebde6d` (tests + piso) + cierre documental. Pendiente para P8: **archivar
  `api-cobertura-fases`** en su ARRANQUE (con CI verde observada) y la cobertura de
  `lib/store/**` con re-baseline de los pisos `lib/**` y global.
  **Incidente post-cierre (CI rojo y su fix)**: el push de P7 generó el run **38835851841**, que
  falló en el job "Unit + integración (Vitest)" al correr `npx tsc --noEmit`: **TS2722** en los 3
  tests nuevos (las invocaciones dinámicas `record[metodo](...)` de los helpers `llamar` tipan
  `T | undefined` bajo `noUncheckedIndexedAccess`). Causa raíz **de proceso**, no de diseño: la
  ventana corrió `eslint` y los tests pero **no** `tsc --noEmit` después de agregar los 3 archivos
  (venía verde de P6 y lo dio por heredado). Fix: `4e8fbc5` (`fix(test): ...`) reemplaza las
  invocaciones por un lookup explícito con guard en los 3 archivos; verificado en local con `tsc
  --noEmit` **0** y los 3 archivos **51/51**. **Lección para P8/P9**: el gate de cada ventana corre
  `npx tsc --noEmit` **después** de agregar archivos — no se hereda el verde de la ventana
  anterior.

- [2026-10-16] **P8 HECHA** (`store-cobertura-fase-b` fase 1): el `coverage.include` sólo
  instrumentaba `lib/store.ts`, así que los **7 slices** de `lib/store/slices/**` y
  `lib/store/helpers.ts` (el interior del store tras el split) quedaban **fuera del gate**. Se
  extendió el include a `lib/store/**/*.ts` y se **midió primero**: `lib/**` completo bajó de
  90.86/81.72/98.21/90.86 (foto vieja, 7 archivos) a **88.27/80.54/96.63/88.27** (15 archivos, con
  slices en 80.65/77.67/92.59/80.65 y 444/2.295 statements sin cubrir) — **nunca bajo el piso 86**,
  así que no se bajó ningún piso. Ranking real por statements sin cubrir: `store.ts` 549 ·
  `ir-slice` 169 · `mt-slice` 73 · `co-slice` 57 · `ad-slice` 45 · `ge-slice` 45 · `cv-slice` 31 ·
  `pi-slice` 24 · `helpers.ts` 5. **39 tests comportamentales nuevos**
  (`test/store-cobertura-fase-b.test.ts`, ~1.190 líneas) contra la API pública `useCompassStore`:
  guardas de hidratación de los 7 slices (tabla por slice: mensaje exacto y sin mutación) +
  comodines IR (alerta crítica, rechazo con justificación, sustitución, aprobación con alta en
  catálogo), **alarma `IR_STOCK_LOW`** al cruzar el umbral crítico, accesos quién-tiene-qué, MT
  (FKs, folio, pagos, garantías por vencer idempotentes, fondos de proyecto), buzón CO con
  transiciones, quórum AD por **período vigente** (nómina congelada + herencia de `periodoId`),
  `publicarActaEnCV`, GE abrir/responder/resolver/cerrar, CV publicar/plantillas y PI reactivación
  de vitrina. Resultado: slices **99.78/94.43/100/99.78**, `lib/**` **93.28/86.12/99.44/93.28** y
  global **88.78/78.18/91.94/88.78**; **ratchet** documentado en `vitest.config.ts`: `lib/**`
  86/78/94/86 → **92/85/98/92** y global 82/72/87/82 → **87/77/90/87** (`app/api/**` intacto).
  Spec viva `DEV-qa-lab` con `MODIFIED` del requirement del gate (`check-delta-coverage` 1 ok).
  Gates: `tsc` 0 (corrido **después** de agregar los tests), `eslint` 0, suite **1063/1063 exit 0
  CON los pisos nuevos aplicados** (105 archivos), `validate --all` 40/0 y `check-delta-coverage`
  ok. **ARRANQUE**: se archivó `api-cobertura-fases` (fases 1+2 completas) con la CI verde
  **observada** del push de P7 (run **38842160060**) →
  `openspec/changes/archive/2026-10-16-api-cobertura-fases`; `store-cleanup` y `st-split-fase2` ya
  estaban archivados. **e2e no aplica**: el alcance es tests + configuración de cobertura, sin
  cambio de comportamiento ni estructura del store. **Fase 2 escrita para el cierre (P9)**:
  `lib/store.ts` legacy con 549 statements sin cubrir, priorizado por la medición
  (`generarReporteRE` 61, `completarTareaMonitoreoPE` 25, `retirarFondoFI` 22,
  `saveIngresoContratistaPE` 21, `aplicarInfraccionIN` 20, …). Commits: `3123111` (tests + pisos) +
  cierre documental.

- [2026-10-16] **P9 HECHA — CIERRE DE LA SERIE** (`store-cobertura-fase-b` fase 2): se completó la
  cobertura pendiente del store legacy con **15 tests nuevos** en 2 archivos: 14 comportamentales
  (`test/store-cobertura-fase-b-legacy.test.ts`: RE, FI —emisión fija/variable con aporte de
  reserva, mora idempotente, pagos con ajuste justificado, cobranza, retiros de fondo— y PE
  —monitoreo, contratistas, visitas, cierre de turno—) + **1 tabla de guardas de las 97 acciones**
  (`store-cobertura-fase-b-guards.test.ts`). `lib/store.ts` **87.11 → 96.06** (549 → 168
  statements sin cubrir), `lib/**` **97.63/91.11/99.44/97.63** y global
  **91.09/81.40/91.94/91.09**; ratchet final: pisos `lib/**` **96/90/98/96** y global
  **90/80/90/90**. Gates completos: `tsc` 0, `npm run lint` 0, suite **1078/1078 exit 0 CON los
  pisos nuevos aplicados** (107 archivos), `validate --all` 40/0 y `check-delta-coverage` ok.
  **e2e de la serie con paridad CI** sobre `prisma/perf-p9.db` (migrate + reseed + build +
  `next start`): smoke completo + los 9 crud refactorizados + `auth.setup` = **32/32 verdes**
  (JUnit 0 failures / 0 skipped; 2 primeros intentos cayeron por timeout de 30 s de primer render
  y pasaron en retry, tolerado por `retries=2`, mismo precedente de P4). **Auditoría integral**:
  hashes del log vs filas del plan OK, `STORE_VERSION = 28`, 7 slices, `prisma/dev.db` y
  `backups/` intactos, ningún change propio de la serie activo al cerrar. **ARRANQUE**: CI del
  push de P8 (run **38879976368**) verde observada. **Archive de cierre**: con la CI verde del
  push de la fase 2 (run **38898541279**) se archivó `store-cobertura-fase-b` →
  `openspec/changes/archive/2026-10-16-store-cobertura-fase-b`; los cuatro changes de la serie
  quedan archivados. **PR draft #2** actualizado con el resumen de la serie (merge = decisión del
  owner). Deuda post-serie declarada en la sección "Cierre de la serie" (168 statements legacy
  restantes, 10 de bordes, tail API, `e2e:fresh`, timeout de poblado-idempotente, 404 de
  put-merge MT, deriva de prosa). Commits: `bb7fc48` (tests + pisos) + archive + cierre
  documental. **Incidente**: durante la ventana la API de GitHub cayó dos veces (dial tcp
  i/o timeout); los reintentos resolvieron y no bloquearon la observación del CI. La delegación
  siguió indisponible en la sesión y la ventana se ejecutó **inline**.

## Cierre de la serie (P9 — 2026-10-16)

**Estado: COMPLETA (9/9 ventanas HECHA).** Rama `noche/serie-noche-3`; PR draft
[#2](https://github.com/cantabriarudolf/Compass/pull/2) (merge = decisión del owner).

### Ventanas

| V | Change | Resultado | Commit final |
|---|---|---|---|
| P1 | `store-cleanup` | censo de 180 miembros; 28 acciones podadas; `lib/store.ts` 8.889 → 7.621; suite 936 | `8e19565` (archive) |
| P2 | `st-split-fase2` IR + MT | 7.621 → 6.618; 15/15 cuerpos byte-idénticos | — |
| P3 | `st-split-fase2` AD + PI | 6.618 → 6.130; 9/9 cuerpos | `327b7af` |
| P4 | `st-split-fase2` CO | 6.130 → 5.795; 10/10 cuerpos | `e140cbe` |
| P5 | `st-split-fase2` GE + CV + cierre | 5.795 → 5.219 (−41% de la serie); 7 slices | `dc24e33` |
| P6 | `api-cobertura-fases` 1 | 3 carpetas API más bajas; piso api 80/65/84/80; 973 tests | `377abc2` |
| P7 | `api-cobertura-fases` 2 | +3 carpetas; piso api 82/67/85/82; 1024 tests | `eebde6d` |
| P8 | `store-cobertura-fase-b` 1 | include `lib/store/**`; slices 80.65 → 99.78; pisos lib 92/85/98/92 y global 87/77/90/87; 1063 tests | `3123111` |
| P9 | `store-cobertura-fase-b` 2 + cierre | `store.ts` 87.11 → 96.06; `lib/**` 97.63; global 91.09; pisos 96/90/98/96 y 90/80/90/90; 1078 tests; e2e 32/32; PR draft | `bb7fc48` |

### Archives con CI verde observada

- `store-cleanup` → `openspec/changes/archive/2026-10-15-store-cleanup` (run 38750846445)
- `st-split-fase2` → `openspec/changes/archive/2026-10-15-st-split-fase2` (run 38780510532)
- `api-cobertura-fases` → `openspec/changes/archive/2026-10-16-api-cobertura-fases` (run 38842160060)
- `store-cobertura-fase-b` → `openspec/changes/archive/2026-10-16-store-cobertura-fase-b` (run 38898541279)

### Números finales

- `lib/store.ts` **8.889 → 5.219 líneas** (−41%); **7 slices** en `lib/store/slices/`;
  `STORE_VERSION = 28` y el shape persistido intactos en toda la serie.
- Tests **993 → 1078** (107 archivos); cobertura **global 91.09/81.40/91.94/91.09**,
  **`lib/**` 97.63/91.11/99.44/97.63** (`store.ts` legacy 96.06, slices 99.78),
  **`app/api/**` 83.69/68.70/86.99/83.69**.
- Pisos finales: **global 90/80/90/90 · `lib/**` 96/90/98/96 · `app/api/**` 82/67/85/82**
  (ningún piso bajó en la serie).
- e2e con paridad CI: **32/32 verdes** (smoke completo + 9 crud de módulos refactorizados +
  `auth.setup`; JUnit 0 failures / 0 skipped) sobre base descartable `prisma/perf-p9.db`; 2
  primeros intentos cayeron por timeout de 30 s de primer render y pasaron en retry (tolerado
  por `retries=2`).

### Deuda post-serie (declarada, fuera del cap)

- **168 statements** de `lib/store.ts`: ramas de validación puntuales de acciones legacy,
  arranque y migraciones.
- **5 statements** de `lib/store/helpers.ts` (40, 98, 101-103) y **5** de slices
  (`ad-slice` 332/357; `ge-slice` 162/234/318).
- Cobertura API restante: `qa-roadmap` 62.5%, `emisiones-gc` 66.89%, `vinculos` 69.2%,
  `fondos-fi` 71.16%, `personas` 72.82%.
- `npm run e2e:fresh` sigue sin existir; `e2e/crud/poblado-idempotente.spec.ts:96` mantiene
  su espera de 30 s; 404 preexistente de MT en `lib/api/put-merge.ts`; `CF_UPDATE_PARAM` sin
  emisor; deriva de prosa en 11 specs vivas + 4 manuales NSGC.
