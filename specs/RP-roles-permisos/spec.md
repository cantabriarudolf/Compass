# RP-roles-permisos Specification

## Purpose
Gestionar quién puede ver, crear, editar, eliminar o ejecutar acciones dentro de GECOS mediante un modelo de control de acceso basado en roles (RBAC), con soporte futuro para permisos contextuales (ABAC). Fuente de verdad: `Data/NSGC/docs/especificaciones/RP - Roles y Permisos.md`.

## Requirements

### Requirement: Modelo RBAC
The system MUST use Role-Based Access Control to authorize users.

#### Scenario: Role Assignment
- **WHEN** an administrator assigns a role to a person from the Maestro de Personas (MP)
- **THEN** that person MUST inherit all permissions associated with the role.

#### Scenario: Multiple Roles
- **WHEN** a person has more than one role
- **THEN** their effective permissions MUST be the union of all assigned roles.

### Requirement: Roles Estándar
The system MUST ship with predefined roles and allow custom roles.

#### Scenario: System Roles
- **WHEN** the system is initialized
- **THEN** the following default roles MUST exist:
  - **Administrador Maestro**: full access to all modules, global settings and financial reports.
  - **Miembro del Comité**: read access to financial reports and audits; ability to approve expenses.
  - **Conserjería / Seguridad**: access to logbook, visits, packages, basic resident view; no finance access.
  - **Propietario / Residente**: access to personal account status, GC payment, amenities booking, claims and votes.
  - **Personal de Mantención**: access to assigned tasks and physical incident reporting.

### Requirement: Matriz de Permisos

The system MUST define a permission matrix for each standard role, listing which actions each role can execute on each resource, following least privilege.
El sistema DEBE exponer esta matriz como snapshot legible para la vista administrativa de solo lectura `/admin/permisos`.

#### Scenario: Action Types
- **WHEN** the permission matrix is consulted
- **THEN** each resource-role pair MUST define allowed actions among ver, crear, editar, eliminar, ejecutar
- **AND** actions not explicitly listed MUST be denied (least privilege).

#### Scenario: Module Permissions
- **WHEN** an administrator opens `/admin/permisos`
- **THEN** they MUST see the effective permission matrix per standard role, including the administrator wildcard.

#### Scenario: Vista solo lectura
- **WHEN** any user opens `/admin/permisos`
- **THEN** the view MUST NOT offer actions to assign roles, edit memberships or mutate the matrix.

### Requirement: Permisos Contextuales (ABAC)
The system SHALL support Attribute-Based Access Control for resource-specific or context-specific actions via `puedeContextual(rol, accion, recurso, contexto)` where `contexto` includes `personaId` (identidad propia), `unidadId` (unidad reclamada), `unidadIdsVinculadas` (unidades con vínculo vigente) and `privacidad { residenteVeMorosidad, residenteVeActas, alertasResidentesActivas }`. The system SHALL expose it as optional contextual filtering where applicable. The system MUST preserve least privilege and parity 1:1 with current decisions: `puedeContextual = puede() base + refinamiento ABAC` only for granular resources (`:propios`, `:propia`, `:residencia`, `:al_dia`, privacidad); resources without contextual dimension MUST delegate directly to `puede()`. Migration of existing inline checks SHALL NOT change observable decisions.

#### Scenario: Supply Request Context
- **WHEN** a resident requests a maintenance supply
- **THEN** they MUST only see the category "Solicitar Insumo Mantenimiento"
- **AND** the category "Solicitar Insumo Uso Interno" MUST be hidden.

#### Scenario: Identidad propia requerida para mp:propios
- **WHEN** un usuario con rol que tiene `mp:propios` llama `puedeContextual(rol, "ver", "mp:propios", { personaId: "p-1" })`
- **THEN** el sistema SHALL conceder si `puede(rol, "ver", "mp:propios")` es true y `personaId` está presente, y SHALL denegar si `personaId` falta.

#### Scenario: Trabajador solo ve su liquidación (pl:propia)
- **WHEN** un usuario con rol `conserjeria` llama `puedeContextual("conserjeria", "ver", "pl:propia", { personaId: "p-4" })`
- **THEN** el sistema SHALL conceder solo si `puede("conserjeria","ver","pl:propia")` es true y `personaId` está presente (paridad: sin `personaId` no ve ni la propia).

