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

describe("Aislamiento A/B con membresías por comunidad (B3, D3)", () => {
  let tmpDbPath: string
  let prismaTest: PrismaClient
  let comunidadAId: string
  let comunidadBId: string

  beforeAll(async () => {
    const tmpDir = os.tmpdir()
    tmpDbPath = path.join(tmpDir, `test-authz-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.db`)
    const databaseUrl = `file:${tmpDbPath}`
    const tryPaths = [
      path.resolve("prisma/schema.sqlite.prisma"),
      path.resolve(__dirname, "../../prisma/schema.sqlite.prisma"),
      path.resolve("prisma/schema.prisma"),
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

    const ca = await prismaTest.comunidad.create({ data: { id: "comunidad-a", nombre: "Comunidad A", slug: "comunidad-a-testauthz" } })
    const cb = await prismaTest.comunidad.create({ data: { id: "comunidad-b", nombre: "Comunidad B", slug: "comunidad-b-testauthz" } })
    comunidadAId = ca.id
    comunidadBId = cb.id

    await prismaTest.usuario.create({ data: { id: "usuario-admin-a", email: "admin-a@test.cl", activo: true } })
    await prismaTest.usuario.create({ data: { id: "usuario-admin-b", email: "admin-b@test.cl", activo: true } })
    await prismaTest.usuario.create({ data: { id: "usuario-residente-a", email: "residente-a@test.cl", activo: true } })

    await prismaTest.membresia.create({ data: { id: "mem-admin-a", usuarioId: "usuario-admin-a", comunidadId: comunidadAId, rol: "administrador" } })
    await prismaTest.membresia.create({ data: { id: "mem-admin-b", usuarioId: "usuario-admin-b", comunidadId: comunidadBId, rol: "administrador" } })
    await prismaTest.membresia.create({ data: { id: "mem-residente-a", usuarioId: "usuario-residente-a", comunidadId: comunidadAId, rol: "residente" } })

    const repoA = crearRepositorio(comunidadAId, prismaTest)
    const repoB = crearRepositorio(comunidadBId, prismaTest)
    await repoA.tiposUnidad.create({
      id: "tu-a-authz",
      nombre: "Tipo A Authz",
      categoria: "Depto",
      metraje: 70,
      montoBaseGc: 80000,
      activo: true,
      historialTarifas: [],
    } as never)
    await repoB.tiposUnidad.create({
      id: "tu-b-authz",
      nombre: "Tipo B Authz",
      categoria: "Depto",
      metraje: 60,
      montoBaseGc: 50000,
      activo: true,
      historialTarifas: [],
    } as never)
  }, 60_000)

  afterAll(async () => {
    if (prismaTest) await prismaTest.$disconnect().catch(() => {})
    if (tmpDbPath && fs.existsSync(tmpDbPath)) {
      try { fs.unlinkSync(tmpDbPath) } catch { /* intencional */ }
      try { fs.unlinkSync(`${tmpDbPath}-journal`) } catch { /* intencional */ }
    }
  })

  it("membresias scoped: repoA no ve membresías de B y viceversa", async () => {
    const repoA = crearRepositorio(comunidadAId, prismaTest)
    const repoB = crearRepositorio(comunidadBId, prismaTest)
    const memA = (await repoA.membresias.findMany()) as unknown as { id: string }[]
    const memB = (await repoB.membresias.findMany()) as unknown as { id: string }[]
    expect(memA.some(m => m.id === "mem-admin-a")).toBe(true)
    expect(memA.some(m => m.id === "mem-admin-b")).toBe(false)
    expect(memB.some(m => m.id === "mem-admin-b")).toBe(true)
    expect(memB.some(m => m.id === "mem-admin-a")).toBe(false)
    expect(memA.some(m => m.id === "mem-residente-a")).toBe(true)
    expect(memB.some(m => m.id === "mem-residente-a")).toBe(false)
  })

  it("cross-read por id de membresia falla: repoB no ve mem-admin-a", async () => {
    const repoA = crearRepositorio(comunidadAId, prismaTest)
    const repoB = crearRepositorio(comunidadBId, prismaTest)
    const foundA = await repoA.membresias.findById("mem-admin-a")
    const foundB = await repoB.membresias.findById("mem-admin-a")
    expect(foundA).not.toBeNull()
    expect(foundB).toBeNull()
  })

  it("cross-write falla: repoB no puede actualizar membresia de A", async () => {
    const repoA = crearRepositorio(comunidadAId, prismaTest)
    const repoB = crearRepositorio(comunidadBId, prismaTest)
    const upd = await repoB.membresias.update("mem-admin-a", { rol: "residente" })
    expect(upd).toBeNull()
    const still = (await repoA.membresias.findById("mem-admin-a")) as unknown as { rol: string }
    expect(still.rol).toBe("administrador")
  })

  it("aislamiento de datos de dominio se mantiene (TipoUnidad) con B3", async () => {
    const repoA = crearRepositorio(comunidadAId, prismaTest)
    const repoB = crearRepositorio(comunidadBId, prismaTest)
    const listA = (await repoA.tiposUnidad.findMany()) as unknown as { id: string }[]
    const listB = (await repoB.tiposUnidad.findMany()) as unknown as { id: string }[]
    expect(listA.some(x => x.id === "tu-a-authz")).toBe(true)
    expect(listB.some(x => x.id === "tu-b-authz")).toBe(true)
    expect(listA.some(x => x.id === "tu-b-authz")).toBe(false)
    expect(listB.some(x => x.id === "tu-a-authz")).toBe(false)
  })

  it("unique compuesto usuario+comunidad: duplicado en misma comunidad falla", async () => {
    await expect(
      prismaTest.membresia.create({ data: { usuarioId: "usuario-admin-a", comunidadId: comunidadAId, rol: "comite" } })
    ).rejects.toThrow()
    await prismaTest.usuario.create({ data: { id: "usuario-extra", email: "extra@test.cl", activo: true } })
    await expect(
      prismaTest.membresia.create({ data: { usuarioId: "usuario-extra", comunidadId: comunidadAId, rol: "residente" } })
    ).resolves.toBeDefined()
    await expect(
      prismaTest.membresia.create({ data: { usuarioId: "usuario-extra", comunidadId: comunidadBId, rol: "residente" } })
    ).resolves.toBeDefined()
  })

  it("usuario email único global: duplicado falla", async () => {
    await expect(
      prismaTest.usuario.create({ data: { email: "admin-a@test.cl", activo: true } })
    ).rejects.toThrow()
  })
})
