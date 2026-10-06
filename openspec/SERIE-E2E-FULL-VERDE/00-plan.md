# Serie E2E-FULL-VERDE — Plan y Estado Canónico

> Toda ventana DEBE leer este archivo al iniciar (bloque ARRANQUE en P2/P3/P4),
> marcar su fila EN CURSO y actualizarla antes del push final. La Bitácora es
> el registro durable. La verdad es el repo, no los chats.

| Ventana | Alcance | Estado | Commit final |
| --- | --- | --- | --- |
| P1 | Higiene y determinismo: fix orden seed-authz + convención TEST-*/cleanup + estrategia GATED + receta reseed scope A | HECHA | `7ba3247` |
| P2 | Rojos CRUD (~17): admin-configuracion, permisos, tipos, personal, proyectos, reservas, gestion, logs, reporteria, punto-cero + 4 GATED | HECHA | — |
| P3 | Rojos flujo/a11y/smoke (6): poblamiento ×2, flujo/personas, a11y ×2, smoke-mobile | HECHA | — |
| P4 | Integral y cierre: full e2e verde + checklist §4 owner + archivo 2 changes + nsgc-prepush + push + VALIDACION-PERFILES COMPLETA | PARCIAL | — |

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
- [2026-09-28] P2 HECHA (manual): change `e2e-rojos-crud` válido (8 deltas:
  CF/TU/PE/MT/MP/FI/RE/AD + GATED-parcial). Baseline 12 pass/9 fail → final
  20 pass + 1 flaky (conserjería, verde en retry) en una corrida
  (`--retries=1`). Fixes con test: rename Prisma `rutCondominio`→`rutComunidad`
  (+migración, seed, cifrado, defaults válidos); tipos PUT-vs-POST por id
  pregenerado; personal `sinNulos`; proyectos folio MT-* + transiciones API +
  espera revalidación; gestión `esReferenciaValida` null (500→200); punto-cero
  scope canónico desc en 5 resolvers + historia a comunidad-a; reporteria
  persistir/distribuir en BD; switches/controles optimistic; specs estabilizados
  (clicks atómicos, verificación de selección, regex-i). GATED (4) PARCIAL
  estructural → P4: QA-Lab escribe store legacy, páginas leen BD. Números:
  vitest 83/817, tsc 0, lint 0 errores, e2e no-GATED 15/15 specs. Lecciones:
  reiniciar dev tras regenerar cliente Prisma; no levantar servidor manual
  (dejar que Playwright lo gestione); next-server dev fuga ~700MB/h (reiniciar
  ante flakes por saturación); restore revive columna vieja (re-ALTER en receta).
  Receta reseed P2: restore P3 + ALTER rename + 2 seeds + punto-cero a A +
  higiene QA/TEST. Push: no (serie en curso).
- [2026-09-28] P3 HECHA (manual): change `e2e-rojos-flujo-a11y-smoke` válido
  (5 deltas: MP/EF/PE-bitacora/PE-proveedores/DEV-harness). ARRANQUE: mi
  primera corrida intercaló GATED (error mío: viola estrategia P1) → re-reseed
  + lane no-GATED 40 pass / 4 fail reales vs P2: TDZ `editandoProvId` en
  proveedores (crash al tipear RUT con lista no-vacía, fix: useState arriba);
  banner cookies tapaba trigger B de permisos (fix: setup verifica flag con
  reintento + evaluate-click en spec); leftovers TEST del backup (fix: script
  `e2e:higiene`, 34 filas) que rompían solicitudes (fila stale) y ocultaban
  los otros; conserjería flaky por re-mount skeleton (fix: tab controlado en
  bitácora + re-activación en spec, nivel P2 flaky→verde). Alcance: poblamiento
  ×2 independizados de QA-Lab (datos TEST propios vía API + cleanup; gap
  relato→P4), flujo/personas (botón renombrado + email único + cleanup),
  a11y 8/8 y smoke 8/8+desktop verdes SIN fix (null-guards bastaron). Números:
   vitest 83/817, tsc 0, lint 0 errores, lanes flujo+a11y+smoke 37/37 en una
   corrida. Push: no (serie en curso, archiva P4).
- [2026-09-29] P4 PARCIAL (manual): ARRANQUE OK (ahead 8 sin push = serie en
  curso; validate 37 pass/7 fail, los 7 sin-deltas pre-existentes incl.
  `roles-validacion-comunidad-a` por diseño; 3 changes serie + roles-specs-perfil
  válidos). Reseed sin restore (BD ya trae `rutComunidad`): `e2e:reseed-base` +
  `e2e:higiene -- --apply` (1 fila purgada), scope A verificado (admin-a última).
  Integral: vitest 83/817 (exit 1 solo por thresholds coverage pre-existentes:
  líneas 79.95% vs 90%, ramas 74.18% vs 75%), tsc 0, lint 0 errores, no-GATED
  89 pass/2 skip en una corrida, GATED 6 pass/4 fail (certificados, pagos, portal,
  remuneraciones). Gap GATED confirmado estructural con evidencia: QA-Lab puebla
  el store legacy (`save*` @deprecated fallback, `ensureHydrated`) mientras las
  páginas leen BD vía API REST → combos/cobros/publicaciones/botón vacíos. Fix
  real = migrar poblamiento QA-Lab a API (serie nueva, fuera del cap P4).
  Desviaciones: `e2e:full-orden` en vez de `npx playwright test` único (P1 lo
  prohíbe: GATED destruye seed); `npm test` exit 1 por coverage (no por tests).
  Sin checklist §4 del owner → NO archiva, NO pushea. Hereda a próxima serie:
  (1) migrar poblamiento QA-Lab fases FI/PL/CT/PI a API REST; (2) checklist §4
  manual 7 cuentas; (3) archivar `e2e-higiene-determinismo`, `e2e-rojos-crud`,
  `e2e-rojos-flujo-a11y-smoke`, `roles-specs-perfil`, `roles-validacion-comunidad-a`
  + nsgc-prepush + push (main ahead 8+1). Servidor dev queda vivo.
