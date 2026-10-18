/**
 * @vitest-environment node
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest"
import { NextRequest } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { createCrudHandlers, type CrudDelegate } from "@/lib/api/crud-factory"
import { IdEntidadSchema } from "@/lib/schemas"
import { puede } from "@/lib/authz"

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

// Schema de entidad para el maestro simple (id + nombre), igual que NombreSimpleSchema.
const SchemaSimple = z.object({
  id: IdEntidadSchema,
  nombre: z.string().min(1),
})

async function main(req: Request, handler: (r: Request) => Promise<Response>) {
  return handler(req)
}

describe("crud-factory — handlers REST con scoping obligatorio (Fase 0)", () => {
  const comunidadA = "factory-comunidad-a"
  const comunidadB = "factory-comunidad-b"
  const emailAdmin = "factory-admin@test.cl"
  const emailResidente = "factory-residente@test.cl"
  const emailConserje = "factory-conserje@test.cl"

  const handlers = createCrudHandlers({
    model: prisma.categoriaMacro as unknown as CrudDelegate,
    schema: SchemaSimple,
    authzCheck: (rol, accion) => puede(rol, accion, "gd"),
  })

  beforeAll(async () => {
    process.env.AUTH_SECRET = AUTH_SECRET
    for (const c of [
      { id: comunidadA, nombre: "Comunidad A Factory", slug: "factory-comunidad-a" },
      { id: comunidadB, nombre: "Comunidad B Factory", slug: "factory-comunidad-b" },
    ]) {
      await prisma.comunidad.upsert({ where: { id: c.id }, update: {}, create: c })
    }
    for (const u of [
      { id: "factory-usuario-admin", email: emailAdmin, activo: true },
      { id: "factory-usuario-residente", email: emailResidente, activo: true },
      { id: "factory-usuario-conserje", email: emailConserje, activo: true },
    ]) {
      await prisma.usuario.upsert({ where: { email: u.email }, update: {}, create: u })
    }
    await prisma.membresia.deleteMany({
      where: { usuarioId: { in: ["factory-usuario-admin", "factory-usuario-residente", "factory-usuario-conserje"] } },
    })
    await prisma.membresia.create({ data: { usuarioId: "factory-usuario-admin", comunidadId: comunidadA, rol: "administrador" } })
    await prisma.membresia.create({ data: { usuarioId: "factory-usuario-residente", comunidadId: comunidadA, rol: "residente" } })
    await prisma.membresia.create({ data: { usuarioId: "factory-usuario-conserje", comunidadId: comunidadA, rol: "conserjeria" } })
  }, 30_000)

  afterAll(async () => {
    try {
      state.cookie = ""
      await prisma.categoriaMacro.deleteMany({ where: { comunidadId: { in: [comunidadA, comunidadB] } } })
      await prisma.membresia.deleteMany({
        where: { usuarioId: { in: ["factory-usuario-admin", "factory-usuario-residente", "factory-usuario-conserje"] } },
      })
      for (const id of ["factory-usuario-admin", "factory-usuario-residente", "factory-usuario-conserje"]) {
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
    return handlers.POST(
      new NextRequest("http://localhost/api/factory-test", {
        method: "POST",
        body: JSON.stringify(body),
        headers: { "content-type": "application/json" },
      })
    )
  }

  async function GET(query = ""): Promise<Response> {
    return handlers.GET(new NextRequest(`http://localhost/api/factory-test${query}`))
  }

  async function GET_ONE(id: string): Promise<Response> {
    return handlers.GET_ONE(new NextRequest(`http://localhost/api/factory-test`), {
      params: Promise.resolve({ id }),
    })
  }

  async function PUT(id: string, body: unknown): Promise<Response> {
    return handlers.PUT(
      new NextRequest(`http://localhost/api/factory-test/${id}`, {
        method: "PUT",
        body: JSON.stringify(body),
        headers: { "content-type": "application/json" },
      }),
      { params: Promise.resolve({ id }) }
    )
  }

  async function DELETE(id: string): Promise<Response> {
    return handlers.DELETE(new NextRequest(`http://localhost/api/factory-test/${id}`, { method: "DELETE" }), {
      params: Promise.resolve({ id }),
    })
  }

  it("POST sin sesión → 401", async () => {
    state.cookie = ""
    const res = await main(
      new NextRequest("http://localhost/api/factory-test", { method: "POST" }),
      (r) => handlers.POST(r)
    )
    expect(res.status).toBe(401)
  })

  it("POST admin crea → 201 y persiste en BD con comunidadId del scope", async () => {
    await conSesion(emailAdmin, async () => {
      const res = await POST({ id: "fac-cat-1", nombre: "Agua" })
      expect(res.status).toBe(201)
      const enBd = await prisma.categoriaMacro.findUnique({ where: { id: "fac-cat-1" } })
      expect(enBd).not.toBeNull()
      expect(enBd?.nombre).toBe("Agua")
      expect(enBd?.comunidadId).toBe(comunidadA)
    })
  })

  it("POST repetido (upsert) → 200 y actualiza el registro en BD", async () => {
    await conSesion(emailAdmin, async () => {
      const res = await POST({ id: "fac-cat-1", nombre: "Agua potable" })
      expect(res.status).toBe(200)
      const enBd = await prisma.categoriaMacro.findUnique({ where: { id: "fac-cat-1" } })
      expect(enBd?.nombre).toBe("Agua potable")
      expect(await prisma.categoriaMacro.count({ where: { id: "fac-cat-1" } })).toBe(1)
    })
  })

  it("POST ignora comunidadId del body: nunca lo decide el cliente", async () => {
    await conSesion(emailAdmin, async () => {
      const res = await POST({ id: "fac-cat-2", nombre: "Gas", comunidadId: comunidadB })
      expect(res.status).toBe(201)
      const enBd = await prisma.categoriaMacro.findUnique({ where: { id: "fac-cat-2" } })
      expect(enBd?.comunidadId).toBe(comunidadA)
    })
  })

  it("POST body inválido → 400 con detalles Zod", async () => {
    await conSesion(emailAdmin, async () => {
      const res = await POST({ nombre: "Sin id" })
      expect(res.status).toBe(400)
      const j = (await res.json()) as { detalles?: unknown }
      expect(j.detalles).toBeTruthy()
    })
  })

  it("GET lista paginada: solo su comunidad, con total", async () => {
    await prisma.categoriaMacro.create({
      data: { id: "fac-cat-b-1", comunidadId: comunidadB, nombre: "De otra comunidad" },
    })
    await conSesion(emailAdmin, async () => {
      const res = await GET("?page=1&pageSize=2")
      expect(res.status).toBe(200)
      const j = (await res.json()) as {
        data: { id: string; comunidadId: string }[]
        page: number
        pageSize: number
        total: number
      }
      expect(j.page).toBe(1)
      expect(j.pageSize).toBe(2)
      expect(j.data.length).toBeLessThanOrEqual(2)
      expect(j.data.every((c) => c.comunidadId === comunidadA)).toBe(true)
      expect(j.data.some((c) => c.id === "fac-cat-b-1")).toBe(false)
      expect(j.total).toBeGreaterThanOrEqual(2)
    })
  })

  it("GET_ONE propio → 200; ajeno o inexistente → 404", async () => {
    await conSesion(emailAdmin, async () => {
      const ok = await GET_ONE("fac-cat-1")
      expect(ok.status).toBe(200)
      const ajeno = await GET_ONE("fac-cat-b-1")
      expect(ajeno.status).toBe(404)
      const inexistente = await GET_ONE("fac-cat-no-existe")
      expect(inexistente.status).toBe(404)
    })
  })

  it("PUT parcial actualiza solo claves enviadas y persiste", async () => {
    await conSesion(emailAdmin, async () => {
      const res = await PUT("fac-cat-1", { nombre: "Agua y cloacas", comunidadId: comunidadB })
      expect(res.status).toBe(200)
      const enBd = await prisma.categoriaMacro.findUnique({ where: { id: "fac-cat-1" } })
      expect(enBd?.nombre).toBe("Agua y cloacas")
      expect(enBd?.comunidadId).toBe(comunidadA)
    })
  })

  it("DELETE → 200 y el registro desaparece de la BD", async () => {
    await conSesion(emailAdmin, async () => {
      const res = await DELETE("fac-cat-2")
      expect(res.status).toBe(200)
      expect(await prisma.categoriaMacro.findUnique({ where: { id: "fac-cat-2" } })).toBeNull()
    })
  })

  it("residente puede ver pero no crear (puede(rol, accion, 'gd'))", async () => {
    await conSesion(emailResidente, async () => {
      const get = await GET()
      expect(get.status).toBe(200)
      const post = await POST({ id: "fac-cat-3", nombre: "Residente no puede" })
      expect(post.status).toBe(403)
      expect(await prisma.categoriaMacro.findUnique({ where: { id: "fac-cat-3" } })).toBeNull()
    })
  })

  it("conserjeria sin permiso sobre el recurso → 403 en GET", async () => {
    await conSesion(emailConserje, async () => {
      const res = await GET()
      expect(res.status).toBe(403)
    })
  })

  it("PUT sobre registro de otra comunidad → 404 sin filtrar existencia", async () => {
    await conSesion(emailAdmin, async () => {
      const res = await PUT("fac-cat-b-1", { nombre: "Intento ajeno" })
      expect(res.status).toBe(404)
      const enBd = await prisma.categoriaMacro.findUnique({ where: { id: "fac-cat-b-1" } })
      expect(enBd?.nombre).toBe("De otra comunidad")
    })
  })
})
