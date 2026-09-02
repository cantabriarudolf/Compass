> **Este archivo ES tu prompt.** Ventana 1 de la serie **cuentas**.

## Contexto común (válido para TODA la serie)

- Proyecto Compass. Front: `k0mp4ss_fe/apps/web`. Estado: Vitest 455/455, e2e crud 30 specs,
  CI 3/3 verde, repo limpio en main. Lee SIEMPRE `openspec/SERIE-CUENTAS/00-plan.md`
  (decisiones, base de hechos, roadmap, bitácora) y `openspec/BACKLOG-100.md` §C3 (en pausa).
- Método por ventana: openspec change completo (propose → apply → validate) → commit
  conventional español → nsgc-prepush → push → archive (git status LIMPIO tras archive) →
  fila HECHA + Bitácora con hash. Validación: tsc 0 · lint 0 errores · Vitest completo con
  número REAL · e2e de la ventana · `openspec validate --all`.
- Confía en el CÓDIGO sobre el plan si un label difiere; anota desviaciones en la Bitácora.
- Si el contexto se agota: cierra la tarea en curso, commitea y deja el estado exacto en 00-plan.md.
- Reporta al final: cambios, verificaciones con NÚMEROS REALES, commits con hash, pendientes.

## Arranque (Ventana 1: lectura inicial)

1. Lee `openspec/SERIE-CUENTAS/00-plan.md` completo (decisiones + base de hechos).
2. Verifica repo: `git status` limpio y pusheado, `git log --oneline -5`, Vitest 455/455.
3. Marca tu fila P1 como EN CURSO en 00-plan.md.

## Alcance P1 — Fase 0 (descubrimiento) + Fase 1 (menú por sesión real)

### Fase 0 — spec de descubrimiento (evidencia del gap, temporal)

1. `e2e/auth/roles-descubrimiento.spec.ts`: login directo como `residente@test.cl`
   (form de `/ingresar`, credenciales del seed), afirmar redirect a `/admin`-territorio y
   **documentar** (mediante aserciones) que el menú muestra grupos que NO son de residente
   (ej. "Finanzas", "Sistema" visibles hoy por `currentRole = "admin"` hardcodeado en
   `app-sidebar.tsx:168`). Este spec es evidencia temporal — P1 lo deja marcado
   `test.skip` con comentario o lo elimina al final de la ventana (decide y anota en
   Bitácora); la matriz definitiva llega en P2.

### Fase 1 — change `rp-menu-sesion` (cierra la violación del spec UI)

1. **openspec-propose** `rp-menu-sesion`:
   - Capability `UI-navegacion-lateral` (delta MODIFIED §Role-Based Menu Visibility: los
     escenarios Admin/Non-Admin pasan a evaluar el rol REAL de la sesión — unión de roles de
     las membresías del usuario autenticado, no un valor hardcodeado).
   - Referencia cruzada a capability `RP-roles-permisos` si el delta lo menciona.
2. **Implementar:**
   - **Sesión con roles** (`lib/auth.ts`, runtime Node): callback `jwt` — cuando existe
     `token.sub`, leer membresías (`prisma.membresia.findMany({ where: { usuarioId } })`) y
     guardar `token.roles = [...new Set(rows.map(r => r.rol))]` (unión, roles authz:
     administrador/comite/conserjeria/residente/mantencion). Callback `session`:
     `session.user.roles = token.roles`. EDGE (`lib/auth.config.ts`): NO tocar (edge-safe
     sin Prisma; el proxy solo autentica). Cuidado con el rendimiento: el callback jwt corre
     por request — puede cachearse en el token (roles solo cambian en activación/seed; el
     JWT ya los persiste entre requests).
   - **Sidebar conectado** (`components/app-sidebar.tsx`): reemplazar
     `const currentRole = "admin"` por el rol real. El sidebar es client component — elige
     la vía que menos fricción tenga y documéntala en design.md: (a) server wrapper que lee
     `auth()` y pasa `roles: string[]` por props, o (b) `useSession()` + SessionProvider en
     el layout raíz, o (c) fetch de `/api/auth/session`. Filtrar GRUPOS e ITEMS con unión:
     visible si `roles del usuario` ∩ `roles declarados ≠ ∅` (un usuario administrador ve
     todo; un residente ve solo Inicio/Comunidad/Personas... verifica qué declara cada grupo).
   - **Alias normalizados**: actualizar las cadenas de `data.navMain` de
     `admin/conserje/residente` a roles authz (`administrador/conserjeria/residente/...`)
     — authz es la fuente de verdad. Revisa TODOS los `roles:` del data (grupos e items).
   - Item del menú sin `roles` explícito: decide y documenta (visible para todos o solo
     admin) según el espíritu del spec.
3. **e2e** `auth/roles-menu.spec.ts` (en P1, login directo por form — los storageStates
   llegan en P2): para residente, conserjeria y admin — login → afirmar matriz de grupos
   visibles/ocultos según el data normalizado. residente NO ve Finanzas/Sistema/
   Desarrollo AI/Inventario (verifica el data real); admin ve todo; conserjeria según su
   grupo (Operaciones/Personas...). 0 pageerror.

## Verificación

`npx tsc --noEmit` (0) · `npm run lint` (0 errores) · `npx vitest run` (455/455 REAL) ·
`npx playwright test auth/roles-menu.spec.ts` (o ruta e2e correspondiente) + el spec de
descubrimiento (o su retirada) · `openspec validate --all` · commit · nsgc-prepush · push ·
archive (git status limpio) · Bitácora P1 HECHA con hash.
