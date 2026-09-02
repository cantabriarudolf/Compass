## 1. Fase 0 — Evidencia temporal del gap

- [ ] 1.1 Crear `e2e/auth/roles-descubrimiento.spec.ts`: login form como `residente@test.cl`/`test1234`, navegar a `/admin`, afirmar que grupos admin-only ("Finanzas" es condicional pero "Sistema"/"Desarrollo AI"/"Inventario"/"Personas" deben ser visibles hoy por `currentRole="admin"`), documentar gap con aserciones y comentarios. Marcar `test.skip` al cierre de P1 (o eliminar) — anotar decisión en Bitácora.
- [ ] 1.2 Verificar `data.navMain` real (grupos/items y sus `roles:`) y dejar rastro de la matriz pre-normalización en el spec de descubrimiento.

## 2. Sesión con roles (lib/auth.ts — Node)

- [ ] 2.1 Ampliar `Session.user` type en `lib/auth.config.ts` con `roles?: string[]` (augmentation) y `JWT` con `roles?: string[]` si el proyecto lo tipa allí (o solo en `lib/auth.ts`).
- [ ] 2.2 Implementar callback `jwt` en `lib/auth.ts`: cuando `token.sub` existe y `!token.roles`, `prisma.membresia.findMany({ where: { usuarioId: token.sub } })` → `token.roles = [...new Set(rows.map(r=>r.rol))]`, preservar en siguientes requests (cache en token). Soportar `trigger==="update"` releyendo. No tocar `lib/auth.config.ts` callbacks más allá del type.
- [ ] 2.3 Implementar callback `session`: `session.user.roles = (token.roles as string[]) ?? []` (+ `id`/`email` ya existentes). Verificar que `auth()` server retorna `roles`.
- [ ] 2.4 Validar que `lib/auth.config.ts` sigue edge-safe (sin import Prisma) y `proxy.ts` no cambia.

## 3. Sidebar conectado + alias normalizados

- [ ] 3.1 Normalizar `components/app-sidebar.tsx` `data.navMain`: `admin→administrador`, `conserje→conserjeria` en TODOS los `roles:` de grupos e items (incl. `Remuneraciones`). Revisar con `grep`.
- [ ] 3.2 Reemplazar `const currentRole = "admin"` por `roles` reales: elegir vía (a) server wrapper — `app/layout.tsx` async `const session = await auth()` y prop `roles` a `AppSidebar` (o wrapper server). Documentar vía y por qué en `design.md` (ya hecho). Filtrado grupos: `g.roles.some(r=>roles.includes(r))`; items: `!it.roles || it.roles.some(r=>roles.includes(r))`; grupo oculto no deja sección vacía.
- [ ] 3.3 Verificar `app/layout.tsx` sigue compilando (`npx tsc --noEmit` 0) y que `SidebarProvider` client no se rompe al volver `RootLayout` async.

## 4. E2E matriz rol×grupos (P1 — login por form)

- [ ] 4.1 Crear `e2e/auth/roles-menu.spec.ts`: helpers `loginAs(page, email)` por form `/ingresar` (fill label Correo/Contraseña, click Ingresar, `toHaveURL(/admin|/dashboard)`), luego afirmar visibilidad de grupos (por `getByText`/`getByRole` del sidebar) para `residente@test.cl`, `conserjeria@test.cl`, `admin@test.cl` según matriz normalizada (residente 4/8, conserjeria 2/8, admin 8/8; `Remuneraciones` solo admin). 0 `pageerror`. No usar storageState (llega en P2).
- [ ] 4.2 Ejecutar `npx playwright test e2e/auth/roles-menu.spec.ts` en local y asegurar verde antes de archivar.

## 5. Validación y cierre

- [ ] 5.1 `npx tsc --noEmit` (0) · `npm run lint` (0 errores) · `npx vitest run` (455/455) · `npx playwright test e2e/auth/roles-menu.spec.ts` (+ descubrimiento skip) · `openspec validate --all` (sin errores).
- [ ] 5.2 Decidir destino del spec de descubrimiento (skip vs eliminar) y ejecutarlo.
- [ ] 5.3 Commit conventional español + `nsgc-prepush` + push + `openspec archive rp-menu-sesion` (git status limpio) + actualizar `openspec/SERIE-CUENTAS/00-plan.md` fila HECHA + Bitácora con hash y matriz normalizada.
