# UI-navegacion-lateral Specification

## Purpose
Define el comportamiento y la estructura del panel de navegación lateral (Sidebar) de la aplicación GECOS, incluyendo su organización por categorías, el resaltado de la ruta activa, la capacidad de plegarse/desplegarse mediante un control visible y su integración con los roles de usuario.
## Requirements
### Requirement: Categorized Navigation
The navigation menu MUST follow the hierarchy implemented in `AppSidebar` and reflect the modules documented in `openspec/specs/`.

#### Scenario: Menu Structure
- **WHEN** the user opens the Sidebar
- **THEN** they MUST see the following groups and items:
  - **Inicio**
    - Resumen (`/dashboard`)
  - **Operaciones**
    - Bitácora Diaria (`/operaciones/bitacora`)
    - Accesos y Visitas (`/operaciones/accesos`)
    - Encomiendas (`/operaciones/paqueteria`)
    - Reservas (`/operaciones/reservas`)
    - Solicitudes (`/operaciones/solicitudes`)
    - Proveedores y Servicios (`/operaciones/proveedores`)
  - **Finanzas**
    - Gastos Comunes (`/finanzas/gastos-comunes`)
    - Recaudación (`/finanzas/pagos`)
    - Multas (`/finanzas/multas`)
    - Remuneraciones (`/finanzas/remuneraciones`)
  - **Comunidad**
    - Directorio de Personas (`/comunidad/personas`)
    - Comunicación (`/comunidad/comunicacion`)
    - Directiva (`/comunidad/directiva`)
    - Certificados (`/comunidad/certificados`)
    - Portal Inmobiliario (`/comunidad/portal`)
  - **Inventario**
    - Estructura Física (`/inventario/estructura` — incluye estacionamientos como `u-E-*`)
    - Tipos de Unidad (`/inventario/tipos`)
    - Estacionamientos (`/inventario/estacionamientos`) — **deprecado v8, filtrar `Estructura Física` por sector `Estacionamientos`**
    - Recursos y EPP (`/inventario/recursos`)
    - Mantenimiento (`/inventario/proyectos`)
  - **Personas**
    - Residentes (`/personas/residentes`)
    - Personal (`/personas/personal`)
  - **Desarrollo AI**
    - Dashboard OpenSpec (`/admin/dev-dashboard`)
    - Laboratorio QA (`/admin/qa-lab`)
  - **Sistema**
    - Reportería y Dashboards (`/admin/reporteria`)
    - Auditoría y Métricas (`/admin/metricas`)
    - Maestros Administrativos (`/admin/maestros`)
    - Configuración (`/admin/configuracion`)
    - Permisos (`/admin/permisos`)
    - Logs de Auditoría (`/admin/logs`)

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

#### Scenario: Matriz ampliada — comite y mantencion según MATRIZ RP

- **WHEN** el usuario autenticado tiene rol `comite` (`comite@test.cl` — `comite` en `comunidad-a`, MATRIZ: `fi:ver`, `re:centro_mando:ver`, `ct:historial:ver`, `pe:directorio:ver`, `ir:mantenimiento:ver`)
- **THEN** MUST ver los grupos `Inicio`, `Finanzas` (Gastos Comunes/Recaudación/Multas, no Remuneraciones), `Comunidad` (Directorio/Certificados), `Sistema` (Reportería y Dashboards + Logs de Auditoría visibles según item granular) — 4/8 grupos visibles.

#### Scenario: Mantencion — Inventario/MT y Operaciones

- **WHEN** el usuario tiene rol `mantencion` (`mantencion@test.cl` — MATRIZ: `mt:ver/crear/editar/ejecutar`, `ir:mantenimiento:ver/crear`, `pe:bitacora:ver`, `pe:directorio:ver`)
- **THEN** MUST ver `Inicio`, `Operaciones` (Bitácora Diaria) e `Inventario` (Recursos y EPP + Mantenimiento con `roles:["administrador","mantencion"]`; Estructura Física/Tipos solo admin) — 3/8 grupos visibles.

#### Scenario: Personas — menor privilegio por mp:propios

- **WHEN** un usuario no-admin con `mp:propios:ver` (`comite`, `conserjeria`, `residente`, `mantencion`) navega al grupo `Personas`
- **THEN** MUST NOT ver el grupo `Personas` completo (listado global admin-only); `mp:propios` es contextual (`puedeContextual` con `personaId`) y no habilita listado — decisión de menor privilegio documentada en design.

### Requirement: Active Link Highlighting
The current active route MUST be visually highlighted in the menu.

#### Scenario: Page Activation
- **WHEN** the user is on the route `/dashboard`
- **THEN** the "Inicio" item in the Sidebar MUST be highlighted.

#### Scenario: Active Sub-Item
- **WHEN** the user is on the route `/comunidad/personas`
- **THEN** the "Directorio de Personas" sub-item under "Comunidad" MUST be highlighted.

### Requirement: Collapsible Sidebar
The Sidebar MUST provide a visible control to collapse and expand it. On desktop, collapsing SHOULD keep the menu icons visible to allow quick navigation (collapsible="icon" behavior). On mobile, the Sidebar SHOULD be hidden by default and revealed through the same control.

#### Scenario: Toggle Sidebar
- **WHEN** the user clicks the Sidebar toggle button in the application header
- **THEN** the Sidebar MUST collapse, showing only the group icons and tooltips
- **AND** clicking the same button again MUST expand the Sidebar to its full width.

### Requirement: Community Branding in Sidebar
The Sidebar header MUST display the community identity configured in the "Identidad Legal" master (CF - Configuración Global).

#### Scenario: Community Name and Logo
- **WHEN** the user views the Sidebar header
- **THEN** the community name MUST be displayed
- **AND** if a `logoUrl` is configured, that logo MUST be displayed
- **AND** if no logo is configured, the default GECOS icon MUST be shown.

