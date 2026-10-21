# Serie Deuda 6 — Store legacy en la UI, fase 1 (lectura + cableado de hooks)

> Toda ventana DEBE leer este archivo al iniciar, marcar su fila **EN CURSO** y actualizarla antes de
> cerrar. **Modo**: delegado con workers desde el chat orquestador. El orquestador audita cada retorno
> contra el repo y lanza la ventana siguiente. **Ninguna ventana pushea, mergea ni abre PR.**

## Origen y alcance

Auditoría read-only del 2026-10-21 (`openspec/BACKLOG-100.md` §Deuda viva verificada): quedan
**13 archivos / 147 usos** de `useCompassStore` (zustand legacy `@deprecated`). Tres son excepciones
justificadas (`admin/qa-lab`, `admin/dev-dashboard`, `admin/mantenimiento`: operan sobre
localStorage/semillas). Esta serie ataca **solo la parte de riesgo bajo**: lectura pura con hook
existente y cableado de hooks cuya ruta API **ya existe**.

**Fuera de alcance (deuda declarada, no se toca acá)**: transiciones PE (5), entregar/resolver
solicitud IR, reportes RE (generar/distribuir/vista), adelantos PL, cobranza FI, publicar acta en CV
(`comunidad/visor`). Todos esos exigen endpoints nuevos con contrato de negocio y quedan para fase 2.

## Ventanas

| Ventana | Alcance | Estado | Commit final |
|---|---|---|---|
| V1 | `comunidad/certificados` — `liquidacionesPL` + `cobrosFI` del store → `useLiquidaciones` + `useCobrosFI` | HECHA | `5e6a373` |
| V2 | `visor-mensajes` — quitar `caducarAvisosCV` del store: caducidad vía API (acción mínima reutilizando el contrato existente) | HECHA | `dc0f583` |
| V3 | `finanzas/multas` — cablear `use-in`: aplicar/desestimar/apelar (rutas ya existen) y migrar la página | HECHA | `412e9a7` |
| V3b | **Permisos**: `cv` (reparado) + `in`, `notificaciones` (con filtro por destinatario) y `cf` en la matriz; filtro de apelación propia en `in` | HECHA | `f1cac65` |
| V4 | `inventario/proyectos` — cablear `use-mt`: verificar garantías + actualizar pago de trabajo (rutas ya existen) y migrar la página | PENDIENTE | — |
| V5 | Cierre: gates completos, `BACKLOG-100.md`, avance NSGC, deuda restante declarada, informe | PENDIENTE | — |

**MÁXIMO: 6 ventanas.** Lo que no entre se declara como deuda fase 2 en V5; no se improvisa.

> **Por qué V3b existe**: al migrar V2 y V3 a la API se destapó que la `MATRIZ` de `lib/authz.ts` no
declara varios recursos que las rutas usan (`cv`, `in`, `notificaciones`, `cf`). Solo el administrador los
obtenía por wildcard, así que los botones "funcionaban" escribiendo en `localStorage` y, migrados a la API,
responden 403. `cv` se reparó con test-first el 2026-10-21 (comité ver/crear/editar; residente, conserjería
y mantención ver). El resto de las decisiones del owner está en `prompt-03b.md`.

## Prerrequisito de base

- Rama **`noche/deuda-6`** creada por el orquestador desde `main`. Prohibido pushear y prohibido mergear.
- Fingerprint de `main` al materializar: `tsc` 0 · `eslint` exit 0 · suite verde con cobertura global
  **94.31 / 85.82 / 93.61**, `lib/**` **99.49**, `lib/store.ts` **99.95** (sin cubrir solo `:4323` y
  `:5131`, declarados inalcanzables por diseño) · `openspec validate --all` **35/35** · `STORE_VERSION = 28`.

## Reglas duras (válidas en TODAS las ventanas)

1. **Un commit por work-unit**, convencional en español, commiteando **solo** los archivos del cambio.
2. **Prohibido `git push`, `gh`, merge, PR y `prisma migrate`.** Prohibido tocar `prisma/dev.db`,
   `Data/NSGC/backups/`, `.env*` y cualquier secreto.
3. **`STORE_VERSION = 28` congelado.** No cambiar el shape persistido ni el contrato de los hooks.
4. **No usar `gentle_review`/RDD** en esta serie (el switch está global `on`; una review bloquea al
   owner esperando una selección). La verificación es: gates + auditoría del orquestador.
