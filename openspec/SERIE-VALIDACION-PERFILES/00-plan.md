# Serie VALIDACION-PERFILES — Plan y Estado Canónico

> Toda ventana DEBE leer este archivo al iniciar (bloque ARRANQUE en P2/P3),
> marcar su fila EN CURSO y actualizarla antes del push final. La Bitácora es
> el registro durable. La verdad es el repo, no los chats.

| Ventana | Alcance | Estado | Commit final |
| --- | --- | --- | --- | --- |
| P1 | Transversales: unit full + tsc/eslint + e2e lane auth + matriz sidebar 4 roles + 403 | HECHA (verify-only, rojos heredados a P2) | s/cambios código |
| P2 | Propias por perfil: specs nuevas (maestros-datos, ficha residente, límite arrendatario, denegación ABAC) + 7ma cuenta en setup | HECHA | (este commit) |
| P3 | Integral: full e2e 43 + checklist manual §4 del owner + archivo de changes + push | pendiente | — |

MÁXIMO: 3 ventanas. Post-serie (fuera): super-admin global (diseño pendiente),
migración SQLite→PostgreSQL, resto de BACKLOG-100.

## Base de hechos (leer antes de cada ventana)

- Cuentas: `openspec/changes/roles-validacion-comunidad-a/cuentas-funcionales.md`
  (§2 matriz 7 cuentas, §3 scope, §4 checklist manual, §7 receta seed).
- TEST password universal: `Test1234!`. Comunidad validación: `comunidad-a`.
  Scope = última membresía (take:1); admin wildcard en permisos, sin bypass de comunidad.
- Matriz sidebar esperada: `e2e/auth/roles-accesos.spec.ts` (MATRIZ).
  Setup sesiones: `e2e/auth.setup.ts` (5 cuentas; arrendatario aún no registrada).
- Seed reproducible: `npm run seed:authz` + `npm run seed:mocks -- --comunidad-id=comunidad-a`
  (OBLIGATORIO el flag; jamás sin flag con backup-a en la BD).
- Seed scripts: `scripts/seed-authz.mjs` (6 usuarios), `scripts/seed-db-from-mocks.ts`.
- Servidor dev: `http://localhost:3000` (si está caído: `cd k0mp4ss_fe/apps/web && npm run dev`).
- Specs: `openspec/specs/RP-roles-permisos/spec.md` (roles, matriz, ABAC, selector comunidad),
  `openspec/specs/AU-autenticacion-sesion/spec.md` (seed, login, rate limit).
- Estado previo: STORE_VERSION 28 · vitest 82 archivos · e2e 43 specs · tsc 0 (2026-09-26).
- Backup seguridad BD dev: `Data/NSGC/backups/db-20260926T081328` (restore: `npm run restore:db`).

## Bitácora

- [2026-09-26] P1 delegada FALLIDA: `gentle-ai-verify` timed out (stall 4 min + web-access
  del harness pide Pi ≥0.86.1). Sin cambios en el repo (tree limpio, dev server OK).
  Se pasa a modo manual con la misma línea de handoff. ( начало serie, sin tocar filas.)
- [2026-09-26] P1 HECHA (modo manual, verify-only): tsc 0 errores · lint 0 errores (6634 warnings) ·
  unit 809/809 pass (EXIT 1 solo por coverage lines 79.67%/90% + branches 74.28%/75%) ·
  e2e-auth 13 pass/4 fail/2 skip (comite+residente: `getByText('Inicio')` not found; Gastos Comunes
  no visible) · validate 33/40 (7 changes en draft fallan) · STORE_VERSION 28. Sin fixes por diseño
  (van por ARRANQUE P2). Checklist §4 queda tarea del owner. Dev server apagado post-ventana.

- [2026-09-26] P2 HECHA: 4 specs nuevos verdes + sesión/MATRIZ arrendatario + fix ARRANQUE null-guard gestion (cierra rojos P1: lane auth 19/19) + seed admin-a última (scope A real) + delta GD. tsc 0, lint 0 errores, validate change OK (34/41: 7 drafts viejos a P3). Dev server apagado post-ventana.
