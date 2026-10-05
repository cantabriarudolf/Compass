# Tasks: pl-api-remuneraciones

- [x] Reseed limpio + ARRANQUE P2 verificado (validate 39/7, portal+vecinos verdes) + fila P3 EN CURSO
- [x] Change `pl-api-remuneraciones` (proposal + tasks + deltas PL, queda abierto)
- [x] Investigación causa raíz (doble desajuste store-vs-API + ficha seed sin sueldoBase; fix solo-spec imposible)
- [x] Routes `/api/liquidaciones` (GET factory + POST generar custom con cálculo server-side)
- [x] Route `/api/liquidaciones/[id]` (GET_ONE/DELETE factory con guard borrador; sin PUT)
- [x] Route `/api/liquidaciones/[id]/confirmar` (POST custom con egreso FI espejo + evento)
- [x] Hook `use-liquidaciones` (lectura/remove + generar/confirmar vía postAccion)
- [x] Migración `app/finanzas/remuneraciones/page.tsx` a hook (UX y textos intactos)
- [x] Reescritura `e2e/crud/remuneraciones.spec.ts` patrón P3 (trabajador TEST vía API + cleanup, sin QA-Lab)
- [x] Tests `test/api/api-liquidaciones.test.ts` (CRUD, 401/403/404/409/400, confirmar + egreso)
- [x] Validar: specs remuneraciones + pagos + certificados + suite unit + tsc 0 + lint 0 + validate
- [x] Commit local sin push + fila P3 y Bitácora en `00-plan.md`
