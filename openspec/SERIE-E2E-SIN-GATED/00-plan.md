# Serie E2E-SIN-GATED — Plan y Estado Canónico

> Toda ventana DEBE leer este archivo al iniciar (bloque ARRANQUE en P2),
> marcar su fila EN CURSO y actualizarla antes del push final. La Bitácora es
> el registro durable. La verdad es el repo, no los chats.

| Ventana | Alcance | Estado | Commit final |
| --- | --- | --- | --- |
| P1 | Helper `e2e/helpers/datos-test.ts` + migrar los 5 specs con setup API propio (pagos, certificados, portal, remuneraciones, poblamiento) | HECHA | `e4c2a10` |
| P2 | Quitar tag GATED + scripts + CI a corrida única con seed completo + verificación verde | HECHA | `b7e88a8` |

MÁXIMO: 2 ventanas. Post-serie (fuera): checklist §4 owner + archivo de 9+4
changes + push a main + GATED-API-BD y VALIDACION-PERFILES COMPLETAS;
super-admin global, migración SQLite→PostgreSQL, resto de BACKLOG-100.

## Base de hechos (leer antes de cada ventana)

- Estado heredado GATED-API-BD P5 PARCIAL (`8954070` + avance `913093f`,
  resguardo remoto `resguardo/serie-gated-api-bd`, main local ahead 19 sin
  push a main): STORE_VERSION 28 · unit 85/835 · tsc 0 · lint 0 errores ·
  no-GATED 88/89+2 skip · GATED 4/4 (4 tests en 4 archivos) · validate 41/7
  sin-deltas pre-existentes.
- Los 5 specs con setup API propio duplicado (`page.request.post` + cleanup
  inline): `e2e/crud/pagos|certificados|portal|remuneraciones.spec.ts`,
  `e2e/flujo/poblamiento.spec.ts`. NO existe `e2e/helpers/` (verificar).
- El tag GATED está vacío de significado: los 4 tests arman y limpian su
  propio dato TEST vía API, ya son independientes del orden. Scripts
  `e2e:nongated`, `e2e:gated`, `e2e:full-orden` en
  `k0mp4ss_fe/apps/web/package.json` (verificar otros consumidores antes de
  borrar).
- CI (`.github/workflows/ci.yml`, job `e2e`): corrida única
  `npx playwright test`, timeout 25 min, BD desde cero con SOLO `seed:authz`
  (sin `seed:mocks` — verificar qué specs exigen datos mock). Job
  `e2e-rate-limit` aislado: NO tocar. Job `deploy` a Vercel en main: NO tocar.
- Lanes que NO se unifican (decisión de diseño): `ciclo` testea la herramienta
  QA-Lab, `poblamiento` la coherencia de datos, `crud` los módulos. Solo se
  unifica el setup duplicado y se elimina el tag.
- Reglas permanentes: dato de dominio solo vía API REST con scope `comunidadId`
  (`withComunidadScope`); mocks de `data/` son solo seed; D1 media por
  referencia; secretos jamás en localStorage ni código; cada cambio de esquema
  Prisma = migración + tests. Terminología RG §4: "comunidad".
- Cuentas TEST (`Test1234!`, comunidad-a): 7 cuentas `*@test.cl`. Seed:
  `npm run e2e:reseed-base` + `e2e:higiene -- --apply`. Comandos con
  `workdir k0mp4ss_fe/apps/web`. Playwright gestiona el dev server.
- Changes abiertos al inicio: `e2e-gated-fi-ct-api`, `pi-api-portal`,
  `pl-api-remuneraciones`, `qa-lab-poblar-api` (serie GATED-API-BD) +
  `e2e-higiene-determinismo`, `e2e-rojos-crud`, `e2e-rojos-flujo-a11y-smoke`,
  `roles-specs-perfil`, `roles-validacion-comunidad-a` (sin deltas por diseño).
  Esta serie suma su change y NO archiva ninguno (archiva el cierre con checklist).

## Bitácora

- [2026-09-30] Serie materializada por orquestador (2 ventanas, cap duro). Base:
  GATED-API-BD P5 PARCIAL con resguardo remoto. Objetivo: eliminar la
  complejidad de orden (helper + fin del tag) dejando los lanes intactos.
- [2026-10-03] P1 HECHA: helper `e2e/helpers/datos-test.ts` (crear/limpiar por
  entidad, RUT/DV, maestros + params legales) + 5 specs migrados con corridas
  verdes individuales (pagos, certificados, portal, remuneraciones,
  poblamiento MP/EF; master QA-Lab intacto). Change `e2e-helper-datos-test`
  abierto con 6 deltas. Validación: unit 85/835, tsc 0, lint 0 errores,
  validate 42/7 (7 sin-deltas pre-existentes), 0 residuos TEST en BD (5 filas
  QA-Lab del master purgadas vía higiene). Sin push (commit `e4c2a10`).
- [2026-10-03] P2 HECHA: tag `(GATED)` eliminado de los 4 describes +
  scripts `e2e:nongated/gated/full-orden` eliminados (`test:e2e` alias
  canónico; CI ya usaba `npx playwright test` directo) + CI job `e2e` con
  seed completo `e2e:reseed-base` y timeout 25→60 min (rate-limit y deploy
  intactos). Interferencia real hallada y reparada sin tag: `personas.spec`
  (nombre fijo → confirm D5; nombre único + fallback por email) y
  `admin-maestros.spec` (re-submit duplicaba fila; un envío + cleanup API).
  Confirmatoria secuencial (paridad CI): 93 passed + 2 skipped, 0 failed.
  Change `e2e-fin-gated` abierto (skip_specs). Validación: unit 85/835, tsc 0,
  lint 0, validate 43/7 (7 sin-deltas pre-existentes), 0 residuos TEST.
  Sin push.
- [2026-10-05] CIERRE: archivados `e2e-helper-datos-test` (6 deltas → mains
  FI/CT/PI/PL/MP/EF vía `openspec archive`; `sdd-archive-compose` inexistente
  en gentle-ai 4.0.0, documentado) y `e2e-fin-gated` (skip_specs, vía worker
  + git mv con diff-r vacío). Validate 41/7 (mismos 7 pre-existentes).
  Commit `3a9ec35`. SERIE COMPLETA 2/2 — resto post-serie en manos del owner
  (otros changes abiertos, push a main, GATED-API-BD/VALIDACION-PERFILES).