5. **Método openspec**: un único change `ui-legacy-store-fase1` (creado en V1) con `skip_specs: true`
   justificado (paridad de comportamiento, sin cambio de contrato observable). `check-delta-coverage`
   debe dar `0 que romperían el archive`. **No archivar**: el archive exige CI verde observado y esta
   serie no pushea.
6. **Gate por ventana**: `npx tsc --noEmit` 0 · `npm run lint` 0 problemas · `npm test` verde con los
   pisos vigentes. e2e **no** se corre en esta máquina (2 cores; flakes documentados en `qa-estado.json`).
7. **Paridad estricta**: mismos textos, mismos permisos, mismas columnas, mismo orden. Si la migración
   exige decidir un contrato nuevo o cambiar comportamiento visible → **BLOQUEADO** con la evidencia
   exacta en la Bitácora; no se improvisa.
8. **Término oficial "comunidad"** (RG §4). Sin placeholders; datos realistas.

## Protocolo de retorno

Cada ventana devuelve, en su respuesta final: fila de la tabla actualizada · commits · gates con
salidas exactas · archivos tocados · qué quedó fuera y por qué · `BLOQUEADO` si aplica (con evidencia).
El orquestador audita (`git diff`, gates si hace falta) antes de lanzar la siguiente.

## Bitácora

- **2026-10-21** — Serie materializada tras la auditoría de la deuda. Base: `main` en `e8d74d5`
  (BACKLOG al día, sin push). Rama `noche/deuda-6`.
- **2026-10-21 · V1 HECHA** — `app/comunidad/certificados/page.tsx`: las 4 lecturas legacy
  (`liquidacionesPL`, `cobrosFI` + `hasHydrated` + `useStoreRehydrated`) pasan a
  `useLiquidaciones()` / `useCobrosFI()`; la página ya no importa `useCompassStore` (solo el helper
  puro `esMiembroDirectivaVigente`). Paridad estricta verificada por shapes+filtros
  (`estado === "confirmada"`, saldo Al Día por unidad) y por el test nuevo
  `test/componentes/certificados-fuente-hooks.test.tsx` (4 casos con señuelos en el store legacy).
  Gate: `npx tsc --noEmit` exit 0 · `npm run lint` **0 problems** · `npm test` **132/1331 pass** con
  cobertura **94.31/85.82/93.61** (igual al fingerprint) · `openspec validate --all` **36/36** ·
  `check-delta-coverage` **0 que romperían el archive**. Commits: `48e5418` (change openspec) y
  `5e6a373` (migración + test). Sin push. **Deuda declarada**: `useCrudCollection` pagina con
  `pageSize=100` (`lib/api/use-crud-collection.ts:98`) — límite preexistente compartido con
  `finanzas/pagos`, `finanzas/gastos-comunes` y `admin/reporteria`; no se toca (contrato del hook
  congelado), queda para fase 2.
- **2026-10-21 · V2 HECHA** — `app/visor-mensajes/page.tsx`: fuera el ref a
  `useCompassStore.getState().caducarAvisosCV` y su `setInterval` de 30 s. Opción (a) del prompt:
  **no hizo falta endpoint nuevo** — el contrato ya existe (`PUT /api/cv/avisos/[id]`, authz
  `editar`/`cv` con scoping de comunidad por sesión) y ya lo usa `app/comunidad/visor/page.tsx:107`.
  La página usa `useAvisosCV().update` (que invalida la colección → el carrusel deja de pintar el
  aviso vencido) y la regla de negocio queda en el helper puro `avisosVencidos()`
  (`lib/api/use-cv.ts:31`): `estado === "publicado" && expiresAt && expiresAt < hoyISO()` — la misma
  semántica de `lib/store/slices/cv-slice.ts:149`, incluido que vencer **hoy** no caduca. Ciclo
  conservado: 1 pasada al montar (cuando la lista del servidor ya cargó) + 1 cada 30 s, corte al
  desmontar, reloj de 1 s intacto. Test de fijación reescrito
  (`test/componentes/visor-mensajes-caducidad.test.tsx`, 2 casos) espía el hook en vez del store y
  comprueba que `caducarAvisosCV` nunca se invoca y que el store queda vacío. Gate: `npx tsc
  --noEmit` exit 0 · `npm run lint` **0 problems** · `npm test` **132 archivos / 1332 tests passed**
  con cobertura **94.31/85.82/93.61** y `lib/store.ts` **99.95** (igual al fingerprint) ·
  `openspec validate ... --strict` *is valid* · `check-delta-coverage` **0 que romperían el archive**.
  Commits: `dc0f583` (migración + test) y el de cierre de documentación. Sin push. **Deltas
  declarados**: (1) esta página ya no emite el evento `CV_ARCHIVED` (el ledger `eventos` es local del
  store y la API no escribe ledger; mismo precedente que `comunidad/visor` desde su migración — la
  acción del store sigue viva para `admin/qa-lab`); (2) la caducidad pasa a exigir sesión con
  `editar` sobre `cv`, mientras antes era puramente cliente sobre `localStorage` y **no tocaba la
  fuente de verdad** (el carrusel ya leía de la API), así que el efecto visible es el previsto.
  `useCompassStore` ya no aparece en la página.
