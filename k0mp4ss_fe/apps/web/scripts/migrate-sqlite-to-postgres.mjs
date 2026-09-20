/**
 * migrate-sqlite-to-postgres.mjs — Migra datos de SQLite a PostgreSQL
 *
 * Uso:
 *   SQLITE_URL="file:./prisma/dev.db" POSTGRES_URL="postgresql://..." \
 *     node scripts/migrate-sqlite-to-postgres.mjs
 *
 * El script:
 * 1. Lee todas las tablas de SQLite (excepto _prisma_migrations)
 * 2. Para cada tabla: SELECT * → INSERT INTO PostgreSQL (upsert por ID)
 * 3. Orden: Comunidad primero (raíz), luego el resto en orden alfabético
 * 4. Reintentos automáticos para FK violations (pasadas hasta resolver)
 * 5. Verificación: conteos de filas por tabla
 *
 * Requiere: schema PostgreSQL ya creado (prisma migrate deploy)
 */

import { PrismaClient } from "@prisma/client"
import { Client } from "pg"
import fs from "fs"
import path from "path"

const SQLITE_URL = process.env.SQLITE_URL || "file:./prisma/dev.db"
const POSTGRES_URL =
  process.env.POSTGRES_URL || process.env.DATABASE_URL_POSTGRES

if (!POSTGRES_URL || !POSTGRES_URL.startsWith("postgresql")) {
  console.error(
    "❌ POSTGRES_URL debe estar definida y apuntar a PostgreSQL.\n" +
      "Ejemplo: POSTGRES_URL=postgresql://user:pass@localhost:5432/dbname"
  )
  process.exit(1)
}

// Backup automático de SQLite antes de migrar
const dbPath = SQLITE_URL.replace("file:", "").replace("./", "")
const backupPath = dbPath + ".backup-" + new Date().toISOString().slice(0, 19)
if (fs.existsSync(dbPath)) {
  fs.copyFileSync(dbPath, backupPath.replace(/:/g, "-"))
  console.log(`💾 Backup SQLite: ${backupPath.replace(/:/g, "-")}`)
}

const prisma = new PrismaClient({ datasourceUrl: SQLITE_URL })
const pg = new Client({ connectionString: POSTGRES_URL })

/**
 * Obtiene lista de tablas de SQLite, excluyo _prisma_migrations.
 * Comunidad va primero (raíz del tenant), luego orden alfabético.
 */
async function getTables() {
  const rows = await prisma.$queryRaw`
    SELECT name FROM sqlite_master
    WHERE type = 'table'
      AND name NOT LIKE 'sqlite_%'
      AND name != '_prisma_migrations'
    ORDER BY name
  `
  const names = rows.map((r) => r.name)
  // Mover Comunidad al principio
  const idx = names.indexOf("Comunidad")
  if (idx > 0) {
    names.splice(idx, 1)
    names.unshift("Comunidad")
  }
  return names
}

/**
 * Migra una tabla de SQLite a PostgreSQL.
 * Retorna { inserted, failed, errors }.
 */
async function migrateTable(tableName, pendingRows = null) {
  const rows =
    pendingRows || (await prisma.$queryRawUnsafe(`SELECT * FROM "${tableName}"`))

  if (rows.length === 0) {
    return { inserted: 0, failed: 0, errors: [], remaining: [] }
  }

  const columns = Object.keys(rows[0])
  const columnList = columns.map((c) => `"${c}"`).join(", ")
  const placeholders = columns.map((_, i) => `$${i + 1}`).join(", ")
  const updates = columns.map((c) => `"${c}" = EXCLUDED."${c}"`).join(", ")

  const insertSql = `
    INSERT INTO "${tableName}" (${columnList})
    VALUES (${placeholders})
    ON CONFLICT ("id") DO UPDATE SET ${updates}
  `

  let inserted = 0
  let failed = 0
  const errors = []
  const remaining = []

  for (const row of rows) {
    const values = columns.map((col) => {
      const v = row[col]
      // Prisma parsea JSON automáticamente; para PostgreSQL pasamos el objeto
      // y pg lo serializa según el tipo de columna
      if (v instanceof Date) return v.toISOString()
      return v ?? null
    })

    try {
      await pg.query(insertSql, values)
      inserted++
    } catch (err) {
      // Si es FK violation, guardar para reintento
      if (err.code === "23503") {
        remaining.push(row)
      } else {
        failed++
        errors.push({ row: row.id || "?", code: err.code, message: err.message })
      }
    }
  }

  return { inserted, failed, errors, remaining }
}

