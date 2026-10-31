# Tasks: qlab-purga-bulk

- [x] Change `qlab-purga-bulk` (proposal + design + tasks + delta `LAB-mejoras`)
- [x] Test rojo `test/api/qa-lab-purga.test.ts` (TDD, BD real): 401/404/403/200/conteos/
      idempotencia/no-borra-reales
- [x] Endpoint `app/api/qa-lab/purga-test/route.ts`: guard + scope + authz + purge bulk
      hijos→padres con `{ borrados, bloqueos }`
- [x] `limpiar()` (`app/admin/qa-lab/page.tsx`): endpoint bulk como camino principal, bucle
      por entidad como fallback documentado, mensajes intactos
- [x] Re-endurecer limpiezas de cola: `e2e/crud/poblado-idempotente.spec.ts` y
      `e2e/flujo/ciclo.spec.ts` a strict 120 s (quitar best-effort + comentario deuda)
- [x] Gates: `npx tsc --noEmit`, `npm test` (981+ verdes, pisos por área),
      `openspec validate --all`, `check-delta-coverage.mjs qlab-purga-bulk`
- [x] e2e dirigida con paridad CI sobre base fresca: `poblado-idempotente` + `ciclo` +
      `poblamiento` verdes sin flaky (14/14 en 2.7 min)
- [x] Medir tiempo de purga antes/después: 59.011 ms/63 requests → 3.917 ms/1 request
      (server-side 916 ms; guion ad-hoc en /tmp, fuera del repo)
- [x] `nsgc-prepush`: avance + sección de purga en `34 - Historia de Poblamiento - Relato de Uso.md`
- [x] Fila P1 del plan a HECHA + Bitácora + `BACKLOG-100.md` (fila `qlab-purga-bulk` → ✅ HECHA)
