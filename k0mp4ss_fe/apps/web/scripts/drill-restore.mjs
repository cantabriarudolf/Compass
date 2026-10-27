#!/usr/bin/env node
/**
 * db:drill — drill de restauración automatizado (SG §3 D-vi).
 *
 * Por qué existe: el ciclo backup → restore se verificó a mano una sola vez
 * (P7, 2026-08-27). Nada garantizaba que restaurar siga funcionando; ahora el
 * drill corre en CI (job `unit`) y para el trabajo en rojo si algo no cuadra.
 *
 * Qué hace:
 *   (a) Guardas duras: aborta si DATABASE_URL no es `file:` o si el archivo
 *       destino no es `perf*.db` (nunca `dev.db`, nunca producción), o si el
 *       entorno es producción.
 *   (b) Crea SU PROPIO directorio temporal (os.tmpdir()) — nunca escribe en
 *       `Data/NSGC/backups/`: pasa `--dir` a backup y restore.
 *   (c) Corre `backup:db --dir <tmp> --label=drill` (subproceso, mismo pipeline).
 *   (d) Lee el manifest del backup y memoriza los conteos por tabla.
 *   (e) Muta a propósito: inserta una fila marcadora en `RateLimitAttempt`.
 *   (f) Corre `restore:db --dir <tmp> <backup> --yes` (mismo pipeline del runbook).
 *   (g) Verifica: la fila marcadora ya no existe y los conteos coinciden
 *       con el manifest, tabla por tabla.
 *   (h) Borra el directorio temporal (try/finally) y deja el resumen en pantalla.
 *
 * Sale `exit 1` con el detalle del paso que falló.
 *
 * Uso:
 *   DATABASE_URL=file:./perf-test.db npm run db:drill
 */
import { spawnSync } from "node:child_process"
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

const WEB_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const LINEA = "=".repeat(76)

function banner(titulo) {
  console.log(`\n${LINEA}`)
  console.log(` db:drill — ${titulo}`)
  console.log(LINEA)
}

function morir(mensaje) {
  console.error(`\ndb:drill ABORTADO: ${mensaje}`)
  process.exit(1)
}

/* ---------- (a) guardas duras ---------- */

const envProduccion = ["NEXT_PUBLIC_APP_ENV", "APP_ENV", "NODE_ENV"].some((k) => {
  const v = (process.env[k] ?? "").toLowerCase()
  return v === "production" || v === "prod"
})
if (envProduccion) {
  morir("entorno de producción detectado (APP_ENV/NODE_ENV): el drill sólo corre contra bases descartables de pruebas.")
}

const databaseUrl = process.env.DATABASE_URL?.trim()
if (!databaseUrl) {
  morir("DATABASE_URL sin definir. Exportá una base descartable: DATABASE_URL=file:./perf-test.db npm run db:drill")
}
if (!databaseUrl.startsWith("file:")) {
  morir(`DATABASE_URL no es SQLite file: — el drill sólo corre contra bases file: descartables.`)
}
const dbNombre = path.basename(databaseUrl.slice("file:".length))
if (!/^perf[\w.-]*\.db$/.test(dbNombre)) {
  morir(`"${dbNombre}" no es una base descartable perf*.db (nunca dev.db, nunca producción).`)
}
const dbPath = path.resolve(WEB_ROOT, "prisma", databaseUrl.slice("file:".length))
if (!existsSync(dbPath)) {
  morir(`BD "${dbNombre}" no existe en prisma/. Créala primero (p. ej. npm run e2e:reseed-base con esa DATABASE_URL).`)
}

banner("drill de restauración contra base descartable")
console.log(` DATABASE_URL : ${databaseUrl}`)
console.log(` Archivo BD   : ${dbPath}`)

/* ---------- (b) directorio temporal propio ---------- */

