# Tasks: ui-legacy-store-fase1 — store legacy en la UI, fase 1

Serie `openspec/SERIE-DEUDA-6/00-plan.md`. Rama `noche/deuda-6`. **Sin push, sin merge, sin PR,
sin `openspec archive`** (el archive exige CI verde observado y esta serie no pushea).

## V1 — `comunidad/certificados` → `useLiquidaciones` + `useCobrosFI`

- [x] **Change openspec** `ui-legacy-store-fase1` con `skip_specs: true` justificado (paridad de
  comportamiento; ninguna capacidad viva declara el origen de datos de la UI).
- [x] **Verificación de shapes antes de reemplazar** (campos usados por la página ↔ tipos de los
  hooks — ver §"Evidencia de shapes").
- [x] Reemplazo de las 2 lecturas legacy (4 usos) por `useLiquidaciones().liquidaciones` y
  `useCobrosFI().items`; eliminado el comentario "Lecturas legacy restantes" y el import de
  `useCompassStore` (queda solo `esMiembroDirectivaVigente`, helper puro de permisos).
- [x] Gate de carga: `!hasHydrated` → `cLiquidaciones || cCobrosFI` (`isLoading` de los hooks);
  `useStoreRehydrated()` eliminado de la página (ya no hay ninguna lectura del store que rehidratar).
- [x] Test de fijación `test/componentes/certificados-fuente-hooks.test.tsx` (4 casos): estado de
  carga, liquidaciones confirmadas del hook (con señuelo en el store), gate Al Día con los cobros
  del hook (con señuelo en el store) y registro emitido construido con la liquidación del hook.
- [x] **Gate V1** (corrido en la ventana, workdir `k0mp4ss_fe/apps/web`): `npx tsc --noEmit` →
  exit 0 (0 errores) · `npm run lint` → exit 0 (**0 problems**) · `npm test` → **132 archivos /
  1331 tests passed**, cobertura global **94.31 / 85.82 / 93.61** (idéntica al fingerprint de base)
  · `openspec validate ui-legacy-store-fase1 --strict` → *is valid* ·
  `node openspec/scripts/check-delta-coverage.mjs ui-legacy-store-fase1` → *0 que romperían el
  archive*. e2e no se corre en esta máquina (2 cores; flakes documentados).

## V2 — `visor-mensajes`: `caducarAvisosCV` fuera del store

- [x] **Semántica legacy documentada** (`lib/store/slices/cv-slice.ts:149-181`): filtra
  `estado === "publicado" && expiresAt && expiresAt < hoyISO()` (comparación lexicográfica ISO;
  vencer hoy NO caduca), los pasa a `estado: "archivado"` con `fechaArchivado = hoyISO()` y emite un
  evento `CV_ARCHIVED` por aviso al ledger local del store (`Aviso "<titulo>" expiró automáticamente
  (<expiresAt>) y salió del carrusel.`). No-op silencioso (`{ ok: true }`) si no hay vencidos; exige
  `hasHydrated`.
- [x] Reemplazar la acción legacy del `setInterval` por caducidad vía API reutilizando el contrato
  existente (`PUT /api/cv/avisos/[id]`, el mismo que usa `app/comunidad/visor/page.tsx:107-114`);
  **sin endpoint nuevo** y sin cambio de comportamiento visible. La regla de negocio queda en un
  helper puro compartido `avisosVencidos()` en `lib/api/use-cv.ts:31`; el archivado lo hace el
  `update` de `useAvisosCV` (SWR invalida la lista → el carrusel deja de mostrar el aviso).
- [x] Test de fijación del ciclo (`test/componentes/visor-mensajes-caducidad.test.tsx`): espía del
  endpoint/hook en vez del store — 1 pasada al montar, 1 cada 30 s, corte al desmontar, solo el aviso
  publicado con `expiresAt` anterior a hoy, args `{ estado: "archivado", fechaArchivado }`, y
  `caducarAvisosCV` del store **nunca** invocado (el store queda vacío).
- [x] **Gate V2** (workdir `k0mp4ss_fe/apps/web`): `npx tsc --noEmit` → exit 0 · `npm run lint` →
  exit 0 (**0 problems**) · `npm test` → **132 archivos / 1332 tests passed** (V1: 1331, +1 caso
  nuevo), cobertura global **94.31 / 85.82 / 93.61** y `lib/store.ts` **99.95** (sin cubrir solo
  `:4323` y `:5131`, igual al fingerprint) · `openspec validate ui-legacy-store-fase1 --strict` →
  *is valid* · `check-delta-coverage` → **0 que romperían el archive**. e2e no se corre en esta
  máquina (2 cores; flakes documentados).

