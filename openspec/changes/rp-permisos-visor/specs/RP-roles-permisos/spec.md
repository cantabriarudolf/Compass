## MODIFIED Requirements

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
