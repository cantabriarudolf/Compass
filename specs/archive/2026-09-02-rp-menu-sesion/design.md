## Context

Estado actual (ver `openspec/SERIE-CUENTAS/00-plan.md` Base de hechos): `app-sidebar.tsx` filtra con `const currentRole = "admin"` hardcodeado; `lib/auth.ts` no expone roles; `lib/auth.config.ts` es edge-safe con `providers: []` y se usa en `proxy.ts` (edge). `lib/authz.ts` ya define `ROLES = ["administrador","comite","conserjeria","residente","mantencion"]` y matriz ABAC, pero el sidebar usa alias legacy `admin/conserje/residente`. Seed crea 5 usuarios con `membresia.rol` en `lib/seed-authz.ts` y password `test1234`. Objetivo: cerrar violación `UI-navegacion-lateral` sin tocar seguridad server-side ni edge.

## Goals / Non-Goals

**Goals:**
- Sesión expone unión de roles de membresías vía callbacks estándar Auth.js.
- Sidebar filtra por intersección con unión; alias normalizados a authz.
- Rendimiento del callback `jwt` no degrada: roles cacheados en JWT entre requests.
- E2E `auth/roles-menu.spec.ts` valida matriz rol×grupos para 3 roles por form.

**Non-Goals:**
- No tocar `lib/auth.config.ts` ni `proxy.ts` (edge).
- No migrar guardas `puede()` server-side (ya existen).
- No implementar storageStates multi-cuenta (P2) ni SSO C3 (BACKLOG-100 pausa).
- No crear nueva capability ni cambiar propósito de `UI-navegacion-lateral`.

## Decisions

**1. Dónde inyectar roles — callback `jwt` / `session` en `lib/auth.ts` (Node)**
- `jwt({ token, user })`: si `token.sub` existe y `token.roles` aún vacío, `prisma.membresia.findMany({ where: { usuarioId: token.sub } })` → `token.roles = [...new Set(rows.map(r => r.rol))]`. Si `token.roles` ya poblado, se reutiliza sin consultar BD. En `trigger === "update"` o si se detecta activación de cuenta (membresía nueva), re-consultar.
- `session({ session, token })`: `session.user.roles = (token.roles as string[]) ?? []` y `session.user.id = token.sub`.
- Rationale: el JWT persiste entre requests; consultar Prisma solo al primer login / refresh evita N+1. Membresías cambian infrecuentemente (solo activación/seed) — no necesita TTL agresivo. Se amplia `Session.user` con `roles: string[]` (augmentation en `lib/auth.config.ts` type). No se agrega `rol` singular; se expone unión.
- Alternativas descartadas: leer roles en `authorize` y pasar via `user` → solo funciona al login inicial, no al refresh via JWT. Hacerlo en edge → imposible sin Prisma.

**2. Vía para inyectar roles al sidebar — (a) server wrapper que lee `auth()` y pasa `roles` por props**
- `app/layout.tsx` se hace `async` y hace `const session = await auth()` (import de `@/lib/auth`). Pasa `session?.user?.roles ?? []` a `AppSidebar` como prop `roles`. `AppSidebar` mantiene `"use client"` pero recibe `roles: string[]` y filtra `data.navMain.filter(g => g.roles.some(r => roles.includes(r)))` + granular `group.items.filter(it => !it.roles || it.roles.some(r => roles.includes(r)))`.
- Rationale: (a) requiere un solo cambio server en el layout raíz, sin introducir `SessionProvider` ni contexto global, sin fetch extra ni `useSession` hook, compatible con client component que sigue siendo cliente. Menor fricción que (b) `SessionProvider` (añadiría provider en layout y hook en sidebar + envolver toda la app, más boilerplate, potencial re-render) y que (c) `fetch("/api/auth/session")` (request async por render, parpadeo, dependencia de ruta API).
- Implementación concreta: crear `components/app-sidebar-wrapper.tsx` si se prefiere no convertir `layout.tsx` en async client conflict, o hacer `layout.tsx` async server directamente. La decisión final documentada aquí: **vía (a) server wrapper** — `RootLayout` async + prop drilling. Si `roles` vacío (no autenticado), sidebar no muestra grupos.
- Trade: requiere que `layout.tsx` siga siendo server component (lo es). Verificado: `app/layout.tsx` actualmente no es client, puede ser async sin romper `SidebarProvider` (que es client).

**3. Alias normalizados**
- Mapeo legacy → authz: `admin → administrador`, `conserje → conserjeria`, `residente → residente`. Se conserva grupo `Finanzas: ["administrador","residente"]`, `Operaciones: ["administrador","conserjeria","residente"]`, etc., verificados en `components/app-sidebar.tsx` líneas 64-147. Después del cambio la matriz documentada es: `administrador` 8/8, `conserjeria` 2/8 (Inicio, Operaciones), `residente` 4/8 (Inicio, Operaciones, Finanzas, Comunidad). `comite` y `mantencion` quedan 0/8 (ningún grupo los declara hoy) — se documenta y se cubre en P2 si se decide ampliar.
- Item sin `roles`: hereda visibilidad del grupo (ej. `Gastos Comunes` bajo `Finanzas` visible a `residente` aunque solo el grupo declare `residente`; `Remuneraciones` con `roles:["administrador"]` queda oculto para `residente`/`conserjeria`).
- Alternativa: añadir `comite`/`mantencion` a grupos existentes — rechazada en P1 para mantener scope quirúrgico (solo rename); ampliación vendrá si spec lo exige.

**4. Performance jwt**
- Decisión: cachear en token, sin Prisma por request. Documentado arriba. Si en el futuro la membresía cambia en caliente, el usuario debe re-login o trigger `session update` para refrescar (aceptable porque activación es acción admin poco frecuente). Se añade comentario en código.

**5. E2E estrategia**
- P1 usa login por FORM (`/ingresar` fill email/password `test1234`) para cada rol, no storageState. `test.skip` para descubrimiento (evidencia temporal). P2 migrará a storageStates. Quirúrgicos: `force:true` no necesario salvo toggle; scoping strict mode; `expect(page).toHaveURL` tras login; `expect(page.getByRole("button", { name:"Inicio" }))` etc. para grupos.

## Risks / Trade-offs

- [Riesgo] `layout.tsx` async + `auth()` en cada request añade latencia BD solo al primer JWT, no por request gracias a cache token. → Mitigación: cache en token; no tocar edge.
- [Riesgo] Alias legacy olvidados en algún `roles:` aislado → sidebar oculto inesperado. → Mitigación: `grep roles:` antes de commit + tests e2e fallarían; barrido completo de `data.navMain`.
- [Riesgo] `comite`/`mantencion` ven 0 grupos → sidebar vacío confuso. → Mitigación: documentado como matriz actual; no bloqueante para P1 (e2e no lo cubre); P2 evaluará ampliar si UX lo requiere.
- [Trade-off] Vía (a) prop drilling vs (b) provider: (a) evita context global y hooks, pero acopla layout a auth; aceptable porque layout ya es el root que alberga sidebar.

## Migration Plan

1. Deploy con callbacks nuevos: usuarios ya logueados recuperan `roles` en próximo refresh JWT (maxAge 30d — sin forzar logout). Sin migración BD.
2. Rollback: revertir `lib/auth.ts` y `components/app-sidebar.tsx` devuelve hardcode; sin BD change.
3. E2E descubrimiento queda `skip` — no bloquea CI.

## Open Questions

- Ninguna que cambie specs/tasks. Futuro: si `comite`/`mantencion` deben ver algún grupo, se ampliará `data.navMain` en P2/P3 con delta spec menor.
