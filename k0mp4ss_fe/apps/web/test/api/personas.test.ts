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

// RUTs chilenos válidos (dígito verificador real, ver lib/rut.ts).
const RUT_ANA = "12345678-5"
const RUT_BETO = "87654321-4"

function personaValida(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "mp-pers-1",
    rut: RUT_ANA,
    nombreCompleto: "Ana Perez",
    nombres: "Ana",
    apellidos: "Perez",
    email: "ana@test.cl",
    telefonoMovil: "+56911111111",
    estadoCuenta: "activa",
    condicionesEspecialesIds: [],
    roles: [],
    ...overrides,
  }
}

describe("/api/personas — MP con BD real (BD-FUENTE-VERDAD)", () => {
  const comunidadA = "mp-comunidad-a"
  const emailAdmin = "mp-admin@test.cl"
  const emailResidente = "mp-residente@test.cl"

  const cargaModulos = async () => ({
    coleccion: await import("@/app/api/personas/route"),
    item: await import("@/app/api/personas/[id]/route"),
  })

  beforeAll(async () => {
    process.env.AUTH_SECRET = AUTH_SECRET
    await prisma.comunidad.upsert({
      where: { id: comunidadA },
      update: {},
      create: { id: comunidadA, nombre: "Comunidad A MP", slug: "mp-comunidad-a" },
    })
    for (const u of [
      { id: "mp-usuario-admin", email: emailAdmin, activo: true },
      { id: "mp-usuario-residente", email: emailResidente, activo: true },
    ]) {
      await prisma.usuario.upsert({ where: { email: u.email }, update: {}, create: u })
    }
    await prisma.membresia.deleteMany({
      where: { usuarioId: { in: ["mp-usuario-admin", "mp-usuario-residente"] } },
    })
    await prisma.membresia.create({
      data: { usuarioId: "mp-usuario-admin", comunidadId: comunidadA, rol: "administrador" },
    })
    await prisma.membresia.create({
      data: { usuarioId: "mp-usuario-residente", comunidadId: comunidadA, rol: "residente" },
    })
    // Estado limpio de las entidades bajo test.
    await prisma.vinculoUnidad.deleteMany({ where: { comunidadId: comunidadA } })
    await prisma.persona.deleteMany({ where: { comunidadId: comunidadA } })
  }, 30_000)

  afterAll(async () => {
    try {
      state.cookie = ""
      await prisma.vinculoUnidad.deleteMany({ where: { comunidadId: comunidadA } })
      await prisma.persona.deleteMany({ where: { comunidadId: comunidadA } })
      await prisma.membresia.deleteMany({
        where: { usuarioId: { in: ["mp-usuario-admin", "mp-usuario-residente"] } },
      })
      for (const id of ["mp-usuario-admin", "mp-usuario-residente"]) {
        await prisma.usuario.delete({ where: { id } }).catch(() => {})
      }
      await prisma.comunidad.delete({ where: { id: comunidadA } }).catch(() => {})
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
      new NextRequest("http://localhost/api/personas", {
        method: "POST",
        body: JSON.stringify(body),
        headers: { "content-type": "application/json" },
      })
    )
  }

  async function GET(query = ""): Promise<Response> {
    const { coleccion } = await cargaModulos()
    return coleccion.GET(new NextRequest(`http://localhost/api/personas${query}`))
  }

  async function GET_ONE(id: string): Promise<Response> {
    const { item } = await cargaModulos()
    return item.GET(new NextRequest(`http://localhost/api/personas/${id}`), {
      params: Promise.resolve({ id }),
    })
  }

  async function DELETE(id: string): Promise<Response> {
    const { item } = await cargaModulos()
    return item.DELETE(
      new NextRequest(`http://localhost/api/personas/${id}`, { method: "DELETE" }),
      { params: Promise.resolve({ id }) }
    )
  }

  it("401 sin sesión (GET y POST)", async () => {
    state.cookie = ""
    const res = await GET()
    expect(res.status).toBe(401)
    const post = await POST(personaValida())
    expect(post.status).toBe(401)
  })

  it("admin crea persona → 201 y queda en la BD", async () => {
    await conSesion(emailAdmin, async () => {
      const res = await POST(personaValida())
      expect(res.status).toBe(201)
      const enBd = await prisma.persona.findUnique({ where: { id: "mp-pers-1" } })
      expect(enBd).not.toBeNull()
      expect(enBd?.comunidadId).toBe(comunidadA)
      expect(enBd?.nombreCompleto).toBe("Ana Perez")
      expect(Array.isArray(enBd?.roles)).toBe(true)
    })
  })

  it("RUT duplicado en la misma comunidad → 409", async () => {
    await conSesion(emailAdmin, async () => {
      const res = await POST(personaValida({ id: "mp-pers-dup-rut" }))
      expect(res.status).toBe(409)
      expect(await prisma.persona.findUnique({ where: { id: "mp-pers-dup-rut" } })).toBeNull()
    })
  })

  it("email duplicado en la misma comunidad → 409", async () => {
    await conSesion(emailAdmin, async () => {
      const res = await POST(
        personaValida({ id: "mp-pers-dup-email", rut: RUT_BETO, nombreCompleto: "Ana Clon" })
      )
      expect(res.status).toBe(409)
      expect(await prisma.persona.findUnique({ where: { id: "mp-pers-dup-email" } })).toBeNull()
    })
  })

  it("residente: GET_ONE propia → 200, ajena → 403; lista → solo la suya", async () => {
    // Ficha del residente, creada por admin y ligada a su Usuario.
    await conSesion(emailAdmin, async () => {
      const res = await POST(
        personaValida({
          id: "mp-pers-residente",
          rut: "11111111-1",
          email: "residente-ficha@test.cl",
          nombreCompleto: "Residente Propio",
          nombres: "Residente",
          apellidos: "Propio",
        })
      )
      expect([200, 201]).toContain(res.status)
    })
    await prisma.usuario.update({
      where: { id: "mp-usuario-residente" },
      data: { personaId: "mp-pers-residente" },
    })

    await conSesion(emailResidente, async () => {
      const propia = await GET_ONE("mp-pers-residente")
      expect(propia.status).toBe(200)
      const ajena = await GET_ONE("mp-pers-1")
      expect(ajena.status).toBe(403)
      const lista = await GET()
      expect(lista.status).toBe(200)
      const j = (await lista.json()) as { data: { id: string }[]; total: number }
      expect(j.data.map((p) => p.id)).toEqual(["mp-pers-residente"])
      expect(j.total).toBe(1)
    })
  })

  it("GET lista con ?q= filtra por nombre/rut/email", async () => {
    await conSesion(emailAdmin, async () => {
      const res = await GET("?q=Ana")
      expect(res.status).toBe(200)
      const j = (await res.json()) as { data: { id: string }[]; total: number }
      expect(j.data.map((p) => p.id)).toEqual(["mp-pers-1"])
      expect(j.total).toBe(1)

      const resRut = await GET(`?q=${encodeURIComponent(RUT_BETO)}`)
      expect(resRut.status).toBe(200)
      const jRut = (await resRut.json()) as { data: { id: string }[]; total: number }
      expect(jRut.total).toBe(0) // RUT_BETO nunca se creó (fue rechazado por email duplicado)

      const resEmail = await GET("?q=residente-ficha@test.cl")
      const jEmail = (await resEmail.json()) as { data: { id: string }[]; total: number }
      expect(jEmail.data.map((p) => p.id)).toEqual(["mp-pers-residente"])
    })
  })

  it("DELETE persona con vínculo activo → 409 y sigue en la BD", async () => {
    // Unidad mínima para el vínculo (sin FK estrictas a maestros).
    await prisma.unidad.upsert({
      where: { id: "mp-unidad-1" },
      update: {},
      create: {
        id: "mp-unidad-1",
        comunidadId: comunidadA,
        microSectorId: "ms-1",
        numero: "101",
        etiqueta: "Depto 101",
        tipoUnidadId: "tu-1",
        metraje: 60,
        prorrateo: 1,
        rolSii: "1234-56",
        estadoId: "ocu-1",
        servicios: {},
      },
    })
    await prisma.vinculoUnidad.create({
      data: {
        id: "mp-vinculo-1",
        comunidadId: comunidadA,
        personaId: "mp-pers-1",
        unidadId: "mp-unidad-1",
        rol: "propietario",
        fechaInicio: "2026-01-01",
        permiteVerFinanzas: true,
      },
    })
    await conSesion(emailAdmin, async () => {
      const res = await DELETE("mp-pers-1")
      expect(res.status).toBe(409)
      const j = (await res.json()) as { error: string }
      expect(j.error).toMatch(/vínculo/i)
      expect(await prisma.persona.findUnique({ where: { id: "mp-pers-1" } })).not.toBeNull()
    })
  })

  it("DELETE persona sin vínculos → 200 y desaparece de la BD", async () => {
    await prisma.persona.create({
      data: {
        id: "mp-pers-2",
        comunidadId: comunidadA,
        rut: RUT_BETO,
        nombreCompleto: "Beto Soto",
        nombres: "Beto",
        apellidos: "Soto",
        email: "beto@test.cl",
        telefonoMovil: "+56922222222",
        estadoCuenta: "activa",
        condicionesEspecialesIds: [],
        roles: [],
      },
    })
    await conSesion(emailAdmin, async () => {
      const res = await DELETE("mp-pers-2")
      expect(res.status).toBe(200)
      expect(await prisma.persona.findUnique({ where: { id: "mp-pers-2" } })).toBeNull()
    })
  })
})