async function main() {
  console.log("🔗 Conectando a PostgreSQL...")
  await pg.connect()

  // Verificar conexión PostgreSQL
  const pgVersion = await pg.query("SELECT version()")
  console.log(`✅ PostgreSQL: ${pgVersion.rows[0].version.split(" ")[0]}...`)

  const tables = await getTables()
  console.log(`📋 Tablas a migrar: ${tables.length}`)
  console.log(`   ${tables.join(", ")}\n`)

  const stats = {}
  let globalRemaining = {}

  // Pasada 1: migrar todas las tablas
  for (const table of tables) {
    process.stdout.write(`🔄 ${table}... `)
    const result = await migrateTable(table)
    stats[table] = { ...result, total: result.inserted + result.failed + result.remaining.length }
    if (result.remaining.length > 0) {
      globalRemaining[table] = result.remaining
    }
    console.log(
      `${result.inserted} OK` +
        (result.failed > 0 ? `, ${result.failed} errores` : "") +
        (result.remaining.length > 0 ? `, ${result.remaining.length} FK pendientes` : "")
    )
  }

  // Pasadas de reintento para FK violations (máximo 5)
  let pass = 2
  while (Object.keys(globalRemaining).length > 0 && pass <= 5) {
    console.log(`\n🔄 Reintento ${pass} (${Object.keys(globalRemaining).length} tablas con pendientes)...`)
    const newRemaining = {}

    for (const [table, rows] of Object.entries(globalRemaining)) {
      if (rows.length === 0) continue
      process.stdout.write(`   ${table} (${rows.length} pendientes)... `)
      const result = await migrateTable(table, rows)
      stats[table].inserted += result.inserted
      stats[table].failed += result.failed
      if (result.remaining.length > 0) {
        newRemaining[table] = result.remaining
      }
      console.log(`${result.inserted} OK, ${result.failed} err, ${result.remaining.length} quedan`)
    }

    globalRemaining = newRemaining
    pass++
  }

  // Reporte final
  console.log("\n" + "=".repeat(60))
  console.log("📊 Resumen de migración")
  console.log("=".repeat(60))

  let totalInserted = 0
  let totalFailed = 0
  let totalRemaining = 0

  for (const [table, s] of Object.entries(stats)) {
    totalInserted += s.inserted
    totalFailed += s.failed
    totalRemaining += s.remaining?.length || 0
    const status = s.failed === 0 && (!s.remaining || s.remaining.length === 0) ? "✅" : "⚠️"
    console.log(`${status} ${table.padEnd(30)} ${String(s.inserted).padStart(6)} / ${String(s.total).padStart(6)}`)
  }

  console.log("-".repeat(60))
  console.log(`   Total: ${totalInserted} insertadas, ${totalFailed} fallidas, ${totalRemaining} FK pendientes`)

  if (totalRemaining > 0) {
    console.log("\n⚠️  Algunas filas quedaron pendientes por FK violations.")
    console.log("   Posibles causas: datos huérfanos en SQLite o tablas faltantes.")
  }

  // Verificación: conteos por tabla
  console.log("\n🔍 Verificación de conteos:")
  for (const table of tables) {
    const sqliteCount = await prisma.$queryRawUnsafe(
      `SELECT COUNT(*) as c FROM "${table}"`
    )
    const pgCount = await pg.query(`SELECT COUNT(*) as c FROM "${table}"`)
    const sCount = Number(sqliteCount[0].c)
    const pCount = Number(pgCount.rows[0].c)
    const ok = sCount === pCount ? "✅" : "❌"
    console.log(`   ${ok} ${table.padEnd(30)} SQLite: ${String(sCount).padStart(4)}  PG: ${String(pCount).padStart(4)}`)
  }

  await pg.end()
  await prisma.$disconnect()
  console.log("\n🏁 Migración completada.")

  if (totalFailed > 0 || totalRemaining > 0) {
    process.exit(1)
  }
}

main().catch((err) => {
  console.error("\n💥 Error fatal:", err.message)
  pg.end().catch(() => {})
  prisma.$disconnect().catch(() => {})
  process.exit(1)
})
