# UI-interfaz-principal Specification

## Purpose
Define la estructura visual persistente de la aplicación (layout compartido, barra superior, barra lateral y brand comunitaria), garantizando una experiencia coherente en todas las rutas y la personalización con la identidad de la comunidad.
## Requirements
### Requirement: Persistent Layout
The application MUST use a shared layout that wraps all pages.

#### Scenario: Visual Consistency
- **WHEN** the user navigates between different routes
- **THEN** the Sidebar and Topbar MUST remain mounted and visible without flickering.

### Requirement: Responsive Sidebar
The Sidebar MUST be responsive and adapt to different screen sizes.

#### Scenario: Desktop View
- **WHEN** the screen width is greater than 1024px
- **THEN** the Sidebar MUST be expanded by default.

#### Scenario: Mobile View
- **WHEN** the screen width is less than 768px
- **THEN** the Sidebar MUST be hidden and accessible via a hamburger menu.

### Requirement: Community Branding
The application header and Sidebar header MUST display the community identity configured in the "Identidad Legal" master (Configuración Global).

#### Scenario: Header Title
- **WHEN** the user views the application header
- **THEN** the title MUST display the value of `nombreComunidad`
- **AND** it MUST fall back to "GECOS" when no name is configured.

#### Scenario: Header Logo
- **WHEN** the user views the application header or Sidebar header
- **THEN** the default Compass icon MUST be shown if no logo is configured
- **AND** if a `logoUrl` is configured in Identidad Legal, that logo MUST be displayed instead.

#### Scenario: Logo Upload
- **WHEN** the user edits the "Identidad Legal" configuration
- **THEN** they MUST be able to upload an image file for the community logo
- **AND** the logo MUST be persisted as part of `ConfiguracionGlobal`.

