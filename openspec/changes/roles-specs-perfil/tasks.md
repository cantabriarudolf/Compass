# Tasks: roles-specs-perfil

- [x] Change `roles-specs-perfil` (proposal + design + tasks mínimos + delta GD)
- [x] `e2e/auth.setup.ts`: 6ta sesión `arrendatario@test.cl → e2e/.auth/arrendatario.json`
- [x] `e2e/auth/roles-accesos.spec.ts`: entrada MATRIZ arrendatario + describe con 403
- [x] `e2e/crud/maestros-datos.spec.ts`: 8 subtabs con datos + 1 `TEST-*`
- [x] `e2e/crud/residente-ficha.spec.ts`: ficha p-3 + reserva RA + certificado CT
- [x] `e2e/crud/arrendatario-limite.spec.ts`: ficha/unidad propias + límite finanzas
- [x] `e2e/crud/abac-denegacion.spec.ts`: filtrado colección + 403 detalle ajeno + 403 admin
- [x] Fix ARRANQUE (rojo P1): null-guard `datosGobernanza/datosLaborales` en `/admin/gestion` + orden seed admin-a última (scope A)
- [x] Verde: nuevos specs + lane auth + `npx tsc --noEmit` + lint + `openspec validate roles-specs-perfil`
- [ ] Commit (conventional español) + fila P2 y Bitácora en `00-plan.md`
