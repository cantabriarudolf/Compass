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

function controlValido(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "ad-ctrl-1",
    unidadId: "ad-u1",
    residenteVeMorosidad: false,
    residenteVeActas: true,
    alertasResidentesActivas: true,
    ...overrides,
  }
}

describe("/api/controles-propiedad — AD con BD real (Fase 2)", () => {
  const comunidadA = "ad-comunidad-a"
  const comunidadB = "ad-comunidad-b"
  const emailAdmin = "ad-admin@test.cl"
  const emailResidente = "ad-residente@test.cl"

  const cargaModulos = async () => ({
    coleccion: await import("@/app/api/controles-propiedad/route"),
    item: await import("@/app/api/controles-propiedad/[id]/route"),
  })

  function unidad(id: string, numero: string): Record<string, unknown> {
    return {
      id,
      comunidadId: comunidadA,
      microSectorId: "ad-ms1",
      numero,
      etiqueta: "Depto",
      tipoUnidadId: "ad-t1",
      metraje: 50,
      prorrateo: 1,
      rolSii: "1-1",
      estadoId: "habitada",
      servicios: {},
    }
  }

  beforeAll(async () => {
    process.env.AUTH_SECRET = AUTH_SECRET
    for (const c of [
      { id: comunidadA, nombre: "Comunidad A AD", slug: "ad-comunidad-a" },
      { id: comunidadB, nombre: "Comunidad B AD", slug: "ad-comunidad-b" },
    ]) {
      await prisma.comunidad.upsert({ where: { id: c.id }, update: {}, create: c })
    }
    for (const u of [unidad("ad-u1", "101"), unidad("ad-u2", "102")]) {
      await prisma.unidad.upsert({ where: { id: u.id as string }, update: {}, create: u as never })
    }
    // Residente vinculado a U1 (no a U2).
    await prisma.persona.upsert({
      where: { id: "ad-res-persona" },
      update: {},
      create: {
        id: "ad-res-persona",
        comunidadId: comunidadA,
        rut: "55555555-5",
        nombreCompleto: "Residente Uno",
        nombres: "Residente",
        apellidos: "Uno",
        email: emailResidente,
        telefonoMovil: "+56900000000",
        estadoCuenta: "activa",
        condicionesEspecialesIds: [],
        roles: ["residente"],
      },
    })
    await prisma.vinculoUnidad.upsert({
      where: { id: "ad-vinc-1" },
      update: {},
      create: {
        id: "ad-vinc-1",
        comunidadId: comunidadA,
        personaId: "ad-res-persona",
        unidadId: "ad-u1",
        rol: "arrendatario",
        fechaInicio: "2026-01-01",
        permiteVerFinanzas: false,
      },
    })
    for (const u of [
      { id: "ad-usuario-admin", email: emailAdmin, personaId: null },
      { id: "ad-usuario-res", email: emailResidente, personaId: "ad-res-persona" },
    ]) {
      await prisma.usuario.upsert({ where: { email: u.email }, update: {}, create: { id: u.id, email: u.email, activo: true, personaId: u.personaId } })
    }
    await prisma.membresia.deleteMany({
      where: { usuarioId: { in: ["ad-usuario-admin", "ad-usuario-res"] } },
    })
    await prisma.membresia.create({ data: { usuarioId: "ad-usuario-admin", comunidadId: comunidadA, rol: "administrador" } })
    await prisma.membresia.create({ data: { usuarioId: "ad-usuario-res", comunidadId: comunidadA, rol: "residente" } })
  }, 30_000)

  afterAll(async () => {
    try {
      state.cookie = ""
      await prisma.controlPropiedad.deleteMany({ where: { comunidadId: { in: [comunidadA, comunidadB] } } })
      await prisma.vinculoUnidad.deleteMany({ where: { comunidadId: comunidadA } })
      await prisma.persona.deleteMany({ where: { comunidadId: comunidadA } })
      await prisma.unidad.deleteMany({ where: { comunidadId: comunidadA } })
      await prisma.membresia.deleteMany({
        where: { usuarioId: { in: ["ad-usuario-admin", "ad-usuario-res"] } },
      })
      for (const id of ["ad-usuario-admin", "ad-usuario-res"]) {
        await prisma.usuario.delete({ where: { id } }).catch(() => {})
      }
      for (const id of [comunidadA, comunidadB]) {
        await prisma.comunidad.delete({ where: { id } }).catch(() => {})
      }
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
      new NextRequest("http://localhost/api/controles-propiedad", {
        method: "POST",
        body: JSON.stringify(body),
        headers: { "content-type": "application/json" },
      })
    )
  }

  async function GET(query = ""): Promise<Response> {
    const { coleccion } = await cargaModulos()
    return coleccion.GET(new NextRequest(`http://localhost/api/controles-propiedad${query}`))
  }

  async function GET_ONE(id: string): Promise<Response> {
    const { item } = await cargaModulos()
    return item.GET(new NextRequest(`http://localhost/api/controles-propiedad/${id}`), {
      params: Promise.resolve({ id }),
    })
  }

  async function PUT(id: string, body: unknown): Promise<Response> {
    const { item } = await cargaModulos()
    return item.PUT(
      new NextRequest(`http://localhost/api/controles-propiedad/${id}`, {
        method: "PUT",
        body: JSON.stringify(body),
        headers: { "content-type": "application/json" },
      }),
      { params: Promise.resolve({ id }) }
    )
  }

  async function DELETE(id: string): Promise<Response> {
    const { item } = await cargaModulos()
    return item.DELETE(new NextRequest(`http://localhost/api/controles-propiedad/${id}`, { method: "DELETE" }), {
      params: Promise.resolve({ id }),
    })
  }

  it("401 sin sesión", async () => {
    state.cookie = ""
    expect((await GET()).status).toBe(401)
    expect((await POST(controlValido())).status).toBe(401)
  })

  it("admin crea control → 201 y queda en la BD", async () => {
    await conSesion(emailAdmin, async () => {
      const res = await POST(controlValido())
      expect(res.status).toBe(201)
      const enBd = await prisma.controlPropiedad.findUnique({ where: { id: "ad-ctrl-1" } })
      expect(enBd).not.toBeNull()
      expect(enBd?.comunidadId).toBe(comunidadA)
      expect(enBd?.residenteVeActas).toBe(true)
    })
  })

  it("unidad inexistente → 400; duplicado por unidad → 409", async () => {
    await conSesion(emailAdmin, async () => {
      const mala = await POST(controlValido({ id: "ad-ctrl-mala", unidadId: "ad-u9" }))
      expect(mala.status).toBe(400)
      const dup = await POST(controlValido({ id: "ad-ctrl-dup" }))
      expect(dup.status).toBe(409)
      expect(await prisma.controlPropiedad.findUnique({ where: { id: "ad-ctrl-dup" } })).toBeNull()
    })
  })

  it("residente: crear no (403); ver solo su unidad", async () => {
    await conSesion(emailAdmin, async () => {
      const r = await POST(controlValido({ id: "ad-ctrl-2", unidadId: "ad-u2" }))
      expect(r.status).toBe(201)
    })
    await conSesion(emailResidente, async () => {
      expect((await POST(controlValido({ id: "ad-ctrl-res" }))).status).toBe(403)
      const lista = await GET()
      expect(lista.status).toBe(200)
      const j = (await lista.json()) as { data: { unidadId: string }[] }
      expect(j.data.length).toBe(1)
      expect(j.data[0]?.unidadId).toBe("ad-u1")
      // Detalle propio → 200; ajeno → 403.
      expect((await GET_ONE("ad-ctrl-1")).status).toBe(200)
      expect((await GET_ONE("ad-ctrl-2")).status).toBe(403)
    })
  })

  it("PUT parcial persiste; DELETE desestima con archivo (admin)", async () => {
    await conSesion(emailAdmin, async () => {
      const put = await PUT("ad-ctrl-1", { residenteVeMorosidad: true })
      expect(put.status).toBe(200)
      expect((await prisma.controlPropiedad.findUnique({ where: { id: "ad-ctrl-1" } }))?.residenteVeMorosidad).toBe(true)
      expect((await DELETE("ad-ctrl-2")).status).toBe(200)
      // Borrado lógico: la fila NO desaparece, queda desestimada y con copia.
      const enBd = await prisma.controlPropiedad.findUnique({ where: { id: "ad-ctrl-2" } })
      expect(enBd).not.toBeNull()
      expect(enBd?.estado).toBe("desestimada")
      expect(
        await prisma.controlPropiedadArchivada.findUnique({ where: { id: "ad-ctrl-2" } })
      ).not.toBeNull()
    })
  })

  it("upsert sobre id de otra comunidad → 404", async () => {
    await prisma.controlPropiedad.create({
      data: {
        id: "ad-ctrl-b",
        comunidadId: comunidadB,
        unidadId: "ad-ub1",
        residenteVeMorosidad: false,
        residenteVeActas: false,
        alertasResidentesActivas: true,
      },
    })
    await conSesion(emailAdmin, async () => {
      const res = await POST(controlValido({ id: "ad-ctrl-b", unidadId: "ad-u1" }))
      expect(res.status).toBe(404)
    })
  })
})
