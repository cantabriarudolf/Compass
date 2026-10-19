/**
 * test/db-descartable.setup.ts — base descartable + guarda dura contra `prisma/dev.db`.
 *
 * Por qué existe (deuda declarada al cerrar SERIE-DEUDA-1): este proyecto resolvía la
 * base de la suite a `prisma/dev.db` cuando nadie exportaba `DATABASE_URL`, así que
 * `npm test` escribía la base de desarrollo del owner. Los 43 archivos de `test/api/**`
 * usan Prisma real (51 archivos de test importan `@/lib/prisma`), de modo que un test
 * que no limpie ensucia datos reales.
 *
 * Contrato:
 *   1. Sin `DATABASE_URL` en el entorno → base descartable `prisma/perf-test.db`
 *      (recreada y migrada de cero por `test/db-descartable-global.setup.ts`).
 *   2. Con `DATABASE_URL` en el entorno → se respeta tal cual (incluido PostgreSQL).
 *   3. Si el destino resuelve a `dev.db` por cualquier vía → **aborta siempre**, con
 *      mensaje explícito y sin importar si corre en un runner de CI o local. Es la
 *      misma guarda dura que la de `scripts/e2e-fresh.mjs`.
 *
 * Historia: D1 dejó una excepción para el job `unit` de `ci.yml`, que exportaba
 * `DATABASE_URL: file:./dev.db`; la ventana E4 de SERIE-DEUDA-3 alineó los 3 valores
 * del workflow a `file:./perf-test.db` y **quitó la excepción**, así que la guarda
 * vuelve a ser absoluta. Ver openspec/changes/ci-db-descartable/proposal.md.
 */
import path from "node:path"

/** Nombre por defecto de la base descartable (gitignored: `*.db` en k0mp4ss_fe/.gitignore). */
export const DB_DESCARTABLE_POR_DEFECTO = "perf-test.db"

/** Raíz de la app (`k0mp4ss_fe/apps/web`); este archivo vive en `test/`. */
export const APP_DIR = path.resolve(__dirname, "..")

/** Directorio del schema; Prisma resuelve las rutas `file:` relativas contra él. */
export const PRISMA_DIR = path.join(APP_DIR, "prisma")

/** Schema SQLite (dual SQLite/PostgreSQL: ver st-migracion-postgres). */
export const SCHEMA_SQLITE = "prisma/schema.sqlite.prisma"

/**
 * De dónde salió el destino:
 * - `default` → nadie exportó `DATABASE_URL`; base descartable.
 * - `entorno` → `DATABASE_URL` del entorno, respetada.
 */
export type OrigenDestino = "default" | "entorno"

/** Entorno de proceso (`process.env` lo satisface); los tests pasan literales. */
export type Entorno = Record<string, string | undefined>

export interface DestinoBase {
  /** `DATABASE_URL` efectiva que verá Prisma. */
  url: string
  /** Ruta absoluta del archivo SQLite; `null` si la base no es un archivo (ej. PostgreSQL). */
  archivo: string | null
  /** De dónde salió la URL. */
  origen: OrigenDestino
  /** `true` si el destino es la base de desarrollo (`dev.db`, backups incluidos). */
  esDevDb: boolean
}

/** Ruta absoluta de una URL `file:`; `null` si no es un archivo. */
export function archivoDeUrl(
  url: string,
  appDir: string = APP_DIR
): string | null {
  if (!url.startsWith("file:")) return null
  const crudo = decodeURIComponent(
    url.slice("file:".length).split("?")[0] ?? ""
  )
  if (crudo.startsWith("//")) return path.resolve(crudo.slice(2))
  if (path.isAbsolute(crudo)) return crudo
  // Igual que Prisma (CLI y cliente): relativo al directorio del schema.
  return path.resolve(appDir, "prisma", crudo)
}

/** Resolución cruda del destino pedido (sin guarda): la usa el test del contrato. */
export function resolverDestinoBaseDescartable(
  env: Entorno = process.env,
  appDir: string = APP_DIR
): DestinoBase {
  const crudo = env.DATABASE_URL?.trim()
  const url = crudo ? crudo : urlDescartablePorDefecto(appDir)
  const archivo = archivoDeUrl(url, appDir)
  return {
    url,
    archivo,
    origen: crudo ? "entorno" : "default",
    esDevDb: archivo !== null && path.basename(archivo).includes("dev.db"),
  }
}

function urlDescartablePorDefecto(appDir: string): string {
  return `file:${path.join(appDir, "prisma", DB_DESCARTABLE_POR_DEFECTO)}`
}

/** Texto del aborto si el destino es la base de desarrollo; `null` si es aceptable. */
export function mensajeDeAborto(destino: DestinoBase): string | null {
  if (!destino.esDevDb) return null
  return [
    "",
    "=".repeat(76),
    " test-db-descartable — ABORTADO: la suite escribiría la base de desarrollo.",
    "=".repeat(76),
    ` DATABASE_URL : ${destino.url}`,
    ` archivo      : ${destino.archivo ?? "(no es un archivo)"}`,
    "",
    " La suite de Vitest nunca escribe `prisma/dev.db` (base de desarrollo del owner).",
    " Quitá esa DATABASE_URL y dejá que la suite use la base descartable por defecto,",
    ' o apuntala a otra base (ej. `export DATABASE_URL="file:./perf-local.db"`).',
    " Ver openspec/changes/test-db-descartable/design.md.",
    "=".repeat(76),
    "",
  ].join("\n")
}

/**
 * Aplica el contrato sobre `env` (fija `DATABASE_URL` salvo cuando respeta el entorno)
 * y aborta si el destino es la base de desarrollo. Devuelve el destino de la corrida
 * para que el `globalSetup` sepa qué base preparar.
 */
export function aplicarDestinoBaseDescartable(
  env: Entorno = process.env,
  appDir: string = APP_DIR
): DestinoBase {
  const destino = resolverDestinoBaseDescartable(env, appDir)
  const aborto = mensajeDeAborto(destino)
  if (aborto) {
    console.error(aborto)
    throw new Error(
      `test-db-descartable: ABORTADO — la suite resolvería a ${destino.archivo ?? destino.url}`
    )
  }
  if (destino.origen !== "entorno") env.DATABASE_URL = destino.url
  return destino
}

/** Destino de la corrida, resuelto al cargar este setup (en el proceso principal y en cada worker). */
export const DESTINO_BASE = aplicarDestinoBaseDescartable()
