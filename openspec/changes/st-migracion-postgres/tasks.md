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
- [ ] 2.6 Test con instancia PostgreSQL real (pendiente: requiere PostgreSQL local o cloud)

## Fase 3: CI/CD y producción
- [ ] 3.1 GitHub Actions: job con PostgreSQL service container
- [ ] 3.2 Script de deploy: migrar datos antes del build
- [ ] 3.3 Documentar en manuales (AU, ST)
- [ ] 3.4 Actualizar `.env.example` con ambos providers

## Verificaciones finales
- [ ] tsc 0 errores
- [ ] Tests unit 606/606 verdes (con SQLite)
- [ ] Tests unit pasan con PostgreSQL en CI
- [ ] Suite e2e 86/88 verdes