#### Scenario: Certificado residencia exige vínculo vigente a la unidad
- **WHEN** un residente llama `puedeContextual("residente","ver","ct:residencia", { personaId:"p-1", unidadId:"u-A-101", unidadIdsVinculadas:["u-A-101"] })`
- **THEN** el sistema SHALL conceder; si `unidadId` no está en `unidadIdsVinculadas`, SHALL denegar (aunque `puede()` base sea true), preservando la validación `vinculoVigente` de `lib/store.ts:4253`.

#### Scenario: Certificado al día exige unidad vinculada (saldo lo decide CT, no ABAC)
- **WHEN** un residente llama `puedeContextual("residente","crear","ct:al_dia", { unidadId:"u-A-101", unidadIdsVinculadas:["u-A-101"] })`
- **THEN** el sistema SHALL conceder si la unidad está vinculada; la deuda pendiente sigue bloqueando la emisión en `lib/store.ts` (no cambia decisión ABAC).

#### Scenario: Privacidad GD — residente solo ve actas si dueño autorizó
- **WHEN** un residente llama `puedeContextual("residente","ver","gd", { privacidad:{ residenteVeActas:false } })`
- **THEN** el sistema SHALL denegar; con `residenteVeActas:true` SHALL conceder si `puede()` base lo permite. Para roles no residentes, `privacidad` no refina.

#### Scenario: Privacidad FI — residente solo ve morosidad si autorizado
- **WHEN** un residente llama `puedeContextual("residente","ver","mp:morosidad", { privacidad:{ residenteVeMorosidad:false } })`
- **THEN** el sistema SHALL denegar; con `residenteVeMorosidad:true` SHALL conceder si base lo permite (paridad con `controlesPropiedad` en `lib/store.ts:1327` y `app/comunidad/directiva/page.tsx:73`).

#### Scenario: Delegación sin contexto para recursos no granulares
- **WHEN** se llama `puedeContextual("comite","ver","fi:balance", {})` o cualquier recurso sin sufijo ABAC
- **THEN** el sistema SHALL retornar exactamente `puede(rol,accion,recurso)` sin refinamiento adicional.

#### Scenario: Menor privilegio preservado
- **WHEN** un rol sin permiso base llama `puedeContextual` con contexto favorable
- **THEN** el sistema SHALL denegar (contexto nunca amplía permisos base; solo los restringe).

### Requirement: Activación de Cuentas
Account creation MUST be a deliberate administrative action, not automatic upon registering a person.

#### Scenario: Activate Account
- **WHEN** the admin clicks "Activar Cuenta de Acceso" on a person's profile
- **THEN** the system MUST ask for confirmation to send onboarding instructions
- **AND** the onboarding email MUST use the `onboarding` template from CO.

#### Scenario: Default Credentials
- **WHEN** an account is activated
- **THEN** the username MUST be the registered email
- **AND** the temporary password MUST be the user's RUT without dots, dash or verifier
- **AND** the user MUST be forced to change the password on first login.

### Requirement: Autenticación Futura
The system SHALL be designed to allow future Google SSO as an optional authentication method. The system SHOULD expose it as `SHOULD` until implemented.

#### Scenario: Google SSO
- **WHEN** a user attempts to log in with Google
- **THEN** access MUST only be granted if the `@gmail.com` address was previously registered and validated by administration.

### Requirement: Menor Privilegio
Any permission not explicitly granted MUST be denied.

#### Scenario: Denied Access
- **WHEN** a user tries to access a resource without the required permission
- **THEN** the system MUST block the action
- **AND** log a `RP_PERMISSION_DENIED` event in AM.

### Requirement: Integración con Auditoría
All role and permission changes MUST be traceable.

#### Scenario: Role Change Audit
- **WHEN** a role is assigned or revoked
- **THEN** events `RP_ROLE_ASSIGNED` or `RP_ROLE_REVOKED` MUST be emitted.

#### Scenario: Security Metric
- **WHEN** unauthorized access attempts occur
- **THEN** the system MUST count them and expose "Número de intentos de acceso no autorizados" as a metric.

