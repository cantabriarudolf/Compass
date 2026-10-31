## Why

El motor RBAC está completo y en producción (`lib/authz.ts` con matriz por rol, guardas en
APIs, membresías en Prisma, seed en QA Lab) y el spec RP ya está COMPLETADO a nivel motor —
pero el sidebar aún promete "Permisos" (`/admin/permisos`) como placeholder "Próximamente".
El administrador no tiene dónde VER quiénes son miembros de su comunidad ni qué puede hacer
cada rol: la matriz vive solo en código y los tests. Decision del owner: vista **solo lectura**
(la asignación/edición sigue en QA Lab seed; sin CRUD aquí).

## What Changes

- Nueva vista `/admin/permisos` (solo lectura) con tres bloques:
  - **Selector de comunidad**: lista las comunidades donde el usuario autenticado tiene
    membresía (nuevo comportamiento de la API existente cuando no se envía `comunidadId`).
  - **Matriz de permisos por rol**: snapshot legible de la matriz de `lib/authz.ts`
    (roles estándar × recursos × acciones), con wildcard del administrador visible.
  - **Membresías de la comunidad**: usuarios, email, rol y estado (activo), scoping por
    `comunidadId` via `GET /api/admin/usuarios` (guardas existentes intactas).
- API `GET /api/admin/usuarios`: comportamiento adicional — sin `comunidadId` devuelve las
  comunidades + rol del usuario autenticado (sin datos de otros usuarios); con `comunidadId`
  mantiene el contrato actual (401/400/403/404/200 sin cambios).
- `lib/authz.ts`: nuevo helper puro `matrizPermisos()` que expone la MATRIZ como snapshot
  plano (rol → recurso → acciones[]) para la vista; + tests Vitest.
- Sin edición, sin asignación de roles, sin cambios de `lib/store.ts`, sin bump de STORE_VERSION.

## Capabilities

### New Capabilities

(ninguna — la vista pertenece a la capability RP existente)

### Modified Capabilities

- `RP-roles-permisos`: se concreta el requirement "Matriz de Permisos" con la vista
  administrativa de solo lectura (`/admin/permisos`): matriz visible por rol, selector de
  comunidad con membresías propias, listado de membresías scoping por comunidad, y garantía
  de que la vista no ofrece acciones de asignación ni edición.

## Impact

- **Nuevo archivo**: `k0mp4ss_fe/apps/web/app/admin/permisos/page.tsx` (client component).
- **Modificados**: `k0mp4ss_fe/apps/web/lib/authz.ts` (+`matrizPermisos()` y tests),
  `k0mp4ss_fe/apps/web/app/api/admin/usuarios/route.ts` (+ramo sin `comunidadId`).
- **Sidebar**: ítem "Permisos" sale de `RUTAS_PENDIENTES` → link real (último placeholder del menú).
- **E2E**: nuevo spec `k0mp4ss_fe/apps/web/e2e/crud/permisos.spec.ts` (read-oriented; el
  endpoint requiere sesión Auth.js real + BD Prisma — el e2e corre contra el dev server con
  BD y admin@test.cl que tiene membresías en A y B).
- **Riesgo**: la API toca Prisma/BD; en Vitest se cubre la parte pura (`matrizPermisos`) y el
  e2e cubre el flujo real (patrón ya probado por `/api/admin/usuarios` y seed-authz).
