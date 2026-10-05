/**
 * @vitest-environment node
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { PrismaClient } from "@prisma/client"
import { crearRepositorio } from "./index"
import { prepararBdTest, limpiarBdTest, sufijoCorrida } from "./bd-test"

describe("Aislamiento A/B con membresías por comunidad (B3, D3)", () => {
  let tmpDbPath: string | null
  let prismaTest: PrismaClient
  let comunidadAId: string
  let comunidadBId: string
  // P1 st-migracion-postgres: en PG los ids se sufijan (BD compartida).
  const SFX = sufijoCorrida("authz")

  beforeAll(async () => {
    const prep = prepararBdTest("test-authz")
    tmpDbPath = prep.tmpDbPath
    const databaseUrl = prep.databaseUrl
    prismaTest = new PrismaClient({ datasourceUrl: databaseUrl })
    await prismaTest.$connect()

    const ca = await prismaTest.comunidad.create({ data: { id: `comunidad-a${SFX}`, nombre: "Comunidad A", slug: `comunidad-a-testauthz${SFX}` } })
    const cb = await prismaTest.comunidad.create({ data: { id: `comunidad-b${SFX}`, nombre: "Comunidad B", slug: `comunidad-b-testauthz${SFX}` } })
    comunidadAId = ca.id
    comunidadBId = cb.id

    await prismaTest.usuario.create({ data: { id: `usuario-admin-a${SFX}`, email: `admin-a${SFX}@test.cl`, activo: true } })
    await prismaTest.usuario.create({ data: { id: `usuario-admin-b${SFX}`, email: `admin-b${SFX}@test.cl`, activo: true } })
    await prismaTest.usuario.create({ data: { id: `usuario-residente-a${SFX}`, email: `residente-a${SFX}@test.cl`, activo: true } })

    await prismaTest.membresia.create({ data: { id: `mem-admin-a${SFX}`, usuarioId: `usuario-admin-a${SFX}`, comunidadId: comunidadAId, rol: "administrador" } })
    await prismaTest.membresia.create({ data: { id: `mem-admin-b${SFX}`, usuarioId: `usuario-admin-b${SFX}`, comunidadId: comunidadBId, rol: "administrador" } })
    await prismaTest.membresia.create({ data: { id: `mem-residente-a${SFX}`, usuarioId: `usuario-residente-a${SFX}`, comunidadId: comunidadAId, rol: "residente" } })

    const repoA = crearRepositorio(comunidadAId, prismaTest)
    const repoB = crearRepositorio(comunidadBId, prismaTest)
    await repoA.tiposUnidad.create({
      id: `tu-a-authz${SFX}`,
      nombre: "Tipo A Authz",
      categoria: "Depto",
      metraje: 70,
      montoBaseGc: 80000,
      activo: true,
      historialTarifas: [],
    } as never)
    await repoB.tiposUnidad.create({
      id: `tu-b-authz${SFX}`,
      nombre: "Tipo B Authz",
      categoria: "Depto",
      metraje: 60,
      montoBaseGc: 50000,
      activo: true,
      historialTarifas: [],
    } as never)
  }, 60_000)

  afterAll(async () => {
    try {
      // Solo PG (BD compartida): Cascade limpia hijos y membresías.
      if (tmpDbPath === null && comunidadAId && comunidadBId) {
        await prismaTest.comunidad.deleteMany({ where: { id: { in: [comunidadAId, comunidadBId] } } })
        await prismaTest.usuario.deleteMany({
          where: { id: { in: [`usuario-admin-a${SFX}`, `usuario-admin-b${SFX}`, `usuario-residente-a${SFX}`, `usuario-extra${SFX}`] } },
        })
      }
    } catch {
      /* intencional */
    }
    if (prismaTest) await prismaTest.$disconnect().catch(() => {})
    limpiarBdTest(tmpDbPath)
  })

  it("membresias scoped: repoA no ve membresías de B y viceversa", async () => {
    const repoA = crearRepositorio(comunidadAId, prismaTest)
    const repoB = crearRepositorio(comunidadBId, prismaTest)
    const memA = (await repoA.membresias.findMany()) as unknown as { id: string }[]
    const memB = (await repoB.membresias.findMany()) as unknown as { id: string }[]
    expect(memA.some(m => m.id === `mem-admin-a${SFX}`)).toBe(true)
    expect(memA.some(m => m.id === `mem-admin-b${SFX}`)).toBe(false)
    expect(memB.some(m => m.id === `mem-admin-b${SFX}`)).toBe(true)
    expect(memB.some(m => m.id === `mem-admin-a${SFX}`)).toBe(false)
    expect(memA.some(m => m.id === `mem-residente-a${SFX}`)).toBe(true)
    expect(memB.some(m => m.id === `mem-residente-a${SFX}`)).toBe(false)
  })

  it("cross-read por id de membresia falla: repoB no ve mem-admin-a", async () => {
    const repoA = crearRepositorio(comunidadAId, prismaTest)
    const repoB = crearRepositorio(comunidadBId, prismaTest)
    const foundA = await repoA.membresias.findById(`mem-admin-a${SFX}`)
    const foundB = await repoB.membresias.findById(`mem-admin-a${SFX}`)
    expect(foundA).not.toBeNull()
    expect(foundB).toBeNull()
  })

  it("cross-write falla: repoB no puede actualizar membresia de A", async () => {
    const repoA = crearRepositorio(comunidadAId, prismaTest)
    const repoB = crearRepositorio(comunidadBId, prismaTest)
    const upd = await repoB.membresias.update(`mem-admin-a${SFX}`, { rol: "residente" })
    expect(upd).toBeNull()
    const still = (await repoA.membresias.findById(`mem-admin-a${SFX}`)) as unknown as { rol: string }
    expect(still.rol).toBe("administrador")
  })

  it("aislamiento de datos de dominio se mantiene (TipoUnidad) con B3", async () => {
    const repoA = crearRepositorio(comunidadAId, prismaTest)
    const repoB = crearRepositorio(comunidadBId, prismaTest)
    const listA = (await repoA.tiposUnidad.findMany()) as unknown as { id: string }[]
    const listB = (await repoB.tiposUnidad.findMany()) as unknown as { id: string }[]
    expect(listA.some(x => x.id === `tu-a-authz${SFX}`)).toBe(true)
    expect(listB.some(x => x.id === `tu-b-authz${SFX}`)).toBe(true)
    expect(listA.some(x => x.id === `tu-b-authz${SFX}`)).toBe(false)
    expect(listB.some(x => x.id === `tu-a-authz${SFX}`)).toBe(false)
  })

  it("unique compuesto usuario+comunidad: duplicado en misma comunidad falla", async () => {
    await expect(
      prismaTest.membresia.create({ data: { usuarioId: `usuario-admin-a${SFX}`, comunidadId: comunidadAId, rol: "comite" } })
    ).rejects.toThrow()
    await prismaTest.usuario.create({ data: { id: `usuario-extra${SFX}`, email: `extra${SFX}@test.cl`, activo: true } })
    await expect(
      prismaTest.membresia.create({ data: { usuarioId: `usuario-extra${SFX}`, comunidadId: comunidadAId, rol: "residente" } })
    ).resolves.toBeDefined()
    await expect(
      prismaTest.membresia.create({ data: { usuarioId: `usuario-extra${SFX}`, comunidadId: comunidadBId, rol: "residente" } })
    ).resolves.toBeDefined()
  })

  it("usuario email único global: duplicado falla", async () => {
    await expect(
      prismaTest.usuario.create({ data: { email: `admin-a${SFX}@test.cl`, activo: true } })
    ).rejects.toThrow()
  })
})
