#!/usr/bin/env node
/**
 * Deja el cliente de Prisma apuntando al motor que el comando que viene necesita.
 *
 * Prisma no puede servir a dos motores con un solo cliente generado: el dev de
 * este repo corre en Postgres y los tests en SQLite descartable. Por eso `predev`
 * pide `postgres` y `pretest` pide `sqlite`.
 *
 * En CI **no se toca nada**: cada carril del workflow genera el cliente que le
 * corresponde (el de Postgres y el de SQLite son jobs distintos). Regenerarlo acá
 * le pisaría la decisión al carril — y eso ya rompió el carril Postgres una vez.
 *
 * Uso: node scripts/preparar-cliente.mjs <postgres|sqlite>
 */
import { execFileSync } from "node:child_process"

const destino = process.argv[2]
if (destino !== "postgres" && destino !== "sqlite") {
  console.error("[cliente] uso: preparar-cliente.mjs <postgres|sqlite>")
  process.exit(2)
}

if (process.env.CI) {
  // El carril del workflow ya eligió el motor: se respeta.
  console.log(`[cliente] CI detectado: el carril decide el motor, no se regenera (${destino})`)
  process.exit(0)
}

const args =
  destino === "postgres"
    ? ["prisma", "generate"]
    : ["prisma", "generate", "--schema=prisma/schema.sqlite.prisma"]

execFileSync("npx", args, { stdio: "inherit" })
console.log(`[cliente] generado para ${destino}`)
