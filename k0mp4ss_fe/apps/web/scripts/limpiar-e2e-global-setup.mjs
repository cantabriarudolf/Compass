// globalSetup de Playwright (referenciado desde playwright.config.ts).
//
// Por qué existe: la lane `e2e/crud` crea filas TEST/QA y no siempre las borra, así que cada
// corrida arrancaba de un estado distinto (mismo conteo de fallas, fallas distintas según lo
// que hubiera quedado). Acá se corre `scripts/limpiar-e2e.mjs --apply` —reglas explícitas,
// allowlist dura y guarda SQLite— antes de la suite, para que toda corrida parta del estado
// que dejó el seed.
//
// En CI se omite salvo `E2E_LIMPIEZA_CI=1`: una CI puede apuntar a una base descartable
// (perf-e2e.db) o a una réplica productiva-like, y el objetivo no es tocar estado local
// gitignored sino que el operador humano repita la corrida sobre el mismo dev.db.
//
// Si la limpieza falla (por ejemplo, DATABASE_URL no es SQLite local), la suite NO arranca:
// correr sobre una base que no se pudo limpiar produce resultados que no se pueden comparar.
import { spawnSync } from "node:child_process"
import path from "node:path"
import { fileURLToPath } from "node:url"

// Raíz de la app derivada del propio archivo (`apps/web/scripts/…`), no del cwd ni de
// `config.configDir`: Playwright entrega al hook una copia serializada de la config que no
// incluye `configDir`, y el CLI puede invocarse desde cualquier directorio.
const APP_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

/** @param {import("@playwright/test").FullConfig} _config */
export default async function globalSetup(_config) {
  if (process.env.CI && process.env.E2E_LIMPIEZA_CI !== "1") {
    console.log("[e2e] limpieza previa omitida: CI detectado (E2E_LIMPIEZA_CI=1 para forzarla)")
    return
  }

  const script = path.join(APP_DIR, "scripts", "limpiar-e2e.mjs")
  const limpieza = spawnSync(process.execPath, [script, "--apply"], { cwd: APP_DIR, stdio: "inherit" })
  if (limpieza.error || limpieza.status !== 0) {
    throw new Error(
      `limpieza previa fallida (${limpieza.error?.message ?? `exit ${limpieza.status}`}): ` +
        "la suite no corre sobre una base con debris de corridas anteriores"
    )
  }
}
