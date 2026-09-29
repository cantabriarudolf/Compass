# Tasks: e2e-gated-fi-ct-api

- [x] Reseed limpio (`e2e:reseed-base` + `e2e:higiene -- --apply`)
- [x] Reescribir `e2e/crud/pagos.spec.ts` (setup TEST vía API + cleanup, sin QA-Lab ni localStorage)
- [x] Reescribir `e2e/crud/certificados.spec.ts` (trío TEST vía API + cleanup ordenado)
- [x] Change `e2e-gated-fi-ct-api` (proposal + tasks + deltas FI/CT, queda abierto)
- [x] Validar: lane GATED 3/4 (pagos+certificados+portal verdes, remuneraciones rojo heredado a P3) + spot-check no-GATED 2/2 + tsc 0 + lint 0 errores + `openspec validate --all` (38 pass / 7 sin-deltas pre-existentes, change propio OK)
- [x] Commit local sin push + fila P1 y Bitácora en `00-plan.md`