- **2026-10-21 · V3 HECHA** — `app/finanzas/multas/page.tsx` (7 usos → 0) y `lib/api/use-in.ts`.
  Contrato real leído antes de cablear: las tres rutas son `POST` sobre `[id]`, pasan por
  `contextoAccionIN()` (`_acciones.ts:25`, `editar` sobre `in`) y responden `{ ok: true }`
  (`aplicar/route.ts:212`, `desestimar/route.ts:58`, `apelar/route.ts:64`); **aplicar no lee body**
  (`POST(_req, ctx)` en `aplicar/route.ts:30`), desestimar lee `{ justificacion }`
  (`desestimar/route.ts:28-30`) y apelar `{ descargos }` (`apelar/route.ts:28-30`).
  `useInfraccionesIN()` ahora devuelve la colección + `aplicar(id)`, `desestimar(id, justificacion)`,
  `apelar(id, descargos)` con `postAccion` y `StoreResult` (patrón `use-liquidaciones`),
  invalidando IN y —solo aplicar— `/api/cobros-fi`. `mensajesBuzonCO` pasa a `useMensajesBuzonCO()`.
  El expediente abierto se referencia por id (`detalleId`) y se resuelve contra la colección SWR:
  tras aplicar/apelar pinta la fila fresca sin copiar el objeto a estado local ni usar un
  `useEffect` con `setState` (el lint de React 19 los marca). Paridad estricta de textos: mismos
  `window.prompt`, mismos fallbacks (`No se pudo aplicar.` / `No se pudo desestimar.` / `No se
  pudieron registrar los descargos.`), mismo cierre al desestimar, misma permanencia al aplicar o
  apelar. Tests: `test/api/use-in-acciones.test.tsx` (6 casos: éxito + error de servidor por acción,
  con URL/método/body exactos) y `test/componentes/multas-acciones-hooks.test.tsx` (5 casos, incluye
  que las acciones legacy del store nunca se invocan y que el buzón CO sale del hook). Gate:
  `npx tsc --noEmit` exit 0 · `npm run lint` **0 problems** · `npm test` **134 archivos / 1343 tests
  passed** con cobertura **94.31/85.82/93.61** y `lib/store.ts` **99.95** (igual al fingerprint) ·
  `openspec validate ... --strict` *is valid* · `check-delta-coverage` **0 que romperían el archive**.
  Commits: `412e9a7` (hook + página + tests) y el de cierre de documentación. Sin push.
  **Hallazgo de permisos (no se toca `lib/authz.ts`)**: la matriz no declara el recurso `"in"` para
  ningún rol salvo el wildcard de `administrador` → `comite` (directiva), `conserjeria`, `residente` y
  `mantencion` reciben **403** en `aplicar`/`desestimar`/`apelar` (y ya lo recibían en el `GET` de
  `app/api/in/infracciones/route.ts:14`). Antes el botón “funcionaba” para esos roles porque escribía
  en `localStorage` sin authz y sin tocar la fuente de verdad; con la API el 403 es visible en el
  toast de error. Requiere decisión del owner sobre la matriz.
