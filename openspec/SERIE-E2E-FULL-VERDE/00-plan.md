# Serie E2E-FULL-VERDE — Plan y Estado Canónico

> Toda ventana DEBE leer este archivo al iniciar (bloque ARRANQUE en P2/P3/P4),
> marcar su fila EN CURSO y actualizarla antes del push final. La Bitácora es
> el registro durable. La verdad es el repo, no los chats.

| Ventana | Alcance | Estado | Commit final |
| --- | --- | --- | --- |
| P1 | Higiene y determinismo: fix orden seed-authz + convención TEST-*/cleanup + estrategia GATED + receta reseed scope A | HECHA | — |
| P2 | Rojos CRUD (~17): admin-configuracion, permisos, tipos, personal, proyectos, reservas, gestion, logs, reporteria, punto-cero + 4 GATED | pendiente | — |
| P3 | Rojos flujo/a11y/smoke (6): poblamiento ×2, flujo/personas, a11y ×2, smoke-mobile | pendiente | — |
| P4 | Integral y cierre: full e2e verde + checklist §4 owner + archivo 2 changes + nsgc-prepush + push + VALIDACION-PERFILES COMPLETA | pendiente | — |

MÁXIMO: 4 ventanas. Post-serie (fuera): super-admin global (diseño pendiente),
migración SQLite→PostgreSQL, resto de BACKLOG-100.

Track paralelo humano P0 (owner, ~15 min, en cualquier momento P1–P3): checklist
manual §4 de `openspec/changes/roles-validacion-comunidad-a/cuentas-funcionales.md`
(7 cuentas, password universal `Test1234!`). P4 lo requiere para cerrar.

## Base de hechos (leer antes de cada ventana)

- Estado heredado P3 (2026-09-27, commits `9429d97` + `1a08b6d`, main ahead 2 sin
  push): STORE_VERSION 28 · vitest 82 archivos 809/809 · tsc 0 · lint 0 errores ·
  e2e full válido (scope A) 70 pass / 23 fail / 2 skip sobre 95 tests en 48 files.
- Serie-scope YA verde (no retrabajar): lane auth 19/19, 5 specs P2
  (maestros-datos, residentes, residente-ficha, abac-denegacion,
  arrendatario-limite), bitacora + multas (null-guards P3, delta
  `OP-bitacora-nullguards` en change `roles-specs-perfil`).
- Fijaos P3 ya aplicados (no repetir): permisos 5→6 membresías + email
  arrendatario; admin-configuracion restaura nombre original en `finally`.
- Fails pendientes (full run scope A 2026-09-27): a11y axe ×2 (reservas,
  bitacora), admin-configuracion, admin-reporteria, certificados (GATED),
  gestion, logs, pagos (GATED), permisos, personal, portal (GATED), proyectos,
  punto-cero, remuneraciones (GATED), reservas, roles-journeys (flaky timing),
  tipos, flujo/personas, poblamiento ×2, smoke-mobile bitacora.
- Causas diagnosticadas en P3 (verificar, no asumir):
  (a) `/admin/configuracion` muestra default del mock (`Edificio Plaza Central`,
  `data/admin/configuracion.ts`) en vez del valor BD y no persiste el guardado;
  (b) permisos busca opción /Los Aromos/ pero el nombre BD cambia (spec
  admin-configuaran renamea sin restore — mitigado con finally P3);
  (c) QA-Lab "Poblar todo de una vez" (4 specs GATED) destruye/reemplaza el seed;
  (d) records TEST-* sin cleanup entre runs (duplicados, saldos, conteos);
  (e) flakes de timing bajo carga paralela (combos sin opciones, mobile).
- GAP seed-authz (P1 lo fija en código): `findFirst` + update in place NO reordena
  membresías; restore+seed pierde scope A. Receta manual hasta el fix: borrar y
  recrear la membresía admin-a (queda última por createdAt → scope A).
- Seed reproducible: `npm run seed:authz` + `npm run seed:mocks -- --comunidad-id=comunidad-a`
  + receta scope A. Cuentas TEST (`Test1234!`, 2FA off, comunidad-a): 7 cuentas
  `admin/comite/conserjeria/residente/mantencion/arrendatario@test.cl`.
- Scope: última membresía (take:1, `withComunidadScope`); admin wildcard en
  permisos, sin bypass de comunidad. Servidor dev `http://localhost:3000`.
- Changes abiertos al cierre: `roles-specs-perfil`, `roles-validacion-comunidad-a`
  (este último falla `validate` por diseño: sin deltas, es change de validación).
- Backup seguridad BD dev P3: `Data/NSGC/backups/db-20260927T021906-pre-p3-reseed`
  (restore: `npm run restore:db -- <dir>` con confirmación; genera pre-snapshot).

## Bitácora

- [2026-09-27] Serie materializada por orquestador (4 ventanas, cap duro). Base:
  reporte P3 VALIDACION-PERFILES (PARCIAL, `1a08b6d`).
- [2026-09-27] Delegado FALLIDO: `gentle-ai-worker` timed out (stall 4 min, mismo
  infra-stall que P1 anterior: harness pide Pi ≥0.86.1). Owner eligió modo manual.
  Handoff: `Corre el archivo openspec/SERIE-E2E-FULL-VERDE/prompt-01.md`.
- [2026-09-27] P1 HECHA (manual): change `e2e-higiene-determinismo` válido;
  seed-authz determinista (pasada `createdAt` admin-a última en `.mjs` + espejo
  `lib`, test 6/6) verificado restore P3 + 2 seeds → scope A sin receta manual;
  convención TEST-*/cleanup + GATED (orden no-GATED→GATED, `e2e:full-orden`)
  en deltas ST/DEV; `admin-configuracion` finally intacto. Números: vitest
  83/815, tsc 0, lint 0 errores, auth 19 pass/2 skip. Lección: reiniciar dev
  server tras `restore:db` (handle stale → login 0/6). Push: no (serie en curso).
