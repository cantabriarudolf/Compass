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

function reporteValido(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "re-reporte-1",
    titulo: "Reporte Mensual",
    bloques: ["gastos_mes"],
    segmento: {
      macroSectorIds: [],
      microSectorIds: [],
      unidadIds: [],
      perfiles: ["administracion"],
      tenencias: ["propietarios"],
    },
    payloadSnapshot: [{ bloque: "gastos_mes", lineas: [{ etiqueta: "Total", valor: "$100.000" }] }],
    fechaGeneracion: "2026-01-15",
    destinatariosPersonaId: [],
    distribuidoA: 0,
    ...overrides,
  }
}

describe("/api/reportes-re — RE con BD real (BD-FUENTE-VERDAD)", () => {
  const comunidadA = "re-comunidad-a"
  const emailAdmin = "re-admin@test.cl"

  const cargaModulos = async () => ({
    coleccion: await import("@/app/api/reportes-re/route"),
    item: await import("@/app/api/reportes-re/[id]/route"),
  })

  beforeAll(async () => {
    process.env.AUTH_SECRET = AUTH_SECRET
    await prisma.comunidad.upsert({
      where: { id: comunidadA },
      update: {},
      create: { id: comunidadA, nombre: "Comunidad A RE", slug: "re-comunidad-a" },
    })
    await prisma.usuario.upsert({
      where: { email: emailAdmin },
      update: {},
      create: { id: "re-usuario-admin", email: emailAdmin, activo: true },
    })
    await prisma.membresia.deleteMany({ where: { usuarioId: "re-usuario-admin" } })
    await prisma.membresia.create({
      data: { usuarioId: "re-usuario-admin", comunidadId: comunidadA, rol: "administrador" },
    })
    await prisma.reporteRE.deleteMany({ where: { comunidadId: comunidadA } })
  }, 30_000)

  afterAll(async () => {
    try {
      state.cookie = ""
      await prisma.reporteRE.deleteMany({ where: { comunidadId: comunidadA } })
      await prisma.membresia.deleteMany({ where: { usuarioId: "re-usuario-admin" } })
      await prisma.usuario.delete({ where: { id: "re-usuario-admin" } }).catch(() => {})
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

  async function POST(body: unknown): Promise<Response> {
    const { coleccion } = await cargaModulos()
    return coleccion.POST(
      new NextRequest("http://localhost/api/reportes-re", {
        method: "POST",
        body: JSON.stringify(body),
        headers: { "content-type": "application/json" },
      })
    )
  }

  async function GET(query = ""): Promise<Response> {
    const { coleccion } = await cargaModulos()
    return coleccion.GET(new NextRequest(`http://localhost/api/reportes-re${query}`))
  }

  async function PUT(id: string, body: unknown): Promise<Response> {
    const { item } = await cargaModulos()
    return item.PUT(
      new NextRequest(`http://localhost/api/reportes-re/${id}`, {
        method: "PUT",
        body: JSON.stringify(body),
        headers: { "content-type": "application/json" },
      }),
      { params: Promise.resolve({ id }) }
    )
  }

  async function DELETE(id: string): Promise<Response> {
    const { item } = await cargaModulos()
    return item.DELETE(
      new NextRequest(`http://localhost/api/reportes-re/${id}`, { method: "DELETE" }),
      { params: Promise.resolve({ id }) }
    )
  }

  it("401 sin sesión", async () => {
    state.cookie = ""
    expect((await GET()).status).toBe(401)
    expect((await POST(reporteValido())).status).toBe(401)
  })

  it("admin crea reporte → 201 y queda en BD", async () => {
    await conSesion(emailAdmin, async () => {
      const res = await POST(reporteValido())
      expect(res.status).toBe(201)
      const enBd = await prisma.reporteRE.findUnique({ where: { id: "re-reporte-1" } })
      expect(enBd).not.toBeNull()
      expect(enBd?.comunidadId).toBe(comunidadA)
      expect(enBd?.titulo).toBe("Reporte Mensual")
    })
  })

  it("GET lista paginada", async () => {
    await conSesion(emailAdmin, async () => {
      const res = await GET()
      expect(res.status).toBe(200)
      const json = await res.json()
      expect(Array.isArray(json.data)).toBe(true)
      expect(json.data.length).toBeGreaterThanOrEqual(1)
    })
  })

  it("GET_ONE existente → 200", async () => {
    await conSesion(emailAdmin, async () => {
      const { item } = await cargaModulos()
      const res = await item.GET(
        new NextRequest("http://localhost/api/reportes-re/re-reporte-1"),
        { params: Promise.resolve({ id: "re-reporte-1" }) }
      )
      expect(res.status).toBe(200)
    })
  })

  it("PUT parcial → 200 y refleja en BD", async () => {
    await conSesion(emailAdmin, async () => {
      const res = await PUT("re-reporte-1", { titulo: "Reporte Actualizado" })
      expect(res.status).toBe(200)
      const enBd = await prisma.reporteRE.findUnique({ where: { id: "re-reporte-1" } })
      expect(enBd?.titulo).toBe("Reporte Actualizado")
    })
  })

  it("DELETE → 200 y desaparece de BD", async () => {
    await conSesion(emailAdmin, async () => {
      const res = await DELETE("re-reporte-1")
      expect(res.status).toBe(200)
      expect(await prisma.reporteRE.findUnique({ where: { id: "re-reporte-1" } })).toBeNull()
    })
  })
})
