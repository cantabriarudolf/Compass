# Design: api-cobertura-fases (fase 1)

## D1 — Las 3 carpetas se eligen de la medición real, no del histórico

El prompt histórico nombraba `app/api/personas` (70.54%), `app/api/unidades` y
`app/api/vinculos`. La medición del 2026-10-15 (suite 936/936, reporte `coverage/`)
muestra un ranking distinto — `personas` subió con los tests de P1/P2 y aparecieron
carpetas más bajas. Rige la medición:

| # | Carpeta | % stmt (antes) | Sin cubrir | Tests existentes previos |
|---|---|---|---|---|
| 1 | `app/api/dev-dashboard` | 31.25 | 66/96 | ninguno (sólo guard 404 indirecto) |
| 2 | `app/api/qa-estado` | 45.65 | 25/46 | sólo el smoke de guardias (`route-guard-smoke`) |
| 3 | `app/api/admin` | 45.96 | 87/161 | GET de `usuarios` (`api-admin-usuarios`); `PATCH` y `seed-authz` sin cubrir |

Los números exactos antes/después por carpeta quedan en el avance NSGC de la ventana.

## D2 — Molde de tests: handlers exportados, Prisma real, sin mocks de Prisma

Se sigue el molde de `test/api/` (p. ej. `personas.test.ts`, `api-admin-usuarios.test.ts`):

- `@vitest-environment node` + `vi.mock("next/headers")` con estado hoisted para la
  cookie: `auth()` resuelve la sesión igual que en runtime.
- Sesión mintida con `test/helpers/sesion-authjs.ts` (cookie JWE real de Auth.js).
- Prisma contra la BD SQLite de test del job `unit` (paridad CI), sin `vi.mock` de
  Prisma ni de `lib/authz`: las guardias se ejercitan de verdad.
- Los handlers se importan de sus `route.ts` y se invocan con `NextRequest` y
  `{ params: Promise<{ id }> }` (Next 16).

## D3 — Decisiones por carpeta (las tres tenían efectos secundarios a domar)

1. **`dev-dashboard`**: `PATCH` llama a `toggleTask()`, que **escribe** el `tasks.md`
   de un change real; `PUT` escribe notas en `openspec/notes/`. El test crea un change
   temporal (`openspec/changes/test-dev-dashboard-tmp/`) y una nota temporal, ejerce el
   camino feliz real y los borra en `afterAll` (worktree limpio tras la corrida).
   El sandbox de `readProjectFile` se prueba con rutas fuera de los prefijos permitidos
   (`../../etc/passwd`, `prisma/dev.db`) → 404 sin leer nada.
2. **`qa-estado`**: `qa-estado.json` está **trackeado** en git. El test guarda su
   contenido original en `beforeAll`, siembra un run/etapa conocido para los caminos
   felices de `nota` y `recalibrar`, y **restaura byte-a-byte** en `afterAll`.
3. **`admin`**: `PATCH /api/admin/usuarios` no tenía ni un test (rol, `activo`,
   invalidación de sesión por `tokenVersion`, 400/403/404) — es el grueso de los 87
   statements sin cubrir de la carpeta. `POST /api/admin/seed-authz` ejercita el guard
   real (404 prod / 401 sin sesión / 403 sin permiso) y para el camino feliz mockea
   **sólo** `seedUsuariosMembresias()` (el helper ya tiene su propio test,
   `seed-authz-orden.test.ts`; ejecutarlo de verdad ensuciaría la BD compartida con el
   seed estándar `comunidad-a`/`comunidad-b`).

## D4 — Ratchet: piso nuevo = medido − 1 pt, nunca se baja

Con la suite verde de la fase 1 se re-mide `app/api/**` y el piso pasa de
78/63/82/78 al nuevo valor (medido − 1 pt entero por métrica). Si alguna métrica
medida quedara por debajo del piso vigente, eso es un hallazgo a investigar, no un
ajuste del piso. Global y `lib/**` no se tocan en esta fase (P8 los re-baselinea).

## Rollback

`git revert` de los commits de la fase 1: los tests nuevos desaparecen y el piso
vuelve al valor anterior. Sin migración de datos ni cambio de contrato.
