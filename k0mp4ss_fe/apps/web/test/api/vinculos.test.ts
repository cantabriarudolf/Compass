/**
 * @vitest-environment node
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest"
import { NextRequest } from "next/server"
import { Prisma } from "@prisma/client"
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

function vinculoValido(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "vu-nuevo",
    personaId: "vu-pers-activa",
    unidadId: "vu-unidad-1",
    rol: "propietario",
    fechaInicio: "2026-06-01",
    permiteVerFinanzas: true,
    ...overrides,
  }
}

describe("/api/vinculos — VU con BD real (BD-FUENTE-VERDAD)", () => {
  const comunidadA = "vu-comunidad-a"
  const emailAdmin = "vu-admin@test.cl"

  const cargaModulos = async () => ({
    coleccion: await import("@/app/api/vinculos/route"),
    item: await import("@/app/api/vinculos/[id]/route"),
  })

  beforeAll(async () => {
    process.env.AUTH_SECRET = AUTH_SECRET
    await prisma.comunidad.upsert({
      where: { id: comunidadA },
      update: {},
      create: { id: comunidadA, nombre: "Comunidad A VU", slug: "vu-comunidad-a" },
    })
    await prisma.usuario.upsert({
      where: { email: emailAdmin },
      update: {},
      create: { id: "vu-usuario-admin", email: emailAdmin, activo: true },
    })
    await prisma.membresia.deleteMany({ where: { usuarioId: "vu-usuario-admin" } })
    await prisma.membresia.create({
      data: { usuarioId: "vu-usuario-admin", comunidadId: comunidadA, rol: "administrador" },
    })
    await prisma.controlPropiedad.deleteMany({ where: { comunidadId: comunidadA } })
    await prisma.vinculoUnidad.deleteMany({ where: { comunidadId: comunidadA } })
    await prisma.unidad.deleteMany({ where: { comunidadId: comunidadA } })
    await prisma.persona.deleteMany({ where: { comunidadId: comunidadA } })
    await prisma.unidad.create({
      data: {
        id: "vu-unidad-1",
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
    const personas: Prisma.PersonaUncheckedCreateInput[] = [
      {        id: "vu-pers-activa",
        comunidadId: comunidadA,
        rut: "12345678-5",
        nombreCompleto: "Ana Activa",
        nombres: "Ana",
        apellidos: "Activa",
        email: "vu-ana@test.cl",
        telefonoMovil: "+56911111111",
        estadoCuenta: "activa",
        condicionesEspecialesIds: [],
        roles: [],
      },
      {        id: "vu-pers-inactiva",
        comunidadId: comunidadA,
        rut: "87654321-4",
        nombreCompleto: "Beto Inactivo",
        nombres: "Beto",
        apellidos: "Inactivo",
        email: "vu-beto@test.cl",
        telefonoMovil: "+56922222222",
        estadoCuenta: "inactiva",
        condicionesEspecialesIds: [],
        roles: [],
      },
      {        id: "vu-pers-dos",
        comunidadId: comunidadA,
        rut: "98765432-K",
        nombreCompleto: "Carla Dos",
        nombres: "Carla",
        apellidos: "Dos",
        email: "vu-carla@test.cl",
        telefonoMovil: "+56933333333",
        estadoCuenta: "activa",
        condicionesEspecialesIds: [],
        roles: [],
      },
        ]
      for (const p of personas) {
        await prisma.persona.create({ data: p })
      }
  }, 30_000)

  afterAll(async () => {
    try {
      state.cookie = ""
      await prisma.controlPropiedad.deleteMany({ where: { comunidadId: comunidadA } })
      await prisma.vinculoUnidad.deleteMany({ where: { comunidadId: comunidadA } })
      await prisma.unidad.deleteMany({ where: { comunidadId: comunidadA } })
      await prisma.persona.deleteMany({ where: { comunidadId: comunidadA } })
      await prisma.membresia.deleteMany({ where: { usuarioId: "vu-usuario-admin" } })
      await prisma.usuario.delete({ where: { id: "vu-usuario-admin" } }).catch(() => {})
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

  async function POST(body: unknown): Promise<Response> {
    const { coleccion } = await cargaModulos()
    return coleccion.POST(
      new NextRequest("http://localhost/api/vinculos", {
        method: "POST",
        body: JSON.stringify(body),
        headers: { "content-type": "application/json" },
      })
    )
  }

  async function DELETE(id: string): Promise<Response> {
    const { item } = await cargaModulos()
    return item.DELETE(
      new NextRequest(`http://localhost/api/vinculos/${id}`, { method: "DELETE" }),
      { params: Promise.resolve({ id }) }
    )
  }

  it("401 sin sesión (GET y POST)", async () => {
    state.cookie = ""
    const { coleccion } = await cargaModulos()
    const res = await coleccion.GET(new NextRequest("http://localhost/api/vinculos"))
    expect(res.status).toBe(401)
    const post = await POST(vinculoValido())
    expect(post.status).toBe(401)
  })

  it("admin crea vínculo → 201 y queda en la BD", async () => {
    await conSesion(async () => {
      const res = await POST(vinculoValido({ id: "vu-base" }))
      expect(res.status).toBe(201)
      const enBd = await prisma.vinculoUnidad.findUnique({ where: { id: "vu-base" } })
      expect(enBd).not.toBeNull()
      expect(enBd?.comunidadId).toBe(comunidadA)
      expect(enBd?.rol).toBe("propietario")
      expect(enBd?.fechaFin).toBeNull()
    })
  })

  it("vínculo sobre persona inactiva → 409", async () => {
    await conSesion(async () => {
      const res = await POST(
        vinculoValido({ id: "vu-inactiva", personaId: "vu-pers-inactiva" })
      )
      expect(res.status).toBe(409)
      const j = (await res.json()) as { error: string }
      expect(j.error).toMatch(/inactiva/i)
      expect(await prisma.vinculoUnidad.findUnique({ where: { id: "vu-inactiva" } })).toBeNull()
    })
  })

  it("duplicado activo (misma persona+unidad sin fechaFin) → 409", async () => {
    await conSesion(async () => {
      const res = await POST(vinculoValido({ id: "vu-duplicado" }))
      expect(res.status).toBe(409)
      const j = (await res.json()) as { error: string }
      expect(j.error).toMatch(/ya posee un vínculo activo/i)
    })
  })

  it("solape de propietario (cruza personas) → 409", async () => {
    await conSesion(async () => {
      // Tramo con fechaFin explícita que se solapa con el tramo activo:
      // al declarar fechaFin no hay cierre automático y el solape se detecta.
      const res = await POST(
        vinculoValido({
          id: "vu-solape",
          personaId: "vu-pers-dos",
          fechaInicio: "2026-07-01",
          fechaFin: "2026-09-30",
        })
      )
      expect(res.status).toBe(409)
      const j = (await res.json()) as { error: string }
      expect(j.error).toMatch(/solapa/i)
      expect(await prisma.vinculoUnidad.findUnique({ where: { id: "vu-solape" } })).toBeNull()
    })
  })

  it("cierre automático del tramo anterior de propietario", async () => {
    await conSesion(async () => {
      // Se cierra el tramo base para no chocar con el duplicado activo.
      await prisma.vinculoUnidad.update({
        where: { id: "vu-base" },
        data: { fechaFin: "2025-12-31" },
      })
      // Tramo anterior activo en la unidad (propietario distinto).
      await prisma.vinculoUnidad.create({
        data: {
          id: "vu-anterior",
          comunidadId: comunidadA,
          personaId: "vu-pers-dos",
          unidadId: "vu-unidad-1",
          rol: "propietario",
          fechaInicio: "2025-01-01",
          permiteVerFinanzas: true,
        },
      })

      const res = await POST(
        vinculoValido({ id: "vu-nuevo", personaId: "vu-pers-activa", fechaInicio: "2026-06-01" })
      )
      expect(res.status).toBe(201)
      const anterior = await prisma.vinculoUnidad.findUnique({ where: { id: "vu-anterior" } })
      expect(anterior?.fechaFin).toBe("2026-05-31") // fechaInicio - 1 día
      const nuevo = await prisma.vinculoUnidad.findUnique({ where: { id: "vu-nuevo" } })
      expect(nuevo).not.toBeNull()
      expect(nuevo?.fechaFin).toBeNull()
    })
  })

  it("DELETE tramo de propietario vigente con ControlPropiedad → 409; sin control → 200", async () => {
    await prisma.controlPropiedad.create({
      data: {
        id: "vu-control-1",
        comunidadId: comunidadA,
        unidadId: "vu-unidad-1",
        residenteVeMorosidad: true,
        residenteVeActas: true,
        alertasResidentesActivas: false,
      },
    })
    await conSesion(async () => {
      const res = await DELETE("vu-nuevo")
      expect(res.status).toBe(409)
      const j = (await res.json()) as { error: string }
      expect(j.error).toMatch(/ControlPropiedad|propietario/i)
      expect(
        await prisma.vinculoUnidad.findUnique({ where: { id: "vu-nuevo" } })
      ).not.toBeNull()

      // Sin ControlPropiedad, la baja del mismo tramo se permite.
      await prisma.controlPropiedad.delete({ where: { id: "vu-control-1" } })
      const res2 = await DELETE("vu-nuevo")
      expect(res2.status).toBe(200)
      expect(await prisma.vinculoUnidad.findUnique({ where: { id: "vu-nuevo" } })).toBeNull()
    })
  })
})
