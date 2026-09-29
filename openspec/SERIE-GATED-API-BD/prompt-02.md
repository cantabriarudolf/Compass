> **Este archivo ES tu prompt.** Ventana P2 de la serie GATED-API-BD.
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

## Arranque: verificación de P1 (antes de tu alcance)

1. `git status` (tree limpio salvo backups untracked) y `git status -sb` y `git log --oneline -8`.
2. `openspec validate --all` → contrastá con el número que P1 declaró.
3. Lee `00-plan.md`: fila P1 HECHA → ejecutá receta reseed y marcá tu fila
   EN CURSO. HECHA pero algo falla → ARREGLA primero (change fix pequeño + test),
   anótalo en la Bitácora, y solo después empieza tu alcance. PARCIAL → completa
   ESE alcance antes del tuyo. Nunca marques EN CURSO si P1 no está cerrada.

## Alcance P2 — API PI + migración portal

1. Partí de reseed limpio. Investiga primero (verifica, no asumas): por qué
   `e2e/crud/portal.spec.ts` falla aun cuando QA-Lab y la page usan el store
   (pistas: guard clean-first bloqueando "Poblar todo", `savePublicacionPortal`
   retornando !ok, unidades BD vs store). Si el fix es solo-spec, aplícalo y
   achica el alcance; si no, sigue al paso 2.
2. Crea API PI con el contrato canónico (`withComunidadScope`, crud-factory o
   put-merge si el schema lleva refine, authz editar, 404 cross-comunidad):
   routes `/api/publicaciones-portal` (+ `/api/leads-portal` si el spec lo exige;
   si no, NO lo toques) + hooks SWR en `lib/api/` (espejo de `use-cobros-fi.ts`).
   Solo migración Prisma si hay desajuste de campos vs `lib/schemas.ts`.
3. Migra `app/comunidad/portal/page.tsx` de `useCompassStore` a los hooks
   (publicaciones/leads; personas/vínculos/unidades ya vienen de API). Mantén
   UX y textos (los specs asertan "E-999", "venta", "Retirada"/"Activa").
4. Reescribe `e2e/crud/portal.spec.ts` patrón P3: publicación TEST vía API +
   cleanup, sin QA-Lab. Tests unitarios del hook/route si aportan (sigue el
   estándar del repo: `test/api/*.test.ts`).
5. Change openspec `pi-api-portal` (propose → apply → abierto, archiva P5) con
   deltas PI. Valida: spec portal verde + suite unit completa + tsc 0 + lint
   0 errores + validate. No rompas specs vecinos (portal comparte unidades con
   certificados/pagos: corre esos 2 también).
6. Commit (conventional español), sin push. Actualiza fila P2 y Bitácora.

## Reporte final estandarizado (OBLIGATORIO)

1. Ventana y estado (HECHA/PARCIAL + motivo). 2. Commits (hash + subject) y push sí/no.
3. Specs creadas/modificadas + changes archivados. 4. Números finales: STORE_VERSION,
   GATED x/y, unit x/y, tsc/eslint OK. 5. Desviaciones vs el prompt.
6. Pendientes fuera de la serie (decisiones del owner).
7. Última línea exacta: `BITACORA_ENTRY: <resumen 2-3 líneas>`.
