# Roadmap Serie Plataforma — Estado Canónico
> Toda ventana DEBE leer este archivo al iniciar, marcar su fila EN CURSO y actualizarla
> antes del push final. La Bitácora es el registro durable de toda la serie.
| Ventana | Alcance | Estado | Commit final |
|---|---|---|---|
| P1 | B4 testing UI RTL+MSW (flujo auth) | EN CURSO | — |
| P2 | C1+C1b+C3b Prisma comunidadId + repos scoping | pendiente | — |
| P3 | C2-final secretos a env (store v26) + aviso duplicados D5 | pendiente | — |
| P4 | B3 autorización: authz.ts + membresías por comunidad | pendiente | — |
| P5 | Auth.js + Prisma adapter + rate limit persistente (D-v) | pendiente | — |
| P6 | D-i/ii/iii CSP + headers + re-chequeos scripted | pendiente | — |
| P7 | D-iv re-auditoría OWASP + D-vi backups con restore | pendiente | — |
| P8 | Cierre integral engranajes + prepush final + push | pendiente | — |
MÁXIMO: 8 ventanas. Post-serie: dominio real/deploy del owner, migración de datos históricos.
Base de hechos: Data/NSGC/docs/auditorias/consolidado - 2026-08-24-b.md, SG y AU specs NSGC.

## Bitácora
(vacía — cada ventana añade su entrada antes del push: `- [fecha] P<n> HECHA: resumen (commit hash)`)
