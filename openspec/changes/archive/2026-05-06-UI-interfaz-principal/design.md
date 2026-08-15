## Context

The `web` application in the Turbo monorepo is currently a basic template. To support the modular architecture described in `project.md`, we need a robust Shell. We will use `shadcn/ui` as the primary component system.

## Goals / Non-Goals

**Goals:**
- Implement a responsive `AppSidebar` component using `shadcn/ui`.
- Create a shared `Layout` that persists across routes.
- Integrate the navigation categories from `docs/02 - Estructura de Menu.md`.
- Enable Theme switching (Light/Dark).
- Use Lucide icons for visual guidance in the menu.

**Non-Goals:**
- Implementation of individual module pages (only the shell and placeholders).
- Backend integration or real API calls.
- User authentication or session management.

## Decisions

- **Component Library**: Use `shadcn/ui` (specifically the `sidebar` and `navbar` patterns).
- **Icons**: Use `lucide-react` for all navigation icons.
- **Theme Management**: Use `next-themes` to handle the transition between dark and light modes.
- **Routing**: Use Next.js App Router conventions.
- **Placeholders**: Use mock labels and icons for modules not yet implemented.

## Risks / Trade-offs

- **Complexity**: The Sidebar component from shadcn is feature-rich but complex to configure initially in a monorepo.
- **Maintenance**: Changing the menu structure later will require updating the sidebar configuration file.