- **2026-10-21 · V3b HECHA** — Cierre de la deuda de permisos con las decisiones del owner del
  2026-10-21. **Matriz** (`lib/authz.ts`): `comite` → `in` ver/crear/editar, `notificaciones` ver, `cf`
  ver; `conserjeria` → `in` ver/crear, `notificaciones` ver; `residente` → `in:apelar` crear,
  `notificaciones` ver; `mantencion` → `notificaciones` ver. Test-first: `lib/authz.test.ts` pasa de 49
  a 76 casos (5 rojos antes de tocar la matriz). Detalle fino: `in:apelar` se declara **vacío** en
  comité y conserjería porque `puede()` cae al prefijo `in` cuando la clave granular no existe — sin el
  vacío explícito, abrir `in` habría habilitado la apelación para ambos. **La parte crítica**:
  `GET /api/notificaciones` deja de usar la factory y arma su propio `where` con
  `filtroNotificaciones()` (`lib/api/notificaciones-scope.ts:50`), así que `ver` nunca se abre sin
  recorte por destinatario: admin y comité ven toda la comunidad, y conserjería/residente/mantención
  solo lo dirigido a su `personaId` o a su rol **sin destinatario puntual**; el `GET` por id también
  queda acotado (ajena → 404). El contrato de `createCrudHandlers` no se tocó: GET propio con el mismo
  shape `{ data, page, pageSize, total }` y `POST`/`PUT`/`DELETE` en la factory. **`in`**: la apelación
  pasa a `in:apelar` con pertenencia validada server-side
  (`app/api/in/infracciones/[id]/apelar/route.ts:45`: unidades con vínculo vigente, ajena → 404); el
  comité y la conserjería no apelan (gestionan el caso) y el residente nunca obtiene `editar` sobre
  `in`. `personaIdDelUsuarioDb`/`unidadesVinculadasDb` se movieron a `lib/api/sesion-persona.ts`
  (`gd-guard` los reexporta). Tests nuevos: `test/api/notificaciones-filtro.test.ts` (16 casos, 6 puros
  del `where` + 10 con sesiones reales: un residente **no** ve la de otro residente),
  `test/api/in-apelacion-propia.test.ts` (10) y `test/api/fase4-in.test.ts` actualizado al
  comportamiento decidido (suma comité/conserjería y renombra el test “(desvío: solo admin hasta RP)”).
  **Verificación HTTP real** (dev server + `/tmp/ck_*.txt`): `in` → 200 admin/comité/conserjería y 403
  residente/mantención; `notificaciones` → 200 los cinco; `configuracion` → 200 admin/comité y 403 el
  resto; `POST apelar` → residente 404 (pasa authz y cae en pertenencia), comité/conserjería/mantención
  403, admin 404 con id inexistente. Gate: `npx tsc --noEmit` exit 0 · `npm run lint` **0 problems** ·
  `npm test` **136 archivos / 1384 tests passed** con cobertura global **94.39 / 85.84 / 93.85** y
  `lib/store.ts` **99.95** (los cuatro ≥ fingerprint 94.31 / 85.82 / 93.61; pisos de `vitest.config.ts`
  sin tocar) · `openspec validate --all` **36 passed, 0 failed** · `check-delta-coverage` **0 que
  romperían el archive**. Commits: `0e160ab` (matriz + tests), `36aa85b` (filtro de notificaciones),
  `f1cac65` (apelación propia) y el de cierre de documentación. Sin push. **Deltas declarados**:
  (1) el comité pierde la apelación — antes era 403 de todos modos por la matriz incompleta, ahora es
  una decisión explícita y no un efecto colateral de `editar` sobre `in`; (2) el comité ve todas las
  notificaciones de su comunidad (órgano de gobierno, criterio del prompt); (3) el residente ve también
  las difusiones a `propietario` porque en RP es el mismo rol y el portal ya filtra así
  (`app/comunidad/portal/page.tsx:135`); (4) `Notificacion` no tiene `unidadId`, así que una difusión al
  rol la ve toda la comunidad con ese rol — limitación de schema, deuda declarada para fase 2;
  (5) el residente ya puede **leer** su bandeja, pero "marcar como leída" sigue siendo del
  administrador: `PUT /api/notificaciones/[id]` exige `editar`, que no se abrió a propósito en esta
  ventana (antes la lectura también era 403, así que la sección del portal estaba muerta; ahora se
  puebla y el botón de leída responde 403). Decidir si el residente marca sus propias notificaciones
  requiere una acción granular análoga a `in:apelar` y queda para la decisión del owner en V5.
