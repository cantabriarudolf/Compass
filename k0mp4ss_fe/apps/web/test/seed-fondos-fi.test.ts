/**
 * @vitest-environment node
 *
 * seed-fondos-fi — los fondos financieros de demo (F17) se siembran en la BD,
 * no sólo en el seed del store. Corre el script real (`npm run db:fondos-fi`
 * → `vite-node scripts/seed-fondos-fi.ts`) dos veces contra la base
 * descartable de la suite y fija:
 *   1. crea los 3 fondos de demo con el `comunidadId` destino y su forma
 *      (tipo, `porcentajeAporte`, estado, sin `saldoInicial`),
 *   2. correrlo 2× deja la misma cantidad (upsert idempotente por id),
 *   3. no toca las filas de otra comunidad.
 *
 * Usa comunidades propias (`seedfondos-*`) y las elimina al terminar (los
 * fondos caen en cascada). Ver test/db-descartable.setup.ts: sin
 * `DATABASE_URL` la suite escribe `prisma/perf-test.db`, nunca `dev.db`.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { execFileSync } from "node:child_process"
import path from "node:path"
import { prisma } from "@/lib/prisma"

const APP_DIR = path.resolve(__dirname, "..")

const COMUNIDAD = "seedfondos-com-a"
const COMUNIDAD_AJENA = "seedfondos-com-b"
const FONDO_AJENO_ID = "seedfondos-fondo-b"

/** Ids de FONDOS_FI_SEED (data/finanzas/fondos.ts), forma canónica del seed. */
const IDS_DEMO = ["fondo-gc", "fondo-reserva", "fondo-amenities"]

function correrSeed(comunidadId: string): string {
  return execFileSync(
    "npx",
    ["vite-node", "scripts/seed-fondos-fi.ts", `--comunidad-id=${comunidadId}`],
    { cwd: APP_DIR, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] }
  )
}

describe("seed-fondos-fi — fondos de demo en la base descartable", () => {
  beforeAll(async () => {
    await prisma.comunidad.upsert({
      where: { id: COMUNIDAD },
      update: {},
      create: { id: COMUNIDAD, nombre: "Comunidad Seed Fondos", slug: "seedfondos-a" },
    })
    await prisma.comunidad.upsert({
      where: { id: COMUNIDAD_AJENA },
      update: {},
      create: { id: COMUNIDAD_AJENA, nombre: "Comunidad Ajena Seed Fondos", slug: "seedfondos-b" },
    })
    // Fila centinela de la comunidad ajena: el seed no debe tocarla.
    await prisma.fondoFI.upsert({
      where: { id: FONDO_AJENO_ID },
      update: {},
      create: {
        id: FONDO_AJENO_ID,
        comunidadId: COMUNIDAD_AJENA,
        nombre: "Fondo Ajeno",
        tipo: "gasto_comun",
        activo: true,
      },
    })
  })

  afterAll(async () => {
    // Los fondos de cada comunidad caen en cascada (onDelete: Cascade).
    await prisma.comunidad.deleteMany({ where: { id: { in: [COMUNIDAD, COMUNIDAD_AJENA] } } })
    await prisma.$disconnect()
  })

  it("crea los fondos de demo con comunidadId y forma del seed", { timeout: 120_000 }, () => {
    const salida = correrSeed(COMUNIDAD)
    expect(salida).toContain("fondos=3")

    return prisma.fondoFI
      .findMany({ where: { comunidadId: COMUNIDAD, id: { in: IDS_DEMO } } })
      .then((fondos) => {
        expect(fondos).toHaveLength(3)
        const porId = new Map(fondos.map((f) => [f.id, f]))
        const gc = porId.get("fondo-gc")
        expect(gc?.nombre).toBe("Fondo de Gasto Común")
        expect(gc?.tipo).toBe("gasto_comun")
        expect(gc?.activo).toBe(true)
        const reserva = porId.get("fondo-reserva")
        expect(reserva?.tipo).toBe("reserva")
        expect(reserva?.porcentajeAporte).toBe(5)
        const amenities = porId.get("fondo-amenities")
        expect(amenities?.nombre).toBe("Fondo de Amenities")
        // Ningún fondo de demo lleva saldoInicial (eso es del punto cero).
        for (const f of fondos) expect(f.saldoInicial).toBeNull()
      })
  })

  it("correrlo dos veces deja la misma cantidad de fondos (idempotente)", { timeout: 120_000 }, async () => {
    correrSeed(COMUNIDAD)
    correrSeed(COMUNIDAD)

    const [total, conIdsDemo] = await Promise.all([
      prisma.fondoFI.count({ where: { comunidadId: COMUNIDAD } }),
      prisma.fondoFI.count({
        where: { comunidadId: COMUNIDAD, id: { in: IDS_DEMO } },
      }),
    ])
    expect(conIdsDemo).toBe(3)
    expect(total).toBe(3)
  })

  it("no toca las filas de otra comunidad", { timeout: 120_000 }, async () => {
    const antes = await prisma.fondoFI.findMany({
      where: { comunidadId: COMUNIDAD_AJENA },
    })
    expect(antes.map((f) => f.id)).toEqual([FONDO_AJENO_ID])

    correrSeed(COMUNIDAD)

    const despues = await prisma.fondoFI.findMany({
      where: { comunidadId: COMUNIDAD_AJENA },
    })
    expect(despues).toHaveLength(1)
    expect(despues[0]?.id).toBe(FONDO_AJENO_ID)
    expect(despues[0]?.nombre).toBe("Fondo Ajeno")
    // Ningún fondo de demo terminó en la comunidad ajena.
    const filtrados = await prisma.fondoFI.count({
      where: { comunidadId: COMUNIDAD_AJENA, id: { in: IDS_DEMO } },
    })
    expect(filtrados).toBe(0)
  })
})
