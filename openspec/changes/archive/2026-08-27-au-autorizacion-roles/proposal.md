# Proposal: au-autorizacion-roles — B3 autorización por roles y membresías (C-extra-2)

## Why
La plataforma tiene autenticación scaffold sin autorización: `lib/auth.ts` emite cookie `compass_session` con `sub=email` y rol único `"admin"` implícito (AU §1). No hay tabla de usuarios/membresías ni matriz de permisos. La Serie Plataforma P4 exige B3 (C-extra-2) según `AU - Autenticacion y Sesion.md §4`, `RP - Roles y Permisos.md` y D3 tenant compartido: roles POR COMUNIDAD (`membresias: {usuarioId, comunidadId, rol}`) con scoping solo server-side (SG §4.1 nunca confiar en cliente) y helper puro `puede(rol, accion, recurso)` derivado de la matriz RP. `proxy.ts` debe seguir decidiendo solo autenticación. Falta endpoint de administración con autorización fina y seed dev de 2 comunidades para demos/qa-lab. STORE_VERSION permanece 26 (sin bump esquema cliente).

## What Changes
- **Prisma**: modelos `Usuario {id, email @unique, personaId? (0..1 → MP), activo}` y `Membresia {id, usuarioId, comunidadId, rol}` con `@@unique([usuarioId, comunidadId])` + `@@index([comunidadId])` + relaciones a `Comunidad`/`Usuario`. Migración `add_usuario_membresia` limpia.
- **lib/authz.ts**: función pura `puede(rol, accion, recurso)` mapeando Matriz de Permisos RP (roles estándar: `administrador`, `comite`, `conserjeria`, `residente`, `mantencion`; acciones `ver|crear|editar|eliminar|ejecutar`; recursos por módulo FI/MP/EF/PE/PL/CT/RE/IR + `admin:usuarios`). Menor privilegio: no listado = denegado. Exporta también `tienePermiso(roles[], accion, recurso)` (unión) y tipos `Rol/Accion/Recurso`.
- **Server-side**: `app/api/admin/usuarios` (GET) lista usuarios/membresías de `?comunidadId=` solo si `puede(rol, ver, admin:usuarios)` (admin-only). Reforzar `app/api/backup` POST con mismo check (solo `administrador` puede ejecutar backup) — demuestra autorización fina en handler existente. `proxy.ts` intacto (solo 401/redirect).
- **Seed dev / qa-lab**: helper `seedUsuariosMembresias()` y botón en `/admin/qa-lab` (fase AU) que crea 2 comunidades (`comunidad-a`, `comunidad-b`) + 5 usuarios TEST (admin, comite, conserjeria, residente, mantencion) con membresías en A/B para pruebas A/B y doc.
- **Deltas de spec**: `AU-autenticacion-sesion` CREATED — Purpose citando `AU - Autenticacion y Sesion.md`, requirements §4 autorización (modelos, puede(), server-side, seed, tests), contexto §1 scaffold documentado. `project.md` actualiza fila AU de "parcial: scaffold propio" a "parcial: scaffold + B3 authz (Auth.js pendiente P5)".

## Capabilities
### New Capabilities
- `AU-autenticacion-sesion`: Autenticación y sesión + autorización por roles (B3). Capa de autenticación scaffold (HMAC token, cookie compass_session, proxy) y autorización con `Usuario`/`Membresia` por comunidad y `puede()` server-side. Fuente NSGC: `AU - Autenticacion y Sesion.md`. Scaffold §1 se documenta como contexto; §4 autorización se implementa (modelos, matriz RP, endpoints protegidos). Reemplazo Auth.js queda para P5.

### Modified Capabilities
<!-- none -->

## Impact
- `k0mp4ss_fe/apps/web/prisma/schema.prisma` + `prisma/migrations/*` (2 modelos)
- `k0mp4ss_fe/apps/web/lib/authz.ts` (nuevo, puro, testeable)
- `k0mp4ss_fe/apps/web/lib/repos/index.ts` (expone usuarios/membresias scoped)
- `k0mp4ss_fe/apps/web/app/api/admin/usuarios/route.ts` (nuevo, GET protegido)
- `k0mp4ss_fe/apps/web/app/api/backup/route.ts` (añade check authz server-side, sin tocar proxy)
- `k0mp4ss_fe/apps/web/app/admin/qa-lab/page.tsx` + `k0mp4ss_fe/apps/web/lib/seed-authz.ts` (seed dev 2 comunidades)
- `k0mp4ss_fe/apps/web/lib/authz.test.ts` + `k0mp4ss_fe/apps/web/lib/repos/repos.authz.test.ts` + `k0mp4ss_fe/apps/web/test/api-admin-usuarios.test.ts`
- `openspec/specs/AU-autenticacion-sesion/spec.md` (nuevo al archivar) + `openspec/specs/project.md` (ajusta nota parcial AU)
- Sin bump `STORE_VERSION` (26). Validaciones: `tsc --noEmit`, `eslint`, `npm test` verde (incluidos nuevos), `openspec validate --all` sin fallos, `prisma migrate dev` limpio.