### Evidencia de la ventana V2

| Punto | Dato |
| --- | --- |
| `caducarAvisosCV` legacy (a eliminar del ciclo) | `lib/store/slices/cv-slice.ts:149` (firma `lib/store/slices/cv-slice.ts:22`) |
| Uso en la página | `app/visor-mensajes/page.tsx:41` (ref `getState()`) + `:47` (montar) + `:50` (cada 30 s) — **eliminado** |
| Contrato reutilizado | `PUT /api/cv/avisos/[id]` → `app/api/cv/avisos/[id]/route.ts:24` (`createPutMerge`, `comunidadId` desde sesión, `editar` sobre `cv`, ajeno → 404) |
| Precedente de archivado por API | `app/comunidad/visor/page.tsx:107-114` (misma regla: publicado + `expiresAt < hoy`) |
| Hook usado (sin contrato nuevo de hooks) | `useAvisosCV().update` → `lib/api/use-crud-collection.ts:106` (invalida la colección al `ok`) |
| Helper puro nuevo | `avisosVencidos()` — `lib/api/use-cv.ts:31` |
| Deltas declarados | (1) El evento `CV_ARCHIVED` ya no se emite desde esta página: el ledger `eventos` es local del store y la API no escribe ledger — mismo precedente que `comunidad/visor` desde su migración; la acción del store sigue viva para `admin/qa-lab`. (2) La caducidad pasa a exigir sesión con `editar` sobre `cv` (authz de la ruta); antes era puramente cliente sobre `localStorage` y **no afectaba a la fuente de verdad**: el carrusel ya leía de la API desde la migración de `useAvisosCV`, así que el efecto visible es el previsto (el aviso vencido sale del carrusel). |

## V3 — `finanzas/multas`: cablear `use-in.ts` y migrar la página

- [x] **Contrato real de las 3 rutas leído antes de cablear** (§"Evidencia de la ventana V3"): las
  tres son `POST` custom sobre `[id]`, pasan por `contextoAccionIN()` (sesión + membresía +
  `editar` sobre `in`) y responden `Response.json({ ok: true })`; los errores viajan como
  `{ error }` con 400/403/404/500 y `postAccion` los propaga tal cual.
- [x] `lib/api/use-in.ts`: `useInfraccionesIN()` devuelve la colección + `aplicar(id)` (POST **sin
  body**: la ruta no lee `req`), `desestimar(id, justificacion)` y `apelar(id, descargos)`. Las tres
  con `postAccion` (patrón de `use-liquidaciones.ts`) devolviendo `StoreResult`; invalidan la
  colección IN y, solo `aplicar`, también `/api/cobros-fi` porque materializa el `cargoFI`.
- [x] Página migrada (7 usos → 0): las 3 acciones del expediente van por el hook, el buzón CO pasa a
  `useMensajesBuzonCO()` (`/api/co/mensajes-buzon`, mismos campos `id`/`folio`/`asunto`/`cuerpo`) y se
  elimina el import de `useCompassStore`. El expediente abierto se referencia por id (`detalleId`) y
  se resuelve contra la colección SWR, así que tras aplicar/apelar el diálogo pinta la fila fresca
  sin copiar el objeto a un estado local ni usar un `useEffect` con `setState`.
- [x] `grep -n "useCompassStore" app/finanzas/multas/page.tsx` → **0 coincidencias**.
- [x] Tests: `test/api/use-in-acciones.test.tsx` (6 casos — éxito + error de servidor por acción, con
  URL, método y body exactos) y `test/componentes/multas-acciones-hooks.test.tsx` (5 casos — aplicar
  con el error del servidor tal cual, desestimar con el prompt + cierre del diálogo, apelar, cero
  llamadas a las acciones legacy y buzón CO leído del hook).
- [x] **Gate V3** (workdir `k0mp4ss_fe/apps/web`): `npx tsc --noEmit` → exit 0 · `npm run lint` →
  exit 0 (**0 problems**) · `npm test` → **134 archivos / 1343 tests passed** (V2: 1332, +11 casos),
  cobertura global **94.31 / 85.82 / 93.61** y `lib/store.ts` **99.95** (igual al fingerprint) ·
  `openspec validate ui-legacy-store-fase1 --strict` → *is valid* · `check-delta-coverage` → **0 que
  romperían el archive**. e2e no se corre en esta máquina (2 cores; flakes documentados).

