# Serie Revisión — Plan y Estado Canónico

> Toda ventana DEBE leer este archivo al iniciar (bloque ARRANQUE), marcar su fila EN CURSO
> y actualizarla antes del push final. La Bitácora es el registro durable de la serie.

## Contexto previo (estado al inicio de la serie)

- Project: Compass (Next.js 16 + TypeScript + Prisma + SQLite + Auth.js + Zustand persist)
- STORE_VERSION: 27 (punto cero financiero migrado)
- Tests: 515/516 unit pasan, 86/88 e2e pasan (2 skipped)
- Build: limpio, tsc: limpio, lint: 43 warnings (0 errores)
- Último commit: `7108e1c` — arnés v0.4.0
- Specs: 31/31 capabilities con spec en `openspec/specs/`
- SERIE-FRONTERA: COMPLETA 6/6 (C1/C2/C4 hechos, C3 en pausa)
- Hallazgos previos: 1 test roto (cancelación RA), warnings mecánicos, store ~5000 líneas

## Roadmap

| Ventana | Alcance | Estado | Commit final |
|---|---|---|---|
| P1 | Estabilización express: test roto RA + lint warnings + flaky PE | ✅ HECHA | `8fada6d` |
| P2 | Security Audit Parte I: AuthZ (A01/A07) — authz.ts, puedeContextual, middleware, ABAC matriz | EN CURSO | — |
| P3 | Security Audit Parte II: APIs + Data (A03/A02/A05/A01-data) — endpoints, Zod, crypto, headers, env | pendiente | — |
| P4 | Arquitectura & Deuda Técnica — store monolito, schemas, SRP, DRY, hallazgos revisor-fin | pendiente | — |
| P5 | Tests, cobertura, documentación y cierre — gaps, flakiness, openspec archive, BACKLOG | pendiente | — |

**MÁXIMO: 5 ventanas.** Post-serie: decisiones del owner sobre refactorings grandes identificados.

## Bitácora

- [2026-09-08] P1 HECHA: test RA arreglado (fecha dinámica +30d, regla de negocio documentada), 31/43 warnings lint limpiados en scripts/*.mjs, PE verificado estable (5/5 corridas individuales, 516/516 suite verde). Change archivado `2026-09-08-revision-estabilizacion`. Commit `8fada6d`.
