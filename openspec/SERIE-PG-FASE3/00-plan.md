# Serie PG-FASE3 — Plan y Estado Canónico

> Toda ventana DEBE leer este archivo al iniciar (bloque ARRANQUE en P2),
> marcar su fila EN CURSO y actualizarla antes del push final. La Bitácora es
> el registro durable. La verdad es el repo, no los chats.

| Ventana | Alcance | Estado | Commit final |
| --- | --- | --- | --- |
| P1 | CI: job unit contra PostgreSQL (service container) + `.env.example` con ambos providers + unit verdes en PG | HECHA | 807c493 |
| P2 | Deploy: script migrar-datos-antes-del-build + docs en manuales AU/ST + verificaciones finales (tsc, unit SQLite+PG, e2e) + archivar `st-migracion-postgres` + commit | pendiente | — |

MÁXIMO: 2 ventanas. Post-serie (fuera): corte real a producción (DATABASE_URL de Neon en Vercel + corrida de migración con datos reales — decisión y credenciales del owner), super-admin global, resto de BACKLOG-100.

## Base de hechos (leer antes de cada ventana)

- Estado heredado (2026-10-05, en sync con remoto): STORE_VERSION 28 · unit 85/835 · tsc 0 · lint 0 · e2e única 93+2 skip · validate 36/6 (6 sin-deltas de otras series).
- Fases 1-2 HECHAS (change `st-migracion-postgres` 13/21): infra dual (`schema.prisma` + `schema.sqlite.prisma` vía `scripts/sync-schema.mjs`, scripts `db:dev/generate/push/prod:*`, `docker-compose.db.yml`) + script `scripts/migrate-sqlite-to-postgres.mjs` probado en Neon (8354 filas, 70/70 tablas, batch x100, timestamps ISO, FKs con reintento). Memoria: topic `st-migracion-postgres`.
- Pendiente Fase 3 (tasks 3.1-3.4 + verificaciones, conteos del change desactualizados: dicen 606/606 y 86/88, hoy 85/835 y 93+2 — actualizar al cerrar).
- CI actual (`.github/workflows/ci.yml`): job `unit` con `DATABASE_URL: file:./dev.db`, job `e2e` con seed completo + build + `npx playwright test` único, timeout 60. NO tocar `e2e-rate-limit` ni `deploy` salvo lo que el alcance pida (el deploy script de 3.2 puede proponer cambio al job `deploy`: si lo toca, documentarlo y avisar al owner).
- `k0mp4ss_fe/apps/web/.env.example` existe (verificar si ya trae ambos providers o hay que agregarlo).
- Reglas permanentes: cada cambio de esquema Prisma = migración + tests; secretos jamás en código (solo `.env` local / dashboard Vercel); Terminología RG §4: "comunidad". Comandos con `workdir k0mp4ss_fe/apps/web`.
- Changes abiertos al inicio (NO tocar): `au-google-sso`, `e2e-higiene-determinismo`, `e2e-rojos-flujo-a11y-smoke`, `fix-vercel-data-ignore`, `gd-ficha-gobernanza`, `gd-periodos-directiva`, `st-split-fase2`, `e2e-rojos-crud` (tiene serie propia ROJOS-CRUD).

## Bitácora

- [2026-10-05] Serie materializada por orquestador (2 ventanas, cap duro). Motivo: owner recordó (vía Engram) que la migración de datos ya estaba probada; solo falta el corte a producción (Fase 3 del change).
- [2026-10-05] P1 HECHA. CI: nuevo job `unit-pg` (postgres:16-alpine service, `prisma db push` + `npm test` contra `postgresql://compass:compass_ci@localhost:5432/compass_test`); job `unit` fijado a `--schema=prisma/schema.sqlite.prisma` (en main su `migrate deploy` fallaba con P1012 porque el schema fuente ya es postgresql). `.env.example` documenta SQLite local + PG Docker + Neon. Docker SÍ disponible: PG local levantado con compose, suite unit 85/85 archivos y 835/835 tests en PG y en SQLite; tsc 0 errores; lint 0 errores. 2 tests asumían SQLite (`lib/repos/repos*.test.ts` con `file:` temporal) → helper nuevo `lib/repos/bd-test.ts` (cambio mínimo). Pre-existente y fuera de alcance: `npm test` con coverage sale 1 por thresholds (líneas 80.17%<90%) sin tocar P1 ningún archivo del include; e2e y resto Fase 3 (3.2, 3.3) para P2. Sin push.
