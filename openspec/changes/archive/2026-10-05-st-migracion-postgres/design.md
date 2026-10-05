# Design: Migración SQLite → PostgreSQL (dual)

## Principio

Un solo schema fuente (`prisma/schema.prisma`) con `provider = "postgresql"`.
Para dev, se genera automáticamente `prisma/schema.sqlite.prisma` vía script
(`scripts/sync-schema.mjs`) que reemplaza el provider. Las migraciones se manejan
independientemente: existentes para SQLite, baseline para PostgreSQL.

## Por qué dual (y no completa)

- Dev local sin Docker: SQLite es instantáneo (`file:./dev.db`).
- PostgreSQL requiere servidor (Docker o cloud). Fricción innecesaria para desarrollo diario.
- El schema actual es 99% compatible (sin `@db.Uuid`, sin arrays nativos, sin `Decimal`).
- CI puede correr contra PostgreSQL (valida compatibilidad real).

## Estructura de archivos

```
prisma/
  schema.prisma              # Fuente de verdad (postgresql)
  schema.sqlite.prisma       # Generado automáticamente (NO editar manualmente)
  migrations/                # Migraciones SQLite históricas (se mantienen)
  migrations-postgres/       # Migraciones PostgreSQL (nueva baseline)
  dev.db                     # SQLite local (se mantiene)
```

## Scripts

| Script | Qué hace |
|---|---|
| `scripts/sync-schema.mjs` | Genera `schema.sqlite.prisma` desde `schema.prisma` |
| `npm run db:dev` | `prisma migrate dev --schema=prisma/schema.sqlite.prisma` |
| `npm run db:generate` | `prisma generate --schema=prisma/schema.sqlite.prisma` |
| `npm run db:push` | `prisma db push --schema=prisma/schema.sqlite.prisma` |
| `npm run db:prod:generate` | `prisma generate` (usa schema.prisma postgresql) |
| `npm run db:prod:deploy` | `prisma migrate deploy` (PostgreSQL) |
| `scripts/migrate-sqlite-to-postgres.mjs` | Exporta SQLite → importa PostgreSQL |

## Flujo de datos (migración)

```
SQLite (dev.db)
  → prisma db pull (introspect, opcional)
  → npx tsx scripts/migrate-sqlite-to-postgres.mjs
    1. Lee todas las tablas de SQLite
    2. Por cada tabla: SELECT * → INSERT INTO PostgreSQL (upsert por ID)
    3. Orden topológico: Comunidad primero, luego dependientes
    4. Manejo de JSON: SQLite almacena JSON como TEXT, Prisma lo parsea igual
    5. Manejo de DateTime: ambos usan ISO string en Prisma
  → Verificación: conteos de filas por tabla
```

## Compatibilidad schema auditada

| Feature | SQLite | PostgreSQL | Proyecto lo usa | Nota |
|---|---|---|---|---|
| String | TEXT | TEXT/varchar | ✅ Sí | Compatible |
| Int | INTEGER | INTEGER | ✅ Sí | Compatible |
| Float | REAL | double/real | ✅ Sí | Compatible |
| Boolean | INTEGER(0/1) | boolean | ✅ Sí | Prisma maneja conversión |
| DateTime | INTEGER/TEXT | timestamp | ✅ Sí | Prisma maneja conversión |
| Json | TEXT | json/jsonb | ✅ Sí | Prisma maneja serialización |
| cuid() | String | String | ✅ Sí | Prisma genera, no BD |
| @db.Uuid | N/A | uuid | ❌ No | No usado |
| Array types | N/A | array | ❌ No | Usamos Json para arrays |
| Decimal | REAL | decimal | ❌ No | Usamos Float |
| @map | ✅ | ✅ | ✅ Sí | Compatible |
| @@index | ✅ | ✅ | ✅ Sí | Compatible |
| @@unique | ✅ | ✅ | ✅ Sí | Compatible |

**Conclusión**: el schema actual es completamente portable sin modificaciones.

## Variables de entorno

```
# Dev (SQLite — default)
DATABASE_URL="file:./dev.db"

# Prod (PostgreSQL)
DATABASE_URL="postgresql://user:pass@host.neon.tech/dbname?sslmode=require"
```

No se necesita `DATABASE_PROVIDER`: el schema se switchea por archivo, no por env.

## CI/CD

- GitHub Actions: usar PostgreSQL service container o base de datos de test (Neon/Supabase).
- Script de migración se corre en el job `deploy` antes del build de Vercel.
- Tests unit: pueden seguir con SQLite (rápido) o switchear a PostgreSQL en CI.

## Rollback

- Backup de `dev.db` antes de cualquier operación.
- El script de migración es idempotente (upsert por ID).
- Si PostgreSQL falla, dev sigue funcionando con SQLite.
