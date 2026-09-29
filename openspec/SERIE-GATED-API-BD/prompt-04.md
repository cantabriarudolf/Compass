> **Este archivo ES tu prompt.** Ventana P4 de la serie GATED-API-BD.
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

## Arranque: verificación de P3 (antes de tu alcance)

1. `git status` (tree limpio salvo backups untracked) y `git status -sb` y `git log --oneline -8`.
2. `openspec validate --all` → contrastá con el número que P3 declaró.
3. Lee `00-plan.md`: fila P3 HECHA → ejecutá receta reseed y marcá tu fila
   EN CURSO. HECHA pero algo falla → ARREGLA primero (change fix pequeño + test),
   anótalo en la Bitácora, y solo después empieza tu alcance. PARCIAL → completa
   ESE alcance antes del tuyo. Nunca marques EN CURSO si P3 no está cerrada.

## Alcance P4 — QA-Lab coherente + lane GATED verde

1. Partí de reseed limpio. Con PI/PL ya en API (P2/P3), deja QA-Lab coherente:
   las fases "Poblar todo" que escribían publicaciones/leads/liquidaciones/
   adelantos al store deben poblar vía API REST (o marcarse legacy con motivo
   documentado si alguna fase no tiene contraparte API — decide y documenta en
   el change, sin dejar botones que mientan). El guard clean-first y
   `tieneDatosTest`/higiene deben seguir cubriendo ambos mundos (store + BD).
2. Change openspec `qa-lab-poblar-api` (propose → apply → abierto, archiva P5;
   si no tocaste app y solo specs/higiene, usa un change fix pequeño igual por
   método). Actualiza el manual QA-Lab en `Data/NSGC/docs/manuales/` si cambió
   el comportamiento de "Poblar todo".
3. Corre el lane GATED completo (`e2e:full-orden` entero o al menos el lane
   GATED tras reseed): objetivo 10/10 (los 10 tests GATED: 6 viejos + 4
   independizados). Si algún GATED no-PI/PL falla, arréglalo (es tu alcance);
   si falla algo no-GATED que P1–P3 dejaron verde, repara primero por ARRANQUE.
4. Valida: GATED 10/10 + unit completa + tsc 0 + lint 0 errores + validate.
5. Commit (conventional español), sin push. Actualiza fila P4 y Bitácora con los
   números del lane.

## Reporte final estandarizado (OBLIGATORIO)

1. Ventana y estado (HECHA/PARCIAL + motivo). 2. Commits (hash + subject) y push sí/no.
3. Specs creadas/modificadas + changes archivados. 4. Números finales: STORE_VERSION,
   GATED x/y, unit x/y, tsc/eslint OK. 5. Desviaciones vs el prompt.
6. Pendientes fuera de la serie (decisiones del owner).
7. Última línea exacta: `BITACORA_ENTRY: <resumen 2-3 líneas>`.
