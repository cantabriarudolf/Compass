# Catálogo de antipatrones de permisos — casos reales de Compass

Cada entrada: cómo se ve, por qué es peligroso, cómo se cierra. Los casos vienen de la auditoría del
2026-10-21 (rama `noche/deuda-6`); se agrega uno nuevo cada vez que aparece un patrón distinto.

## A1 — Recurso usado por una ruta y ausente de la `MATRIZ`

**Cómo se ve**: `route.ts` llama `puede(rol, accion, "x")`, pero `"x"` no existe en ninguna entrada de
`MATRIZ`. Solo el administrador lo obtiene por el wildcard `"*"`.
**Por qué es peligroso**: todos los demás roles reciben 403 y la funcionalidad se cae sin que nadie lo
note hasta que alguien entra con otro rol. Se descubre probando por rol, no en el código.
**Cómo se cierra**: declarar el recurso con el mínimo privilegio decidido por el owner; test-first en
`lib/authz.test.ts`; verificar con HTTP real por rol.
**Caso real**: `cv` (visor de mensajes), `in` (infracciones), `notificaciones`, `cf` (configuración).
`GET /api/cv/avisos` daba 200 solo a admin.

## A2 — Bypass de la matriz (guard propio con lógica de rol)

**Cómo se ve**: un archivo como `lib/api/gd-guard.ts` implementa `puedeGestionarActas` /
`puedeGestionarControles` con reglas de rol adentro, en vez de declarar el recurso en la `MATRIZ`.
**Por qué es peligroso**: doble fuente de verdad. Cualquier auditoría de permisos miente: la matriz dice
que el comité no puede y el guard dice que sí. Y un recurso puede no existir nunca (`ad`).
**Cómo se cierra**: mover el recurso a la matriz y dejar el guard como lector de `puede()`; borrar el
bypass. Si el guard necesita contexto (membresía vigente), que el contexto sea un parámetro, no la regla.
**Caso real**: comité gestiona actas por bypass porque la matriz no le da `gd`; `ad` no existe en la
`MATRIZ`.

## A3 — ABAC en la UI, no en la API

**Cómo se ve**: un comentario del propio route lo confiesa: "residente solo ve … (ABAC en UI, no en API
por simplicidad)".
**Por qué es peligroso**: mientras el permiso está cerrado no se nota; al abrirlo, el rol ve datos
ajenos. Es una fuga que aparece recién cuando se habilita la funcionalidad.
**Cómo se cierra**: filtro server-side (`where` por destinatario/unidad/persona) **antes** de abrir el
permiso; test de que un rol no ve lo ajeno; 404 en el detalle ajeno.
**Caso real**: `app/api/notificaciones/route.ts`; se cerró con `lib/api/notificaciones-scope.ts` y `ver`
recién después.

## A4 — Desvío declarado en un test

**Cómo se ve**: `it("residente sin recurso x en matriz → 403 (desvío: solo admin hasta RP)")`, o una
nota en un `00-plan.md` del tipo "cv e in sin entradas en la matriz → solo admin hasta que RP los otorgue".
**Por qué es peligroso**: el test **fija el defecto** como comportamiento esperado. El 403 queda
"documentado" y nadie lo cierra porque parece intencional.
**Cómo se cierra**: llevarlo al owner como decisión pendiente; actualizar el test al comportamiento
decidido (nunca revertir la matriz para complacerlo) y renombrarlo para que nombre la decisión.
**Caso real**: `test/api/fase4-cv.test.ts` y `test/api/fase4-in.test.ts`.

## A5 — Rol invertido (el que registra no es el que sufre)

**Cómo se ve**: el único permiso para escribir el estado es el del rol que administra, pero el dato es
del rol que la padece. Ejemplo: `PUT /api/notificaciones/[id]` exige `editar`, así que el admin puede
marcar leída una notificación ajena y el residente no puede marcar la propia.
**Por qué es peligroso**: el administrador puede falsificar el dato ("leída" sin que nadie la haya
leído) y el dueño real del dato queda sin poder.
**Cómo se cierra**: acción granular para el destinatario (`notificaciones:propias`), filtrada por
`destinatarioPersonaId`; el admin conserva la lectura y el estado, no la firma por otro.
**Caso real**: `marcarLeida` de notificaciones (abierto al 2026-10-21).

## A6 — Herramienta interna sin gate

**Cómo se ve**: rutas de backoffice (`/api/qa-estado`, `/api/qa-roadmap`, `/api/dev-dashboard`) que solo
piden sesión (`auth()`), sin `puede`.
**Por qué es peligroso**: cualquier usuario autenticado (un residente) entra a herramientas de
diagnóstico y puede escribir estado.
**Cómo se cierra**: no siempre es un permiso: si el módulo es interno, se marca como **módulo a retirar
o aislar antes de producción** (decisión del owner 2026-10-21: mantener por ahora, con esa conciencia).
**Caso real**: los tres endpoints nombrados.

## A7 — Herencia por prefijo que abre de más

**Cómo se ve**: `puede()` resuelve `"in:apelar"` por prefijo a `"in"`. Si el rol tiene `in` y no deseás
que apuere, hereda el permiso sin querer.
**Por qué es peligroso**: un permiso granular nuevo queda abierto por el paraguas del recurso base.
**Cómo se cierra**: declarar la clave granular **vacía** (`"in:apelar": new Set([])`) en los roles que no
deben usarla, para cortar el fallback.
**Caso real**: V3b de `SERIE-DEUDA-6`.

## A8 — La acción legacy "funcionaba" porque escribía en localStorage

**Cómo se ve**: un botón de la UI que llamaba al store de zustand sin authz. Al migrarlo a la API, el
403 aparece de golpe y parece una regresión.
**Por qué es peligroso**: oculta el defecto de permisos: la UI "funcionaba" sin control y la fuente de
verdad nunca se enteraba.
**Cómo se cierra**: al migrar, correr el gate de permisos ANTES de dar la ventana por cerrada; el 403 es
el síntoma correcto de un permiso mal declarado (A1), no un bug de la migración.
**Caso real**: `finanzas/multas` y `visor-mensajes` en `SERIE-DEUDA-6`.
