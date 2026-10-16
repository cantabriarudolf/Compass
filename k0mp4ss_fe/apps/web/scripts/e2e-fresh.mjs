#!/usr/bin/env node
/**
 * e2e:fresh — prepara una base descartable y deja lista la lane e2e con paridad CI.
 *
 * Por qué existe: la receta e2e (`migrate deploy` + `e2e:reseed-base` + `build` +
 * `CI=1 npx playwright test`) se replicó a mano 4 veces en SERIE-NOCHE-3, con dos
 * trampas ya sufridas:
 *   1. `CI=1` fija `reuseExistingServer: false` en `playwright.config.ts`: si queda un
 *      `next-server` huérfano en :3000 la lane muere antes de empezar (incidente P4
 *      de NOCHE-3).
 *   2. Olvidar exportar `DATABASE_URL` termina corriendo la lane contra `prisma/dev.db`,
 *      que las reglas duras de la serie prohíben tocar.
 *
 * El shell env gana sobre `.env` (Next y dotenv sólo setean variables ausentes de
 * `process.env`), así que exportar `DATABASE_URL` acá es suficiente para la lane entera.
 *
 * Uso (desde k0mp4ss_fe/apps/web):
 *   npm run e2e:fresh                                  # prepara la base e imprime el comando
 *   npm run e2e:fresh -- --no-build --db perf-x.db      # reusa otra base, sin build
 *   npm run e2e:fresh -- -- e2e/smoke --grep "mobile"   # prepara Y corre Playwright
 *
 * Flags:
 *   --db <archivo>   base descartable a usar (default `perf-e2e.db`, relativa a prisma/)
 *   --keep-db        no recrear la base (por defecto se borra: "fresh" de verdad)
 *   --no-build       saltea `npm run build` (sólo válido si ya hay build reciente)
 *   --help           esta ayuda
 *
 * Todo lo que siga a `--` se pasa tal cual a Playwright y, además, hace que el script
 * corra el comando en vez de sólo imprimirlo. Con npm el primer `--` lo consume npm,
 * así que la invocación real lleva doble separador: `npm run e2e:fresh -- -- <specs>`.
 *
 * NUNCA toca `prisma/dev.db` (guarda dura) ni `Data/NSGC/backups/`.
 */
