# Findings Integral — Serie Revisión P1-P5

## Security (P2 + P3)

### Aplicados en esta serie
- **AuthZ matriz**: recurso `am` añadido (comité lee, admin todo). Tests coverage en `authz.test.ts`.
- **APIs protegidas**: `/api/auditoria`, `/api/fi`, `/api/fi/sync` ahora verifican `puede()` server-side.
- **Dev APIs protegidas**: `/api/dev-dashboard`, `/api/qa-estado`, `/api/qa-roadmap` ahora requieren auth (antes solo `isWriteApiEnabled`).
- **Seed authz**: `/api/admin/seed-authz` ahora tiene guard `isWriteApiEnabled()` (ya existía, verificado).
- **CSP report**: sanitizado para loguear solo campos estándar (`document-uri`, `violated-directive`, `blocked-uri`), evitando log injection.
- **Resolver comunidad**: retorna `rol` para authz checks downstream.

### Pendientes (recomendados post-serie)
- **CSP enforcement**: aún en report-only; requiere 0 violations 7 días antes de activar.
- **proxy.ts `any` types**: 8 warnings de `no-explicit-any` en código de seguridad edge.
- **HSTS preload**: desactivado hasta tener dominio real (`PUBLIC_DOMAIN`).

## Arquitectura (P4)

- **Store monolito**: 5007 líneas, 140 CRUD. Documentado en `revision-arquitectura/`.
- **DRY IDs**: 27+ repeticiones de `Date.now()+Math.random()`. `lib/id-utils.ts` creado como base.
- **DRY fechas**: 4 funciones `hoyISO*` duplicadas por dominio.
- **Hallazgos revisor-fin**: F1 (apertura derivada) y F2 (saldoCC no reconcilia) documentados.

## Tests (P5)

- **Suite**: 517/517 unit tests verdes, 86/88 e2e verdes (2 skipped).
- **Coverage**: solo `lib/store.ts` trackeado (94.42% lines, 78.85% branches). Otros archivos críticos sin visibilidad.
- **Flakiness**: PE estable individualmente; suite completa ocasionalmente timeout en jsdom (resource contention, no lógica).
