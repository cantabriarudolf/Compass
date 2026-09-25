/**
 * @vitest-environment node
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { execSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import os from "node:os"
import { PrismaClient } from "@prisma/client"
import { crearRepositorio } from "./index"

// C1b: Tests de aislamiento A/B con SQLite archivo temporal
describe("Repositorios con scoping obligatorio por comunidadId (C1b)", () => {
  let tmpDbPath: string
  let prismaTest: PrismaClient
  let comunidadAId: string
  let comunidadBId: string

  beforeAll(async () => {
    const tmpDir = os.tmpdir()
    tmpDbPath = path.join(tmpDir, `test-p2-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.db`)
    const databaseUrl = `file:${tmpDbPath}`
    const schemaPath = path.resolve(process.cwd(), "k0mp4ss_fe/apps/web/prisma/schema.prisma")
    const tryPaths = [
      path.resolve("prisma/schema.sqlite.prisma"),
      path.resolve(__dirname, "../../prisma/schema.sqlite.prisma"),
      path.resolve("prisma/schema.prisma"),
      schemaPath,
      path.resolve(__dirname, "../../prisma/schema.prisma"),
    ]
    let sp = tryPaths.find(p => fs.existsSync(p))
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

    prismaTest = new PrismaClient({ datasourceUrl: databaseUrl })
    await prismaTest.$connect()

    const comunidadA = await prismaTest.comunidad.create({
      data: { id: "comunidad-a", nombre: "Comunidad A", slug: "comunidad-a" },
    })
    const comunidadB = await prismaTest.comunidad.create({
      data: { id: "comunidad-b", nombre: "Comunidad B", slug: "comunidad-b" },
    })
    comunidadAId = comunidadA.id
    comunidadBId = comunidadB.id
  }, 60_000)

  afterAll(async () => {
    if (prismaTest) await prismaTest.$disconnect().catch(() => {})
    if (tmpDbPath && fs.existsSync(tmpDbPath)) {
      try { fs.unlinkSync(tmpDbPath) } catch { /* intencional */ }
      try { fs.unlinkSync(`${tmpDbPath}-journal`) } catch { /* intencional */ }
    }
  })

  it("factory exige comunidadId no vacío", () => {
    expect(() => crearRepositorio("")).toThrow(/comunidadId/)
    expect(() => crearRepositorio("   ")).toThrow(/comunidadId/)
    // @ts-expect-error prueba null
    expect(() => crearRepositorio(null)).toThrow()
  })

  it("ningún método expone query sin scope: findMany retorna solo datos de su comunidad", async () => {
    const repoA = crearRepositorio(comunidadAId, prismaTest)
    const repoB = crearRepositorio(comunidadBId, prismaTest)

    await repoA.tiposUnidad.create({
      id: "tu-a1",
      nombre: "Tipo A1",
      categoria: "Depto",
      metraje: 70,
      montoBaseGc: 80000,
      descripcion: "test",
      activo: true,
      historialTarifas: [],
    })

    const listA = (await repoA.tiposUnidad.findMany()) as unknown as { id: string }[]
    const listB = (await repoB.tiposUnidad.findMany()) as unknown as { id: string }[]

    expect(listA.some((x) => x.id === "tu-a1")).toBe(true)
    expect(listB.some((x) => x.id === "tu-a1")).toBe(false)
    expect(listB.length).toBe(0)
  })

  it("cross-read por id falla: repoB no ve registro de repoA", async () => {
    const repoA = crearRepositorio(comunidadAId, prismaTest)
    const repoB = crearRepositorio(comunidadBId, prismaTest)

    await repoA.personas.create({
      id: "persona-a1",
      rut: "11.111.111-1",
      nombreCompleto: "Ana Alpha",
      nombres: "Ana",
      apellidos: "Alpha",
      email: "ana@a.cl",
      telefonoMovil: "+56911111111",
      estadoCuenta: "activa",
      condicionesEspecialesIds: [],
      roles: ["propietario"],
    })

    const foundInA = await repoA.personas.findById("persona-a1")
    const foundInB = await repoB.personas.findById("persona-a1")

    expect(foundInA).not.toBeNull()
    expect((foundInA as { id: string }).id).toBe("persona-a1")
    expect(foundInB).toBeNull()
  })

  it("cross-write falla: repoB no puede actualizar registro de repoA", async () => {
    const repoA = crearRepositorio(comunidadAId, prismaTest)
    const repoB = crearRepositorio(comunidadBId, prismaTest)

    await repoA.macroSectores.create({
      id: "macro-a1",
      nombre: "Macro A1",
      etiqueta: "MA1",
      descripcion: "desc",
    })

    const updatedByB = await repoB.macroSectores.update("macro-a1", { nombre: "Hacked" })
    expect(updatedByB).toBeNull()

    const stillInA = (await repoA.macroSectores.findById("macro-a1")) as unknown as { nombre: string }
    expect(stillInA.nombre).toBe("Macro A1")
  })

  it("cross-delete falla: repoB no puede borrar registro de repoA", async () => {
    const repoA = crearRepositorio(comunidadAId, prismaTest)
    const repoB = crearRepositorio(comunidadBId, prismaTest)

    await repoA.unidades.create({
      id: "unidad-a1",
      microSectorId: "micro-x",
      numero: "101",
      etiqueta: "Depto",
      tipoUnidadId: "tu-a1",
      metraje: 70,
      prorrateo: 1.5,
      rolSii: "001",
      estadoId: "vacante",
      servicios: {},
    })

    const deletedByB = await repoB.unidades.delete("unidad-a1")
    expect(deletedByB).toBeNull()

    const stillExists = await repoA.unidades.findById("unidad-a1")
    expect(stillExists).not.toBeNull()
  })

  it("aislamiento se verifica en múltiples entidades (FondoFI, ProveedorPE)", async () => {
    const repoA = crearRepositorio(comunidadAId, prismaTest)
    const repoB = crearRepositorio(comunidadBId, prismaTest)

    await repoA.fondosFI.create({
      id: "fondo-a1",
      nombre: "Fondo A1",
      tipo: "gasto_comun",
      descripcion: "fondo test",
      activo: true,
    })
    await repoA.proveedoresPE.create({
      id: "prov-a1",
      rut: "76.111.111-1",
      nombre: "Proveedor A",
      rubro: "Mantención",
      activo: true,
    })

    expect(await repoB.fondosFI.findById("fondo-a1")).toBeNull()
    expect(await repoB.proveedoresPE.findById("prov-a1")).toBeNull()
    expect(((await repoA.fondosFI.findMany()) as unknown as { id: string }[]).length).toBeGreaterThan(0)
    expect(((await repoB.fondosFI.findMany()) as unknown as { id: string }[]).length).toBe(0)
  })

  it("mismo nombre en distinta comunidad se permite (unicidad por comunidadId, C3b)", async () => {
    const repoA = crearRepositorio(comunidadAId, prismaTest)
    const repoB = crearRepositorio(comunidadBId, prismaTest)

    await repoA.tiposUnidad.create({
      id: "tu-shared-a",
      nombre: "Tipo Compartido",
      categoria: "Depto",
      metraje: 60,
      montoBaseGc: 50000,
      activo: true,
      historialTarifas: [],
    })
    await expect(
      repoB.tiposUnidad.create({
        id: "tu-shared-b",
        nombre: "Tipo Compartido",
        categoria: "Depto",
        metraje: 60,
        montoBaseGc: 50000,
        activo: true,
        historialTarifas: [],
      })
    ).resolves.toBeDefined()

    const allA = await repoA.tiposUnidad.findMany({ where: { nombre: "Tipo Compartido" } })
    const allB = await repoB.tiposUnidad.findMany({ where: { nombre: "Tipo Compartido" } })
    expect((allA as unknown as { id: string }[]).length).toBe(1)
    expect((allB as unknown as { id: string }[]).length).toBe(1)
  })

  it("duplicado dentro de la misma comunidad falla por constraint (C3b)", async () => {
    const repoA = crearRepositorio(comunidadAId, prismaTest)
    await repoA.fondosFI.create({
      id: "fondo-dup-1",
      nombre: "Fondo Unico",
      tipo: "reserva",
      activo: true,
    })
    await expect(
      repoA.fondosFI.create({
        id: "fondo-dup-2",
        nombre: "Fondo Unico",
        tipo: "reserva",
        activo: true,
      })
    ).rejects.toThrow()
  })
})
