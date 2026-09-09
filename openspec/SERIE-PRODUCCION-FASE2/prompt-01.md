> **Este archivo ES tu prompt.** Ventana P1 de la serie produccion-fase2.
> Léelo completo (incluido `00-plan.md` de la serie) y ejecuta sus bloques en orden.

## Contexto común (válido para TODA la serie produccion-fase2)

Estado previo: Compass es un proyecto Next.js 16 para gestión de comunidades edificadas. STORE_VERSION=27. Tests: 552 unit (vitest) + 86 e2e (playwright). Lint: 13 warnings. CI/CD: GitHub Actions con unit+e2e+deploy a Vercel. Hosting: Vercel. Database: SQLite dev.

Método del proyecto: por cada cambio → openspec-propose → implementar con openspec-apply-change → validar → commitear (conventional español) → sincronizar specs mains y archivar con openspec-archive-change → skill nsgc-prepush antes de cualquier push.

Reglas permanentes: dato de dominio solo vía acciones del store (repository + StoreResult); mocks de data/ son solo seed; D1 media por referencia (sin base64/Blob); secretos jamás en localStorage ni código; cada cambio de esquema del store = bump STORE_VERSION + migrate + test.

Verificación por ventana: cd k0mp4ss_fe/apps/web && npx tsc --noEmit && npm run lint (0 errores) && npm test (suite completa verde) + openspec validate --all sin fallos.
`next build` puede fallar por red (Google Fonts): ignóralo salvo ventana de deploy.
No commitear Untitled.md. Si tu contexto se agota: cierra la tarea en curso + commit + deja el estado exacto en openspec/SERIE-PRODUCCION-FASE2/00-plan.md.

## Alcance de esta ventana (P1 — Migración SQLite → Neon PostgreSQL)

### Pre-requisito del owner
El owner DEBE tener una base de datos Neon creada y el DATABASE_URL antes de ejecutar esta ventana. Si no lo tiene, esta ventana se detiene y reporta el bloqueante.

### Tarea 1: Cambiar provider de Prisma a PostgreSQL

1. En `prisma/schema.prisma`, cambiar:
   ```prisma
   datasource db {
     provider = "postgresql"
     url      = env("DATABASE_URL")
   }
   ```
2. El schema actual usa `Json` (56 campos). En PostgreSQL `Json` funciona, pero evalúa si alguno debería ser `JsonB` ( mejor performance). NO cambies de `Json` a `JsonB` a menos que sea trivial — eso requiere migración de datos.
3. Los IDs con `cuid()` funcionan igual en PostgreSQL.
4. Las migraciones existentes son SQLite. Necesitas regenerarlas para PostgreSQL:
   - Backup de migraciones actuales: copiar `prisma/migrations/` a `prisma/migrations-sqlite-backup/`
   - Limpiar `prisma/migrations/` (borrar todo excepto migration_lock.toml)
   - Generar migración inicial PostgreSQL: `npx prisma migrate dev --name init_postgres`

### Tarea 2: Configurar connection pooling

Neon requiere connection pooling para serverless (Vercel). Opciones:
- **Prisma Accelerate** (recomendado): `npx prisma generate --accelerate` + usar `PrismaClient` con `accelerate`
- **Neon serverless driver**: `@neondatabase/serverless` + adapter de Prisma

Implementa **Prisma Accelerate**:
1. Instala `@prisma/extension-accelerate`
2. Actualiza `lib/prisma.ts` para usar la extensión:
   ```typescript
   import { PrismaClient } from "@prisma/client"
   import { withAccelerate } from "@prisma/extension-accelerate"
   
   const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }
   export const prisma = globalForPrisma.prisma ?? new PrismaClient().$extends(withAccelerate())
   if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma
   ```
3. El DATABASE_URL de Neon debe incluir `?sslmode=require`

### Tarea 3: Reescribir scripts de backup/restore

1. `scripts/backup-db.mjs`: actualmente solo soporta SQLite. Reescribir para PostgreSQL:
   - Usar `pg_dump` (si está disponible) o exportar vía Prisma queries
   - Guardar en formato JSON por tabla (compatible con restore)
   - Incluir manifest con timestamp y sha256
2. `scripts/restore-db.mjs`: reescribir para PostgreSQL:
   - Leer backup JSON
   - Truncar tablas y reinsertar datos (respetando FKs)
   - Preguntar confirmación `--yes`
3. Ambos scripts deben detectar si la BD es SQLite o PostgreSQL y comportarse correctamente.

### Tarea 4: Migrar datos de SQLite a PostgreSQL

1. Crear script `scripts/migrate-sqlite-to-postgres.mjs`:
   - Lee `prisma/dev.db` (SQLite) vía Prisma con `provider = "sqlite"` temporal
   - Escribe en PostgreSQL vía Prisma con `provider = "postgresql"`
   - Respetar orden de tablas (FKs): maestros primero, luego datos
   - Loguear progreso
2. O usa herramienta externa: `pgloader` (si está disponible) o `sqlite3 → csv → psql`
3. IMPORTANTE: El script debe ser idempotente (puede correrse varias veces sin duplicar).

### Tarea 5: Actualizar .env.example y CI

1. `.env.example`: añadir sección `[Neon PostgreSQL]` con ejemplo de DATABASE_URL
2. `.github/workflows/ci.yml`: actualizar DATABASE_URL para usar PostgreSQL en CI (Neon tiene proyectos de prueba gratuitos, o usar PostgreSQL local en runner)
3. Documentar en README que SQLite solo se usa para dev local rápido, y Neon es la fuente de verdad.

### Tarea 6: Validación final

1. `npx prisma generate` → sin errores
2. `npx prisma migrate deploy` → sin errores
3. `npx tsc --noEmit` → 0 errores
4. `npm test` → suite completa verde (los tests que usan Prisma real deben funcionar con PostgreSQL)
5. `npm run lint` → 0 errores (warnings heredados OK)
6. `openspec validate --all` → sin fallos

## Reporte final estandarizado (OBLIGATORIO)

1. Ventana y estado: P1 HECHA/PARCIAL + motivo.
2. Commits: hash + subject y push sí/no.
3. Specs creadas/modificadas + changes archivados.
4. Números: STORE_VERSION, tests X/Y, tsc/eslint OK.
5. Desviaciones vs el prompt.
6. Pendientes heredados a la(s) ventana(s) siguiente(s).
7. Última línea exacta: `BITACORA_ENTRY: P1 — Migración SQLite → Neon PostgreSQL (commit <hash>)`.
