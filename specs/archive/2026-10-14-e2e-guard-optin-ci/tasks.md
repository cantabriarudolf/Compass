# Tasks: e2e-guard-optin-ci

- [x] Change `e2e-guard-optin-ci` (proposal + design + tasks + delta `SG-hardening-despliegue`)
- [x] Tests rojos TDD en `test/env-guard.test.ts` (opt-in doble candado: 4 casos)
- [x] Implementación en `lib/env-guard.ts`: `E2E_ALLOW_WRITE_APIS=1` solo con
      `getAppEnv() === "development"`; doc comment del doble candado
- [x] CI: `E2E_ALLOW_WRITE_APIS: "1"` en el env del job `e2e` de
      `.github/workflows/ci.yml` con comentario (solo lane, y por qué); YAML validado
      con `python3 -c "import yaml; yaml.safe_load(...)"`
- [x] Docs: sección en `docs/runbook-operaciones.md` (opt-in solo pruebas/e2e;
      producción no debe setearlo)
- [x] Gates: `npx tsc --noEmit`, `npx vitest run test/env-guard.test.ts`,
      `npm test` (981+), `openspec validate --all`,
      `node openspec/scripts/check-delta-coverage.mjs e2e-guard-optin-ci`
- [x] e2e dirigida con paridad CI sobre base fresca descartable `perf-saneo.db`:
      `poblado-idempotente` + `ciclo` verdes con build de producción y el opt-in cableado
      (evidencia de camino bulk, no fallback)
- [x] **Desviación documentada**: la primera corrida quedó 9/11 con 2 fallos de firma
      DIFERENTE a la de CI (carreras de estado stale en los specs, expuestas por el
      camino bulk ~4s vs fallback ~60s): (a) tras "Limpiar y poblar", las aserciones
      matcheaban el estado STALE de la corrida 1 mientras `limpiar()` reseteaba el
      reporte en segundo plano; (b) el helper `clickPoblar` de `ciclo.spec.ts`
      auto-confirma el diálogo del guard y su detector de efecto se engaña con el
      "🟢 Listo" de la corrida 1. Fix mínimo en los specs (punto de sincronía
      tarjetas→0 + click crudo para la segunda corrida); re-corrida 11/11 verdes
      (4.9 min)
- [x] NO push en esta unidad (el orquestador agrupa el push de S1+S2)
