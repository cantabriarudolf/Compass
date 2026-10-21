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

function notificacionValida(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "notif-1",
    destinatarioRol: "residente",
    asunto: "Nuevo aviso",
    cuerpo: "Este es el contenido del aviso",
    canal: "email_simulado",
    moduloOrigen: "cv",
    fecha: "2026-01-15",
    leida: false,
    ...overrides,
  }
}

describe("/api/notificaciones — Notificaciones con BD real (BD-FUENTE-VERDAD)", () => {
  const comunidadA = "not-comunidad-a"
  const emailAdmin = "not-admin@test.cl"
  const emailResidente = "not-residente@test.cl"

  const cargaModulos = async () => ({
    coleccion: await import("@/app/api/notificaciones/route"),
    item: await import("@/app/api/notificaciones/[id]/route"),
    leer: await import("@/app/api/notificaciones/[id]/leer/route"),
  })

  beforeAll(async () => {
    process.env.AUTH_SECRET = AUTH_SECRET
    await prisma.comunidad.upsert({
      where: { id: comunidadA },
      update: {},
      create: { id: comunidadA, nombre: "Comunidad A Notif", slug: "not-comunidad-a" },
    })
    await prisma.usuario.upsert({
      where: { email: emailAdmin },
      update: {},
      create: { id: "not-usuario-admin", email: emailAdmin, activo: true },
    })
    await prisma.membresia.deleteMany({ where: { usuarioId: "not-usuario-admin" } })
    await prisma.membresia.create({
      data: { usuarioId: "not-usuario-admin", comunidadId: comunidadA, rol: "administrador" },
    })
    // residente con persona: destinatario legítimo de una notificación (H7)
    await prisma.usuario.upsert({
      where: { email: emailResidente },
      update: { personaId: "not-persona-residente" },
      create: { id: "not-usuario-residente", email: emailResidente, activo: true, personaId: "not-persona-residente" },
    })
    await prisma.membresia.deleteMany({ where: { usuarioId: "not-usuario-residente" } })
    await prisma.membresia.create({
      data: { usuarioId: "not-usuario-residente", comunidadId: comunidadA, rol: "residente" },
    })
    await prisma.notificacion.deleteMany({ where: { comunidadId: comunidadA } })
    await prisma.notificacion.create({
      data: {
        ...notificacionValida({ id: "notif-propia-res" }),
        destinatarioRol: "residente",
        destinatarioPersonaId: "not-persona-residente",
        comunidadId: comunidadA,
      } as never,
    })
  }, 30_000)

  afterAll(async () => {
    try {
      state.cookie = ""
      await prisma.notificacion.deleteMany({ where: { comunidadId: comunidadA } })
      await prisma.membresia.deleteMany({ where: { usuarioId: "not-usuario-admin" } })
      await prisma.usuario.delete({ where: { id: "not-usuario-admin" } }).catch(() => {})
      await prisma.membresia.deleteMany({ where: { usuarioId: "not-usuario-residente" } })
      await prisma.usuario.delete({ where: { id: "not-usuario-residente" } }).catch(() => {})
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
      new NextRequest("http://localhost/api/notificaciones", {
        method: "POST",
        body: JSON.stringify(body),
        headers: { "content-type": "application/json" },
      })
    )
  }

  async function GET(query = ""): Promise<Response> {
    const { coleccion } = await cargaModulos()
    return coleccion.GET(new NextRequest(`http://localhost/api/notificaciones${query}`))
  }

  async function PUT(id: string, body: unknown): Promise<Response> {
    const { item } = await cargaModulos()
    return item.PUT(
      new NextRequest(`http://localhost/api/notificaciones/${id}`, {
        method: "PUT",
        body: JSON.stringify(body),
        headers: { "content-type": "application/json" },
      }),
      { params: Promise.resolve({ id }) }
    )
  }

  it("401 sin sesión", async () => {
    state.cookie = ""
    expect((await GET()).status).toBe(401)
    expect((await POST(notificacionValida())).status).toBe(401)
  })

  it("admin crea notificación → 201 y queda en BD", async () => {
    await conSesion(emailAdmin, async () => {
      const res = await POST(notificacionValida())
      expect(res.status).toBe(201)
      const enBd = await prisma.notificacion.findUnique({ where: { id: "notif-1" } })
      expect(enBd).not.toBeNull()
      expect(enBd?.comunidadId).toBe(comunidadA)
      expect(enBd?.asunto).toBe("Nuevo aviso")
      expect(enBd?.leida).toBe(false)
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

  it("H7: el PUT del admin no firma la lectura de otro; el destinatario marca por POST /leer", async () => {
    const { leer } = await cargaModulos()
    // el destinatario marca la SUYA por el endpoint nuevo → 200 y queda en BD
    await conSesion(emailResidente, async () => {
      const res = await leer.POST(
        new NextRequest("http://localhost/api/notificaciones/notif-propia-res/leer", {
          method: "POST",
        }),
        { params: Promise.resolve({ id: "notif-propia-res" }) }
      )
      expect(res.status).toBe(200)
      const enBd = await prisma.notificacion.findUnique({ where: { id: "notif-propia-res" } })
      expect(enBd?.leida).toBe(true)
    })
    // el admin ya NO puede des-marcar/firmar por otro: el PUT descarta `leida`
    await conSesion(emailAdmin, async () => {
      const res = await PUT("notif-propia-res", { leida: false })
      expect(res.status).toBe(200)
      const enBd = await prisma.notificacion.findUnique({ where: { id: "notif-propia-res" } })
      expect(enBd?.leida).toBe(true)
    })
  })

  it("GET_ONE existente → 200", async () => {
    await conSesion(emailAdmin, async () => {
      const { item } = await cargaModulos()
      const res = await item.GET(
        new NextRequest("http://localhost/api/notificaciones/notif-1"),
        { params: Promise.resolve({ id: "notif-1" }) }
      )
      expect(res.status).toBe(200)
    })
  })
})
