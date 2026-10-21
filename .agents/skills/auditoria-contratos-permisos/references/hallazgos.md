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