### Evidencia de la ventana V3

Payload real de cada ruta (leído del `route.ts`, no inferido):

| Acción | Ruta (`path:line`) | Body que lee | Respuesta | Errores |
| --- | --- | --- | --- | --- |
| Aplicar | `POST` — `app/api/in/infracciones/[id]/aplicar/route.ts:30` | **ninguno** (el handler recibe `_req` y no lo lee) | `{ ok: true }` — `:212` | 403 (authz), 404, 400 por estado / tipo inexistente / respaldo de directiva / datos inválidos, 500 |
| Desestimar | `POST` — `app/api/in/infracciones/[id]/desestimar/route.ts:22` | `{ justificacion: string }` — `leerCuerpo` `:28`, extracción `:30` (trim; vacío → 400) | `{ ok: true }` — `:58` | 403, 404, 400 (resolución final / sin justificación), 500 |
| Apelar | `POST` — `app/api/in/infracciones/[id]/apelar/route.ts:22` | `{ descargos: string }` — `leerCuerpo` `:28`, extracción `:30` (trim; <10 chars → 400) | `{ ok: true }` — `:64` | 403, 404, 400 (estado ≠ `en_revision` / descargos cortos), 500 |
| Authz compartida | `app/api/in/infracciones/_acciones.ts:25` | — | — | `puede(rol, "editar", "in")` → si no, `jsonError(403, "Permiso denegado.")` `:26` |

**Hallazgo de permisos (fuera de alcance, no se toca `lib/authz.ts`)**: la matriz no declara el
recurso `"in"` para ningún rol salvo el wildcard de `administrador` (`lib/authz.ts:22-95`). Consecuencia
observable: `comite` ("directiva" en la UI del expediente) recibe **403** en las tres acciones
—y ya lo recibía en el `GET` de la colección (`app/api/in/infracciones/route.ts:14`), porque el `GET`
exige el mismo `ver`/`in`—, igual que `conserjeria`, `residente` y `mantencion`. Antes de esta ventana
el botón sí “funcionaba” para esos roles porque la acción escribía en `localStorage` **sin** authz y
sin tocar la fuente de verdad; con la API el 403 es visible en el toast de error. Queda declarado para
la decisión del owner sobre la matriz (no se modifica acá).

