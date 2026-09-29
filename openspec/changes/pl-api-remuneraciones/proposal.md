# Proposal: pl-api-remuneraciones (SERIE-GATED-API-BD P3)

## Problema
El GATED `remuneraciones` es el único rojo restante (P1 dejó FI/CT verdes,
P2 portal+vecinos verdes). Causa verificada en P3 sobre reseed limpio, no
asumida — doble desajuste store-vs-API:
1. La page `/finanzas/remuneraciones` lee personas/config/maestros vía API
   (BD) pero `liquidacionesPL`/`adelantosPL` del store, mientras QA-Lab
   "Poblar todo" escribe el store. El trabajador "TEST Persona QA Uno" que el
   spec busca en el combo nunca aparece (vive en el store, el combo lee la API).
2. Los trabajadores del seed con ficha (p-4/p-5/p-9) traen ficha legacy sin
   `sueldoBase`/`afpId`/`saludId`: aunque se seleccionen, el preview es nulo y
   `generarLiquidacionPL` retorna "no registra sueldo base contractual".
Resultado: combo sin opción TEST seleccionable → botón "Generar liquidación
(borrador)" (`disabled={!trabajadorId}`) queda deshabilitado → spec rojo.
Un fix solo-spec es imposible: sin API no hay forma de poner una ficha con
sueldo base visible para la page. Se sigue al paso 2 del prompt P3.

## Propuesta
API PL con el contrato canónico + migración de la page + spec independizado:
- `POST /api/liquidaciones` custom "generar": valida input, trabajador con
  ficha y sueldo base (404 cross-comunidad), FKs legales MA (400), parámetros
  CF (400 "CF no cargado"), duplicado trabajador+periodo (409); calcula vía
  `pl-utils` (puro, server-safe), folio LIQ- correlativo, vínculo a proyección
  PE si existe, evento `PL_GENERATE_PAYSLIP`. 201 al alta.
- `POST /api/liquidaciones/[id]/confirmar` custom: solo borrador (400 si no),
  fondo GC activo (400 si no), crea el egreso FI categoría sueldos (folio FE-
  correlativo, validado con `EgresoFISchema`), marca adelantos pendientes
  vinculados como descontados, evento `PL_EXPENSE_SYNC`. 200.
- `GET /api/liquidaciones` + `[id]` (GET_ONE/DELETE) vía crud-factory
  (`LiquidacionPLSchema`, 404 cross-comunidad). Sin PUT: el snapshot es
  inmutable por diseño (paridad con el schema y el store, que no tiene editar).
  DELETE con guard `beforeDelete`: solo borrador sin egreso (409 si no).
- Authz: `puede(rol, accion, "pl")` en todo (solo administración; la page ya es
  `roles: ["administrador"]` en el sidebar). `pl:propia` (conserjería ve la
  suya) queda para post-serie: requiere filtro ABAC por personaId fuera del
  alcance P3.
- Sin migración Prisma (campos 1:1 con `LiquidacionPL`; `bonos`/`adelantosIds`
  como Json, igual que el seed).
- Hook `use-liquidaciones` (lectura/remove vía `useCrudCollection` +
  `generar`/`confirmar` vía `postAccion`) + migración de
  `app/finanzas/remuneraciones/page.tsx` (UX y textos intactos: "Borrador",
  "Confirmada", "LIQ-", folios). El preview del cálculo sigue client-side
  (`calcularLiquidacion` puro); el servidor recalcula y manda (nunca confía en
  totales del cliente).
- Reescritura `e2e/crud/remuneraciones.spec.ts` patrón P3: trabajador TEST con
  ficha completa vía POST `/api/personas` (FKs desde `/api/maestros/*`) +
  params CF vía PUT `/api/configuracion` + liquidación vía UI + cleanup
  (DELETE liquidaciones TEST + egreso espejo + persona), sin QA-Lab.
- Tests `test/api/api-liquidaciones.test.ts` (generar 201 + BD, 401, 403
  residente, 404 cross, 409 duplicado, 400 sin CF, confirmar 200 + egreso +
  evento, confirmar repetida 400, DELETE confirmada 409).
- El change queda abierto (lo archiva P5).

## Alcance
- `app/api/liquidaciones/**`
- `lib/api/use-liquidaciones.ts`
- `app/finanzas/remuneraciones/page.tsx`, `e2e/crud/remuneraciones.spec.ts`
- `test/api/api-liquidaciones.test.ts`
- Deltas en spec PL-liquidaciones-remuneraciones (este change)

## No-alcance (documentado, no olvidado)
- `/api/adelantos`: el spec GATED no lo ejercita (prompt P3: si no lo exige,
  no tocarlo). La pestaña Adelantos y el preview de anticipos siguen en el
  store legacy; `generar` server-side lee adelantos pendientes de BD (vacíos
  sin API que los cree) y `confirmar` descuenta los vinculados (lista vacía en
  la práctica). P4/futuro decide si adelantos merece API.
