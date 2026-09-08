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
| P2 | Security Audit Parte I: AuthZ (A01/A07) — authz.ts, puedeContextual, middleware, ABAC matriz | ✅ HECHA | `55ad834` |
| P3 | Security Audit Parte II: APIs + Data (A03/A02/A05/A01-data) — endpoints, Zod, crypto, headers, env | ✅ HECHA | `2114ede` |
| P4 | Arquitectura & Deuda Técnica — store monolito, schemas, SRP, DRY, hallazgos revisor-fin | ✅ HECHA | `1185512` |
| P5 | Tests, cobertura, documentación y cierre — gaps, flakiness, openspec archive, BACKLOG | ✅ HECHA | `PENDIENTE` |

**MÁXIMO: 5 ventanas.** Post-serie: decisiones del owner sobre refactorings grandes identificados.

## Bitácora

- [2026-09-08] P1 HECHA: test RA arreglado (fecha dinámica +30d, regla de negocio documentada), 31/43 warnings lint limpiados en scripts/*.mjs, PE verificado estable (5/5 corridas individuales, 516/516 suite verde). Change archivado `2026-09-08-revision-estabilizacion`. Commit `8fada6d`.
- [2026-09-08] P2 HECHA: recurso `am` añadido a matriz authz (comité lee, admin todo), tests authz para `am`, authz checks en `/api/auditoria`, `/api/fi`, `/api/fi/sync`, guard `isWriteApiEnabled` en `/api/admin/seed-authz`, `resolverComunidadId` retorna rol. Tests 517/517 verde.
- [2026-09-08] P3 HECHA: auth checks añadidos a `/api/dev-dashboard`, `/api/qa-estado`, `/api/qa-roadmap` (antes solo `isWriteApiEnabled`), CSP report sanitizado (solo campos estándar, evita log injection), test security-rechecks actualizado. Tests 517/517 verde. Commit `2114ede`.
- [2026-09-08] P4 HECHA: documentada deuda técnica en `openspec/changes/revision-arquitectura/` — store monolito (5007 líneas, 140 CRUD), 27+ repeticiones de patrón ID, 4 funciones `hoyISO*` duplicadas, hallazgos F1/F2 del revisor-fin. Creado `lib/id-utils.ts` como base para futuro refactor. Tests 517/517 verde. Commit `1185512`.
- [2026-09-08] P5 HECHA: coverage verificado (94.42% store.ts, otros archivos sin tracking), suite estable, hallazgos consolidados en `openspec/changes/revision-integraal/`, BACKLOG-100.md actualizado. Serie COMPLETA 5/5.