/* global process, console */
import { execFileSync, spawnSync } from "node:child_process"
import { existsSync, readFileSync, rmSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const APP_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const PRISMA_DIR = path.join(APP_DIR, "prisma")
const SCHEMA = "prisma/schema.sqlite.prisma"
const PUERTO = 3000
const DB_POR_DEFECTO = "perf-e2e.db"

// Specs canónicos de la serie: smoke completo + los 9 crud refactorizados de NOCHE-3.
const SPECS_CANONICOS = [
  "e2e/smoke",
  "e2e/crud/recursos.spec.ts",
  "e2e/crud/proyectos.spec.ts",
  "e2e/crud/directiva.spec.ts",
  "e2e/crud/gestion.spec.ts",
  "e2e/crud/portal.spec.ts",
  "e2e/crud/comunicacion.spec.ts",
  "e2e/crud/solicitudes.spec.ts",
  "e2e/crud/visor.spec.ts",
  "e2e/crud/poblado-idempotente.spec.ts",
]

const AYUDA = `e2e:fresh — base descartable + lane e2e con paridad CI

  npm run e2e:fresh                                 prepara la base e imprime el comando
  npm run e2e:fresh -- --db perf-x.db --no-build     reusa otra base, sin build
  npm run e2e:fresh -- -- e2e/smoke                  prepara y corre Playwright

Flag       Descripción
--db       Base descartable relativa a prisma/ (default ${DB_POR_DEFECTO})
--keep-db  No recrear la base (por defecto se borra para garantizar "fresh")
--no-build Saltear \`npm run build\` (sólo si hay un build reciente)
--help     Esta ayuda

Lo que siga a \`--\` se pasa tal cual a Playwright y dispara la corrida. Con npm el
primer \`--\` lo consume npm, por eso se escribe doble: \`npm run e2e:fresh -- -- <specs>\`.`

/* ---------- argumentos ---------- */

const argv = process.argv.slice(2)
const separador = argv.indexOf("--")
const propios = separador === -1 ? argv : argv.slice(0, separador)
const argsPlaywright = separador === -1 ? [] : argv.slice(separador + 1)

let dbArg = DB_POR_DEFECTO
let recrearBase = true
let correrBuild = true

for (let i = 0; i < propios.length; i++) {
  const arg = propios[i]
  if (arg === "--help" || arg === "-h") {
    console.log(AYUDA)
    process.exit(0)
  } else if (arg === "--db") {
    dbArg = propios[++i]
    if (!dbArg) {
      console.error("e2e:fresh — --db necesita un archivo (ej: --db perf-x.db)")
      process.exit(2)
    }
  } else if (arg === "--keep-db") {
    recrearBase = false
  } else if (arg === "--no-build") {
    correrBuild = false
  } else {
    console.error(
      `e2e:fresh — argumento desconocido: ${arg}\n\n` +
        "Los flags propios van antes: --db, --keep-db, --no-build, --help.\n" +
        "Para pasarle argumentos a Playwright usá el separador `--`. Con npm, npm se queda\n" +
        "con el primer `--`, así que va doble:\n\n" +
        "  npm run e2e:fresh -- -- e2e/crud/poblado-idempotente.spec.ts e2e/smoke\n",
    )
    process.exit(2)
  }
}

/* ---------- base descartable (guarda dura contra dev.db) ---------- */

const dbPath = path.resolve(PRISMA_DIR, dbArg)
const dbNombre = path.basename(dbPath)

if (dbNombre.includes("dev.db")) {
  console.error(
    `e2e:fresh — ABORTADO: "${dbPath}" es la base de desarrollo.\n` +
      "Las corridas e2e usan bases descartables; `prisma/dev.db` no se toca nunca.",
  )
  process.exit(1)
}
if (!/^perf[\w.-]*\.db$/.test(dbNombre)) {
  console.warn(
    `e2e:fresh — aviso: "${dbNombre}" no sigue la convención de bases descartables ` +
      `perf*.db (gitignored). Sigo con esa base sólo porque no es dev.db.`,
  )
}

const urlRelativa = path.dirname(dbPath) === PRISMA_DIR
const databaseUrl = urlRelativa ? `file:./${dbNombre}` : `file:${dbPath}`
process.env.DATABASE_URL = databaseUrl

/* ---------- helpers ---------- */

function correr(comando, args, { permitirFallo = false, env = process.env } = {}) {
  console.log(`\n$ ${comando} ${args.join(" ")}`)
  const r = spawnSync(comando, args, {
    cwd: APP_DIR,
    stdio: "inherit",
    env,
  })
  const codigo = r.status ?? 1
  if (r.error || (codigo !== 0 && !permitirFallo)) {
    const detalle = r.error ? r.error.message : `exit ${codigo}`
    throw new Error(`"${comando} ${args.join(" ")}" falló (${detalle})`)
  }
  return codigo
}

function pidEnPuerto(puerto) {
  try {
    return execFileSync("lsof", ["-ti", `tcp:${puerto}`], { encoding: "utf8" })
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean)
  } catch (err) {
    // lsof sin resultados sale 1; si no existe, se cae a `ss`.
    if (err.status === 1) return []
    try {
      const salida = execFileSync("ss", ["-lptnH", `sport = :${puerto}`], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      })
      return [...salida.matchAll(/pid=(\d+)/g)].map((m) => m[1])
    } catch {
      return []
    }
  }
}

function cmdline(pid) {
  try {
    return readFileSync(`/proc/${pid}/cmdline`, "utf8").replace(/\0/g, " ").trim()
  } catch {
    return ""
  }
}

function sigueVivo(pid) {
  try {
    process.kill(Number(pid), 0)
    return true
  } catch {
    return false
  }
}

