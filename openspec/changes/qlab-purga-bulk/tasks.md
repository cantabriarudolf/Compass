# Tasks: qlab-purga-bulk

- [ ] Change `qlab-purga-bulk` (proposal + design + tasks + delta `LAB-mejoras`)
- [ ] Test rojo `test/api/qa-lab-purga.test.ts` (TDD, BD real): 401/404/403/200/conteos/
      idempotencia/no-borra-reales
- [ ] Endpoint `app/api/qa-lab/purga-test/route.ts`: guard + scope + authz + purge bulk
      hijos→padres con `{ borrados, bloqueos }`
- [ ] `limpiar()` (`app/admin/qa-lab/page.tsx`): endpoint bulk como camino principal, bucle
      por entidad como fallback documentado, mensajes intactos
- [ ] Re-endurecer limpiezas de cola: `e2e/crud/poblado-idempotente.spec.ts` y
      `e2e/flujo/ciclo.spec.ts` a strict 120 s (quitar best-effort + comentario deuda)
- [ ] Gates: `npx tsc --noEmit`, `npm test` (975+ verdes, pisos por área),
      `openspec validate --all`, `check-delta-coverage.mjs qlab-purga-bulk`
- [ ] e2e dirigida con paridad CI sobre base fresca: `poblado-idempotente` + `ciclo` +
      `poblamiento` verdes sin flaky
- [ ] Medir tiempo de purga antes/después (evidencia del O(1))
- [ ] `nsgc-prepush`: avance + sección de purga en `34 - Historia de Poblamiento - Relato de Uso.md`
- [ ] Fila P1 del plan a HECHA + Bitácora + `BACKLOG-100.md` (fila `qlab-purga-bulk` → ✅ HECHA)
