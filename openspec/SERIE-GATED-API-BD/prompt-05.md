> **Este archivo ES tu prompt.** Ventana P5 de la serie GATED-API-BD (cierre).
> Léelo completo (incluido `00-plan.md` de la serie) y ejecuta sus bloques en orden.

## Contexto común (válido para TODA la serie GATED-API-BD)

Estado previo: E2E-FULL-VERDE P4 PARCIAL — STORE_VERSION 28, vitest 83/817,
tsc 0, lint 0 errores, no-GATED 89/2 skip, GATED 6/4 fail (certificados, pagos,
portal, remuneraciones); main ahead 9 sin push. Diagnóstico verificado P4:
páginas FI/CT leen BD vía API, portal y remuneraciones leen el store, QA-Lab
pobla el store. Schema Prisma ya trae PublicacionPortal/LeadPortal/
LiquidacionPL/AdelantoPL. Changes abiertos: `e2e-higiene-determinismo`,
`e2e-rojos-crud`, `e2e-rojos-flujo-a11y-smoke`, `roles-specs-perfil`,
`roles-validacion-comunidad-a` (sin deltas por diseño).
Método del proyecto: por cada cambio → openspec-propose → implementar con
openspec-apply-change → validar → commitear (conventional español) → sincronizar
specs mains y archivar con openspec-archive-change → skill nsgc-prepush antes de
cualquier push.
Reglas permanentes: dato de dominio solo vía API REST con scope `comunidadId`
(`withComunidadScope`: última membresía, take:1, sin override); mocks de `data/`
son solo seed; D1 media por referencia (sin base64/Blob); secretos jamás en
localStorage ni código; cada cambio de esquema Prisma = migración + tests.
Terminología RG §4: "comunidad" (nunca "condominio").
Cuentas TEST (password universal `Test1234!`, 2FA off, comunidad `comunidad-a`):
`admin/comite/conserjeria/residente/mantencion/arrendatario@test.cl`.
Seed reproducible: `npm run e2e:reseed-base` + `npm run e2e:higiene -- --apply`
(receta P1 E2E, sin pasos manuales; scope A = admin-a última membresía).
Estrategia GATED vigente: orden no-GATED→GATED (`e2e:full-orden`), convención
TEST-*/cleanup. Servidor dev: `http://localhost:3000` (dejar que Playwright lo
gestione; no levantar manual). Comandos con `workdir k0mp4ss_fe/apps/web`.
`next build` puede fallar por red (Google Fonts): ignóralo salvo ventana de deploy.
Si tu contexto se agota: cierra la tarea en curso + commit + deja el estado exacto
en `openspec/SERIE-GATED-API-BD/00-plan.md`.

## Arranque: verificación de P4 (antes de tu alcance)

1. `git status` (tree limpio salvo backups untracked) y `git status -sb` y `git log --oneline -8`.
2. `openspec validate --all` → contrastá con el número que P4 declaró.
3. Lee `00-plan.md`: fila P4 HECHA → ejecutá receta reseed y marcá tu fila
   EN CURSO. HECHA pero algo falla → ARREGLA primero (change fix pequeño + test),
   anótalo en la Bitácora, y solo después empieza tu alcance. PARCIAL → completa
   ESE alcance antes del tuyo. Nunca marques EN CURSO si P4 no está cerrada.

## Alcance P5 — Integral y cierre de ambas series

1. Partí de reseed limpio P1. Corre TODO con servidor dev vivo: `npm test`
   (unit completa; el exit 1 por thresholds de coverage es pre-existente —
   reporta tests x/y, no pelees los thresholds) + `npx tsc --noEmit` + lint +
   `npm run e2e:full-orden` (NO un único `playwright test`: GATED destruye el
   seed, estrategia P1 E2E) + `openspec validate --all`.
2. Checklist manual §4 de `openspec/changes/roles-validacion-comunidad-a/cuentas-funcionales.md`:
   pídeselo al owner (ojos humanos, ~15 min, las 7 cuentas). El owner dijo en P4
   E2E que lo haría — pedí confirmación explícita y citala en la Bitácora. Sin
   su OK, la serie NO se declara completa: marca PARCIAL y hereda el pendiente
   con nombre y apellido (no archivar, no pushear).
3. Si todo verde + checklist OK: archiva los changes (`e2e-higiene-determinismo`,
   `e2e-rojos-crud`, `e2e-rojos-flujo-a11y-smoke`, `e2e-gated-fi-ct-api`,
   `pi-api-portal`, `pl-api-remuneraciones`, `qa-lab-poblar-api`,
   `roles-specs-perfil`, `roles-validacion-comunidad-a`) tras CI verde local,
   sincroniza specs mains, actualiza fila P5 y Bitácora.
4. nsgc-prepush (skill obligatoria antes de pushear) + push. Marca GATED-API-BD
   COMPLETA en `00-plan.md` y VALIDACION-PERFILES COMPLETA en su `00-plan.md`.
   Apaga el dev server post-ventana solo si el owner ya no lo necesita.

## Reporte final estandarizado (OBLIGATORIO)

1. Ventana y estado (HECHA/PARCIAL + motivo). 2. Commits (hash + subject) y push sí/no.
3. Specs creadas/modificadas + changes archivados. 4. Números finales: STORE_VERSION,
   unit X/Y, e2e X/Y, tsc/eslint OK. 5. Desviaciones vs el prompt.
6. Pendientes fuera de la serie (decisiones del owner).
7. Última línea exacta: `BITACORA_ENTRY: <resumen 2-3 líneas>`.
