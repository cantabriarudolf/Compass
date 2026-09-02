## Context

P1 cerró la violación `UI-navegacion-lateral` con unión de roles en JWT y sidebar por intersección vía `app/layout.tsx` server wrapper. Quedó hallazgo: `comite`/`mantencion` 0/8 grupos porque `data.navMain` no los declaraba, aunque MATRIZ RP (`lib/authz.ts`) les da permisos reales (`comite: fi:ver/re:centro_mando/ct:historial/pe:directorio/ir:mantenimiento; mantencion: mt:ver/crear/ejecutar/ir/pe:bitacora`). Infra e2e aún single-tenant (`e2e/.auth/admin.json`).

## Goals / Non-Goals

**Goals:**
- Mapping roles×grupos/items ampliado según MATRIZ, con decisión menor privilegio para `Personas`.
- Infra multi-cuenta parametrizada con `storageState` por spec sin 5 proyectos.
- E2E `roles-accesos` (menú+403) y `roles-journeys` (1 happy por rol no-admin) verdes.

**Non-Goals:**
- No tocar `lib/auth.config.ts`/edge/proxy ni matriz `lib/authz.ts` (fuente de verdad ya existente).
- No implementar SSO Google (BACKLOG-100).
- No confirmar retiros/pagos del seed en journeys.

## Decisions

**1. Mapping ampliado — mínima ampliación necesaria para cerrar hallazgo**

Antes (P1):
- Inicio: [administrador,conserjeria,residente]
- Operaciones: [administrador,conserjeria,residente]
- Finanzas: [administrador,residente] (Remuneraciones: [administrador])
- Comunidad: [administrador,residente]
- Inventario: [administrador]
- Personas: [administrador]
- Desarrollo AI: [administrador]
- Sistema: [administrador]

Después (P2):
- Inicio: [administrador,conserjeria,residente,comite,mantencion] (+2, todos autenticados ven resumen)
- Operaciones: [administrador,conserjeria,residente,mantencion] (+mantencion por `pe:bitacora:ver`)
- Finanzas: [administrador,residente,comite] (+comite por `fi:ver`/`fi:balance:ver`)
  - Items: Gastos Comunes/Recaudación/Multas heredan grupo; Remuneraciones [administrador] (filtrado granular, comite no ve)
- Comunidad: [administrador,residente,comite] (+comite por `ct:historial:ver` + `pe:directorio:ver`)
- Inventario: [administrador,mantencion] (+mantencion por `mt`+`ir:mantenimiento`)
  - Items granular: `Estructura Física` [administrador], `Tipos de Unidad` [administrador], `Recursos y EPP` [administrador,mantencion] (`ir:mantenimiento`), `Mantenimiento` [administrador,mantencion] (`mt`)
- Personas: [administrador] (SIN ampliar) — decisión menor privilegio: `mp:propios` es contextual (`puedeContextual` con `personaId`), no habilita listado global. Añadir `mantencion`/`comite` expondría PII. Documentado como 0/8→0/8 para Personas.
- Desarrollo AI: [administrador]
- Sistema: [administrador,comite] (+comite por `re:centro_mando:ver`)
  - Items granular: `Reportería y Dashboards` [administrador,comite], resto [administrador] (auditoría/métricas/gestión/maestros/config/permisos/logs solo admin). Comite ve 1-2 items, no 7.

Resultado: `administrador 8/8, conserjeria 3/8 (Inicio,Operaciones + Inventario? no → 2/8? con Operaciones+Inicio=2, pero al añadir mantencion no afecta conserjeria) → 2/8`, actual `conserjeria` se mantiene 2/8; `residente 4/8`; `comite 4/8 (Inicio,Finanzas,Comunidad,Sistema)`; `mantencion 3/8 (Inicio,Operaciones,Inventario)`. Ver matriz e2e.

Alternativa descartada: ampliar Personas a todos con `mp:propios` — expone listado y viola menor privilegio.

**2. Infra multi-cuenta — función `crearSesion(page,email,archivo)` parametrizada**

