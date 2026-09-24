#!/usr/bin/env -S npx tsx
/**
 * scripts/migrate-punto-cero-a-db — migra el punto cero 2023-2024 a Prisma.
 *
 * Lee `data/finanzas/punto-cero-2324.json` y hace upsert idempotente por id:
 * 1 fondo ("Cuenta Corriente") + 182 egresos + 44 ingresos. Correr 2× no
 * duplica (misma salida que `mapearPuntoCero()` aplicada dos veces).
 *
 * Uso (desde k0mp4ss_fe/apps/web):
 *   npx tsx scripts/migrate-punto-cero-a-db.ts [--comunidad-id=xxx]
 *
 * Comunidad destino: flag `--comunidad-id`, o env `COMUNIDAD_ID`, o la
 * primera Comunidad de la BD (orden de creación). Sin comunidad → aborta.
 */
/* global process */
import { config } from "dotenv"
import path from "node:path"
import { fileURLToPath } from "node:url"

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
config({ path: path.join(scriptDir, "..", ".env") })

import { PrismaClient } from "@prisma/client"
import { mapearPuntoCero } from "../lib/fi/punto-cero-migracion"

function resolverComunidadId(): string | null {
  const flag = process.argv
    .find((a) => a.startsWith("--comunidad-id="))
    ?.slice("--comunidad-id=".length)
    ?.trim()
  if (flag) return flag
  const env = process.env.COMUNIDAD_ID?.trim()
  if (env) return env
  return null
}

async function main(): Promise<void> {
  const prisma = new PrismaClient({
    datasourceUrl: process.env.DATABASE_URL,
  })
  try {
    let comunidadId = resolverComunidadId()
    if (!comunidadId) {
      const primera = await prisma.comunidad.findFirst({
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      })
      if (!primera) {
        throw new Error(
          "Sin comunidad destino: la BD no tiene Comunidades. Pasá --comunidad-id=xxx."
        )
      }
      comunidadId = primera.id
      console.log(`[punto-cero] comunidad no indicada: uso la primera (${comunidadId}).`)
    }
    const comunidad = await prisma.comunidad.findUnique({
      where: { id: comunidadId },
    })
    if (!comunidad) {
      throw new Error(`La comunidad "${comunidadId}" no existe en la BD.`)
    }

    const { fondo, egresos, ingresos } = mapearPuntoCero()

    await prisma.fondoFI.upsert({
      where: { id: fondo.id },
      update: { ...fondo, comunidadId },
      create: { ...fondo, comunidadId },
    })
    for (const e of egresos) {
      await prisma.egresoFI.upsert({
        where: { id: e.id },
        update: { ...e, comunidadId },
        create: { ...e, comunidadId },
      })
    }
    for (const i of ingresos) {
      await prisma.ingresoFI.upsert({
        where: { id: i.id },
        update: { ...i, comunidadId },
        create: { ...i, comunidadId },
      })
    }

    const [f, eg, ing] = await Promise.all([
      prisma.fondoFI.count({ where: { comunidadId, id: fondo.id } }),
      prisma.egresoFI.count({
        where: { comunidadId, id: { startsWith: "fi-egr-hist-" } },
      }),
      prisma.ingresoFI.count({
        where: { comunidadId, id: { startsWith: "fi-ing-hist-" } },
      }),
    ])
    console.log(
      `[punto-cero] ok comunidad=${comunidadId} fondo=${f} egresos=${eg} ingresos=${ing}`
    )
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((e: unknown) => {
  console.error("[punto-cero] error:", e instanceof Error ? e.message : e)
  process.exit(1)
})