### Requirement: Matriz de Permisos del Módulo PE
La matriz de permisos MUST definir el acceso al módulo Personal y Servicios por rol:
- **Administrador Maestro / administración**: ver, crear, editar y eliminar fichas de trabajadores, feriados y proyecciones; gestión completa de proveedores, mantenciones preventivas y libro de visitas técnicas; lectura del reporte diario.
- **Conserjería / Seguridad (personal)**: registrar y editar controles de bitácora (visitas, encomiendas, contratistas), iniciar turno y cerrar su propio turno; consulta del directorio de emergencias; sin acceso a datos previsionales ni bancarios de las fichas.
- **Propietario / Residente**: agendar visitas y contratistas hacia su unidad y consultar el directorio de emergencias; sin acceso a la bitácora global ni a fichas laborales.

Cualquier permiso no listado SHALL denegarse conforme a Menor Privilegio, registrando `RP_PERMISSION_DENIED`.

#### Scenario: Conserje cierra su turno pero no ve remuneraciones
- **WHEN** un usuario con rol personal accede a la bitácora e intenta abrir la ficha previsional de un compañero
- **THEN** puede operar la bitácora y el cierre de turno, pero la sección previsional/bancaria le resulta denegada

#### Scenario: Residente agenda visita a su unidad
- **WHEN** un residente agenda una visita o contratista indicando su unidad
- **THEN** la pre-agenda se registra a la espera del ingreso sellado por conserjería, sin exponerle otros registros

### Requirement: Matriz de Permisos del Módulo PL
La matriz de permisos MUST definir el acceso a Liquidaciones y Remuneraciones por rol:
- **Administrador Maestro / administración**: ver, crear, confirmar y eliminar liquidaciones; registrar adelantos; editar parámetros legales CF; generar el PDF oficial.
- **Conserjería / Seguridad (personal)**: consultar sus propios documentos remuneratorios emitidos (PDF de su liquidación); sin acceso a liquidaciones de terceros ni a parámetros legales.
- **Propietario / Residente**: sin acceso al módulo.

Cualquier permiso no listado SHALL denegarse conforme a Menor Privilegio, registrando `RP_PERMISSION_DENIED`.

#### Scenario: Trabajador consulta su liquidación
- **WHEN** un usuario con rol personal accede a Remuneraciones
- **THEN** puede descargar únicamente sus propias liquidaciones confirmadas

### Requirement: Matriz de Permisos del Módulo CT
La matriz de permisos MUST definir el acceso a Certificados por rol:
- **Administrador Maestro / administración**: generar cualquier tipología para cualquier unidad/persona; consultar y exportar el historial completo.
- **Propietario / Residente**: solicitar certificado de residencia, estado de cuenta y al día de SU unidad; sin acceso al historial global.
- **Conserjería / Seguridad (personal)**: descargar únicamente sus certificados de liquidación de sueldo confirmados.
- **Directiva / Comité**: lectura del historial de emisión.

Cualquier permiso no listado SHALL denegarse conforme a Menor Privilegio, registrando `RP_PERMISSION_DENIED`.

#### Scenario: Residente solicita solo lo suyo
- **WHEN** un residente solicita un certificado Al Día
- **THEN** solo puede seleccionar unidades donde mantiene vínculo vigente

### Requirement: Matriz de Permisos del Módulo RE
La matriz de permisos MUST definir el acceso a Reportería y Dashboards por rol:
- **Administrador Maestro / administración**: ver todas las vistas del Centro de Mando; crear, distribuir y eliminar reportes; configurar cualquier segmentación.
- **Directiva / Comité**: lectura del Centro de Mando (demográfico, operativo, gestiones y financiero); sin distribución.
- **Conserjería / Seguridad (personal)**: acceso al Reporte Diario operativo (PE); sin acceso al Centro de Mando financiero.
- **Propietario / Residente**: únicamente los reportes distribuidos hacia él vía bandeja simulada; sin acceso al generador.

Cualquier permiso no listado SHALL denegarse conforme a Menor Privilegio, registrando `RP_PERMISSION_DENIED`.

