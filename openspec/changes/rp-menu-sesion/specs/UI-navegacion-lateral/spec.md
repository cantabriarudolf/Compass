## MODIFIED Requirements

### Requirement: Role-Based Menu Visibility
The Sidebar MUST only show groups and items that the current user role is authorized to access. The role is the **real session role**: the union of `Membresia.rol` values for the authenticated `Usuario.id` (via Auth.js `jwt`/`session` callbacks, see `lib/auth.ts`), normalized to authz roles (`administrador/comite/conserjeria/residente/mantencion`, source `lib/authz.ts ROLES`). `lib/auth.config.ts` remains edge-safe without Prisma. `data.navMain` roles MUST use authz aliases (e.g., `administrador` not `admin`, `conserjeria` not `conserje`). Visibility: a group/item is visible iff `intersection(userRoles, declaredRoles) ≠ ∅` (union of memberships). Items without explicit `roles` inherit the group's visibility (visible to any role that can see the group). `administrador` is not a wildcard at navigation level — its visibility derives from declared roles that include `administrador` (which today covers all groups, but the rule is intersection, not blanket). Reference: `RP-roles-permisos` for canonical role set.

#### Scenario: Admin Role
- **WHEN** the current user has the `administrador` role in the union of their membership roles (real session via `Membresia`, e.g., `admin@test.cl` with `administrador` en A y B — normalized from legacy `admin`)
- **THEN** all groups that declare `administrador` MUST be visible (today: 8/8 groups) and no group is hidden.

#### Scenario: Non-Admin Role
- **WHEN** the current user has a role other than `administrador` (e.g., `residente` with `["residente"]`, `conserjeria` with `["conserjeria"]` — union of memberships, roles normalized to `authz`)
- **THEN** groups and items without any of the user's roles in their `roles` list MUST be hidden (intersection `userRoles ∩ declaredRoles ≠ ∅`).
- **AND** hidden groups MUST NOT leave empty sections in the menu.
- **AND** items with their own `roles` (e.g., `Remuneraciones: ["administrador"]` normalized from `["admin"]`) MUST be hidden unless the user's role set intersects that list, even if the parent group is visible.

#### Scenario: Union of roles
- **WHEN** a user has multiple memberships with different roles (e.g., `["administrador","residente"]`)
- **THEN** effective visible groups MUST be the union of groups matching any single role (intersection per role, union across roles).

#### Scenario: Item without explicit roles inherits group visibility
- **WHEN** an item inside a visible group has no `roles` field (e.g., `Gastos Comunes` under `Finanzas`)
- **THEN** the item MUST be visible to any user for whom the parent group is visible; it MUST NOT be treated as admin-only.

#### Scenario: Unauthenticated or empty roles
- **WHEN** the session has no `roles` (unauthenticated or token before jwt enrichment)
- **THEN** the sidebar MUST show no navigation groups beyond the public header (no groups assumed).
