# Serie CUENTAS — Plan y Estado Canónico

> Toda ventana DEBE leer este archivo al iniciar (bloque ARRANQUE), marcar su fila EN CURSO
> y actualizarla antes del push final. Reanudación en chat nuevo: "corre la serie
> SERIE-CUENTAS" — el orquestador lee el estado desde este archivo + git, NUNCA de texto
> de otros chats.

**Objetivo:** cuentas por caso de uso — cerrar la violación vigente del spec
`UI-navegacion-lateral` §Role-Based Menu Visibility (`app-sidebar.tsx:168` tiene
`const currentRole = "admin"` hardcodeado con comentario "Placeholder... vendrá de un
AuthContext": cualquier usuario logueado ve el menú completo de admin) y dotar al plan de
pruebas de cuentas por rol con journeys reales.

**Decisiones de diseño cerradas con el owner (2026-09-01):**
- **Alcance:** Fases 0-4 completas.
- **Rol del menú:** **unión de roles** de las membresías del usuario (sin concepto de
  "comunidad activa"); la seguridad real sigue server-side (guardas `puede()` en APIs).
- **Cuentas:** las 5 del seed (`seed-authz.ts`, `PASSWORD_TEST = "test1234"`): admin@test.cl
  (A+B), comite@test.cl, conserjeria@test.cl, residente@test.cl, mantencion@test.cl (A).
- **Alias:** normalizar el sidebar a los roles authz (`administrador, comite, conserjeria,
  residente, mantencion`) — authz es la fuente de verdad; la sesión expone roles authz.
- **Skill:** el abanico de `/qa` gana el parámetro "¿con qué cuenta?" y la capacidad de
  orquestar series materializadas (delega a `ejecutor-ventana` via skill serie-ventanas).
- **C3 (Google SSO):** sigue EN PAUSA en `BACKLOG-100.md` (fuera de esta serie).

## Base de hechos (verificado en código 2026-09-01)

1. `app-sidebar.tsx:168` — `const currentRole = "admin"` hardcodeado; filtro por grupo
   (`data.navMain.filter(group => group.roles.includes(currentRole))`, línea 204) e items
   granulares con `roles` (ej. Remuneraciones solo `["admin"]`, línea 92).
2. Sesión Auth.js: `sub = Usuario.id` + email; SIN rol (`lib/auth.ts` callbacks no expone
   membresías). `lib/auth.config.ts` es edge-safe con `providers: []`.
3. `seed-authz.ts`: 5 usuarios (personaId p-3..p-7), membresías admin en A+B, resto en A.
   `PASSWORD_TEST = "test1234"`.
4. Matriz authz (`lib/authz.ts` MATRIZ + `puedeContextual` + `reglasContextuales()`): los
   perfiles por rol ya existen y están testeados (unit 36+8) — lo que falta es conectarlos
   a sesión/navegación y probarlos E2E por cuenta.
5. Guardas server-side ya activas: APIs con `puede()` (403 logged), rate-limit, scoping A/B.
6. e2e hoy: setup único → storageState solo de admin; specs `crud/` (29) + `flujo/` (3) +
   `auth/` corren como admin.

## Quirúrgicos y reglas (heredados)

- Auth.js v5: callbacks jwt/session en `lib/auth.ts` (Node); NO tocar `lib/auth.config.ts`
  (edge-safe, sin Prisma). Roles en token → session vía callbacks estándar de next-auth.
- El sidebar es client component: decidir entre (a) server wrapper que pasa roles por props,
  (b) `useSession()` + SessionProvider, o (c) fetch de `/api/auth/session` — la que menoscabe
  menos; documentar en design.md.
- `test.use({ storageState })` por spec para elegir cuenta (patrón Playwright multi-auth);
  setup loguea los 5 roles una vez. **`e2e/.auth/` va al `.gitignore`** (cookies de sesión).
- e2e: quirúrgicos estándar (force/noWaitAfter, scoping strict mode, `expect(errores)`);
  journeys afirman contra datos reales del seed (verificar qué trae antes de afirmar).
- `next build` puede fallar por red (Google Fonts): ignóralo. Si el contexto se agota:
  cierra la tarea en curso, commitea y deja el estado exacto aquí.

## Roadmap

| Ventana | Alcance | Estado | Commit final |
|---|---|---|---|
| P1 | Fase 0+1 — spec descubrimiento (evidencia del gap) + change `rp-menu-sesion`: roles por unión de membresías en sesión Auth.js + sidebar conectado con alias normalizados + e2e `auth/roles-menu.spec.ts` (matriz rol×grupos) | HECHA (2026-09-01) | pendiente hash |
| P2 | Fase 2+3 — infra multi-cuenta (setup 5 storageStates + gitignore `.auth/`) + `auth/roles-accesos.spec.ts` (rutas permitidas/denegadas por rol) + `crud/roles-journeys.spec.ts` (1 journey feliz por rol no-admin) | pendiente | — |
| P3 | Fase 4 — skill `pruebas`: parámetro "¿con qué cuenta?" + sección orquestación de series (delega a ejecutor-ventana) + rol en `qa-estado.json` + cierre integral (Vitest/e2e reales) + avance NSGC + SERIE COMPLETA | pendiente | — |

## Bitácora

- [2026-09-01] P1 HECHA: rp-menu-sesion — unión membresías en jwt/session, sidebar roles reales (vía a server wrapper), alias authz, matriz e2e 5/5 (admin 8/8, conserjeria 2/8, residente 4/8) + descubrimiento skip — tsc 0/lint 0/Vitest 455/455/validate 33/33 (commit pendiente hash) — vía (a) elegida por menor fricción vs SessionProvider/fetch, comite/mantencion 0/8 hoy