#### Scenario: Comité consulta sin distribuir
- **WHEN** un miembro del comité abre el Centro de Mando
- **THEN** visualiza las métricas pero las acciones de generar/distribuir reportes le resultan denegadas

### Requirement: Selector de Comunidad y Membresías

The system MUST let an authenticated user with memberships see the communities they belong to, and an administrator browse the memberships of a selected community scoped by `comunidadId`.

#### Scenario: Comunidades propias
- **WHEN** an authenticated user opens `/admin/permisos` without choosing a community
- **THEN** the system MUST list the communities where the user has a membership, with the user's role in each
- **AND** the response MUST NOT include other users' data.

#### Scenario: Membresías de la comunidad
- **WHEN** an administrator selects a community where they hold an administrative membership
- **THEN** the system MUST list the community memberships: user email, role and active status
- **AND** the list MUST be scoped by `comunidadId` (no cross-community data).

#### Scenario: Acceso denegado por rol
- **WHEN** a user without administrative role in the selected community requests the membership list
- **THEN** the system MUST deny access with 403 and log the denial (AM).

### Requirement: Matriz Contextual visible
El sistema MUST exponer en `/admin/permisos` la matriz contextual ABAC de forma read-only, derivada en tiempo de ejecución del snapshot de `lib/authz.ts` (`reglasContextuales()`). Cada entrada SHALL mostrar por rol: recurso, condición legible (ej. "solo propios", "unidad vinculada", "según privacidad"), descripción y dónde se aplica ("motor" para `puedeContextual` o "check local" para checks inline no migrados). La vista MUST mantener el badge "solo lectura" y cero botones de mutación, y MUST reflejar el snapshot del motor sin datos duros desincronizables.

#### Scenario: Snapshot derivado sin datos duros
- **WHEN** se carga `/admin/permisos`
- **THEN** la sección "Permisos contextuales (ABAC)" SHALL renderizar las entradas retornadas por `reglasContextuales()` (constante de módulo derivada del código de `puedeContextual`, como `matrizPermisos()`), sin duplicar literales en la vista.

#### Scenario: Reglas por rol con condición legible
- **WHEN** un operador inspecciona la sección ABAC
- **THEN** SHALL ver al menos una regla por cada rol con refinamiento ABAC (residente, conserjeria, comite, mantencion) con su recurso y badge de condición legible ("solo propios" | "solo propia" | "unidad vinculada" | "según privacidad: residenteVeActas" | "según privacidad: residenteVeMorosidad" | "según privacidad: alertasResidentesActivas").

#### Scenario: Dónde se aplica — motor vs check local
- **WHEN** se lista cada regla ABAC
- **THEN** cada fila SHALL mostrar un badge "motor" si la regla está implementada en `puedeContextual` (ej. `gd`/`gd:*` con `residenteVeActas`, `mp:propios`, `pl:propia`, `ct:propio`/`ct:residencia`/`ct:al_dia` con vinculación) o "check local" si es un check inline aún no migrado por acoplo a store/UI (ej. `mp:morosidad`/`fi:morosidad` con `residenteVeMorosidad` en switches de `app/admin/gestion`, `notify:residente`/`pe:notify_residente` con `alertasResidentesActivas` en `lib/store.ts:1327`, `ct:al_dia` saldo en `lib/store.ts:4272`, `vinculoVigente` en `lib/store.ts:4253` / filtros `app/comunidad/certificados/page.tsx:177`).

#### Scenario: Solo lectura sin mutaciones
- **WHEN** cualquier usuario abre `/admin/permisos` con la sección ABAC visible
- **THEN** la vista MUST mantener el badge "solo lectura" y MUST NOT ofrecer botones de editar/eliminar/crear/asignar en la sección ABAC (cero mutaciones), igual que la matriz RBAC.

#### Scenario: Paridad con motor
- **WHEN** se añaden nuevas reglas ABAC a `puedeContextual` o cambian condiciones
- **THEN** `reglasContextuales()` SHALL reflejarlas automáticamente (derivado del mismo código), sin requerir edición manual de la vista.

### Requirement: Verificación E2E por cuenta

