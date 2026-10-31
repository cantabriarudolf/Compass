# Tasks: e2e-helper-datos-test

- [x] Reseed limpio (`e2e:reseed-base` + `e2e:higiene -- --apply`)
- [x] Relevar setup duplicado en los 5 specs (entidades, fondos/maestros, cleanups)
- [x] Crear `e2e/helpers/datos-test.ts` (crear/limpiar por entidad, RUT/DV, maestros + params legales)
- [x] Migrar `e2e/crud/pagos.spec.ts` + corrida verde
- [x] Migrar `e2e/crud/certificados.spec.ts` + corrida verde
- [x] Migrar `e2e/crud/portal.spec.ts` + corrida verde
- [x] Migrar `e2e/crud/remuneraciones.spec.ts` + corrida verde
- [x] Migrar `e2e/flujo/poblamiento.spec.ts` (MP/EF) + corrida verde
- [x] Change `e2e-helper-datos-test` (proposal + tasks + deltas, queda abierto)
- [x] Validar: 5 specs verdes + suite unit + tsc 0 + lint 0 errores + `openspec validate --all` + 0 residuos TEST en BD
- [x] Commit local sin push + fila P1 y Bitácora en `00-plan.md`
