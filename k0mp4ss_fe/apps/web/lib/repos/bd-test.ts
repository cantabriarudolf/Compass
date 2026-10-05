/**
 * BD aislada para tests de repos (st-migracion-postgres P1, dual SQLite/PG).
 *
 * SQLite (default, `DATABASE_URL=file:...` o sin scheme postgres): archivo
 * temporal + `migrate deploy` del schema sqlite (comportamiento histórico).
 *
 * PostgreSQL (`DATABASE_URL=postgres*`): se usa la BD del entorno (CI la crea
 * con `prisma db push` antes de `npm test`); no hay archivo temporal. Los ids
 * únicos se sufijan por corrida vía `sufijoCorrida()` y el afterAll de cada
 * test borra sus comunidades (`onDelete: Cascade` limpia los hijos).
 */
import { execSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"

export function esPostgresTest(): boolean {
  const url = process.env.DATABASE_URL ?? ""
  return url.startsWith("postgresql://") || url.startsWith("postgres://")
}

/** Sufijo único por corrida (incluye prefijo del archivo): "" en SQLite. */
export function sufijoCorrida(prefijo: string): string {
  if (!esPostgresTest()) return ""
  return `-${prefijo}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
}

export function prepararBdTest(prefijo: string): { databaseUrl: string; tmpDbPath: string | null } {
  const envUrl = process.env.DATABASE_URL ?? ""
  if (esPostgresTest()) return { databaseUrl: envUrl, tmpDbPath: null }

  const tmpDbPath = path.join(os.tmpdir(), `${prefijo}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.db`)
  const databaseUrl = `file:${tmpDbPath}`
  const tryPaths = [
    path.resolve("prisma/schema.sqlite.prisma"),
    path.resolve(__dirname, "../../prisma/schema.sqlite.prisma"),
    path.resolve("prisma/schema.prisma"),
    path.resolve(__dirname, "../../prisma/schema.prisma"),
  ]
  let sp = tryPaths.find((p) => fs.existsSync(p))
  if (!sp) sp = "k0mp4ss_fe/apps/web/prisma/schema.sqlite.prisma"
  try {
    execSync(`npx prisma migrate deploy --schema=${sp}`, {
      env: { ...process.env, DATABASE_URL: databaseUrl },
      stdio: "pipe",
    })
  } catch {
    execSync(`npx prisma db push --schema=${sp} --skip-generate --accept-data-loss`, {
      env: { ...process.env, DATABASE_URL: databaseUrl },
      stdio: "pipe",
    })
  }
  return { databaseUrl, tmpDbPath }
}

export function limpiarBdTest(tmpDbPath: string | null): void {
  if (!tmpDbPath || !fs.existsSync(tmpDbPath)) return
  try {
    fs.unlinkSync(tmpDbPath)
  } catch {
    /* intencional */
  }
  try {
    fs.unlinkSync(`${tmpDbPath}-journal`)
  } catch {
    /* intencional */
  }
}
