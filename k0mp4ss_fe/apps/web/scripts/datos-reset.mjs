#!/usr/bin/env node
/**
 * scripts/datos:reset.mjs — devuelve la base de desarrollo a cero y la resiembra.
 *
 * Por qué existe: los datos cargados hoy son de PRUEBA (decisión del owner: se usan hasta cargar la
 * información real) y no hay forma corta de volver al punto de partida. La receta se hacía a mano
 * —borrar el archivo, migrar, generar el client y correr los dos seeds— y el orden importa: si el
 * último `prisma generate` de la máquina fue el del schema PostgreSQL (job `unit-pg`), el seed
 * corre con el client equivocado y muere contra SQLite (misma trampa que ya documenta
 * `e2e-fresh.mjs`).
 *
 * Este comando NO migra ni convierte datos: borra la base local y la reconstruye con los mocks.
 * Los datos del navegador (`localStorage`) son otra mitad del wipe y no se tocan desde acá.
 *
 * Guarda de entorno (no es opcional): se niega a correr en producción o contra cualquier base que
 * no sea un archivo SQLite local. La destrucción de una base Postgres es decisión del owner con
 * `backup:db`/`restore:db`, nunca un `npm run`.
 *
 * Uso (desde k0mp4ss_fe/apps/web):
 *   npm run datos:reset
 *   npm run datos:reset -- --db perf-e2e.db          # otra base SQLite descartable
 *   npm run datos:reset -- --comunidad-id=comunidad-b
 *   npm run datos:reset -- --help
 *
 * Flags:
 *   --db <archivo>         base relativa a prisma/ (default `dev.db`)
 *   --comunidad-id <id>    comunidad destino del seed de mocks (default `comunidad-a`)
 *   --help                 esta ayuda
 */
import { existsSync, readFileSync, rmSync } from "node:fs"
import path from "node:path"
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"

const APP_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const PRISMA_DIR = path.join(APP_DIR, "prisma")
const SCHEMA = "prisma/schema.sqlite.prisma"
const DB_POR_DEFECTO = "dev.db"
const COMUNIDAD_POR_DEFECTO = "comunidad-a"
/** Sufijos que SQLite deja al lado del archivo principal. */
const SUFIJOS_SQLITE = ["", "-journal", "-shm", "-wal"]

const AYUDA = `datos:reset — borra la base local y la resiembra con los mocks

  npm run datos:reset                        base prisma/dev.db + comunidad-a
  npm run datos:reset -- --db perf-x.db      otra base SQLite descartable
  npm run datos:reset -- --comunidad-id=...  comunidad destino del seed

Flag                    Descripción
--db <archivo>          Base relativa a prisma/ (default ${DB_POR_DEFECTO})
--comunidad-id <id>     Comunidad destino de seed:mocks (default ${COMUNIDAD_POR_DEFECTO})
--help                  Esta ayuda

Guarda dura: no corre si el entorno efectivo es producción ni si DATABASE_URL no es un
\`file:\` local. La base se BORRA: no hay migración de datos.`

/* ---------- guarda de entorno (exportada: la fija su test) ---------- */

/**
 * Lee DATABASE_URL del entorno o, si falta, de los .env del proyecto (el shell gana).
 *
 * @param {Record<string, string | undefined>} [entorno]
 * @param {string[]} [archivosEnv]
 */
export function resolverDatabaseUrl(entorno = {}, archivosEnv = []) {
  const delEntorno = entorno.DATABASE_URL?.trim()
  if (delEntorno) return delEntorno
  for (const contenido of archivosEnv) {
    const match = contenido.match(/^\s*DATABASE_URL\s*=\s*(.+)$/m)
    if (!match) continue
    return match[1].trim().replace(/^["']|["']$/g, "")
  }
  return ""
}

/**
 * Entorno efectivo de la app mirando **las dos** variables.
 *
 * El `??` encadenado que usaba `main()` tenía un agujero real: con
 * `NEXT_PUBLIC_APP_ENV=development` en el `.env` y `APP_ENV=production` en el shell, el primero
 * ganaba y la guarda de un comando destructivo quedaba abierta. Acá gana el más restrictivo.
 *
 * @param {Record<string, string | undefined>} [entorno]
 */
export function entornoEfectivo(entorno = {}) {
  const variables = [entorno.NEXT_PUBLIC_APP_ENV, entorno.APP_ENV]
    .map((v) => String(v ?? "").trim())
    .filter(Boolean)
  const produccion = variables.find((v) => /^prod/i.test(v))
  return produccion ?? variables[0] ?? ""
}

/**
 * Decide si el reset puede correr. Devuelve `{ ok, motivo?, dbPath? }`.
 *
 * Tres rechazos, en este orden: entorno efectivo de producción (aunque la base parezca local),
 * DATABASE_URL ausente, y DATABASE_URL que no sea `file:` (Postgres de producción o de CI).
 *
 * @param {{ databaseUrl?: string, appEnv?: string, nodeEnv?: string }} [opciones]
 */
export function evaluarEntorno({ databaseUrl = "", appEnv = "", nodeEnv = "" } = {}) {
  const entorno = String(appEnv || "").toLowerCase()
  const runtime = String(nodeEnv || "").toLowerCase()
  if (entorno === "production" || entorno === "prod") {
    return {
      ok: false,
      motivo:
        "entorno efectivo de producción (NEXT_PUBLIC_APP_ENV/APP_ENV=production): el wipe de datos es del owner, no de un npm run",
    }
  }
  if (runtime === "production") {
    return {
      ok: false,
      motivo:
        "NODE_ENV=production: datos:reset sólo opera sobre una base de desarrollo local",
    }
  }
  if (!databaseUrl) {
    return {
      ok: false,
      motivo:
        "DATABASE_URL ausente: definila en el entorno o en apps/web/.env antes de correr el wipe",
    }
  }
  if (!databaseUrl.startsWith("file:")) {
    return {
      ok: false,
      motivo: `DATABASE_URL no es SQLite local (${databaseUrl.split(":")[0]}://…): el wipe de una base gestionada se hace con backup:db/restore:db y decisión del owner`,
    }
  }
  const relativa = databaseUrl.slice("file:".length)
  return { ok: true, dbPath: path.resolve(PRISMA_DIR, relativa) }
}

/* ---------- argumentos ---------- */

const argv = process.argv.slice(2)

function leerArgs(args) {
  const opciones = { db: null, comunidadId: COMUNIDAD_POR_DEFECTO, ayuda: false }
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === "--help" || arg === "-h") {
      opciones.ayuda = true
    } else if (arg === "--db") {
      opciones.db = args[++i]
      if (!opciones.db) throw new Error("--db necesita un archivo (ej.: --db perf-x.db)")
    } else if (arg.startsWith("--db=")) {
      opciones.db = arg.slice("--db=".length)
    } else if (arg === "--comunidad-id") {
      opciones.comunidadId = args[++i]
      if (!opciones.comunidadId) throw new Error("--comunidad-id necesita un id")
    } else if (arg.startsWith("--comunidad-id=")) {
      opciones.comunidadId = arg.slice("--comunidad-id=".length)
    } else {
      throw new Error(`argumento desconocido: ${arg}\n\n${AYUDA}`)
    }
  }
  return opciones
}

