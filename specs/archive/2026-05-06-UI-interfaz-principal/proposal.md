## Why

The project currently has a basic placeholder page. To build a modular dashboard as specified in `project.md`, we need a central shell (Layout) that provides consistent navigation and structure. This will allow us to implement the modules one by one in a scalable way.

## What Changes

- Implementation of a global `Layout` in the `web` application.
- Integration of a sidebar navigation system based on `docs/02 - Estructura de Menu.md`.
- Addition of a top navigation bar for global actions (Theme toggle, User profile placeholder).
- Configuration of Dark/Light mode support.

## Capabilities

### New Capabilities
- `UI-interfaz-principal`: The core layout structure including the Sidebar and Main content area.
- `UI-navegacion-lateral`: Dynamic menu system that maps to the modular roadmap of the project.

### Modified Capabilities
- None

## Impact

- `apps/web/app/layout.tsx`: Will be updated to include the Shell.
- `apps/web/app/page.tsx`: Will be updated to reflect the first dashboard view.
- `apps/web/components/`: New components for Sidebar, Navbar, and Theme toggler.
