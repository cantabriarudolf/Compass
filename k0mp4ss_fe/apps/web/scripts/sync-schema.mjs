/**
 * sync-schema.mjs — Genera prisma/schema.sqlite.prisma desde prisma/schema.prisma
 *
 * Uso: node scripts/sync-schema.mjs
 *
 * El schema fuente de verdad es schema.prisma (postgresql). Este script genera
 * automáticamente la versión SQLite para desarrollo local. NO editar
 * schema.sqlite.prisma manualmente.
 */

import fs from "fs"
import path from "path"

const prismaDir = path.resolve(process.cwd(), "prisma")
const sourcePath = path.join(prismaDir, "schema.prisma")
const targetPath = path.join(prismaDir, "schema.sqlite.prisma")

const source = fs.readFileSync(sourcePath, "utf8")

const generated = source.replace(
  /provider\s*=\s*"postgresql"/,
  'provider = "sqlite"'
)

const header = `// GENERATED FILE — Do not edit manually.
// Source: prisma/schema.prisma
// Run: node scripts/sync-schema.mjs
//

`

fs.writeFileSync(targetPath, header + generated)
console.log(`✅ Generated ${path.relative(process.cwd(), targetPath)}`)
