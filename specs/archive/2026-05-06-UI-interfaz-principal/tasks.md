## 1. Setup & Foundation

- [x] 1.1 Ensure `next-themes` is installed in `apps/web`.
- [x] 1.2 Create `apps/web/components/theme-provider.tsx`.
- [x] 1.3 Add `sidebar`, `separator`, `tooltip`, and `dropdown-menu` shadcn components to the `web` app.

## 2. Sidebar Implementation

- [x] 2.1 Create `apps/web/components/app-sidebar.tsx` using the shadcn sidebar pattern.
- [x] 2.2 Map the navigation structure from `docs/02 - Estructura de Menu.md` into the sidebar data object.
- [x] 2.3 Integrate Lucide icons for all menu items.

## 3. Global Layout

- [x] 3.1 Update `apps/web/app/layout.tsx` to wrap the children with `ThemeProvider` and `SidebarProvider`.
- [x] 3.2 Implement a standard Sidebar Layout (Sidebar + Header + Main Content).
- [x] 3.3 Add a `ModeToggle` component to the header for theme switching.

## 4. Testing & Polish

- [x] 4.1 Verify responsive behavior (mobile drawer vs desktop static).
- [x] 4.2 Test theme persistence across navigation.
- [x] 4.3 Check that the sidebar highlights active routes correctly.