/* ---------- receta ---------- */

function correr(comando, args) {
  console.log(`\n$ ${comando} ${args.join(" ")}`)
  const r = spawnSync(comando, args, { cwd: APP_DIR, stdio: "inherit" })
  const codigo = r.status ?? 1
  if (r.error || codigo !== 0) {
    throw new Error(`"${comando} ${args.join(" ")}" falló (${r.error?.message ?? `exit ${codigo}`})`)
  }
}

function leerEnv() {
  const contenidos = []
  for (const archivo of [".env", ".env.local"]) {
    const ruta = path.join(APP_DIR, archivo)
    if (existsSync(ruta)) contenidos.push(readFileSync(ruta, "utf8"))
  }
  return contenidos
}

function banner(dbPath, comunidadId) {
  const linea = "=".repeat(76)
  console.log(`\n${linea}`)
  console.log(" datos:reset — la base local vuelve a cero y se resiembra")
  console.log(linea)
  console.log(` Archivo SQLite   : ${dbPath}`)
  console.log(` Comunidad seed   : ${comunidadId}`)
  console.log(" Qué se pierde    : TODO lo cargado en la base (los datos de hoy son de prueba)")
  console.log(" Qué NO se toca   : el navegador (localStorage) ni Data/NSGC/backups/")
  console.log(`${linea}\n`)
}

function main() {
  const opciones = leerArgs(argv)
  if (opciones.ayuda) {
    console.log(AYUDA)
    return
  }

  const databaseUrl = opciones.db
    ? `file:./${opciones.db}`
    : resolverDatabaseUrl(process.env, leerEnv())
  const veredicto = evaluarEntorno({
    databaseUrl,
    appEnv: entornoEfectivo(process.env),
    nodeEnv: process.env.NODE_ENV ?? "",
  })
  if (!veredicto.ok) {
    console.error(`datos:reset — ABORTADO: ${veredicto.motivo}`)
    process.exit(1)
  }

  const dbPath = veredicto.dbPath
  if (path.basename(dbPath).includes("dev.db") === false && !/^perf[\w.-]*\.db$/.test(path.basename(dbPath))) {
    console.warn(
      `datos:reset — aviso: "${path.basename(dbPath)}" no es dev.db ni sigue la convención perf*.db. ` +
        "Sigo sólo porque es una base SQLite local."
    )
  }

  // El client de Prisma y los seeds leen DATABASE_URL del entorno: fijarlo acá evita que un
  // `prisma generate` previo del schema PostgreSQL (job unit-pg) rompa la receta.
  process.env.DATABASE_URL = databaseUrl
  banner(dbPath, opciones.comunidadId)

  for (const sufijo of SUFIJOS_SQLITE) {
    const archivo = `${dbPath}${sufijo}`
    if (!existsSync(archivo)) continue
    rmSync(archivo, { force: true })
    console.log(`datos:reset — borrado ${path.relative(APP_DIR, archivo)}`)
  }

  correr("npx", ["prisma", "migrate", "deploy", `--schema=${SCHEMA}`])
  correr("npx", ["prisma", "generate", `--schema=${SCHEMA}`])
  correr("npm", ["run", "seed:authz"])
  correr("npm", ["run", "seed:mocks", "--", `--comunidad-id=${opciones.comunidadId}`])

  console.log("\ndatos:reset — listo: base local recreada y sembrada.")
  console.log("  Cuentas TEST: admin@test.cl · comite@test.cl · conserjeria@test.cl ·")
  console.log("                residente@test.cl · mantencion@test.cl · arrendatario@test.cl")
  console.log("  Password: Test1234!  (seed:authz)")
}

if (process.argv[1] && process.argv[1].endsWith("datos-reset.mjs")) {
  try {
    main()
  } catch (err) {
    console.error(`\ndatos:reset — ABORTADO: ${err.message}`)
    process.exit(1)
  }
}
