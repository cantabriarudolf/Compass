# Tasks: au-google-provider-disabled

- [x] Change `au-google-provider-disabled` (proposal + design + tasks + delta `AU-autenticacion-sesion`)
- [x] Tests TDD **rojos primero** en `test/auth-google-provider.test.ts` (3/6 rojos
      previos: bandera → no lanza + provider ausente; sin bandera → lanza nombrando
      la bandera; bandera con credenciales presentes → sin Google)
- [x] Implementación en `lib/auth.ts`: const `googleProviderDisabled = GOOGLE_PROVIDER_DISABLED === "1"`
      → (a) fail-fast condicionado a `!googleProviderDisabled` y (b) `Google(...)`
      fuera del array de providers vía spread; mensaje de error nombra la bandera
- [x] Docs: `.env.example` (junto a `GOOGLE_CLIENT_ID`/`SECRET`) +
      `docs/runbook-operaciones.md` (escenario "Build sin credenciales Google")
- [x] Delta `AU-autenticacion-sesion`: `MODIFIED` requirement scaffold (mensaje nuevo +
      salvo-clause) + `ADDED` requirement de la bandera
- [x] **Trap 3 (`CONVENCION-DELTAS`)**: el `MODIFIED` del mismo requirement en
      `au-google-sso` se sincroniza (misma prosa, unión de 13 escenarios) para que el
      último archive no borre la prosa de la bandera
- [x] Gates: `npx tsc --noEmit` (0) · `npx vitest run test/auth-google-provider.test.ts` (6/6) ·
      `npm test` completo · `openspec validate --all` ·
      `node openspec/scripts/check-delta-coverage.mjs au-google-provider-disabled`
- [x] NO push en esta unidad (el orquestador agrupa el push + CI + archive)
