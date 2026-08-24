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
Permissions MUST be defined per module and action type.

#### Scenario: Action Types
- **WHEN** a permission is granted
- **THEN** it MUST apply to one of the following action types:
  - `ver`
  - `crear`
  - `editar`
  - `eliminar`
  - `ejecutar`

#### Scenario: Module Permissions
- **WHEN** the administrator reviews the permission matrix
- **THEN** they MUST see permissions grouped by module (FI, MP, EF, PE, etc.)
- **AND** the matrix MUST clearly indicate which roles have each permission.

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
