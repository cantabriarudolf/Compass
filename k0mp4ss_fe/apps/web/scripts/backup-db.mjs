#!/usr/bin/env node
/**
 * D-vi — backup:db (SG §3): vuelca la BD Prisma (SQLite dev) a Data/NSGC/backups/.
 * Genera por timestamp:
 *   db-<ts>/sqlite/dev.db            copia consistente del archivo (WAL flusheada)
 *   db-<ts>/tables/<Model>.json      export JSON por tabla (findMany vía Prisma)
 *   db-<ts>/manifest.json            meta + conteos + sha256 del archivo
 * Uso: npm run backup:db [-- --label=pre-restore]
 */
/* global process */
import { createHash } from "node:crypto"
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const WEB_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

function findRepoRoot() {
  let dir = WEB_ROOT
  const root = path.parse(dir).root
  while (dir !== root) {
    if (existsSync(path.join(dir, "openspec")) && existsSync(path.join(dir, "Data"))) return dir
    dir = path.dirname(dir)
  }
  throw new Error("No se encontró la raíz del repo (openspec/ + Data/)")
}

function resolveDbPath() {
  // DATABASE_URL estilo Prisma: file:./dev.db relativo a prisma/
  for (const envFile of [path.join(WEB_ROOT, ".env"), path.join(WEB_ROOT, ".env.local")]) {
    if (!existsSync(envFile)) continue
    const match = readFileSync(envFile, "utf8").match(/^DATABASE_URL=(.+)$/m)
    if (!match) continue
    const raw = match[1].trim().replace(/^["']|["']$/g, "")
    if (!raw.startsWith("file:")) throw new Error(`DATABASE_URL no-SQLite no soportado por backup:db: ${raw}`)
    const rel = raw.slice("file:".length)
    return path.resolve(WEB_ROOT, "prisma", rel)
  }
  throw new Error("DATABASE_URL no encontrado en .env/.env.local")
}

function modelNames() {
  const schema = readFileSync(path.join(WEB_ROOT, "prisma", "schema.prisma"), "utf8")
  return [...schema.matchAll(/^model\s+(\w+)\s*\{/gm)].map((m) => m[1]).filter((n) => n !== "Q")
}

function delegateName(model) {
  return model.charAt(0).toLowerCase() + model.slice(1)
}

function sha256(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex")
}

function timestamp() {
  const d = new Date()
  const p = (n, w = 2) => String(n).padStart(w, "0")
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}T${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
}

async function main() {
  const labelArg = process.argv.find((a) => a.startsWith("--label="))
  const label = labelArg ? labelArg.split("=")[1] : null
  const ts = timestamp()
  const dirName = label ? `db-${ts}-${label}` : `db-${ts}`

  const repoRoot = findRepoRoot()
  const dbPath = resolveDbPath()
  if (!existsSync(dbPath)) throw new Error(`BD no existe: ${dbPath}`)

  const outDir = path.join(repoRoot, "Data", "NSGC", "backups", dirName)
  const sqliteDir = path.join(outDir, "sqlite")
  const tablesDir = path.join(outDir, "tables")
  mkdirSync(sqliteDir, { recursive: true })
  mkdirSync(tablesDir, { recursive: true })

  const { PrismaClient } = await import("@prisma/client")
  const prisma = new PrismaClient()

  // Flush WAL al archivo principal para una copia consistente de solo dev.db
  try {
    await prisma.$queryRawUnsafe("PRAGMA wal_checkpoint(TRUNCATE)")
  } catch {
    // Best-effort: si el checkpoint WAL falla (p. ej. BD sin WAL activo), la copia igual procede.
  }

  const counts = {}
  for (const model of modelNames()) {
    const delegate = delegateName(model)
    if (typeof prisma[delegate]?.findMany !== "function") continue
    const rows = await prisma[delegate].findMany()
    counts[model] = rows.length
    writeFileSync(path.join(tablesDir, `${model}.json`), JSON.stringify(rows, null, 2))
  }

  copyFileSync(dbPath, path.join(sqliteDir, path.basename(dbPath)))
  // Sidecars WAL/SHM por si quedaran (ya flusheados): se copian como evidencia
  for (const ext of ["-wal", "-shm"]) {
    const side = `${dbPath}${ext}`
    if (existsSync(side)) copyFileSync(side, path.join(sqliteDir, path.basename(side)))
  }

  const dbCopy = path.join(sqliteDir, path.basename(dbPath))
  const manifest = {
    generatedAt: new Date().toISOString(),
    label,
    databaseUrlFile: path.basename(dbPath),
    sha256: sha256(dbCopy),
    bytes: statSync(dbCopy).size,
    tables: Object.keys(counts).length,
    totalRows: Object.values(counts).reduce((a, b) => a + b, 0),
    counts,
  }
  writeFileSync(path.join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2))
  await prisma.$disconnect()

  console.log(`backup:db OK → Data/NSGC/backups/${dirName}`)
  console.log(`  tablas: ${manifest.tables} · filas: ${manifest.totalRows} · sha256: ${manifest.sha256.slice(0, 16)}…`)
}

main().catch((e) => {
  console.error("backup:db FALLO:", e.message)
  process.exit(1)
})
