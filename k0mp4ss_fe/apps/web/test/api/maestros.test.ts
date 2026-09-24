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

describe("/api/maestros/[tipo] — MA con BD real (BD-FUENTE-VERDAD)", () => {
  const comunidadA = "ma-comunidad-a"
  const emailAdmin = "ma-admin@test.cl"

  beforeAll(async () => {
    process.env.AUTH_SECRET = AUTH_SECRET
    await prisma.comunidad.upsert({
      where: { id: comunidadA },
      update: {},
      create: { id: comunidadA, nombre: "Comunidad A MA", slug: "ma-comunidad-a" },
    })
    await prisma.usuario.upsert({
      where: { email: emailAdmin },
      update: {},
      create: { id: "ma-usuario-admin", email: emailAdmin, activo: true },
    })
    await prisma.membresia.deleteMany({ where: { usuarioId: "ma-usuario-admin" } })
    await prisma.membresia.create({
      data: { usuarioId: "ma-usuario-admin", comunidadId: comunidadA, rol: "administrador" },
    })
    await prisma.persona.deleteMany({ where: { comunidadId: comunidadA } })
    await prisma.banco.deleteMany({ where: { comunidadId: comunidadA } })
  }, 30_000)

  afterAll(async () => {
    try {
      state.cookie = ""
      await prisma.persona.deleteMany({ where: { comunidadId: comunidadA } })
      await prisma.banco.deleteMany({ where: { comunidadId: comunidadA } })
      await prisma.membresia.deleteMany({ where: { usuarioId: "ma-usuario-admin" } })
      await prisma.usuario.delete({ where: { id: "ma-usuario-admin" } }).catch(() => {})
      await prisma.comunidad.delete({ where: { id: comunidadA } }).catch(() => {})
    } catch {
      // intencional: limpieza best-effort
    }
  })

  async function conSesion(fn: () => Promise<void>): Promise<void> {
    const user = await prisma.usuario.findUnique({ where: { email: emailAdmin } })
    if (!user) throw new Error("usuario admin no encontrado")
    const { cookieSesionAuthjs } = await import("../helpers/sesion-authjs")
    state.cookie = await cookieSesionAuthjs({ sub: user.id, email: user.email })
    try {
      await fn()
    } finally {
      state.cookie = ""
    }
  }

  async function POST(tipo: string, body: unknown): Promise<Response> {
    const coleccion = await import("@/app/api/maestros/[tipo]/route")
    return coleccion.POST(
      new NextRequest(`http://localhost/api/maestros/${tipo}`, {
        method: "POST",
        body: JSON.stringify(body),
        headers: { "content-type": "application/json" },
      }),
      { params: Promise.resolve({ tipo }) }
    )
  }

  async function DELETE(tipo: string, id: string): Promise<Response> {
    const item = await import("@/app/api/maestros/[tipo]/[id]/route")
    return item.DELETE(new NextRequest(`http://localhost/api/maestros/${tipo}/${id}`, {
      method: "DELETE",
    }), {
      params: Promise.resolve({ tipo, id }),
    })
  }

  async function GET(tipo: string): Promise<Response> {
    const coleccion = await import("@/app/api/maestros/[tipo]/route")
    return coleccion.GET(new NextRequest(`http://localhost/api/maestros/${tipo}`), {
      params: Promise.resolve({ tipo }),
    })
  }

  it("401 sin sesión (GET y POST)", async () => {
    state.cookie = ""
    const res = await GET("bancos")
    expect(res.status).toBe(401)
    const post = await POST("bancos", { id: "ma-banco-x", nombre: "X" })
    expect(post.status).toBe(401)
  })

  it("tipo desconocido → 400", async () => {
    await conSesion(async () => {
      const res = await GET("tipos-inexistentes")
      expect(res.status).toBe(400)
      const del = await DELETE("tipos-inexistentes", "cualquiera")
      expect(del.status).toBe(400)
    })
  })

  it("admin crea maestro (bancos) → 201 y queda en la BD", async () => {
    await conSesion(async () => {
      const res = await POST("bancos", { id: "ma-banco-1", nombre: "Banco Test" })
      expect(res.status).toBe(201)
      const enBd = await prisma.banco.findUnique({ where: { id: "ma-banco-1" } })
      expect(enBd).not.toBeNull()
      expect(enBd?.comunidadId).toBe(comunidadA)
      expect(enBd?.nombre).toBe("Banco Test")
    })
  })

  it("upsert sobre id existente → 200 y actualiza el nombre", async () => {
    await conSesion(async () => {
      const res = await POST("bancos", { id: "ma-banco-1", nombre: "Banco Renombrado" })
      expect(res.status).toBe(200)
      const enBd = await prisma.banco.findUnique({ where: { id: "ma-banco-1" } })
      expect(enBd?.nombre).toBe("Banco Renombrado")
      // Sigue habiendo un solo registro (upsert, no insert).
      expect(await prisma.banco.count({ where: { comunidadId: comunidadA } })).toBe(1)
    })
  })

  it("DELETE maestro en uso por ficha laboral → 409; liberado → 200", async () => {
    await prisma.persona.create({
      data: {
        id: "ma-pers-1",
        comunidadId: comunidadA,
        rut: "12345678-5",
        nombreCompleto: "Conserje Banco",
        nombres: "Conserje",
        apellidos: "Banco",
        email: "ma-conserje@test.cl",
        telefonoMovil: "+56944444444",
        estadoCuenta: "activa",
        condicionesEspecialesIds: [],
        roles: [],
        datosLaborales: {
          id: "dl-1",
          cargo: "Conserje",
          afp: "Capital",
          prevision: "Fonasa",
          fechaIngreso: "2025-01-01",
          bancoId: "ma-banco-1",
        },
      },
    })
    await conSesion(async () => {
      const res = await DELETE("bancos", "ma-banco-1")
      expect(res.status).toBe(409)
      const j = (await res.json()) as { error: string }
      expect(j.error).toMatch(/bancoId|fichas laborales/i)
      expect(await prisma.banco.findUnique({ where: { id: "ma-banco-1" } })).not.toBeNull()

      // Liberada la referencia, la baja se permite.
      await prisma.persona.delete({ where: { id: "ma-pers-1" } })
      const res2 = await DELETE("bancos", "ma-banco-1")
      expect(res2.status).toBe(200)
      expect(await prisma.banco.findUnique({ where: { id: "ma-banco-1" } })).toBeNull()
    })
  })

  it("DELETE maestro no usado → 200", async () => {
    await conSesion(async () => {
      const res = await POST("bancos", { id: "ma-banco-libre", nombre: "Banco Libre" })
      expect([200, 201]).toContain(res.status)
      const del = await DELETE("bancos", "ma-banco-libre")
      expect(del.status).toBe(200)
      expect(await prisma.banco.findUnique({ where: { id: "ma-banco-libre" } })).toBeNull()
    })
  })
})
