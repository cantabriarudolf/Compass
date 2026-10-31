## Why

`app-sidebar.tsx:168` tiene `const currentRole = "admin"` hardcodeado: cualquier usuario autenticado ve el menú completo de administrador aunque su membresía sea `residente` o `conserjeria`. La sesión Auth.js tampoco expone roles (solo `sub` + email). Es una violación vigente del spec `UI-navegacion-lateral §Role-Based Menu Visibility` y un gap de autoridad visible antes de tocar la seguridad server-side (que ya está guardada con `puede()`).

## What Changes

- **Sesión con roles**: callbacks `jwt` y `session` en `lib/auth.ts` (runtime Node) leen `membresia.findMany({ where: { usuarioId } })` y exponen `token.roles` / `session.user.roles` como unión de roles authz (`administrador/comite/conserjeria/residente/mantencion`). `lib/auth.config.ts` no se toca (edge-safe).
- **Sidebar conectado**: `components/app-sidebar.tsx` reemplaza el placeholder por el rol real de la sesión. Filtrado por intersección: grupo/item visible si `rolesUsuario ∩ rolesDeclarados ≠ ∅`. Soporta unión de roles (admin en A+B ve todo).
- **Alias normalizados**: `data.navMain` migra `admin→administrador`, `conserje→conserjeria`, `residente→residente` (y equivalentes) para alinear con `lib/authz.ts ROLES`. Items sin `roles` explícito heredan visibilidad del grupo.
- **Evidencia temporal**: `e2e/auth/roles-descubrimiento.spec.ts` documenta el gap antes del fix y queda `skip` al cerrar la ventana.
- **Matriz verificada**: `e2e/auth/roles-menu.spec.ts` cubre login por form (`test1234`) para `residente`, `conserjeria` y `admin` y afirma la matriz rol×grupos normalizada.

## Capabilities

### New Capabilities
- (ninguna nueva; se modifica comportamiento existente)

### Modified Capabilities
- `UI-navegacion-lateral`: §Role-Based Menu Visibility — escenarios Admin/Non-Admin pasan a evaluar el rol REAL de la sesión (unión de membresías vía Auth.js) en lugar del valor hardcodeado; alias del data alineados a roles authz; filtrado por intersección con unión. Referencia cruzada a `RP-roles-permisos` (roles authz son fuente de verdad).

## Impact

- **Código**: `k0mp4ss_fe/apps/web/lib/auth.ts` (callbacks), `components/app-sidebar.tsx` + wrapper/server prop, `app/layout.tsx` (inyecta roles o SessionProvider), `e2e/auth/*`, `lib/authz.ts` solo como referencia (no muta matriz).
- **Specs**: `openspec/specs/UI-navegacion-lateral/spec.md` — delta MODIFIED del requirement Role-Based Menu Visibility.
- **Tests**: Vitest 455/455 sin regresión; e2e `auth/roles-menu.spec.ts` + descubrimiento (skip).
- **Seguridad**: sin impacto server-side; `puede()` y proxy sin cambios. JWT persiste roles entre requests — evita consulta Prisma por request (ver design.md).
- **Compatibilidad**: breaking visual solo para usuarios no-admin que ahora ven menos grupos (comportamiento esperado por spec).
