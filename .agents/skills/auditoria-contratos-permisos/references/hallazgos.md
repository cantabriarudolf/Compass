# Registro de hallazgos de permisos

Una entrada por hallazgo, con evidencia medida (no lectura). Estado: `abierto` · `decidido` ·
`cerrado` · `aceptado` (deuda consciente). Se agrega al final; no se borra historia.

---

## 2026-10-21 · Auditoría inicial (rama `noche/deuda-6`, serie deuda-6)

Origen: al migrar acciones de UI del store legacy a la API, los 403 destaparon permisos declarados en
comentarios o tests pero nunca implementados en el motor.

### H1 · `cv` ausente en la matriz — **cerrado**

- **Evidencia**: `GET /api/cv/avisos` → admin 200 · residente/comité/conserjería 403 (dev server, sesiones reales).
- **Causa**: recurso ausente; solo el wildcard del admin. Defecto preexistente en `main`.
- **Decisión del owner**: comité `ver/crear/editar`; residente, conserjería y mantención `ver`.
- **Cierre**: commit `584fd4c`. Test-first en `lib/authz.test.ts`; `test/api/fase4-cv.test.ts` actualizado
  al comportamiento decidido (residente GET 200 / POST 403). Verificado: 200 en los 5 roles.

### H2 · `in` ausente en la matriz — **cerrado**

- **Evidencia**: `GET /api/in/infracciones` → 403 a comité, residente y conserjería.
- **Causa**: idem H1; además el test `fase4-in.test.ts` lo fijaba como "desvío: solo admin hasta RP".
- **Decisión del owner**: admin todo; comité `ver/crear/editar`; conserjería `ver/crear` (registra, no
  resuelve); residente solo apela las propias con pertenencia server-side.
- **Cierre**: commits `0e160ab` y `f1cac65`. Recurso `in:apelar` declarado **vacío** en comité y
  conserjería para cortar la herencia por prefijo; `apelar/route.ts:44` devuelve 404 si la unidad no es
  del usuario. Verificado: in 200 a admin/comité/conserjería; apelar residente 404, comité 403.

### H3 · Notificaciones sin filtro por destinatario — **cerrado**

- **Evidencia**: el route declaraba "comité ver, residente ver propias" pero el recurso no existía; y el
  comentario admitía "ABAC en UI, no en API por simplicidad".
- **Riesgo**: abrir `ver` sin filtro = un residente ve notificaciones ajenas.
- **Decisión del owner**: `ver` para los cinco roles, **con filtro server-side**.
- **Cierre**: commit `36aa85b`. `lib/api/notificaciones-scope.ts:44` (admin/comité toda la comunidad;
  resto por persona o rol; sin regla → conjunto vacío), aplicado en colección y detalle (ajena → 404).

### H4 · `cf` (configuración) ausente — **cerrado**

- **Decisión del owner**: comité `ver`, sin `editar` (parámetros financieros); admin wildcard.
- **Cierre**: `0e160ab`. Verificado: 200 a admin y comité; 403 al resto.

### H5 · Bypass de la matriz en `gd-guard` — **cerrado**

- **Evidencia**: `lib/api/gd-guard.ts` decidía permisos de actas (`gd`) y controles de propiedad (`ad`)
  con lógica propia; la matriz no le daba `gd` al comité y **no existía `ad`**.
- **Decisión del owner (2026-10-21)**: "esto no debe suceder ni ahí ni en ningún lado".
- **Cierre**: commit `5226db6`. La `MATRIZ` declara `gd` y `ad` para comité (5 acciones, paridad exacta
  con el guard viejo) y `ad:ver` para residente; ambas funciones quedaron como delegación de una línea
  en `puede()`. Test de paridad `test/api/gd-guard-paridad.test.ts` (5 roles × 5 acciones).
- **Pregunta abierta**: el comité conserva `eliminar` sobre actas y controles por paridad. Recortarlo es
  una decisión de producto posterior, no un efecto del refactor.

### H6 · Herramientas internas sin gate (`qa-estado`, `qa-roadmap`, `dev-dashboard`) — **aceptado**

- **Evidencia**: solo `auth()` + `isWriteApiEnabled()`, sin `puede`: cualquier autenticado lee/escribe.
- **Decisión del owner (2026-10-21)**: mantener por ahora, con conciencia de que **el módulo debe salir
  o aislarse antes de producción**; no es deuda de permisos sino de alcance del producto.

### H7 · Rol invertido en `marcarLeida` de notificaciones — **cerrado**

- **Evidencia**: `PUT /api/notificaciones/[id]` exigía `editar` (solo admin). El residente veía sus
  notificaciones pero no podía marcarlas leídas; el admin podía marcarlas por él (falsificación).
