# Roadmap Serie Plataforma — Estado Canónico
> Toda ventana DEBE leer este archivo al iniciar, marcar su fila EN CURSO y actualizarla
> antes del push final. La Bitácora es el registro durable de toda la serie.
| Ventana | Alcance | Estado | Commit final |
|---|---|---|---|
| P1 | B4 testing UI RTL+MSW (flujo auth) | HECHA | 212da14 |
| P2 | C1+C1b+C3b Prisma comunidadId + repos scoping | HECHA | adf42b0 |
| P3 | C2-final secretos a env (store v26) + aviso duplicados D5 | HECHA | e09c50e |
| P4 | B3 autorización: authz.ts + membresías por comunidad | HECHA | d53b288 |
| P5 | Auth.js + Prisma adapter + rate limit persistente (D-v) | EN CURSO | — |
| P6 | D-i/ii/iii CSP + headers + re-chequeos scripted | pendiente | — |
| P7 | D-iv re-auditoría OWASP + D-vi backups con restore | pendiente | — |
| P8 | Cierre integral engranajes + prepush final + push | pendiente | — |
MÁXIMO: 8 ventanas. Post-serie: dominio real/deploy del owner, migración de datos históricos.
Base de hechos: Data/NSGC/docs/auditorias/consolidado - 2026-08-24-b.md, SG y AU specs NSGC.

## Bitácora
- [2026-08-26] P1 HECHA: B4 RTL+MSW (ingresar, session/logout, useStoreRehydrated, lib/auth + proxy + 1 form D1) — 364 tests, store 94.24/78.45/96.1, tsc/lint/validate OK (212da14)
- [2026-08-27] P2 HECHA: C1/C1b/C3b Prisma SQLite dev (66 modelos con comunidadId indexado, DATABASE_URL gitignored, migrations commiteadas) + lib/prisma.ts + lib/repos crearRepositorio(comunidadId) con scoping obligatorio + tests aislamiento A/B (8, sqlite temporal) — 372 tests, store v25 intacto, tsc/lint/validate/migrate OK (adf42b0)
- [2026-08-27] P3 HECHA: C2-final secretos a env (store v26, migrate v25→v26 limpia smtpPassword/claveEliminacionMaestro, partialize simplificado, UI informativa, .env.example) + D5 aviso duplicados no bloqueante TU/EF/MP (window.confirm advisory, store intacto) — 378 tests (372+6), store v26, tsc/lint/validate OK (e09c50e)
- [2026-08-27] P4 HECHA: B3 autorización por comunidad (Usuario/Membresia por comunidadId D3, puede() matriz RP pura 5 roles/5 acciones, gates server-side GET /api/admin/usuarios nuevo + POST /api/backup reforzado, seed 2 comunidades A/B + 5 usuarios TEST idempotente, proxy solo auth) — 405 tests (378+27), store v26 intacto, tsc/lint/validate/migrate OK (d53b288)
