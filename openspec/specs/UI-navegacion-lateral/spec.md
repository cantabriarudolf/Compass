# UI-navegacion-lateral Specification

## Purpose
TBD - created by archiving change interfaz-base. Update Purpose after archive.
## Requirements
### Requirement: Categorized Navigation
The navigation menu MUST follow the hierarchy defined in the project documentation.

#### Scenario: Menu Structure
- **WHEN** the user opens the Sidebar
- **THEN** they MUST see the following categories: Panel de Control, Gestión de Comunidad, Finanzas y Operación, Infraestructura y Activos, Reportes y Auditoría, Configuración.

### Requirement: Active Link Highlighting
The current active route MUST be visually highlighted in the menu.

#### Scenario: Page Activation
- **WHEN** the user is on the route `/dashboard`
- **THEN** the "Inicio" item in the Sidebar MUST be highlighted.

