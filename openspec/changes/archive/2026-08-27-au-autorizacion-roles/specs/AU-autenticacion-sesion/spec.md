# AU-autenticacion-sesion Specification

## Purpose
Capa de autenticación y autorización del frontend. Fuente NSGC: `Data/NSGC/docs/especificaciones/AU - Autenticacion y Sesion.md`. En esta ventana se documenta el scaffold existente (§1) como contexto y se implementa la autorización B3 (§4) con modelos por comunidad, matriz RP y autorización server-side. El reemplazo definitivo por Auth.js (NextAuth v5) y rate limit persistente quedan para P5 según AU §3.

## ADDED Requirements

### Requirement: Estado implementado del scaffold (§1 — contexto)
El sistema SHALL mantener el scaffold documentado en `AU - Autenticacion y Sesion.md §1` como contexto: `lib/auth.ts` token `base64url(payload).hmac-sha256` firmado con `AUTH_SECRET` (timingSafeEqual, expiración 30 días), rate limit en memoria (10 fallos/15 min → 429, clave `x-forwarded-for`), credenciales `ADMIN_EMAIL`/`ADMIN_PASSWORD` con fallback dev, cookie `compass_session` httpOnly/lax/secure-prod, rutas API `POST /api/auth/login`/`logout` públicas y `proxy.ts` matcher `/admin/:path*` + `/api/:path*` (públicas `/ingresar` y `/api/auth`, resto 401 JSON o redirect `?next=`). El reemplazo por Auth.js se describe en AU §3 y NO se implementa en esta ventana.

#### Scenario: Scaffold vigente sin Auth.js
- **WHEN** se inspecciona `k0mp4ss_fe/apps/web/lib/auth.ts` y `proxy.ts`
- **THEN** el token HMAC, cookie y matcher existen conforme a AU §1 y `openspec validate --all` sigue verde sin dependencia `next-auth`.

### Requirement: Modelos Usuario y Membresia por comunidad (B3)
El sistema SHALL proveer en `k0mp4ss_fe/apps/web/prisma/schema.prisma` los modelos `Usuario {id, email @unique, personaId? (0..1 → MP), activo}` y `Membresia {id, usuarioId, comunidadId, rol}` con `@@unique([usuarioId, comunidadId])`, `@@index([comunidadId])` y relaciones `usuario Usuario @relation` / `comunidad Comunidad @relation` + back-relation `Comunidad.membresias` y `Usuario.membresias`. `Membresia.rol` SHALL ser String validado por `lib/authz.ts` contra roles estándar RP. `prisma migrate dev --name add_usuario_membresia` SHALL correr limpio y `prisma generate` crear cliente.

#### Scenario: Unicidad por comunidad
- **WHEN** se crea `Membresia {usuarioId: u1, comunidadId: A, rol: administrador}` y luego `{u1, A, rol: residente}`
- **THEN** la segunda inserción falla por `@@unique([usuarioId, comunidadId])`, mientras `{u1, B, rol: residente}` en comunidad distinta se permite.

#### Scenario: Usuario global y persona opcional
- **WHEN** se crea `Usuario {email: admin@test.cl, personaId: null}` y otro con `personaId: p-1`
- **THEN** ambos se persisten; `email` falla si se duplica globalmente y `personaId` no exige FK estricta (0..1).

### Requirement: Matriz de permisos pura lib/authz.ts (RP)
El sistema SHALL exponer `k0mp4ss_fe/apps/web/lib/authz.ts` puro con `export const ROLES`, `export type Rol = "administrador" | "comite" | "conserjeria" | "residente" | "mantencion"`, `export type Accion = "ver" | "crear" | "editar" | "eliminar" | "ejecutar"`, `export type Recurso = string` y `export function puede(rol: Rol, accion: Accion, recurso: string): boolean` mapeando la Matriz de Permisos de `RP - Roles y Permisos.md` §3 y specs PE/PL/CT/RE/IR. Roles estándar RP SHALL mapearse: Administrador Maestro → `administrador` (wildcard full access), Miembro del Comité → `comite`, Conserjería/Seguridad → `conserjeria`, Propietario/Residente → `residente`, Personal de Mantención → `mantencion`. Permisos SHALL definirse por módulo y acción; lo no listado SHALL denegarse (menor privilegio) y `puede` SHALL ser testeable sin IO. Exporta también `tienePermiso(roles: Rol[], accion, recurso)` como unión.

