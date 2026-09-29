> **Este archivo ES tu prompt.** Ventana P1 de la serie GATED-API-BD.
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

## Alcance P1 — GATED FI/CT vía API (sin cambios de app)

Eres la primera ventana: marca tu fila EN CURSO en `00-plan.md`.

1. Partí de reseed limpio (`e2e:reseed-base` + `e2e:higiene -- --apply`).
2. Reescribe `e2e/crud/pagos.spec.ts` y `e2e/crud/certificados.spec.ts` con el
   patrón P3 (datos TEST propios vía API + cleanup, sin QA-Lab "Poblar todo"):
   - pagos: unidad TEST vía POST `/api/unidades` + cobro pendiente TEST vía POST
     `/api/cobros-fi` (upsert por factory; si POST rechaza id pre-generado usa el
     patrón PUT-vs-POST de P2 E2E) + cleanup DELETE al final. Fondo: usa uno del
     seed vía GET `/api/fondos-fi`. Elimina el fallback de inyección localStorage.
   - certificados residencia: persona + unidad + vínculo activo TEST vía POST a
     `/api/personas`, `/api/unidades`, `/api/vinculos` + cleanup. El resto del
     flujo (generar PDF, folio CT-, historial, VC-) queda igual.
3. Change openspec `e2e-gated-fi-ct-api` (propose → apply → queda abierto, lo
   archiva P5) con deltas en los specs e2e que correspondan.
4. Valida: ambos specs verdes en lane GATED (`npx playwright test --grep GATED`
   filtrando esos archivos basta para tu alcance, pero corre el lane GATED
   completo y reporta el estado de los 4: tus 2 deben estar verdes, portal y
   remuneraciones quedan rojos heredados a P2/P3) + `npx tsc --noEmit` + lint
   0 errores + `openspec validate --all` (37 pass / 7 sin-deltas pre-existentes).
   No rompas el lane no-GATED (spot-check: 2-3 specs vecinos si tocaste helpers).
5. Commit (conventional español), sin push (serie en curso). Actualiza fila P1 y
   Bitácora en `00-plan.md`.

## Reporte final estandarizado (OBLIGATORIO)

1. Ventana y estado (HECHA/PARCIAL + motivo). 2. Commits (hash + subject) y push sí/no.
3. Specs creadas/modificadas + changes archivados. 4. Números finales: STORE_VERSION,
   GATED x/y, tsc/eslint OK. 5. Desviaciones vs el prompt.
6. Pendientes fuera de la serie (decisiones del owner).
7. Última línea exacta: `BITACORA_ENTRY: <resumen 2-3 líneas>`.