const tmp = mkdtempSync(path.join(tmpdir(), "db-drill-"))
let exito = false
try {
  /* ---------- (c) backup al tmpdir (nunca Data/NSGC/backups/) ---------- */
  console.log(`\n[3/8] backup:db → ${tmp}`)
  const backup = spawnSync(
    process.execPath,
    [path.join(WEB_ROOT, "scripts", "backup-db.mjs"), "--dir", tmp, "--label=drill"],
    { stdio: "inherit" },
  )
  if (backup.status !== 0) morir("backup falló — el drill aborta aquí.")

  const backupNombre = readdirSync(tmp)
    .filter((d) => d.startsWith("db-") && existsSync(path.join(tmp, d, "manifest.json")))
    .sort()
    .pop()
  if (!backupNombre) morir(`el backup no dejó ningún dir db-* con manifest en ${tmp}`)

  /* ---------- (d) manifest → conteos memorizados ---------- */
  console.log(`\n[4/8] manifest leído desde ${backupNombre}/manifest.json`)
  const manifest = JSON.parse(readFileSync(path.join(tmp, backupNombre, "manifest.json"), "utf8"))
  console.log(`  tablas: ${manifest.tables} · filas totales: ${manifest.totalRows}`)

  /* ---------- (e) mutación a propósito: fila marcadora ---------- */
  console.log(`\n[5/8] mutación a propósito: fila marcadora en RateLimitAttempt`)
  const claveMarcador = `DRILL-RESTORE-${Date.now()}`
  const { PrismaClient } = await import("@prisma/client")
  const prisma = new PrismaClient()
  try {
    await prisma.rateLimitAttempt.create({ data: { clave: claveMarcador } })
    const insertada = await prisma.rateLimitAttempt.count({ where: { clave: claveMarcador } })
    if (insertada !== 1) morir(`la fila marcadora "${claveMarcador}" no quedó insertada — el drill aborta antes de restore.`)
    console.log(`  clave="${claveMarcador}" insertada (rateLimitAttempt +1 filas)`)
  } finally {
    await prisma.$disconnect()
  }

  /* ---------- (f) restore desde el backup del tmpdir ---------- */
  console.log(`\n[6/8] restore:db ← ${backupNombre} (--dir ${tmp})`)
  const restore = spawnSync(
    process.execPath,
    [path.join(WEB_ROOT, "scripts", "restore-db.mjs"), "--dir", tmp, backupNombre, "--yes"],
    { stdio: "inherit" },
  )
  if (restore.status !== 0) morir("restore falló — el drill aborta aquí.")

  /* ---------- (g) verificación: marker borrado + conteos del manifest ---------- */
  console.log(`\n[7/8] verificación post-restore`)
  const { PrismaClient: PrismaClient2 } = await import("@prisma/client")
  const prisma2 = new PrismaClient2()
  try {
    const quedan = await prisma2.rateLimitAttempt.count({ where: { clave: claveMarcador } })
    if (quedan !== 0) {
      morir(`la fila marcadora "${claveMarcador}" sigue en la BD (${quedan}) — el restore NO volvió al estado del backup.`)
    }
    console.log(`  fila marcadora "${claveMarcador}": borrada ✔`)

    const divergencias = []
    let verificadas = 0
    for (const [modelo, esperado] of Object.entries(manifest.counts)) {
      const delegado = modelo.charAt(0).toLowerCase() + modelo.slice(1)
      if (typeof prisma2[delegado]?.count !== "function") continue
      const actual = await prisma2[delegado].count()
      if (actual === esperado) verificadas++
      else divergencias.push(`${modelo}: manifest=${esperado} bd=${actual}`)
    }
    if (divergencias.length > 0) {
      morir(`divergencias vs manifest en ${divergencias.length} tabla(s):\n  ${divergencias.join("\n  ")}`)
    }
    console.log(`  ${verificadas} tablas verificadas contra manifest, 0 divergencias ✔`)
    exito = true
  } finally {
    await prisma2.$disconnect()
  }
} catch (err) {
  morir(err instanceof Error ? err.message : String(err))
} finally {
  /* ---------- (h) limpieza del tmpdir, siempre ---------- */
  try {
    rmSync(tmp, { recursive: true, force: true })
    console.log(`\n[8/8] tmpdir borrado: ${tmp}`)
  } catch (err) {
    // si la limpieza falla el drill igual sale con su estado real; la ruta queda
    // nombrada para que la borres a mano (es un tmp del SO, no del repo)
    console.warn(`aviso: no pudo borrarse el tmpdir ${tmp} (${err instanceof Error ? err.message : err})`)
  }
}

if (!exito) morir("verificación incompleta")

console.log(`\n${LINEA}`)
console.log(" RESUMEN db:drill — ciclo completo OK")
console.log(LINEA)
console.log(` BD                 : ${dbNombre} (descartable perf*)`)
console.log(` Backup/restaurado  : ${tmp} ya borrado, tmpdir limpio`)
console.log(` Muta → restore     : fila marcadora en RateLimitAttempt insertada y borrada ✔`)
console.log(` Manifest           : conteos verificados tabla por tabla ✔`)
console.log(` Data/NSGC/backups/ : sin escrituras (el drill usó su tmpdir propio) ✔`)
console.log(LINEA)
