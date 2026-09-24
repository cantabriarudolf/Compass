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

function periodoValido(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "gd-per-1",
    fechaInicio: "2026-01-15",
    duracionMeses: 24,
    fechaInscripcion: "2026-02-01",
    referenciaInscripcion: "Acta asamblea N° 4/2026, CBR Santiago",
    estado: "vigente",
    miembros: [
      {
        personaId: "persona-1",
        nombre: "Miembro Uno",
        cargo: "presidente",
        fechaAsuncion: "2026-01-15",
      },
    ],
    ...overrides,
  }
}

describe("/api/periodos-directiva — GD períodos con BD real (Fase 0)", () => {
  const comunidadA = "gd-comunidad-a"
  const comunidadB = "gd-comunidad-b"
  const emailAdmin = "gd-admin@test.cl"
  const emailResidente = "gd-residente@test.cl"

  const cargaModulos = async () => ({
    coleccion: await import("@/app/api/periodos-directiva/route"),
    item: await import("@/app/api/periodos-directiva/[id]/route"),
  })

  beforeAll(async () => {
    process.env.AUTH_SECRET = AUTH_SECRET
    for (const c of [
      { id: comunidadA, nombre: "Comunidad A GD", slug: "gd-comunidad-a" },
      { id: comunidadB, nombre: "Comunidad B GD", slug: "gd-comunidad-b" },
    ]) {
      await prisma.comunidad.upsert({ where: { id: c.id }, update: {}, create: c })
    }
    for (const u of [
      { id: "gd-usuario-admin", email: emailAdmin, activo: true },
      { id: "gd-usuario-residente", email: emailResidente, activo: true },
    ]) {
      await prisma.usuario.upsert({ where: { email: u.email }, update: {}, create: u })
    }
    await prisma.membresia.deleteMany({
      where: { usuarioId: { in: ["gd-usuario-admin", "gd-usuario-residente"] } },
    })
    await prisma.membresia.create({ data: { usuarioId: "gd-usuario-admin", comunidadId: comunidadA, rol: "administrador" } })
    await prisma.membresia.create({ data: { usuarioId: "gd-usuario-residente", comunidadId: comunidadA, rol: "residente" } })
  }, 30_000)

  afterAll(async () => {
    try {
      state.cookie = ""
      await prisma.periodoDirectiva.deleteMany({ where: { comunidadId: { in: [comunidadA, comunidadB] } } })
      await prisma.membresia.deleteMany({
        where: { usuarioId: { in: ["gd-usuario-admin", "gd-usuario-residente"] } },
      })
      for (const id of ["gd-usuario-admin", "gd-usuario-residente"]) {
        await prisma.usuario.delete({ where: { id } }).catch(() => {})
      }
      await prisma.comunidad.delete({ where: { id: comunidadA } }).catch(() => {})
      await prisma.comunidad.delete({ where: { id: comunidadB } }).catch(() => {})
    } catch {
      // intencional: limpieza best-effort
    }
  })

  async function conSesion(email: string, fn: () => Promise<void>): Promise<void> {
    const user = await prisma.usuario.findUnique({ where: { email } })
    if (!user) throw new Error(`usuario no encontrado: ${email}`)
    const { cookieSesionAuthjs } = await import("../helpers/sesion-authjs")
    state.cookie = await cookieSesionAuthjs({ sub: user.id, email: user.email })
    try {
      await fn()
    } finally {
      state.cookie = ""
    }
  }

  async function POST(body: unknown): Promise<Response> {
    const { coleccion } = await cargaModulos()
    return coleccion.POST(
      new NextRequest("http://localhost/api/periodos-directiva", {
        method: "POST",
        body: JSON.stringify(body),
        headers: { "content-type": "application/json" },
      })
    )
  }

  async function GET(query = ""): Promise<Response> {
    const { coleccion } = await cargaModulos()
    return coleccion.GET(new NextRequest(`http://localhost/api/periodos-directiva${query}`))
  }

  async function GET_ONE(id: string): Promise<Response> {
    const { item } = await cargaModulos()
    return item.GET(new NextRequest(`http://localhost/api/periodos-directiva/${id}`), {
      params: Promise.resolve({ id }),
    })
  }

  async function PUT(id: string, body: unknown): Promise<Response> {
    const { item } = await cargaModulos()
    return item.PUT(
      new NextRequest(`http://localhost/api/periodos-directiva/${id}`, {
        method: "PUT",
        body: JSON.stringify(body),
        headers: { "content-type": "application/json" },
      }),
      { params: Promise.resolve({ id }) }
    )
  }

  async function DELETE(id: string): Promise<Response> {
    const { item } = await cargaModulos()
    return item.DELETE(new NextRequest(`http://localhost/api/periodos-directiva/${id}`, { method: "DELETE" }), {
      params: Promise.resolve({ id }),
    })
  }

  it("401 sin sesión", async () => {
    state.cookie = ""
    const res = await GET()
    expect(res.status).toBe(401)
    const post = await POST(periodoValido())
    expect(post.status).toBe(401)
  })

  it("admin crea período vigente → 201 y queda en la BD (miembros como Json)", async () => {
    await conSesion(emailAdmin, async () => {
      const res = await POST(periodoValido())
      expect(res.status).toBe(201)
      const enBd = await prisma.periodoDirectiva.findUnique({ where: { id: "gd-per-1" } })
      expect(enBd).not.toBeNull()
      expect(enBd?.comunidadId).toBe(comunidadA)
      expect(enBd?.estado).toBe("vigente")
      const miembros = enBd?.miembros as unknown[]
      expect(Array.isArray(miembros)).toBe(true)
      expect(miembros.length).toBe(1)
    })
  })

  it("body inválido según PeriodoDirectivaSchema (duracionMeses > 36) → 400", async () => {
    await conSesion(emailAdmin, async () => {
      const res = await POST(periodoValido({ id: "gd-per-invalido", duracionMeses: 48 }))
      expect(res.status).toBe(400)
      const j = (await res.json()) as { detalles?: unknown }
      expect(j.detalles).toBeTruthy()
      expect(await prisma.periodoDirectiva.findUnique({ where: { id: "gd-per-invalido" } })).toBeNull()
    })
  })

  it("GET lista: solo períodos de su comunidad (aislamiento A/B)", async () => {
    await prisma.periodoDirectiva.create({
      data: {
        id: "gd-per-b-1",
        comunidadId: comunidadB,
        fechaInicio: "2026-03-01",
        duracionMeses: 12,
        fechaInscripcion: "2026-03-05",
        referenciaInscripcion: "Acta asamblea B",
        estado: "vigente",
        miembros: [],
      },
    })
    await conSesion(emailAdmin, async () => {
      const res = await GET()
      expect(res.status).toBe(200)
      const j = (await res.json()) as { data: { id: string; comunidadId: string }[]; total: number }
      expect(j.data.every((p) => p.comunidadId === comunidadA)).toBe(true)
      expect(j.data.some((p) => p.id === "gd-per-b-1")).toBe(false)
      expect(j.data.some((p) => p.id === "gd-per-1")).toBe(true)
    })
  })

  it("GET_ONE propio → 200; de otra comunidad → 404", async () => {
    await conSesion(emailAdmin, async () => {
      const ok = await GET_ONE("gd-per-1")
      expect(ok.status).toBe(200)
      const ajeno = await GET_ONE("gd-per-b-1")
      expect(ajeno.status).toBe(404)
    })
  })

  it("PUT parcial actualiza referencia y persiste en BD", async () => {
    await conSesion(emailAdmin, async () => {
      const res = await PUT("gd-per-1", {
        referenciaInscripcion: "Escritura pública N° 88, CBR Santiago",
      })
      expect(res.status).toBe(200)
      const enBd = await prisma.periodoDirectiva.findUnique({ where: { id: "gd-per-1" } })
      expect(enBd?.referenciaInscripcion).toBe("Escritura pública N° 88, CBR Santiago")
      expect(enBd?.estado).toBe("vigente")
      expect(enBd?.comunidadId).toBe(comunidadA)
    })
  })

  it("residente: ver sí (200), crear no (403) — puede(rol, accion, 'gd')", async () => {
    await conSesion(emailResidente, async () => {
      const get = await GET()
      expect(get.status).toBe(200)
      const post = await POST(periodoValido({ id: "gd-per-residente" }))
      expect(post.status).toBe(403)
      expect(await prisma.periodoDirectiva.findUnique({ where: { id: "gd-per-residente" } })).toBeNull()
      // Tampoco puede eliminar (accion "eliminar" no está en su matriz)
      const del = await DELETE("gd-per-1")
      expect(del.status).toBe(403)
    })
  })

  it("POST upsert sobre id de otra comunidad → 404 (no revela existencia)", async () => {
    await conSesion(emailAdmin, async () => {
      const res = await POST(periodoValido({ id: "gd-per-b-1", estado: "cerrado" }))
      expect(res.status).toBe(404)
    })
  })

  it("DELETE período vigente → 409 y sigue en la BD (el libro nunca se borra)", async () => {
    await conSesion(emailAdmin, async () => {
      const res = await DELETE("gd-per-1")
      expect(res.status).toBe(409)
      const j = (await res.json()) as { error: string }
      expect(j.error).toMatch(/vigente/i)
      expect(await prisma.periodoDirectiva.findUnique({ where: { id: "gd-per-1" } })).not.toBeNull()
    })
  })

  it("DELETE período cerrado → 200 y desaparece de la BD", async () => {
    await prisma.periodoDirectiva.create({
      data: {
        id: "gd-per-cerrado",
        comunidadId: comunidadA,
        fechaInicio: "2024-01-01",
        duracionMeses: 12,
        fechaInscripcion: "2024-01-10",
        referenciaInscripcion: "Acta asamblea 2024",
        estado: "cerrado",
        miembros: [],
      },
    })
    await conSesion(emailAdmin, async () => {
      const res = await DELETE("gd-per-cerrado")
      expect(res.status).toBe(200)
      expect(await prisma.periodoDirectiva.findUnique({ where: { id: "gd-per-cerrado" } })).toBeNull()
    })
  })
})