- **Decisión del owner (2026-10-21)**: la gracia es **alertar al admin de que se leyó**; el que marca es
  el destinatario, el admin ve el estado.
- **Cierre**: commit `5226db6`. Nuevo `POST /api/notificaciones/[id]/leer` con `notificaciones:propias`
  (5 roles), pertenencia server-side (ajena → 404) e idempotencia; el `PUT` del admin descarta `leida`
  cuando el actor no es el destinatario. Mapa rol→destinatarioRol con fuente única en
  `lib/api/notificaciones-scope.ts`. El test que consagraba la falsificación
  (`api-notificaciones.test.ts`) se reescribió al comportamiento decidido.
- **Deuda declarada**: `Notificacion` no tiene `fechaLectura`; "se leyó" es solo `leida: Boolean`.
  Agregar la fecha exige migración de esquema.

### H8 · Scoping de auditoría entre comunidades — **cerrado sin defecto**

- **Evidencia**: `app/api/auditoria/route.ts` arma `where = { comunidadId }` resuelto de la sesión; el
  `sync` filtra por la comunidad resuelta. La pertenencia se valida y `puede(rol,"ver","am")` aplica.
- **Veredicto**: no hay cruce de comunidades. Se cierra como verificado.

### H9 · Conserjería no puede leer el padrón de unidades desde el servidor (F6) — **cerrado sin tocar la matriz**

- **Evidencia**: `GET /api/unidades` gatea con `puede(rol, "ver", "mp")` (`app/api/unidades/route.ts:29`).
  El bloque `conserjeria` de `lib/authz.ts` declara `mp:propios` (ABAC del propio vínculo) y **no** `mp`,
  así que la ruta devuelve **403** al rol que registra las visitas. El defecto no se veía porque el
  selector de «Unidad destino» leía el padrón del **store del cliente** y nunca tocaba la API.
- **Por qué no se resolvió con la matriz**: darle `mp` a conserjería abriría el maestro de personas y el
  padrón completo (metraje, prorrateo, estado, servicios) para un caso de uso operativo. La regla 5 del
  skill prohíbe tocar la matriz sin decisión del owner.
- **Cierre**: `app/api/pe/unidades/route.ts` — **proyección de solo lectura** para la operación:
  `puede(rol, "ver", "pe:bitacora")` (que conserjería ya tiene por la bitácora), scope por
  `withComunidadScope`, cuatro campos (`id`, `numero`, `etiqueta`, `rolSii`), estacionamiento excluido
  por **etiqueta** (los deptos de la torre E comparten el prefijo `u-E-` con las plazas).
- **Códigos por rol** (`test/api/pe-unidades-operacion.test.ts`, 6 casos): conserjería 200 · administrador
  200 (wildcard) · residente **403** · sin sesión **401** antes de consultar la base.
- **Hallazgo abierto que este cambio no toca**: la búsqueda por RUN del QR (`buscarPersonaPorRun` →
  `GET /api/personas?rut=`) también está detrás de `mp` (`app/api/personas/route.ts:278`) y para
  conserjería cae al padrón local del store con el aviso «No se pudo consultar el padrón del servidor».
  El fallback evita el bloqueo, pero el padrón real no se consulta: merece su propia proyección `pe`.

### H10 · El guardado de visitas validaba contra el padrón del cliente — **cerrado**

- **Evidencia**: `lib/store.ts` (`saveBitacoraVisitaPE`) exigía que `unidadId` y `destinoPersonaId`
  existieran en el padrón del store. Con la fuente de verdad en la BD y los paneles buscando en el
  servidor, cualquier unidad o persona creada después del snapshot se rechazaba como huérfana
  («destinoPersonaId no existe en el Maestro de Personas»), y eso ya pasaba con el QR de la cédula
  para el administrador, que resuelve personas contra `/api/personas`.
- **Cierre**: se retiran los dos chequeos. La jornada se sigue validando porque ese maestro vive en
  el store. Los dos casos que fijaban el rechazo (`test/store-personal.test.ts`) pasan a fijar la
  aceptación de referencias del servidor.
- **Deuda asociada**: **cerrada el 2026-10-25** (ventana `pe-paneles-bd`). La bitácora ya persiste
  en la base (`POST/PUT/DELETE /api/pe/bitacora-visitas` desde `visitas-panel.tsx`, con el hook de
  post-escritura emitiendo `PE_VISITA_INGRESADA`), así que `saveBitacoraVisitaPE` quedó como
  código legacy sin consumidores y este razonamiento ya no hace falta para nada.
