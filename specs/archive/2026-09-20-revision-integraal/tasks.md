# Tareas Derivadas — Serie Revisión

## Critical (hacer primero)
- [ ] Ninguna — la serie no descubrió vulnerabilidades críticas activas.

## High
- [x] **Adoptar `generarId()`** en `lib/store.ts` — HECHO SERIE-PRODUCCION P1 (`39f3cdc`, 28 usos verificados 2026-09-19).
- [x] **Unificar `hoyISO*`** en `lib/date-utils.ts` — HECHO SERIE-PRODUCCION P1 (store importa `hoyISO`/`ahoraISO`, sin defs locales, verificado 2026-09-19).

## Medium
- [ ] **CSP enforcement**: sigue en Report-Only (ver `proxy.ts` + `sg-predeploy-headers/design.md`) — BLOQUEADO owner (requiere dominio real + 7 días telemetría).
- [x] **Coverage extendido** — HECHO SERIE-PRODUCCION P4 (8 archivos: store, date-utils, id-utils, env-guard, logger, authz, schemas, api routes).
- [x] **Auth en dev endpoints QA** — HECHO SERIE-REVISION (`/api/qa-estado` exige `auth()`, QA Lab verificado en tests).

## Low
- [x] **Documentar F1/F2** — HECHO 2026-09-19 (semántica en `lib/store.ts` + 2 tests en `test/store-punto-cero.test.ts`; serie `saldoCC` declarada no materializada).
- [x] **proxy.ts types** — HECHO 2026-09-19 (el `any` estaba en `lib/auth.ts:130`; reemplazo por `NextAuthResult`-safe: `resultadoAuth` + `auth: () => Promise<Session \| null>` explícito; tsc 0, 76 tests auth verdes).
- [ ] **Store split**: spike HECHO 2026-09-19 (`spike-store-split.md`, 3 fases / 7–8 ventanas) — implementación pendiente de calendarizar por el owner.
