# Change: revision-estabilizacion

## Why

Ventana P1 de la serie SERIE-REVISION (estabilización express). Estado previo: 515/516 unit tests (1 roto en RA), 43 warnings de lint (0 errores) y duda sobre estabilidad del test PE `pe-panels.test.tsx` (flaky histórico con `pointer-events: none`). El objetivo es dejar todo verde y limpio antes de las ventanas de revisión profunda (P2–P5).

El test roto `cancelación anticipada sin penalización` (test/store-reservas.test.ts:188) falla porque la fecha hardcodeada del helper `reservaBase` (`2026-09-10`) envejeció: hoy (2026-09-08) faltan exactamente 2 días, dentro de la ventana `cancelacionTardiaDias: 2` del elemento del test, por lo que el store correctamente marca `tardia: true` (comportamiento conforme al spec RA: tardía si faltan ≤ `cancelacionTardiaDias` días). El bug está en el test, no en el store ni en el spec: la regla de negocio ya está especificada en `openspec/specs/RA-reservas-amenities/spec.md` ("holgura mayor a la ventana de tardía" → `tardia:false`).

## What Changes

- **Test RA corregido**: el caso `cancelación anticipada sin penalización` usa una fecha dinámica a +30 días (holgura muy superior a la ventana de tardía de 2 días) en vez de heredar la fecha hardcodeada `2026-09-10` de `reservaBase`, con comentario que documenta la regla de negocio (tardía ⟺ faltan ≤ `cancelacionTardiaDias` días). Sin cambios en `lib/store.ts` ni `STORE_VERSION` (permanece en 27): la lógica del store es correcta y coincide con el spec.
- **Warnings de lint en `scripts/*.mjs` eliminados (31 de 43)**: `no-undef` de `process` vía `/* global process */` (los scripts son herramientas CLI fuera del bundle Next, no se migran a `node:process` para minimizar el diff); `turbo/no-undeclared-env-vars` con disable inline justificado (env vars de CLI: `CHECK_HEADERS_URL`, `RESTORE_CONFIRM`, `CHECK_RECHECK_LIVE` — no corren bajo turbo); `no-unused-vars` eliminando imports/variables muertas reales (`okFail`, `hasReadGuard`, `hasMatcher`, `hasNoEnforcement`, `readdirSync`, `mkdirSync`, `statSync`, `writeFileSync` sin uso); `no-empty` documentando catches vacíos intencionales con comentario (regla no-empty ignora bloques con comentario).
- **Warnings fuera de alcance de esta ventana (12) NO se tocan**: `proxy.ts` (8: `no-explicit-any`/`no-empty` — código de seguridad P2/P3, no se toca en estabilización), `e2e/crud/punto-cero.spec.ts` (1), `scripts/fix-rut-seeds.cjs` (2 — `.cjs`, fuera de `scripts/*.mjs`), `test/qa-roadmap.test.ts` (1). Quedan heredados para P4/P5.
- **Estabilidad PE verificada**: corridas repetidas de `test/componentes/pe-panels.test.tsx` con reporter verbose para confirmar si el flaky `pointer-events: none` desapareció o fue casualidad; hallazgo documentado en design.md y en la bitácora de la serie.

## Capabilities

### New Capabilities

(ninguna)

### Modified Capabilities

(ninguna — el spec RA ya especifica correctamente la regla de cancelación tardía; este change solo alinea el test con el spec y limpia tooling CLI. Cero cambios de comportamiento de producto.)

## Impact

- **Código:** solo `k0mp4ss_fe/apps/web/scripts/*.mjs` (backup-db, check-headers, restore-db, security-recheck, seed-authz) y `test/store-reservas.test.ts`. Sin cambios en `lib/store.ts`, schemas, APIs ni componentes.
- **Tests:** suite completa debe quedar 516/516. Los scripts corren igual (`npm run check:headers`, `npm run check:rechecks` verificados post-cambio).
- **Riesgos:** bajo — eliminaciones de código muerto verificado por búsqueda de usos; disables inline de turbo lint acotados a 3 líneas con justificación.
- **Dependencias:** ninguna.