/** Saneo del puerto 3000: con CI=1 Playwright no reusa un server ya levantado. */
function sanearPuerto() {
  const pids = pidEnPuerto(PUERTO)
  if (pids.length === 0) {
    console.log(`e2e:fresh — puerto ${PUERTO} libre.`)
    return
  }
  for (const pid of pids) {
    const cmd = cmdline(pid)
    if (/next-server|next start/.test(cmd)) {
      console.log(`e2e:fresh — terminando next-server huérfano (pid ${pid}, :${PUERTO})`)
      try {
        process.kill(Number(pid), "SIGTERM")
      } catch {
        /* ya murió */
      }
      const limite = Date.now() + 5_000
      while (sigueVivo(pid) && Date.now() < limite) {
        execFileSync("sleep", ["0.1"])
      }
      if (sigueVivo(pid)) {
        try {
          process.kill(Number(pid), "SIGKILL")
        } catch {
          /* ya murió */
        }
      }
    } else {
      console.warn(
        `e2e:fresh — aviso: el puerto ${PUERTO} lo ocupa otro proceso (pid ${pid}: ` +
          `"${cmd || "desconocido"}"). Con CI=1 Playwright no reusa server: detenelo ` +
          "antes de correr la lane.",
      )
    }
  }
}

function banner() {
  const linea = "=".repeat(76)
  console.log(`\n${linea}`)
  console.log(" e2e:fresh — base descartable lista para la lane con paridad CI")
  console.log(linea)
  console.log(` Base (DATABASE_URL) : ${databaseUrl}`)
  console.log(` Archivo SQLite      : ${dbPath}`)
  console.log(` Base recreada       : ${recrearBase ? "sí (borrada y migrada de cero)" : "no (--keep-db)"}`)
  console.log(` Build de producción : ${correrBuild ? "hecha (next build)" : "salteada (--no-build)"}`)
  console.log("----------------------------------------------------------------------------")
  console.log(" Comando Playwright exacto (paridad CI):")
  console.log(
    argsPlaywright.length === 0
      ? `   CI=1 npx playwright test ${SPECS_CANONICOS.join(" ")}`
      : `   CI=1 npx playwright test ${argsPlaywright.join(" ")}`,
  )
  if (argsPlaywright.length === 0) {
    console.log("   (specs canónicos de la serie: smoke + los 9 crud de NOCHE-3)")
    console.log("   Sin `--` el script sólo imprime el comando; agregalo para que lo corra:")
    console.log(
      "   npm run e2e:fresh -- -- e2e/crud/poblado-idempotente.spec.ts e2e/smoke",
    )
  }
  console.log("----------------------------------------------------------------------------")
  console.log(" AVISO: NO corras e2e/auth/rate-limit.spec.ts antes de la lane:")
  console.log("        bloquea la IP 15 min y aborta `auth.setup`.")
  console.log(`${linea}\n`)
}

/* ---------- receta ---------- */

function main() {
  console.log("e2e:fresh — preparando base descartable (nunca prisma/dev.db)")

  if (recrearBase) {
    for (const sufijo of ["", "-journal", "-shm", "-wal"]) {
      const archivo = `${dbPath}${sufijo}`
      if (existsSync(archivo)) {
        rmSync(archivo, { force: true })
        console.log(`e2e:fresh — borrado ${path.relative(APP_DIR, archivo)}`)
      }
    }
  } else if (!existsSync(dbPath)) {
    console.warn(`e2e:fresh — aviso: --keep-db pero ${dbPath} no existe; se migra de cero.`)
  }

  sanearPuerto()

  correr("npx", ["prisma", "migrate", "deploy", `--schema=${SCHEMA}`])
  correr("npm", ["run", "e2e:reseed-base"])
  if (correrBuild) correr("npm", ["run", "build"])
  else console.log("\ne2e:fresh — build salteado (--no-build)")

  banner()

  if (argsPlaywright.length > 0) {
    // Paridad CI de verdad: sin `CI=1` Playwright usa `next dev`, `reuseExistingServer:
    // true` y Chrome del sistema en vez del chromium embebido. El banner imprime el
    // comando con `CI=1`, así que la corrida tiene que llevar exactamente ese entorno.
    const envPlaywright = { ...process.env, CI: "1" }
    console.log("e2e:fresh — corriendo Playwright con CI=1 (paridad CI)")
    correr("npx", ["playwright", "test", ...argsPlaywright], { env: envPlaywright })
  }
}

try {
  main()
} catch (err) {
  console.error(`\ne2e:fresh — ABORTADO: ${err.message}`)
  process.exit(1)
}
