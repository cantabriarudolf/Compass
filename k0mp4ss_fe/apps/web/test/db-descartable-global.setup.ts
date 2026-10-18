/**
 * test/db-descartable-global.setup.ts — prepara la base descartable de la suite.
 *
 * Corre **una vez**, en el proceso principal de Vitest, antes de cualquier archivo de
 * test (`globalSetup` en `vitest.config.ts`). Sin este paso la suite iría contra un
 * archivo SQLite sin migrar: los 43 archivos de `test/api/**` usan Prisma real y
 * morirían con `no such table`. Son los mismos dos pasos del job `unit` de CI
 * (`migrate deploy` + `npm test`) y el mismo comando que `scripts/e2e-fresh.mjs`.
 *
 * Se registra *después* de importar `db-descartable.setup.ts`, que ya fijó
 * `DATABASE_URL` y corrió la guarda dura contra `prisma/dev.db`.
 */
import { spawnSync } from "node:child_process"
import { existsSync, rmSync } from "node:fs"
import path from "node:path"

import { APP_DIR, DESTINO_BASE, SCHEMA_SQLITE } from "./db-descartable.setup"
const SUFIJOS_SQLITE = ["", "-journal", "-shm", "-wal"]

function correrMigraciones(url: string): void {
  const r = spawnSync(
    "npx",
    ["prisma", "migrate", "deploy", `--schema=${SCHEMA_SQLITE}`],
    {
      cwd: APP_DIR,
      env: { ...process.env, DATABASE_URL: url },
      encoding: "utf8",
    }
  )
  const salida = `${r.stdout ?? ""}${r.stderr ?? ""}`.trim()
  if (r.error || r.status !== 0) {
    throw new Error(
      `test-db-descartable: \`prisma migrate deploy\` falló (${r.error?.message ?? `exit ${r.status}`}).\n${salida}`
    )
  }
}

export default function prepararBaseDescartable(): void {
  const destino = DESTINO_BASE

  if (destino.archivo === null) {
    console.log(
      `test-db-descartable — base externa no-file (${destino.url}): sin preparación local.`
    )
    return
  }

  console.log(
    "test-db-descartable — preparando base descartable (nunca prisma/dev.db)"
  )
  for (const sufijo of SUFIJOS_SQLITE) {
    const archivo = `${destino.archivo}${sufijo}`
    if (existsSync(archivo)) {
      rmSync(archivo, { force: true })
      console.log(
        `test-db-descartable — borrado ${path.relative(APP_DIR, archivo)}`
      )
    }
  }

  correrMigraciones(destino.url)

  console.log(
    `test-db-descartable — base lista: ${destino.url} (recreada y migrada de cero)`
  )
}