Otras notas de paridad: mismos textos de `window.prompt` ("Justificación de la desestimación
(obligatoria):" / "Descargos del vecino:"), mismos fallbacks ("No se pudo aplicar." / "No se pudo
desestimar." / "No se pudieron registrar los descargos."), mismo cierre del diálogo al desestimar y
misma permanencia con estado actualizado al aplicar/apelar.

## V3b — Permisos: `in`, `notificaciones`, `cf` + filtro por destinatario

Decisiones del owner del 2026-10-21 (`openspec/SERIE-DEUDA-6/prompt-03b.md`), mínimo privilegio
cerrado por rol. Test-first en `lib/authz.test.ts` (RED: 5 casos rojos antes de tocar la matriz).

- [x] **Matriz** (`lib/authz.ts`): `comite` → `in` ver/crear/editar, `notificaciones` ver, `cf` ver;
  `conserjeria` → `in` ver/crear, `notificaciones` ver; `residente` → `in:apelar` crear,
  `notificaciones` ver; `mantencion` → `notificaciones` ver. `administrador` sigue por wildcard.
  `in:apelar` se declara **vacío** para comité y conserjería a propósito: `puede()` cae al prefijo
  `in` cuando la clave granular no existe, así que el vacío explícito es lo que impide que
  “gestionar el expediente” habilite la apelación. `RECURSOS_CONOCIDOS` suma `cv` (faltaba desde V3b
  de `cv`), `in`, `in:apelar`, `notificaciones` y `cf`; se exporta `normalizaRol` para que las rutas
  ABAC razonen con el mismo rol que el motor.
- [x] **Tests de matriz** (`lib/authz.test.ts`, +27 casos en 3 `describe`): comité edita `in` pero no
  elimina; conserjería crea `in` pero no edita; residente no ve/crea/edita `in` y solo tiene
  `in:apelar`; comité/conserjería/mantención no apelan; los 5 roles ven `notificaciones` y solo el
  admin escribe; comité ve `cf` pero no edita; mantención no ve `cf`.
- [x] **Notificaciones: filtro server-side ANTES de abrir `ver`** — `GET` propio en el route
  (`app/api/notificaciones/route.ts:40`, `where` acotado en `:63`) con el mismo shape y paginación que la factory
  (`{ data, page, pageSize, total }`), `where` acotado por `filtroNotificaciones()`
  (`lib/api/notificaciones-scope.ts:44`, `OR` por persona/rol en `:56-64`): admin y comité toda la comunidad; conserjería, residente y
  mantención solo lo dirigido a su `personaId` o a su rol **sin destinatario puntual**. El `GET` por
  id también queda acotado (`app/api/notificaciones/[id]/route.ts:25`, where en `:38`, ajeno → 404, no revela
  existencia). El contrato de `createCrudHandlers` **no** se tocó: `POST`/`DELETE`/`PUT` siguen en la
  factory.
- [x] **`in`: apelación propia** — `contextoApelacionIN()` (`app/api/in/infracciones/_acciones.ts:50`)
  exige `in:apelar` (NO `editar` sobre `in`) y devuelve las unidades con vínculo vigente del usuario;
  la ruta valida pertenencia antes de escribir (`app/api/in/infracciones/[id]/apelar/route.ts:44`,
  404 si la infracción es de otra unidad). El administrador sigue registrando descargos sin acotar por
  unidad; comité y conserjería reciben **403** (no apelan: gestionan el caso).
- [x] `lib/api/sesion-persona.ts`: `personaIdDelUsuarioDb` y `unidadesVinculadasDb` salen de
  `gd-guard` a un módulo transversal (misma implementación, `gd-guard` las reexporta) porque ahora las
  comparten notificaciones, apelaciones IN y los llamadores históricos de AD/GD.
- [x] Tests con BD real: `test/api/notificaciones-filtro.test.ts` (16 casos: 6 puros del `where` + 10
  con sesiones reales — un residente **no** ve la de otro residente, ve la suya y las de su rol, el
  admin y el comité ven todas, GET por id ajeno 404, rol fuera de la matriz 403, fallo de BD 500) y
  `test/api/in-apelacion-propia.test.ts` (10 casos: propia 200 + evento, ajena 404 sin evento, comité y
  conserjería 403, admin 200, descargos cortos/sin campo/JSON roto 400, sin vínculo 404, fallo de BD
  500). `test/api/fase4-in.test.ts` actualizado al comportamiento decidido (el test
  “(desvío: solo admin hasta RP)” pasa a nombrar la decisión del owner y suma comité/conserjería:
  `GET` 200 para ambos, comité edita 200 / conserjería 403, conserjería reporta 201 / residente 403).
- [x] **Verificación HTTP real** (dev server en `http://localhost:3000`, cookies `/tmp/ck_*.txt`):

| Ruta | admin | comité | conserjería | residente | mantención |
| --- | --- | --- | --- | --- | --- |
| `GET /api/in/infracciones` | 200 | 200 | 200 | 403 | 403 |
| `GET /api/notificaciones` | 200 | 200 | 200 | 200 | 200 |
| `GET /api/configuracion` | 200 | 200 | 403 | 403 | 403 |

  `POST /api/in/infracciones/<id>/apelar` en vivo: residente 404 (`Registro no encontrado.` — pasa
  authz, cae en pertenencia), comité/conserjería/mantención 403 (`Permiso denegado.`), admin 404 con
  id inexistente. La tabla por sí sola no demuestra el filtro: `prisma/dev.db` no tiene filas en
  `notificaciones` (verificado con un `groupBy` read-only), así que la prueba del recorte vive en los
  tests con BD real.

- [x] **Gate V3b** (workdir `k0mp4ss_fe/apps/web`): `npx tsc --noEmit` → exit 0 · `npm run lint` →
  exit 0 (**0 problems**) · `npm test` → **136 archivos / 1384 tests passed** (V3: 1343) con cobertura
  global **94.39 / 85.84 / 93.85** y `lib/store.ts` **99.95** (los cuatro por encima del fingerprint
  de base 94.31 / 85.82 / 93.61; pisos de `vitest.config.ts` 93/84/92/93 sin tocar) ·
  `openspec validate --all` → **36 passed, 0 failed** · `check-delta-coverage` → **0 que romperían el
  archive**. e2e no se corre en esta máquina (2 cores; flakes documentados).

### Deltas declarados en V3b

1. **La apelación deja de estar disponible para el comité**: antes la ruta exigía `editar` sobre `in`
   y el comité no tenía `in` (403 de todos modos), pero al abrirle `in` ver/crear/editar el `editar`
   habría habilitado apelar. La decisión del owner es explícita (“la apelación es acto propio del
   residente”), así que la ruta ahora pide `in:apelar` y el comité recibe 403 en esa acción mientras
   aplica/desestima/respalda sin problema. Si la administración necesita que el comité registre
   descargos, es una decisión de matriz para V5.
2. **El comité ve todas las notificaciones de su comunidad** (criterio de órgano de gobierno indicado
   en el prompt). Es el único rol con `ver` total además del administrador; queda escrito en el
   comentario de `lib/api/notificaciones-scope.ts`.
3. **`residente` ve también las difusiones a `propietario`**: en RP “Propietario/Residente” es un solo
   rol y el portal de residentes filtra hoy `destinatarioRol === "propietario"`
   (`app/comunidad/portal/page.tsx:135`); sin esa equivalencia la bandeja del portal quedaría vacía.
   Las de rol se exigen además **sin destinatario puntual**, para no filtrar avisos dirigidos a otro
   vecino.
4. El `GET` de notificaciones deja de usar la factory para poder acotar el `where`. El shape y la
   paginación (`page`/`pageSize`, tope 100, `orderBy createdAt desc`) son idénticos; `POST`, `PUT` y
   `DELETE` no cambian.
5. La bandeja de un residente no puede acotarse por unidad: el modelo `Notificacion` no tiene
   `unidadId`, así que una difusión al rol “residente” la ven todos los residentes de la comunidad.
   Es una limitación del schema, declarada para fase 2 (no se toca el schema en esta serie).
6. **`marcarLeida` sigue siendo solo del administrador**: `PUT /api/notificaciones/[id]` exige
   `editar`, que esta ventana no abrió (habría permitido editar cualquier notificación de la
   comunidad). Antes la lectura también era 403, así que la sección de notificaciones del portal
   estaba muerta; ahora se puebla con lo propio, pero el botón de “leída” responde 403. Abrirlo
   requiere una acción granular del estilo `notificaciones:propias` y una decisión del owner (V5).

## V4 — `inventario/proyectos`: cablear `use-mt.ts` y migrar la página

- [ ] Verificar garantías + actualizar pago de trabajo contra las rutas ya existentes.
- [ ] Migrar la página (3 usos) y test de fijación.

## V5 — Cierre de la serie

- [ ] Gates completos (tsc/lint/test) + `openspec validate --all` + `check-delta-coverage`.
- [ ] `BACKLOG-100.md`: mapa de migración actualizado con lo hecho y la deuda fase 2 declarada.
- [ ] Avance NSGC (skill `nsgc-prepush`) + informe final de la serie.

## Evidencia de shapes (V1)

Campos que la página usa de cada colección, contra el tipo del hook y el schema Zod:

| Dato de la página | Store legacy | Hook (`path:line`) | Tipo (`lib/schemas.ts:line`) |
| --- | --- | --- | --- |
| `estado === "confirmada"` (filtro) | `liquidacionesPL` | `useLiquidaciones().liquidaciones` — `lib/api/use-liquidaciones.ts:22,31` | `LiquidacionPLSchema.estado` — `lib/schemas.ts:2016` |
| `id`, `folio`, `trabajadorPersonaId`, `periodo` | `liquidacionesPL` | idem | `lib/schemas.ts:1963-1969` |
| `totalImponible`, `totalHaberes`, `totalDescuentos`, `liquidoAPagar` | `liquidacionesPL` | idem | `lib/schemas.ts:1986,1993,2010,2015` |
| `unidadId` (filtro de saldo) | `cobrosFI` | `useCobrosFI().items` — `lib/api/use-cobros-fi.ts:7` | `CobroFISchema.unidadId` — `lib/schemas.ts:1247` |
| `montoBase`, `moras`, `pagos` (vía `exigibleTotal`/`saldoPendiente`) | `cobrosFI` | idem | `lib/schemas.ts:1258,1263,1264`; helpers en `lib/finanzas-utils.ts:31,35` |

Resultado: **0 campos faltantes** → sin `BLOQUEADO` por shapes.

Límite conocido y preexistente del hook: `useCrudCollection` pide `pageSize=100`
(`lib/api/use-crud-collection.ts:98`), igual que las 3 pantallas ya migradas (`finanzas/pagos`,
`finanzas/gastos-comunes`, `admin/reporteria`). No se cambia en esta fase (contrato del hook
congelado); queda declarado para la fase 2.
