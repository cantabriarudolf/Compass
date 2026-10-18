/**
 * @vitest-environment node
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest"
import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"

const state = vi.hoisted(() => ({ cookie: "" }))
vi.mock("next/headers", () => ({
  headers: () =>
    Promise.resolve(
      new Headers(
        state.cookie
          ? { cookie: state.cookie, "x-forwarded-proto": "http" }
          : { "x-forwarded-proto": "http" }
      )
    ),
}))

const AUTH_SECRET = "test-secret-12345678"

describe("/api/configuracion — CF singleton con BD real (BD-FUENTE-VERDAD)", () => {
  const comunidadA = "cf-comunidad-a"
  const emailAdmin = "cf-admin@test.cl"
  const emailResidente = "cf-residente@test.cl"

  const cargaModulo = async () => import("@/app/api/configuracion/route")

  beforeAll(async () => {
    process.env.AUTH_SECRET = AUTH_SECRET
    await prisma.comunidad.upsert({
      where: { id: comunidadA },
      update: {},
      create: { id: comunidadA, nombre: "Comunidad A CF", slug: "cf-comunidad-a" },
    })
    await prisma.usuario.upsert({
      where: { email: emailAdmin },
      update: {},
      create: { id: "cf-usuario-admin", email: emailAdmin, activo: true },
    })
    await prisma.usuario.upsert({
      where: { email: emailResidente },
      update: {},
      create: { id: "cf-usuario-residente", email: emailResidente, activo: true },
    })
    await prisma.membresia.deleteMany({
      where: { usuarioId: { in: ["cf-usuario-admin", "cf-usuario-residente"] } },
    })
    await prisma.membresia.create({
      data: { usuarioId: "cf-usuario-admin", comunidadId: comunidadA, rol: "administrador" },
    })
    await prisma.membresia.create({
      data: { usuarioId: "cf-usuario-residente", comunidadId: comunidadA, rol: "residente" },
    })
    await prisma.eventoAuditoria.deleteMany({
      where: { comunidadId: comunidadA, tipoAccion: "CF_UPDATE_PARAM" },
    })
    await prisma.configuracionGlobal.deleteMany({ where: { comunidadId: comunidadA } })
  }, 30_000)

  afterAll(async () => {
    try {
      state.cookie = ""
      await prisma.eventoAuditoria.deleteMany({ where: { comunidadId: comunidadA } })
      await prisma.configuracionGlobal.deleteMany({ where: { comunidadId: comunidadA } })
      await prisma.membresia.deleteMany({
        where: { usuarioId: { in: ["cf-usuario-admin", "cf-usuario-residente"] } },
      })
      for (const id of ["cf-usuario-admin", "cf-usuario-residente"]) {
        await prisma.usuario.delete({ where: { id } }).catch(() => {})
      }
      await prisma.comunidad.delete({ where: { id: comunidadA } }).catch(() => {})
    } catch { /* best-effort */ }
  })

  async function conSesion(email: string, fn: () => Promise<void>): Promise<void> {
    const user = await prisma.usuario.findUnique({ where: { email } })
    if (!user) throw new Error(`usuario no encontrado: ${email}`)
    const { cookieSesionAuthjs } = await import("../helpers/sesion-authjs")
    state.cookie = await cookieSesionAuthjs({ sub: user.id, email: user.email })
    try { await fn() } finally { state.cookie = "" }
  }

  async function GET(): Promise<Response> {
    const mod = await cargaModulo()
    return mod.GET()
  }

  async function PUT(body: unknown): Promise<Response> {
    const mod = await cargaModulo()
    return mod.PUT(
      new NextRequest("http://localhost/api/configuracion", {
        method: "PUT",
        body: JSON.stringify(body),
        headers: { "content-type": "application/json" },
      })
    )
  }

  it("401 sin sesión", async () => {
    state.cookie = ""
    expect((await GET()).status).toBe(401)
  })

  it("GET sin config → 404", async () => {
    await conSesion(emailAdmin, async () => {
      const res = await GET()
      expect(res.status).toBe(404)
    })
  })

  it("PUT crea config → 201 y queda en BD", async () => {
    await conSesion(emailAdmin, async () => {
      const res = await PUT({ nombreComunidad: "Mi Comunidad" })
      expect(res.status).toBe(201)
      const enBd = await prisma.configuracionGlobal.findUnique({
        where: { comunidadId: comunidadA },
      })
      expect(enBd).not.toBeNull()
      expect(enBd?.nombreComunidad).toBe("Mi Comunidad")
      expect(enBd?.comunidadId).toBe(comunidadA)
    })
  })

  it("GET con config → 200", async () => {
    await conSesion(emailAdmin, async () => {
      const res = await GET()
      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.nombreComunidad).toBe("Mi Comunidad")
    })
  })

  it("PUT update → 200 y refleja en BD", async () => {
    await conSesion(emailAdmin, async () => {
      const res = await PUT({ nombreComunidad: "Comunidad Actualizada", diaCortePago: 15 })
      expect(res.status).toBe(200)
      const enBd = await prisma.configuracionGlobal.findUnique({
        where: { comunidadId: comunidadA },
      })
      expect(enBd?.nombreComunidad).toBe("Comunidad Actualizada")
      expect(enBd?.diaCortePago).toBe(15)
    })
  })

  it("PUT objeto completo estilo Prisma (rutComunidad + nulls) → 200 y persiste nombre (P2 E2E-FULL-VERDE)", async () => {
    await conSesion(emailAdmin, async () => {
      const { configuracionDefault } = await import("@/data/admin/configuracion")
      // Parte de una fila válida completa (como la que deja el seed en dev).
      const seed = await PUT({ ...configuracionDefault })
      expect(seed.status).toBe(200)
      const get = await GET()
      expect(get.status).toBe(200)
      const actual = await get.json()
      // El GET expone rutComunidad (columna renombrada RG §4), nunca legacy.
      expect(actual.rutComunidad).toBe(configuracionDefault.rutComunidad)
      expect(actual.rutCondominio).toBeUndefined()
      const res = await PUT({ ...actual, nombreComunidad: "QA-Comunidad-Persistida" })
      expect(res.status).toBe(200)
      const reget = await (await cargaModulo()).GET()
      expect((await reget.json()).nombreComunidad).toBe("QA-Comunidad-Persistida")
    })
  })

  describe("Auditoría CF_UPDATE_PARAM (am-emisores-1)", () => {
    const limpiarEventos = async (): Promise<void> => {
      await prisma.eventoAuditoria.deleteMany({
        where: { comunidadId: comunidadA, tipoAccion: "CF_UPDATE_PARAM" },
      })
    }

    it("PUT que cambia un parámetro legal emite UN evento con old/new", async () => {
      await conSesion(emailAdmin, async () => {
        // Fila base con los cuatro parámetros legales cargados.
        const base = await PUT({
          ufMensual: 39500,
          ingresoMinimoMensual: 500000,
          topeGratificacionLegal: 4.75,
          tasaSIS: 1.88,
        })
        expect([200, 201]).toContain(base.status)
        await limpiarEventos()

        const res = await PUT({ ufMensual: 39800 })
        expect(res.status).toBe(200)

        const eventos = await prisma.eventoAuditoria.findMany({
          where: { comunidadId: comunidadA, tipoAccion: "CF_UPDATE_PARAM" },
        })
        expect(eventos).toHaveLength(1)
        const evento = eventos[0]!
        expect(evento.categoria).toBe("CF")
        expect(evento.tipoAccion).toBe("CF_UPDATE_PARAM")
        expect(evento.usuario).toBe("cf-usuario-admin")
        expect(evento.descripcion).toContain("ufMensual: 39500 → 39800")
        // Nunca viajan secretos al evento.
        expect(evento.descripcion).not.toMatch(/smtp|claveEliminacion/i)
        const cfg = await prisma.configuracionGlobal.findUnique({
          where: { comunidadId: comunidadA },
        })
        expect(evento.referenciaId).toBe(cfg?.id)
      })
    })

    it("PUT que reenvía los parámetros legales sin cambio no emite evento", async () => {
      await conSesion(emailAdmin, async () => {
        await limpiarEventos()
        const fila = await prisma.configuracionGlobal.findUnique({
          where: { comunidadId: comunidadA },
        })
        const res = await PUT({
          ...(fila as unknown as Record<string, unknown>),
          nombreComunidad: "Sin cambio legal",
        })
        expect(res.status).toBe(200)
        expect(
          await prisma.eventoAuditoria.count({
            where: { comunidadId: comunidadA, tipoAccion: "CF_UPDATE_PARAM" },
          })
        ).toBe(0)
      })
    })

    it("PUT con parámetro legal fuera de rango → 400 y no emite evento", async () => {
      await conSesion(emailAdmin, async () => {
        await limpiarEventos()
        const res = await PUT({ tasaSIS: 150 })
        expect(res.status).toBe(400)
        expect(
          await prisma.eventoAuditoria.count({
            where: { comunidadId: comunidadA, tipoAccion: "CF_UPDATE_PARAM" },
          })
        ).toBe(0)
      })
    })

    it("residente (sin permiso de edición) → 403 y no emite evento", async () => {
      await conSesion(emailResidente, async () => {
        await limpiarEventos()
        const res = await PUT({ ufMensual: 41000 })
        expect(res.status).toBe(403)
        expect(
          await prisma.eventoAuditoria.count({
            where: { comunidadId: comunidadA, tipoAccion: "CF_UPDATE_PARAM" },
          })
        ).toBe(0)
        const cfg = await prisma.configuracionGlobal.findUnique({
          where: { comunidadId: comunidadA },
        })
        expect(cfg?.ufMensual).not.toBe(41000)
      })
    })
  })
})
