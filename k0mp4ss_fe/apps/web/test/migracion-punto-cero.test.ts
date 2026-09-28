/**
 * @vitest-environment node
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { prisma } from "@/lib/prisma"
import { mapearPuntoCero } from "@/lib/fi/punto-cero-migracion"

describe("migración punto cero 2023-2024 (Fase 3)", () => {
  it("mapea 1 fondo + 182 egresos + 44 ingresos con ids deterministas", () => {
    const { fondo, egresos, ingresos } = mapearPuntoCero()
    expect(fondo.id).toBe("fondo-cc-punto-cero")
    expect(fondo.nombre).toBe("Cuenta Corriente")
    expect(fondo.saldoInicial).toBe(17082694)
    expect(egresos).toHaveLength(182)
    expect(ingresos).toHaveLength(44)
    expect(egresos[0]?.id).toBe("fi-egr-hist-001")
    expect(egresos[0]?.folio).toBe("FE-0001")
    expect(egresos[181]?.folio).toBe("FE-0182")
    expect(ingresos[0]?.id).toBe("fi-ing-hist-001")
    for (const e of egresos) {
      expect(e.fondoId).toBe(fondo.id)
      expect(e.descripcion.length).toBeGreaterThan(0)
      expect(e.monto).toBeGreaterThan(0)
    }
    for (const i of ingresos) {
      expect(i.fondoId).toBe(fondo.id)
      expect(i.monto).toBeGreaterThan(0)
    }
  })

  it("el mapeo es determinista (2 corridas → mismo resultado)", () => {
    expect(mapearPuntoCero()).toEqual(mapearPuntoCero())
  })

  describe("idempotencia en BD real", () => {
    const comunidad = "pc-comunidad-a"

    beforeAll(async () => {
      await prisma.comunidad.upsert({
        where: { id: comunidad },
        update: {},
        create: { id: comunidad, nombre: "Comunidad PC", slug: "pc-comunidad-a" },
      })
    }, 30_000)

    afterAll(async () => {
      try {
        await prisma.egresoFI.deleteMany({ where: { comunidadId: comunidad } })
        await prisma.ingresoFI.deleteMany({ where: { comunidadId: comunidad } })
        await prisma.fondoFI.deleteMany({ where: { comunidadId: comunidad } })
        await prisma.comunidad.delete({ where: { id: comunidad } }).catch(() => {})
      } catch {
        // intencional: limpieza best-effort
      }
    })

    async function aplicar(): Promise<void> {
      const { fondo, egresos, ingresos } = mapearPuntoCero()
      await prisma.fondoFI.upsert({
        where: { id: fondo.id },
        update: { ...fondo, comunidadId: comunidad },
        create: { ...fondo, comunidadId: comunidad },
      })
      for (const e of egresos) {
        await prisma.egresoFI.upsert({
          where: { id: e.id },
          update: { ...e, comunidadId: comunidad },
          create: { ...e, comunidadId: comunidad },
        })
      }
      for (const i of ingresos) {
        await prisma.ingresoFI.upsert({
          where: { id: i.id },
          update: { ...i, comunidadId: comunidad },
          create: { ...i, comunidadId: comunidad },
        })
      }
    }

    // P2: 454 upserts secuenciales contra dev.db; 5s es frágil bajo carga.
    it("aplicar 2× no duplica (1 fondo + 182 egresos + 44 ingresos)", async () => {
      await aplicar()
      await aplicar()
      const { fondo } = mapearPuntoCero()
      expect(
        await prisma.fondoFI.count({ where: { comunidadId: comunidad } })
      ).toBe(1)
      expect(
        await prisma.egresoFI.count({ where: { comunidadId: comunidad } })
      ).toBe(182)
      expect(
        await prisma.ingresoFI.count({ where: { comunidadId: comunidad } })
      ).toBe(44)
      expect(
        await prisma.fondoFI.findUnique({ where: { id: fondo.id } })
      ).not.toBeNull()
    }, 20_000)
  })
})
