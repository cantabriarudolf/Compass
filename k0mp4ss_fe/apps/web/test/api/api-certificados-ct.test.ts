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

function certificadoValido(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "ct-cert-1",
    folio: "CERT-001",
    codigoVerificacion: "ABC123",
    tipo: "residencia",
    solicitanteNombre: "Juan Pérez",
    resumen: "Certificado de residencia",
    detalle: [{ clave: "Unidad", valor: "101" }],
    fechaEmision: "2026-01-15",
    ...overrides,
  }
}

describe("/api/certificados-ct — CT con BD real (BD-FUENTE-VERDAD)", () => {
  const comunidadA = "ct-comunidad-a"
  const emailAdmin = "ct-admin@test.cl"

  const cargaModulos = async () => ({
    coleccion: await import("@/app/api/certificados-ct/route"),
    item: await import("@/app/api/certificados-ct/[id]/route"),
  })

  beforeAll(async () => {
    process.env.AUTH_SECRET = AUTH_SECRET
    await prisma.comunidad.upsert({
      where: { id: comunidadA },
      update: {},
      create: { id: comunidadA, nombre: "Comunidad A CT", slug: "ct-comunidad-a" },
    })
    await prisma.usuario.upsert({
      where: { email: emailAdmin },
      update: {},
      create: { id: "ct-usuario-admin", email: emailAdmin, activo: true },
    })
    await prisma.membresia.deleteMany({ where: { usuarioId: "ct-usuario-admin" } })
    await prisma.membresia.create({
      data: { usuarioId: "ct-usuario-admin", comunidadId: comunidadA, rol: "administrador" },
    })
    await prisma.certificadoCT.deleteMany({ where: { comunidadId: comunidadA } })
  }, 30_000)

  afterAll(async () => {
    try {
      state.cookie = ""
      await prisma.certificadoCT.deleteMany({ where: { comunidadId: comunidadA } })
      await prisma.membresia.deleteMany({ where: { usuarioId: "ct-usuario-admin" } })
      await prisma.usuario.delete({ where: { id: "ct-usuario-admin" } }).catch(() => {})
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
      new NextRequest("http://localhost/api/certificados-ct", {
        method: "POST",
        body: JSON.stringify(body),
        headers: { "content-type": "application/json" },
      })
    )
  }

  async function GET(query = ""): Promise<Response> {
    const { coleccion } = await cargaModulos()
    return coleccion.GET(new NextRequest(`http://localhost/api/certificados-ct${query}`))
  }

  async function PUT(id: string, body: unknown): Promise<Response> {
    const { item } = await cargaModulos()
    return item.PUT(
      new NextRequest(`http://localhost/api/certificados-ct/${id}`, {
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
      new NextRequest(`http://localhost/api/certificados-ct/${id}`, { method: "DELETE" }),
      { params: Promise.resolve({ id }) }
    )
  }

  it("401 sin sesión", async () => {
    state.cookie = ""
    expect((await GET()).status).toBe(401)
    expect((await POST(certificadoValido())).status).toBe(401)
  })

  it("admin crea certificado → 201 y queda en BD", async () => {
    await conSesion(emailAdmin, async () => {
      const res = await POST(certificadoValido())
      expect(res.status).toBe(201)
      const enBd = await prisma.certificadoCT.findUnique({ where: { id: "ct-cert-1" } })
      expect(enBd).not.toBeNull()
      expect(enBd?.comunidadId).toBe(comunidadA)
      expect(enBd?.folio).toBe("CERT-001")
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

  it("PUT parcial → 200 y refleja en BD", async () => {
    await conSesion(emailAdmin, async () => {
      const res = await PUT("ct-cert-1", { resumen: "Certificado Actualizado" })
      expect(res.status).toBe(200)
      const enBd = await prisma.certificadoCT.findUnique({ where: { id: "ct-cert-1" } })
      expect(enBd?.resumen).toBe("Certificado Actualizado")
    })
  })

  it("DELETE → 200 y desaparece de BD", async () => {
    await conSesion(emailAdmin, async () => {
      const res = await DELETE("ct-cert-1")
      expect(res.status).toBe(200)
      expect(await prisma.certificadoCT.findUnique({ where: { id: "ct-cert-1" } })).toBeNull()
    })
  })
})
