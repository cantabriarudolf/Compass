# UI-interfaz-principal Specification

## Purpose
TBD - created by archiving change interfaz-base. Update Purpose after archive.
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

