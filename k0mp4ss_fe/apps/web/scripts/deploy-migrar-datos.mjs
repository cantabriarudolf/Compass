#!/usr/bin/env node
/**
 * deploy-migrar-datos.mjs — Corte SQLite → PostgreSQL ANTES del build (Fase 3, task 3.2).
 *
 * Qué hace, en orden:
 *   1. Valida que DATABASE_URL apunte a PostgreSQL (fail-closed; sin secretos hardcodeados).
 *   2. Crea el esquema PG baseline con `prisma db push` (schema.prisma fuente ya es
 *      postgresql; todavía NO hay migraciones PG versionadas — la primera migración
 *      versionada post-corte es decisión del owner).
 *   3. Migra los datos con `scripts/migrate-sqlite-to-postgres.mjs` (idempotente,
 *      upsert por ID, probado en Neon: 8354 filas, 70/70 tablas).
 *   4. NO corre el build: ejecútalo después (`npm run build` o el deploy a Vercel).
 *
 * Uso (corte real, lo corre el owner con la DATABASE_URL de Neon):
 *   DATABASE_URL="postgresql://...?sslmode=require" \
 *   SQLITE_URL="file:./prisma/dev.db" \
 *   npm run db:prod:migrar-datos && npm run build
 *
 * Flags:
 *   --help           Muestra esta ayuda y sale 0 (sin efectos laterales).
 *   --solo-esquema   Solo crea el esquema PG, sin migrar datos.
 *
 * Env opcionales:
 *   SQLITE_URL       Origen SQLite (default: file:./prisma/dev.db).
 *   SKIP_DATOS=1     Equivale a --solo-esquema.
 *
 * Seguridad: la URL de conexión NUNCA se imprime (solo host redactado).
 */

import { execSync } from "node:child_process"

const args = process.argv.slice(2)

if (args.includes("--help") || args.includes("-h")) {
  console.log("Uso:")
  console.log('  DATABASE_URL="postgresql://..." [SQLITE_URL="file:./prisma/dev.db"]')
  console.log("  node scripts/deploy-migrar-datos.mjs [--solo-esquema]")
  console.log("")
  console.log("Pasos: valida DATABASE_URL PG → `prisma db push` (esquema baseline) →")
  console.log("migrate-sqlite-to-postgres.mjs (datos idempotentes). El build corre después.")
  process.exit(0)
}

/** Redacta credenciales: "postgresql://user:pass@host/db" → "postgresql://***@host/db". */
function redactarUrl(url) {
  return url.replace(/^([a-z]+:\/\/)[^@/]*@/u, "$1***@")
}

const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL || !DATABASE_URL.startsWith("postgresql")) {
  console.error("❌ DATABASE_URL debe estar definida y apuntar a PostgreSQL.")
  console.error("   El corte a producción usa la DATABASE_URL de Neon (dashboard Vercel).")
  console.error("   Abortado por seguridad: no se tocó ninguna base de datos.")
  process.exit(1)
}

const soloEsquema = args.includes("--solo-esquema") || process.env.SKIP_DATOS === "1"
const SQLITE_URL = process.env.SQLITE_URL || "file:./prisma/dev.db"

console.log(`🎯 Destino PG: ${redactarUrl(DATABASE_URL)}`)
console.log(`📂 Origen SQLite: ${SQLITE_URL}`)

function correr(cmd, envExtra = {}) {
  execSync(cmd, {
    stdio: "inherit",
    env: { ...process.env, ...envExtra },
  })
}

try {
  console.log("1/2 Esquema PG baseline (`prisma db push`)...")
  correr("npx prisma db push")

  if (soloEsquema) {
    console.log("⏭️  Datos omitidos (--solo-esquema). Esquema PG listo; corre el build después.")
    process.exit(0)
  }

  console.log("2/2 Datos SQLite → PG (idempotente, upsert por ID)...")
  correr("node scripts/migrate-sqlite-to-postgres.mjs", {
    POSTGRES_URL: DATABASE_URL,
    SQLITE_URL,
  })

  console.log("✅ Datos migrados. Siguiente paso: `npm run build` y deploy a Vercel.")
} catch (err) {
  console.error("❌ Corte fallido:", err.message)
  console.error("   La BD SQLite local queda intacta (el script de datos hace backup antes de migrar).")
  process.exit(1)
}
