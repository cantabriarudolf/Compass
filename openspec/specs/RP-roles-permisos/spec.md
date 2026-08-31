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
The system SHALL support Attribute-Based Access Control for resource-specific or context-specific actions. The system SHOULD expose it as optional contextual filtering where applicable.

#### Scenario: Supply Request Context
- **WHEN** a resident requests a maintenance supply
- **THEN** they MUST only see the category "Solicitar Insumo Mantenimiento"
- **AND** the category "Solicitar Insumo Uso Interno" MUST be hidden.

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

