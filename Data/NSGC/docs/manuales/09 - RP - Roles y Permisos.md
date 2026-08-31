# 🔐 09 - Roles y Permisos (RP)

Acá definís quién puede hacer qué dentro de GECOS. El sistema usa roles predefinidos, pero también permitirá crear roles personalizados.

## 🚀 Funcionalidad Principal

Gestionar el acceso a módulos y acciones mediante un modelo RBAC (Control de Acceso Basado en Roles) con membresías por comunidad (tenant compartido `comunidadId`, AU §4 B3).

## 🛠️ Secciones

- **Roles Estándar** (RP §2): El sistema trae 5 roles listos para usar:
  - **Administrador Maestro** (`administrador`): acceso total a todos los módulos, configuración global y finanzas. Wildcard en `lib/authz.ts:puede()`.
  - **Miembro del Comité** (`comite`): lectura de balances/reportes financieros, auditoría, aprobación de gastos (`FI:ejecutar`), lectura del Centro de Mando (`RE:centro_mando`) e historial de certificados (`CT:historial`). Sin crear/editar FI ni gestionar usuarios.
  - **Conserjería / Seguridad** (`conserjeria`, alias `personal`/`seguridad`): bitácora/visitas/encomiendas/contratistas, iniciar y ejecutar cierre de turno (`PE:bitacora`, `PE:cierre_turno`), directorio de emergencias (`PE:directorio`) y reporte diario (`PE:reporte_diario`). Sin finanzas (`FI` denegado) ni ficha previsional/bancaria (`PE:ficha` denegado). Puede ver su propia liquidación (`PL:propia`) y solicitar insumos (`IR:mantenimiento` + `IR:interno` como personal de servicio).
  - **Propietario / Residente** (`residente`, alias `propietario`): edita sus datos propios (`MP:propios`), solicita certificados de su unidad (`CT:propio` `residencia`/`al_dia`), agenda visitas/contratistas a su unidad (`PE:visita`), reserva amenities (`RA`), y solicita "Solicitar Insumo Mantenimiento" (`IR:mantenimiento`) — pero **NO** "Uso Interno" (`IR:interno` denegado, ABAC). Ve directorio de emergencias.
  - **Personal de Mantención** (`mantencion`): tareas asignadas e incidentes físicos (`MT`, `MT:tarea`, `MT:incidente`), directorio, e insumos ambos tipos (`IR:mantenimiento` + `IR:interno`).
- **Matriz de Permisos** (`lib/authz.ts`): tabla pura `puede(rol, accion, recurso)` donde `accion` es `ver|crear|editar|eliminar|ejecutar` y `recurso` es módulo granular (`FI`, `PE:bitacora`, `IR:interno`, `admin:usuarios`, `backup`). Derivada de RP tabla + specs PE/PL/CT/RE/IR. Menor privilegio: lo no listado se deniega. Alias normalizados (`admin`→`administrador`, `directiva`→`comite`).
- **Membresías por comunidad** (AU §4, D3): `Usuario {id, email @unique, personaId? (0..1→MP), activo}` y `Membresia {usuarioId, comunidadId, rol}` con `@@unique([usuarioId, comunidadId])` en `prisma/schema.prisma`. Una persona puede tener 0..1 cuenta; un usuario puede estar en varias comunidades con roles distintos. Scoping obligatorio via `lib/repos` (`membresias` scoped por `comunidadId`); `usuarios` global por `email`. Unión de roles vía `tienePermiso(roles[], accion, recurso)` (spec RP §Roles Múltiples).
- **Autorización server-side** (SG §4.1, nunca confiar en cliente): `proxy.ts` solo decide autenticación (401/redirect a `/ingresar`). La autorización fina vive en handlers:
  - `GET /api/admin/usuarios`: con `?comunidadId=` lista `Membresia+Usuario` de la comunidad solo si `puede(rol,"ver","admin:usuarios")` (solo `administrador`). Scoping por `comunidadId` → aislamiento A/B (admin de A no ve B). Retorna 401 sin sesión, 403 sin permiso, 200 con lista scoped. **Sin `comunidadId`** retorna las comunidades propias del usuario autenticado (`{comunidades:[{id,nombre,rol}]}`, sin datos de terceros) — alimenta el selector de `/admin/permisos`.
  - `POST /api/backup` (reforzado): tras `isWriteApiEnabled()`, exige `puede(rol,"ejecutar","backup")` (solo `administrador`). Fallback dev: si BD sin seed y `sub` es `ADMIN_EMAIL` legado, bypass como `administrador` hasta seed.
- **Vista Permisos y Roles** (`/admin/permisos`, solo lectura): matriz de permisos por rol (snapshot en vivo de `matrizPermisos()` en `lib/authz.ts` — nunca desincroniza del motor), con wildcard del Administrador Maestro y recursos bloqueados visibles. Selector de comunidades propias y tabla de membresías de la comunidad elegida (email, rol, estado activo). No ofrece ninguna acción de asignación o edición: la asignación vive en el seed del **QA Lab**.
- **Activación de Cuentas**: Desde la ficha de una persona en **MP - Maestro de Personas**, podés activar su cuenta de acceso. El sistema envía un email de onboarding y asigna una contraseña temporal basada en el RUT.
- **Seed dev / QA Lab** (B3): `lib/seed-authz.ts:seedUsuariosMembresias()` crea idempotente 2 comunidades (`comunidad-a` Los Aromos TEST, `comunidad-b` Las Palmas TEST) + 5 usuarios TEST (`admin@test.cl` admin en A+B, `comite@test.cl` comite en A, `conserjeria@test.cl` conserjeria en A, `residente@test.cl` residente en A, `mantencion@test.cl` mantencion en A) con membresías. Botón "👥 Crear usuarios TEST (2 comunidades, B3)" en `/admin/qa-lab` (fase AU) invoca `POST /api/admin/seed-authz`. Documentado en avance P4 y manual.

## 💡 Tips de Oro

- **Menor privilegio**: Si un permiso no está explícitamente asignado, el sistema lo niega (`puede()` retorna `false` y se loggea `RP_PERMISSION_DENIED`).
- **Roles múltiples**: Una misma persona puede tener varios roles y hereda la unión de sus permisos (`tienePermiso(["residente","conserjeria"], ...)`).
- **Aislamiento A/B**: Un admin de comunidad A no lee ni muta membresias/usuarios ni datos de comunidad B (repos con `comunidadId` + tests `repos.authz.test.ts` y `api-admin-usuarios.test.ts`).
- **Auditoría**: Cada asignación/revocación genera `RP_ROLE_ASSIGNED` / `RP_ROLE_REVOKED`; accesos denegados cuentan en **AM** métrica "Número de intentos de acceso no autorizados".
- **ABAC**: `IR:mantenimiento` lo pueden todos; `IR:interno` solo personal de servicio (`conserjeria`+`mantencion`+`administrador`).

## 🔗 Dependencias

- Las personas a las que se les asignan roles viven en **MP - Maestro de Personas** (`personaId` opcional).
- El email de onboarding usa plantillas de **CO - Comunicación Vecinos**.
- Los intentos de acceso no autorizado se contabilizan en **AM - Auditoría y Métricas**.
- La capa de datos vive en **ST - Capa de Datos Persistente** (`prisma/schema.prisma` `Usuario`/`Membresia` + `lib/repos` scoping D3).
