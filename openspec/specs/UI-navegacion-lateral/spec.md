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
    - Estructura Física (`/inventario/estructura`)
    - Tipos de Unidad (`/inventario/tipos`)
    - Estacionamientos (`/inventario/estacionamientos`)
    - Recursos y EPP (`/inventario/recursos`)
    - Mantenimiento (`/inventario/proyectos`)
  - **Personas**
    - Residentes (`/personas/residentes`)
    - Personal (`/personas/personal`)
  - **Desarrollo AI**
    - Dashboard OpenSpec (`/admin/dev-dashboard`)
  - **Sistema**
    - Auditoría y Métricas (`/admin/metricas`)
    - Maestros Administrativos (`/admin/maestros`)
    - Configuración (`/admin/configuracion`)
    - Permisos (`/admin/permisos`)
    - Logs de Auditoría (`/admin/logs`)

### Requirement: Role-Based Menu Visibility
The Sidebar MUST only show groups and items that the current user role is authorized to access.

#### Scenario: Admin Role
- **WHEN** the current user has the "admin" role
- **THEN** all groups and items MUST be visible.

#### Scenario: Non-Admin Role
- **WHEN** the current user has a role other than "admin"
- **THEN** groups and items without that role in their `roles` list MUST be hidden.
- **AND** hidden groups MUST NOT leave empty sections in the menu.

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
