> **Este archivo ES tu prompt.** Ventana P3 de la serie GATED-API-BD.
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

## Arranque: verificación de P2 (antes de tu alcance)

1. `git status` (tree limpio salvo backups untracked) y `git status -sb` y `git log --oneline -8`.
2. `openspec validate --all` → contrastá con el número que P2 declaró.
3. Lee `00-plan.md`: fila P2 HECHA → ejecutá receta reseed y marcá tu fila
   EN CURSO. HECHA pero algo falla → ARREGLA primero (change fix pequeño + test),
   anótalo en la Bitácora, y solo después empieza tu alcance. PARCIAL → completa
   ESE alcance antes del tuyo. Nunca marques EN CURSO si P2 no está cerrada.

## Alcance P3 — API PL + migración remuneraciones

1. Partí de reseed limpio. Investiga primero (verifica, no asumas): por qué
   `e2e/crud/remuneraciones.spec.ts` deja "Generar liquidación (borrador)"
   deshabilitado tras poblar (pistas: combo "Trabajador con ficha PE" sin
   opciones — la ficha viene de `usePersonas` API —, `paramsLegalesCargados`
   falso, preview nulo por `sueldoBase` 0). Si el fix es solo-spec, aplícalo y
   achica el alcance; si no, sigue al paso 2.
2. Crea API PL con el contrato canónico (`withComunidadScope`, authz editar,
   404 cross-comunidad): routes `/api/liquidaciones` (+ `/api/adelantos` si el
   spec lo exige; si no, NO lo toques) + hooks SWR en `lib/api/`. Solo migración
   Prisma si hay desajuste de campos vs `lib/schemas.ts`. Ojo con la lógica de
   negocio: `generarLiquidacionPL`/`confirmarLiquidacionPL` del store (folio
   LIQ-, cálculo vía `pl-utils`, egreso espejo en FI) debe preservarse —
   decide dónde vive (server vs cliente) y documentalo en el change.
3. Migra `app/finanzas/remuneraciones/page.tsx` de `useCompassStore` a los hooks
   (liquidaciones/adelantos; personas/maestros/config ya vienen de API). Mantén
   UX y textos (el spec aserta "Borrador", "Confirmada", "LIQ-", folios).
   Actualiza el TODO "EXCEPCIÓN P5" de la page si lo resuelves.
4. Reescribe `e2e/crud/remuneraciones.spec.ts` patrón P3: trabajador TEST con
   ficha (vía API personas) + liquidación vía UI + cleanup, sin QA-Lab. Tests
   unitarios del hook/route si aportan (`test/api/*.test.ts`).
5. Change openspec `pl-api-remuneraciones` (propose → apply → abierto, archiva P5)
   con deltas PL. Valida: spec remuneraciones verde + suite unit completa +
   tsc 0 + lint 0 errores + validate. Corre también pagos + certificados
   (comparten FI/personas).
6. Commit (conventional español), sin push. Actualiza fila P3 y Bitácora.

## Reporte final estandarizado (OBLIGATORIO)

1. Ventana y estado (HECHA/PARCIAL + motivo). 2. Commits (hash + subject) y push sí/no.
3. Specs creadas/modificadas + changes archivados. 4. Números finales: STORE_VERSION,
   GATED x/y, unit x/y, tsc/eslint OK. 5. Desviaciones vs el prompt.
6. Pendientes fuera de la serie (decisiones del owner).
7. Última línea exacta: `BITACORA_ENTRY: <resumen 2-3 líneas>`.