El plan de pruebas MUST incluir login y journeys reales por cada rol estándar, afirmando accesos permitidos y denegaciones contra las guardas server-side como fuente de verdad. La infraestructura multi-cuenta loguea los 5 roles del seed (`admin@test.cl`, `comite@test.cl`, `conserjeria@test.cl`, `residente@test.cl`, `mantencion@test.cl` — `PASSWORD_TEST=test1234`) a `e2e/.auth/<rol>.json`; los specs eligen cuenta con `test.use({ storageState: "e2e/.auth/<rol>.json" })` sin crear 5 proyectos en `playwright.config.ts`.

#### Scenario: Infra multi-cuenta genera storageStages por rol

- **WHEN** se ejecuta `npx playwright test --project setup` (auth.setup parametriizado)
- **THEN** el sistema MUST producir `e2e/.auth/admin.json`, `comite.json`, `conserjeria.json`, `residente.json`, `mantencion.json` con cookies válidas y MUST excluirlos del repo vía `k0mp4ss_fe/apps/web/e2e/.auth/` en `.gitignore`.

#### Scenario: Matriz rol×accesos verificada con storageState

- **WHEN** se ejecuta `e2e/auth/roles-accesos.spec.ts` con `test.use({ storageState: "e2e/.auth/<rol>.json" })` para cada rol no-admin (`comite`, `conserjeria`, `residente`, `mantencion`)
- **THEN** MUST afirmar grupos visibles/ocultos del sidebar según la matriz ampliada (Intersección declarada vs unión de membresías) y MUST afirmar denegaciones server-side reales vía `fetch("/api/admin/usuarios?comunidadId=comunidad-a")` → `403` para roles sin `admin:usuarios` (`comite`, `residente`, `conserjeria`, `mantencion`), mientras `admin@test.cl` recibe `200`.

#### Scenario: Journeys felices por rol no-admin

- **WHEN** se ejecuta `e2e/crud/roles-journeys.spec.ts` con el `storageState` correspondiente
- **THEN** cada rol MUST completar 1 journey feliz contra datos del seed verificados y sin contaminar suites existentes (entidades `TEST-*` nuevas, sin confirmar retiros/pagos del seed): `conserjeria` registra visita en `/operaciones/bitacora`; `residente` crea reserva RA y solicita certificado CT de su unidad; `comite` lista Finanzas/Sistema sin errores y no puede crear gasto; `mantencion` ve MT y registra incidente IR si el store lo permite — cada test MUST finalizar con `expect(errores).toEqual([])`.

#### Scenario: Regresión del menú con storageStates

- **WHEN** se ejecuta `e2e/auth/roles-menu.spec.ts` tras la ampliación de `data.navMain`
- **THEN** MUST seguir verde con la matriz ampliada (`comite` 4/8, `mantencion` 3/8, `conserjeria` 3/8, `residente` 4/8, `administrador` 8/8) y granularidad de items (`Remuneraciones:["administrador"]` oculto para no-admin; `Recursos y EPP`/`Mantenimiento` visibles para `mantencion`).

### Requirement: Recursos de Comunicación con Vecinos

La matriz de permisos MUST distinguir la difusión masiva del buzón ciudadano y MUST
reservar el desglose nominativo de lecturas al rol administrador.
Un residente MUST poder escribir por el buzón y MUST NOT poder emitir difusiones.

#### Scenario: Difusión separada del buzón
- **WHEN** se consulta la matriz de permisos
- **THEN** existen los recursos `co` (difusión), `co:buzon` (buzón ciudadano) y `co:lecturas` (desglose nominativo)
- **AND** `co` y `co:buzon` no comparten las mismas acciones por rol

#### Scenario: El residente no emite difusiones
- **WHEN** un residente intenta crear una difusión con `POST /api/co/envios`
- **THEN** el sistema responde 403
- **AND** emite el evento `RP_PERMISSION_DENIED`

#### Scenario: El residente escribe por el buzón
- **WHEN** un residente crea un mensaje con `POST /api/co/mensajes-buzon`
- **THEN** el sistema acepta la creación

#### Scenario: Desglose nominativo reservado
- **WHEN** se consulta la matriz de permisos
- **THEN** el recurso `co:lecturas` solo otorga `ver` al rol administrador
