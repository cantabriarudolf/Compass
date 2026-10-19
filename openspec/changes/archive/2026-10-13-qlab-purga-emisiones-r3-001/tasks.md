# Tasks: qlab-purga-emisiones-r3-001

- [x] Verificar diff del fix ya aplicado (route.ts + test) sin nada ajeno mezclado
- [x] Change `qlab-purga-emisiones-r3-001` (proposal + design + tasks + delta `LAB-mejoras`
      MODIFIED, nuevo escenario R3-001)
- [x] Gates: `npx tsc --noEmit` (0 errores), `npx vitest run test/api/qa-lab-purga.test.ts`
      (6/6), `npm test` completo (pisos de cobertura), `openspec validate --all`,
      `check-delta-coverage.mjs` (change + global)
- [x] e2e dirigida con paridad CI sobre base descartable fresca `perf-fix-r3001.db`:
      `poblado-idempotente.spec.ts` + `ciclo.spec.ts` verdes (build producción con
      `NEXT_PUBLIC_APP_ENV=development E2E_ALLOW_WRITE_APIS=1`, corrida `CI=1`)
- [x] `nsgc-prepush` si aplica (avance/manual solo si el cambio amerita docs)
- [x] Commit del fix + tests + change; push de `noche/serie-noche-2`; esperar CI del PR #1
- [x] Con CI verde: archive del change + `openspec validate --all` + commit docs + push
