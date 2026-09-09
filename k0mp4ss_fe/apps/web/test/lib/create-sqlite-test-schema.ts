import fs from "node:fs"
import path from "node:path"
import os from "node:os"

/**
 * Crea un schema Prisma temporal con provider = "sqlite" para tests que
 * necesiten una BD local aislada. Copia el schema principal y reemplaza
 * el provider.
 *
 * SERIE-PRODUCCION-FASE2 P1: el schema principal usa PostgreSQL, pero los
 * tests de repos necesitan SQLite temporales para aislamiento.
 */
export function createSQLiteTestSchema(): string {
  const tryPaths = [
    path.resolve("prisma/schema.prisma"),
    path.resolve(process.cwd(), "prisma/schema.prisma"),
  ]
  const mainSchema = tryPaths.find(p => fs.existsSync(p))
  if (!mainSchema) {
    throw new Error("No se encontró prisma/schema.prisma")
  }

  const schemaContent = fs.readFileSync(mainSchema, "utf-8")
  // Reemplazar provider postgresql → sqlite
  const testSchema = schemaContent.replace(
    /provider\s*=\s*"postgresql"/,
    'provider = "sqlite"'
  )

  const tmpDir = os.tmpdir()
  const tmpSchema = path.join(tmpDir, `schema-test-${Date.now()}.prisma`)
  fs.writeFileSync(tmpSchema, testSchema)

  return tmpSchema
}
