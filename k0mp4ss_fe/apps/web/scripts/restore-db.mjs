#!/usr/bin/env node
/**
 * D-vi — restore:db (SG §3): restaura la BD Prisma (SQLite dev) desde un backup
 * de Data/NSGC/backups/ generado por backup:db.
 *
 * Seguridad:
 *  - Rechaza ejecutarse con APP_ENV/NEXT_PUBLIC_APP_ENV=production.
 *  - Exige confirmación explícita: flag --yes o env RESTORE_CONFIRM=1.
 *  - Crea un snapshot "pre-restore" del estado actual ANTES de restaurar.
 *
 * Uso:
 *   npm run restore:db -- db-20260827T163000      (dir específico)
 *   npm run restore:db -- latest                  (backup más reciente)
 *   npm run restore:db -- latest --yes
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs"
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
  for (const envFile of [path.join(WEB_ROOT, ".env"), path.join(WEB_ROOT, ".env.local")]) {
    if (!existsSync(envFile)) continue
    const match = readFileSync(envFile, "utf8").match(/^DATABASE_URL=(.+)$/m)
    if (!match) continue
    const raw = match[1].trim().replace(/^["']|["']$/g, "")
    if (!raw.startsWith("file:")) throw new Error(`DATABASE_URL no-SQLite no soportado por restore:db: ${raw}`)
    return path.resolve(WEB_ROOT, "prisma", raw.slice("file:".length))
  }
  throw new Error("DATABASE_URL no encontrado en .env/.env.local")
}

function guardasEntorno() {
  const env = (process.env.NEXT_PUBLIC_APP_ENV ?? process.env.APP_ENV ?? process.env.NODE_ENV ?? "development").toLowerCase()
  if (env === "production" || env === "prod") {
    throw new Error("restore:db bloqueado en producción (APP_ENV=production). Restauración gestionada por el owner.")
  }
}

function confirmado() {
  return process.argv.includes("--yes") || process.env.RESTORE_CONFIRM === "1"
}

function elegirBackup(backupsDir, arg) {
  if (!existsSync(backupsDir)) throw new Error(`No existe ${backupsDir}`)
  const dirs = readdirSync(backupsDir)
    .filter((d) => d.startsWith("db-") && existsSync(path.join(backupsDir, d, "manifest.json")))
    .sort()
  if (dirs.length === 0) throw new Error("No hay backups de BD en Data/NSGC/backups/ (corre npm run backup:db primero)")
  if (!arg || arg === "latest") {
    console.log(`restore:db → backup más reciente: ${dirs[dirs.length - 1]}`)
    return path.join(backupsDir, dirs[dirs.length - 1])
  }
  const elegido = dirs.find((d) => d === arg || d.startsWith(arg))
  if (!elegido) throw new Error(`Backup "${arg}" no encontrado. Disponibles: ${dirs.join(", ")}`)
  return path.join(backupsDir, elegido)
}

async function main() {
  guardasEntorno()
  if (!confirmado()) {
    console.error("restore:db ABORTADO: sobrescribe la BD actual. Requiere --yes o RESTORE_CONFIRM=1.")
    process.exit(1)
  }

  const repoRoot = findRepoRoot()
  const backupsDir = path.join(repoRoot, "Data", "NSGC", "backups")
  const arg = process.argv.find((a) => a.startsWith("db-") || a === "latest")
  const backupDir = elegirBackup(backupsDir, arg)

  const manifestPath = path.join(backupDir, "manifest.json")
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"))
  const dbSource = path.join(backupDir, "sqlite", manifest.databaseUrlFile)
  if (!existsSync(dbSource)) throw new Error(`Copia SQLite faltante en el backup: ${dbSource}`)

  const dbPath = resolveDbPath()
  console.log(`restore:db → ${path.relative(repoRoot, dbPath)} desde ${path.basename(backupDir)}`)

  // 1. Snapshot pre-restore del estado actual (mismo pipeline que backup:db)
  const { spawnSync } = await import("node:child_process")
  const pre = spawnSync(process.execPath, [path.join(WEB_ROOT, "scripts", "backup-db.mjs"), "--label=pre-restore"], { stdio: "inherit" })
  if (pre.status !== 0) throw new Error("Snapshot pre-restore falló — no se toca la BD actual")

  // 2. Copia el archivo de vuelta y elimina sidecars WAL/SHM obsoletos
  copyFileSync(dbSource, dbPath)
  for (const ext of ["-wal", "-shm"]) {
    const side = `${dbPath}${ext}`
    if (existsSync(side)) rmSync(side)
  }

  // 3. Verificación: abre la BD restaurada y compara conteos vs manifest
  const { PrismaClient } = await import("@prisma/client")
  const prisma = new PrismaClient()
  let ok = 0
  let diferencias = 0
  for (const [model, esperado] of Object.entries(manifest.counts)) {
    const delegate = model.charAt(0).toLowerCase() + model.slice(1)
    if (typeof prisma[delegate]?.count !== "function") continue
    const actual = await prisma[delegate].count()
    if (actual === esperado) ok++
    else {
      diferencias++
      console.warn(`  ⚠ ${model}: manifest=${esperado} bd=${actual}`)
    }
  }
  await prisma.$disconnect()

  console.log(`restore:db ${diferencias === 0 ? "OK" : "OK con diferencias"} → ${ok} tablas verificadas contra manifest (${diferencias} divergencias)`)
  if (diferencias > 0) process.exit(2)
}

main().catch((e) => {
  console.error("restore:db FALLO:", e.message)
  process.exit(1)
})
