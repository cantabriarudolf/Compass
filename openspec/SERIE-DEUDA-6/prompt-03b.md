# Ventana V3b — Permisos: `in`, `notificaciones`, `cf` + filtro por destinatario

**ARRANQUE**: leé `openspec/SERIE-DEUDA-6/00-plan.md` completo y marcá tu fila **EN CURSO**.

**Rama**: `noche/deuda-6`. Prohibido `git push`, `gh`, merge y PR. **No toques `prisma/dev.db`.**

## Por qué existe esta ventana

El barrido de `puede(...)` de `app/api/**` contra la `MATRIZ` de `lib/authz.ts` encontró recursos que la API
usa y la matriz no declara. Solo el administrador los obtiene por wildcard. Evidencia medida contra el dev
server (ramas con sesiones reales): `GET /api/in/infracciones`, `GET /api/notificaciones` y
`GET /api/configuracion` responden **403 a comité, residente y conserjería**.

`cv` ya quedó reparado (comité ver/crear/editar; residente, conserjería y mantención ver). Esta ventana
cierra el resto con las decisiones del owner del 2026-10-21.

## Decisiones del owner (no reinterpretar)

| Recurso | administrador | comité | conserjería | residente | mantención |
|---|---|---|---|---|---|
| `in` (infracciones) | ver/crear/editar/eliminar/ejecutar | **ver/crear/editar** | **ver/crear** | **apelar propias** | — |
| `notificaciones` | todo | **ver** | **ver** | **ver** | **ver** |
| `cf` (configuración global) | todo | **ver** | — | — | — |

## Paso 1 — Matriz

Agregá las claves en `lib/authz.ts` (`MATRIZ`) con el mínimo privilegio exacto de la tabla. Test-first:
extendé `lib/authz.test.ts` con la matriz completa por rol (RED antes del cambio, GREEN después). Casos
obligatorios: comité edita `in` pero no elimina; conserjería crea `in` pero no edita; residente no crea ni
edita `in`; comité ve `cf` pero no edita; todos los roles ven `notificaciones`; mantención no ve `cf`.

## Paso 2 — Notificaciones: filtro server-side ANTES de abrir `ver`

**Esta es la parte crítica.** Hoy el comentario de `app/api/notificaciones/route.ts` dice "residente solo ve
notificaciones donde destinatarioRol = residente o destinatarioPersonaId = su personaId (ABAC en UI, no en
API por simplicidad)". Si abrís `ver` sin filtro, un residente ve notificaciones ajenas: **eso es una fuga
de datos personales y no se acepta**.

Regla a implementar:
- `administrador`: todas las de su comunidad.
- `comite`: todas las de su comunidad (órgano de gobierno) — criterio declarado por el orquestador; dejalo
  escrito en el comentario del archivo.
- `conserjeria`, `residente`, `mantencion`: solo las que tengan `destinatarioPersonaId` igual a su
  `personaId` **o** `destinatarioRol` igual a su rol (más el caso "todos"/sin destinatario si el modelo lo
  contempla; verificá el schema).

Implementación: si `createCrudHandlers` no permite filtrar sin cambiar su contrato, **escribí un `GET`
propio en el route** con el mismo shape de respuesta y paginación. No cambies el contrato del factory.
Tests obligatorios: un residente **no** ve la notificación de otro residente; sí ve la suya y la de su rol;
el admin ve todas; el comité ve todas.

## Paso 3 — `in`: apelación propia

El residente debe poder apelar **solo sus** infracciones. Revisá
`app/api/in/infracciones/[id]/apelar/route.ts` y `_acciones.ts`:
- Si la ruta ya valida que la infracción pertenece a la unidad/persona del residente, alcanza con declarar
  `"in:apelar"` para residente y usarlo en esa ruta.
- Si **no** valida pertenencia, agregá la validación (404 si no es suya) **antes** de habilitar el permiso.
- No habilites `editar` sobre `in` para residente: eso abriría aplicar/desestimar.
Tests: residente apela la propia (ok) y recibe 404 en la ajena; comité/conserjería no apelan.

## Paso 4 — Verificación real (obligatoria)

Con el dev server corriendo (`http://localhost:3000`) y las cookies de sesión de `/tmp/ck_*.txt`
(admin, comite, residente, conserjeria, mantencion), verificá y reportá el código HTTP de:
`GET /api/in/infracciones`, `GET /api/notificaciones`, `GET /api/configuracion`.
Esperado: `in` → 200 admin/comité/conserjería; `notificaciones` → 200 los cinco; `configuracion` → 200
admin/comité. Si el dev server no refleja el cambio, reinicialo vos y dejalo corriendo al terminar.

## Paso 5 — Gate y cierre

`npx tsc --noEmit` 0 · `npm run lint` 0 problemas · `npm test` verde con los pisos y sin bajar cobertura.
Commit(s) por work-unit en español. Actualizá tu fila y la Bitácora del 00-plan. Sin push.

## Retorno

Fila · commits · gates con salidas exactas · tabla de códigos HTTP observados · evidencia `path:line` del
filtro de notificaciones y de la validación de pertenencia en `apelar` · tests nuevos · `BLOQUEADO` si algo
no se puede hacer sin cambiar el contrato del factory o del schema.
