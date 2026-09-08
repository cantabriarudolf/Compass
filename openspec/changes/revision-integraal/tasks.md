# Tareas Derivadas — Serie Revisión

## Critical (hacer primero)
- [ ] Ninguna — la serie no descubrió vulnerabilidades críticas activas.

## High
- [ ] **Adoptar `generarId()`** en `lib/store.ts` (reemplazar 27+ repeticiones). Change: `refactor-id-utils`.
- [ ] **Unificar `hoyISO*`** en un único helper `lib/date-utils.ts`. Change: `refactor-date-utils`.

## Medium
- [ ] **CSP enforcement**: revisar telemetría de violations, plan de activación.
- [ ] **Coverage extendido**: añadir `lib/authz.ts`, `lib/schemas.ts`, y route handlers al tracking de coverage.
- [ ] **Auth en dev endpoints QA**: `/api/qa-estado` y `/api/qa-roadmap` ahora requieren auth; verificar que el QA Lab no se rompe (ya verificado en tests).

## Low
- [ ] **Documentar F1/F2** en fixture punto-cero + tests de semántica.
- [ ] **proxy.ts types**: reemplazar `any` por tipos correctos de NextAuth/NextRequest.
- [ ] **Store split**: spike de extracción por dominio (bajo riesgo, alto esfuerzo).