#### Scenario: Administrador wildcard
- **WHEN** `puede("administrador", accion, recurso)` para cualquier `accion` y `recurso` de la matriz (FI, MP, PE, PL, CT, RE, IR, admin:usuarios, backup)
- **THEN** retorna `true`.

#### Scenario: Conserjería no ve finanzas
- **WHEN** `puede("conserjeria", "ver", "FI")` o `puede("conserjeria","ver","FI:balance")`
- **THEN** retorna `false` conforme a RP tabla (Finanzas Ver Balance solo Admin/Comité).

#### Scenario: Conserjería sí ejecuta cierre de turno y bitácora
- **WHEN** `puede("conserjeria","ejecutar","PE:cierre_turno")` y `puede("conserjeria","crear","PE:bitacora")`
- **THEN** ambos retornan `true` y `puede("conserjeria","ver","PE:ficha")` retorna `false` (sin prevision/banca).

#### Scenario: Residente solicita mantenimiento pero no interno
- **WHEN** `puede("residente","crear","IR:mantenimiento")` vs `puede("residente","crear","IR:interno")`
- **THEN** el primero `true` (ABAC todos) y el segundo `false` (solo mantencion/personal).

#### Scenario: Menor privilegio deniega no listado
- **WHEN** `puede("residente","eliminar","FI")` o recurso desconocido `puede("comite","ver","recurso_inexistente")`
- **THEN** retorna `false` y se registra `RP_PERMISSION_DENIED` donde aplique.

### Requirement: Autorización server-side en endpoints (SG §4.1)
El sistema SHALL aplicar autorización fina SOLO server-side: `proxy.ts` SHALL seguir decidiendo solo autenticación (401/redirect) y NUNCA autorización. Al menos dos puntos reales SHALL verificar `puede()` server-side: (1) nuevo `GET /api/admin/usuarios?comunidadId=` que lista `Membresia`+`Usuario` de la comunidad del contexto solo si `puede(rol,"ver","admin:usuarios")` (admin-only) y scoping por `comunidadId` via `crearRepositorio`; (2) handler existente `POST /api/backup` reforzado exigiendo `puede(rol,"ejecutar","backup")` (solo `administrador`). Ambos SHALL retornar `401` sin sesión, `400` sin `comunidadId`, `403` con rol sin permiso y `200` con rol válido, validando Zod y sin confiar en cliente.

#### Scenario: Endpoint protegido 403/200 por rol
- **WHEN** `GET /api/admin/usuarios?comunidadId=A` con sesión válida de `conserjeria` miembro de A
- **THEN** responde `403`; con sesión de `administrador` miembro de A responde `200` con solo membresias de A.

#### Scenario: Aislamiento A/B server-side
- **WHEN** `GET /api/admin/usuarios?comunidadId=B` con sesión de `administrador` solo miembro de A (no de B)
- **THEN** responde `403` y no fuga datos de B; con membresia en B responde `200` sin mezclar A.

### Requirement: Seed dev de 2 comunidades con membresías
El sistema SHALL proveer helper `k0mp4ss_fe/apps/web/lib/seed-authz.ts` y acción/endpoint qa-lab que crea de forma idempotente 2 comunidades (`comunidad-a`, `comunidad-b`) y usuarios TEST (`admin@test.cl` admin en A+B, `comite@test.cl` comite en A, `conserjeria@test.cl` conserjeria en A, `residente@test.cl` residente en A, `mantencion@test.cl` mantencion en A) con `Membresia` por comunidad y `email` ligado a `sub` de la cookie para demos. Documentado en manual y avance P4.

#### Scenario: Seed idempotente dos comunidades
- **WHEN** se ejecuta `seedUsuariosMembresias()` dos veces
- **THEN** no duplica usuarios/membresias y ambos runs retornan `ok:true` con counts estables.

### Requirement: Tests de autorización y aislamiento
El sistema SHALL tener tests: (a) `lib/authz.test.ts` puro matriz RP (≥20 casos permitidos/denegados por rol), (b) `lib/repos/repos.authz.test.ts` aislamiento A/B usando `crearRepositorio` y DB temporal (admin A no lee/muta membresias de B), (c) `test/api-admin-usuarios.test.ts` endpoint responde `403` con rol sin permiso y `200` con rol válido usando `verificarToken` mock y DB temporal. Todos en `vitest --run`.

#### Scenario: Suite verde
- **WHEN** se ejecuta `cd k0mp4ss_fe/apps/web && npm test`
- **THEN** los tres suites authz pasan y `openspec validate --all` sigue verde.
