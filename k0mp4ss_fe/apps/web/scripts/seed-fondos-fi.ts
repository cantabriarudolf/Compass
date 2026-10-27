#!/usr/bin/env -S npx tsx
/**
 * scripts/seed-fondos-fi — siembra los fondos financieros de demo (F17) en la
 * BD con Prisma.
 *
 * Los fondos de demo (`FONDOS_FI_SEED` en `data/finanzas/fondos.ts`: gasto
 * común, reserva y amenities) vivían sólo en el seed del store legacy, así que
 * una base recién sembrada tenía un solo fondo (`fondo-cc-punto-cero`). Este
 * script hace upsert idempotente por id de los 3 fondos, con el `comunidadId`
 * del destino. No toca movimientos (egresos/ingresos): de eso se encarga
 * `migrate-punto-cero-a-db.ts`.
 *
 * Uso (desde k0mp4ss_fe/apps/web):
 *   npm run db:fondos-fi [-- --comunidad-id=xxx]
 *
 * Comunidad destino: flag `--comunidad-id`, o env `COMUNIDAD_ID`, o la
 * primera Comunidad de la BD (orden de creación). Sin comunidad → aborta.
 */
/* global process */
import { cargarUrlBase } from "../lib/database-url"

import { PrismaClient } from "@prisma/client"
import { FONDOS_FI_SEED } from "../data/finanzas/fondos"

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

/** Upsert idempotente de los fondos de demo para una comunidad; devuelve ids sembrados. */
export async function sembrarFondosFi(
  prisma: PrismaClient,
  comunidadId: string
): Promise<string[]> {
  const sembrados: string[] = []
  for (const fondo of FONDOS_FI_SEED) {
    await prisma.fondoFI.upsert({
      where: { id: fondo.id },
      update: { ...fondo, comunidadId },
      create: { ...fondo, comunidadId },
    })
    sembrados.push(fondo.id)
  }
  return sembrados
}

async function main(): Promise<void> {
  const prisma = new PrismaClient({
    datasourceUrl: cargarUrlBase(),
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
      console.log(`[fondos-fi] comunidad no indicada: uso la primera (${comunidadId}).`)
    }
    const comunidad = await prisma.comunidad.findUnique({
      where: { id: comunidadId },
    })
    if (!comunidad) {
      throw new Error(`La comunidad "${comunidadId}" no existe en la BD.`)
    }

    const sembrados = await sembrarFondosFi(prisma, comunidadId)
    const total = await prisma.fondoFI.count({ where: { comunidadId } })
    console.log(
      `[fondos-fi] ok comunidad=${comunidadId} sembrados=${sembrados.length} fondos=${total} (${sembrados.join(", ")})`
    )
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((e: unknown) => {
  console.error("[fondos-fi] error:", e instanceof Error ? e.message : e)
  process.exit(1)
})
