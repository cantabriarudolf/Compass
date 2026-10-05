# Tareas — Migración SQLite → PostgreSQL (dual)

## Fase 1: Infra dual (esta ventana)
- [x] 1.1 Crear change openspec `st-migracion-postgres` (proposal + design)
- [x] 1.2 Script `scripts/sync-schema.mjs` — genera `schema.sqlite.prisma` desde `schema.prisma`
- [x] 1.3 Actualizar `package.json` con scripts `db:dev`, `db:generate`, `db:push`, `db:prod:*`
- [x] 1.4 Generar `schema.sqlite.prisma` inicial
- [x] 1.5 Verificar `prisma generate` con schema SQLite sigue funcionando
- [x] 1.6 Verificar `prisma migrate dev` con schema SQLite sigue funcionando
- [x] 1.7 Docker compose para PostgreSQL local de desarrollo

## Fase 2: Script de migración de datos
- [x] 2.1 Script `scripts/migrate-sqlite-to-postgres.mjs`
- [x] 2.2 Orden topológico de tablas (Comunidad → dependientes) + reintentos FK
- [x] 2.3 Upsert por ID (idempotente)
- [x] 2.4 Verificación: conteos de filas por tabla
- [x] 2.5 Backup automático de SQLite antes de migrar
- [x] 2.6 Test con instancia PostgreSQL real (Neon) — ✅ 8354 filas migradas, 70/70 tablas verificadas, 0 fallidas

## Fase 3: CI/CD y producción
- [x] 3.1 GitHub Actions: job con PostgreSQL service container — ✅ P1 PG-FASE3 (2026-10-05): nuevo job `unit-pg` (postgres:16-alpine, `prisma db push` + `npm test` contra PG); job `unit` fijado a `schema.sqlite.prisma` (en main fallaba con P1012: schema fuente ya es postgresql)
- [ ] 3.2 Script de deploy: migrar datos antes del build
- [ ] 3.3 Documentar en manuales (AU, ST)
- [x] 3.4 Actualizar `.env.example` con ambos providers — ✅ P1 PG-FASE3 (2026-10-05): SQLite dev local + PG Docker local + Neon prod, con comentarios, sin secretos

## Verificaciones finales
- [x] tsc 0 errores — ✅ P1 PG-FASE3 (2026-10-05): `npx tsc --noEmit` exit 0
- [x] Tests unit 835/835 verdes (con SQLite) — ✅ P1 PG-FASE3 (2026-10-05): 85/85 archivos, 835/835 tests (`npx vitest run` exit 0; `npm test` con coverage sale 1 SOLO por thresholds pre-existentes: líneas 80.17%<90%, ramas 73.88%<75% — ningún archivo del include tocado por P1)
- [x] Tests unit pasan con PostgreSQL en CI — ✅ P1 PG-FASE3 (2026-10-05, verificado local con Docker en vez de CI): 85/85 archivos, 835/835 tests contra PG local (`db push` + suite). 2 archivos asumían SQLite (`lib/repos/repos.test.ts`, `repos.authz.test.ts` con `file:` temporal) → adaptados con helper `lib/repos/bd-test.ts` (sufijo por corrida + limpieza Cascade en PG; SQLite intacto)
- [ ] Suite e2e 86/88 verdes