- `e2e/auth.setup.ts` exporta helpers: `correoOFormulario(page)` existente + nuevo `crearSesion(page,email,archivo)` que: `goto /ingresar` → si form visible rellena email/`test1234` → espera `/admin`, `context().storageState({path: archivo})`. Itera `CUENTAS = [{email,rol,file}]` 5 entradas (`admin@test.cl`→`e2e/.auth/admin.json`, `comite`→`comite.json`, etc.). Si valid cookie vigente redirige, reutiliza `storageState` sin login (resiliencia).
- `.gitignore` ya contiene `k0mp4ss_fe/apps/web/e2e/.auth/` (repo root) — verificar no duplicar; añadir si falta `k0mp4ss_fe/apps/web/e2e/.auth/` (con y sin `**`).
- `playwright.config.ts` mantiene 1 proyecto `chromium` con `dependencies:["setup"]`; patrón por spec: `test.use({ storageState: "e2e/.auth/residente.json" })`. Razón: 5 proyectos duplicaría workers y timeout de dev; `test.use` por spec permite elegir cuenta sin explosión de proyectos. Documentado aquí y en `e2e/auth.setup.ts` header.

Alternativa: 5 proyectos `chromium-{rol}` — rechazada por costo de ejecución y duplicación de reporte.

**3. `roles-accesos.spec.ts` — denegaciones con fetch client-side con sesión**

- Cada bloque `test.describe` usa `test.use({ storageState })`. Afirma grupos visibles/ocultos vía `getByText` exact + `getByRole("button",{name:grupo})` para expandir collabsibles.
- Denegación: `await page.evaluate(async () => fetch("/api/admin/usuarios?comunidadId=comunidad-a").then(r=>r.status))` → 403 para `comite/conserjeria/residente/mantencion`, 200 para `admin`. Usa `comunidad-a` id del seed (`seed-authz.ts`). header `x-comunidad-id` alternativa no necesaria. Afirma 403 desde sesión (no page rendering).

Alternativa: navegar a `/admin/gestion` y esperar 403 UI — rechazada porque UI puede renderizar esqueleto; la verdad es API.

**4. `roles-journeys.spec.ts` — journeys sin contaminación**

- Usa `test.use storageState` por rol + `useCompassStore.getState().seedData()` verificación previa. Cada journey crea entidad `TEST-<rol>-<ts>` (ej. `TEST-CONSERJERIA-...`). No confirma pagos/retiros del seed.
- Conserjeria: `saveBitacoraVisitaPE` → `ingresarBitacora` en `/operaciones/bitacora` (VisitasPanel). Mantencion: `saveTrabajoMT` en `/inventario/proyectos`. Residente: `saveReservaRA` + `generarCertificadoCT({tipo:"residencia",unidadId})`. Comite: navigar `/finanzas/gastos-comunes` y `/admin/reporteria` sin errores; intenta `saveEgresoFI` y verifica botón ausente o error `Menor privilegio`.
- `expect(errores).toEqual([])` por test.

## Risks / Trade-offs

- [Riesgo] Grupo `Sistema` visible para `comite` expone 7 items si no hay filtro granular → mitigado con `roles` por item.
- [Riesgo] `storageState` caduca en CI (JWT 30d) → setup reloggea automáticamente si `waitFor form` detecta sesión inválida.
- [Trade-off] `test.use storageState` por spec vs por `describe` — `test.use` solo funciona a nivel file top-level; se aplica `test.use` en cada archivo y `describe` hereda; mantener 4 archivos separados (uno por rol) si se requiere granularidad.

## Migration Plan

1. Deploy sin migración BD: sidebar ya lee roles de sesión; usuarios con sesión antigua ven menos grupos hasta refresh JWT (re-login si son `comite`/`mantencion`).
2. Rollback: revertir `app-sidebar.tsx` data + `auth.setup.ts` single file; `storageState` huérfanos inocuos.
3. E2E: `npx playwright test auth/roles-accesos crud/roles-journeys auth/roles-menu` verdes antes de `openspec archive`.

## Open Questions

- Ninguna que cambie specs/tasks.
