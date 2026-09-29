# Tasks: pi-api-portal

- [x] Reseed limpio + ARRANQUE P1 verificado (validate 38/7, portal verde 7/7) + fila P2 EN CURSO
- [x] Change `pi-api-portal` (proposal + tasks + deltas PI, queda abierto)
- [x] Routes `/api/publicaciones-portal` + `[id]` (factory, authz editar, 409 con leads)
- [x] Routes `/api/leads-portal` + `[id]` (POST custom con notify+evento, resto factory)
- [x] Hooks `use-publicaciones-portal` + `use-leads-portal` (espejo use-cobros-fi)
- [x] Migración `app/comunidad/portal/page.tsx` a hooks (UX y textos intactos)
- [x] Reescritura `e2e/crud/portal.spec.ts` patrón P3 (TEST vía API + cleanup, sin QA-Lab)
- [x] Tests `test/api/api-publicaciones-portal.test.ts` (CRUD, 401, 404 cross, leads POST)
- [x] Validar: spec portal + vecinos (certificados, pagos) + suite unit + tsc 0 + lint 0 + validate
- [x] Commit local sin push + fila P2 y Bitácora en `00-plan.md`
