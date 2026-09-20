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

import { Client } from "pg"
import Database from "better-sqlite3"
import fs from "fs"

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

const sqlite = new Database(dbPath)
sqlite.pragma("journal_mode = WAL")
const pg = new Client({ connectionString: POSTGRES_URL })

/**
 * Obtiene lista de tablas de SQLite, excluyo _prisma_migrations.
 * Comunidad va primero (raíz del tenant), luego orden alfabético.
 */
function getTables() {
  const rows = sqlite
    .prepare(
      `SELECT name FROM sqlite_master
       WHERE type = 'table'
         AND name NOT LIKE 'sqlite_%'
         AND name != '_prisma_migrations'
       ORDER BY name`
    )
    .all()
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
    pendingRows || sqlite.prepare(`SELECT * FROM "${tableName}"`).all()

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

      const BATCH_SIZE = 100

      function convertRow(row) {
        return columns.map((col) => {
          const v = row[col]
          if (v == null) return null
          if (v instanceof Date) return v.toISOString()
          if (typeof v === "number" && v > 1_000_000_000_000 && v < 3_000_000_000_000) {
            return new Date(v).toISOString()
          }
          if (typeof v === "object") return JSON.stringify(v)
          return v
        })
      }

      // Procesar en batches para velocidad
      for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        const batch = rows.slice(i, i + BATCH_SIZE)
        const batchValues = []
        const placeholders = []
        let paramIdx = 1

        for (const row of batch) {
          const rowValues = convertRow(row)
          const rowPlaceholders = rowValues.map(() => `$${paramIdx++}`).join(", ")
          placeholders.push(`(${rowPlaceholders})`)
          batchValues.push(...rowValues)
        }

        const batchSql = `
          INSERT INTO "${tableName}" (${columnList})
          VALUES ${placeholders.join(", ")}
          ON CONFLICT ("id") DO UPDATE SET ${updates}
        `

        try {
          await pg.query(batchSql, batchValues)
          inserted += batch.length
        } catch (err) {
          // Batch falló: fallback fila por fila para identificar problema
          for (const row of batch) {
            const values = convertRow(row)
            try {
              await pg.query(insertSql, values)
              inserted++
            } catch (err2) {
              if (err2.code === "23503") {
                remaining.push(row)
              } else {
                failed++
                if (errors.length < 3) {
                  errors.push({ row: row.id || "?", code: err2.code, message: err2.message })
                }
              }
            }
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

  const tables = getTables()
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
    } else {
      delete globalRemaining[table]
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

  for (const [table, s] of Object.entries(stats)) {
    totalInserted += s.inserted
    totalFailed += s.failed
    const hasRemaining = globalRemaining[table]?.length > 0
    const status = s.failed === 0 && !hasRemaining ? "✅" : "⚠️"
    console.log(`${status} ${table.padEnd(30)} ${String(s.inserted).padStart(6)} / ${String(s.total).padStart(6)}`)
  }

  const totalRemaining = Object.values(globalRemaining).reduce((sum, rows) => sum + rows.length, 0)

  console.log("-".repeat(60))
  console.log(`   Total: ${totalInserted} insertadas, ${totalFailed} fallidas, ${totalRemaining} FK pendientes`)

  if (totalRemaining > 0) {
    console.log("\n⚠️  Algunas filas quedaron pendientes por FK violations.")
    console.log("   Posibles causas: datos huérfanos en SQLite o tablas faltantes.")
  }

  // Verificación: conteos por tabla
  console.log("\n🔍 Verificación de conteos:")
  for (const table of tables) {
    const sqliteCount = sqlite.prepare(`SELECT COUNT(*) as c FROM "${table}"`).get()
    const pgCount = await pg.query({ text: "SELECT COUNT(*) as c FROM " + pg.escapeIdentifier(table) })
    const sCount = Number(sqliteCount.c)
    const pCount = Number(pgCount.rows[0].c)
    const ok = sCount === pCount ? "✅" : "❌"
    console.log(`   ${ok} ${table.padEnd(30)} SQLite: ${String(sCount).padStart(4)}  PG: ${String(pCount).padStart(4)}`)
  }

  sqlite.close()
  await pg.end()
  console.log("\n🏁 Migración completada.")

  if (totalFailed > 0 || totalRemaining > 0) {
    process.exit(1)
  }
}

main().catch((err) => {
  console.error("\n💥 Error fatal:", err.message)
  pg.end().catch(() => {})
  sqlite.close()
  process.exit(1)
})
