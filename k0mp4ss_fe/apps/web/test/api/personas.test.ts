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
    await prisma.eventoAuditoria.deleteMany({ where: { comunidadId: comunidadA } })
  }, 30_000)

  afterAll(async () => {
    try {
      state.cookie = ""
      await prisma.vinculoUnidad.deleteMany({ where: { comunidadId: comunidadA } })
      await prisma.persona.deleteMany({ where: { comunidadId: comunidadA } })
      await prisma.eventoAuditoria.deleteMany({ where: { comunidadId: comunidadA } })
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

  async function PUT(id: string, body: unknown): Promise<Response> {
    const { item } = await cargaModulos()
    return item.PUT(
      new NextRequest(`http://localhost/api/personas/${id}`, {
        method: "PUT",
        body: JSON.stringify(body),
        headers: { "content-type": "application/json" },
      }),
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

  it("DELETE persona sin vínculos → 200 y desaparece de la BD", async () => {    await prisma.persona.create({
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

  it("PUT firma digital sobre fila con nulls Prisma → 200 (P2 E2E-FULL-VERDE)", async () => {
    await prisma.persona.create({
      data: {
        id: "mp-pers-firma",
        comunidadId: comunidadA,
        rut: "22222222-2",
        nombreCompleto: "Dir Firma",
        nombres: "Dir",
        apellidos: "Firma",
        email: "dir-firma@test.cl",
        telefonoMovil: "+56933333333",
        telefonoFijo: null,
        fotografiaUrl: null,
        estadoCuenta: "activa",
        condicionesEspecialesIds: [],
        roles: ["propietario", "directiva"],
        datosGobernanza: { id: "g-f", cargoDirectiva: "presidente", fechaAsuncion: "2025-03-01" },
      },
    })
    await conSesion(emailAdmin, async () => {
      const res = await PUT("mp-pers-firma", {
        datosGobernanza: { id: "g-f", cargoDirectiva: "presidente", fechaAsuncion: "2025-03-01", firmaDigital: "https://x/f.png" },
      })
      expect(res.status).toBe(200)
      const enBd = await prisma.persona.findUnique({ where: { id: "mp-pers-firma" } })
      expect((enBd?.datosGobernanza as { firmaDigital?: string })?.firmaDigital).toBe("https://x/f.png")
    })
    await prisma.persona.delete({ where: { id: "mp-pers-firma" } }).catch(() => {})
  })

  // --- AD: la poda de gobernanza se audita en el camino real de la API ---

  it("PUT sin rol directiva portando ficha → poda la ficha y audita AD_DIRECTIVA_DESVINCULADA una sola vez", async () => {
    const ficha = { id: "g-dora", cargoDirectiva: "presidente", fechaAsuncion: "2025-03-01" }
    await prisma.persona.create({
      data: {
        id: "mp-pers-dora",
        comunidadId: comunidadA,
        rut: "33333333-3",
        nombreCompleto: "Dora Directiva",
        nombres: "Dora",
        apellidos: "Directiva",
        email: "dora@test.cl",
        telefonoMovil: "+56944444444",
        estadoCuenta: "activa",
        condicionesEspecialesIds: [],
        roles: ["propietario", "directiva"],
        datosGobernanza: ficha,
      },
    })
    // El PUT porta la ficha y pierde el rol: la misma request toca el helper
    // (poda del merge) y el epílogo del PUT (fuerza null). Debe emitir UN evento.
    await conSesion(emailAdmin, async () => {
      const res = await PUT("mp-pers-dora", { roles: ["propietario"], datosGobernanza: ficha })
      expect(res.status).toBe(200)
    })

    const enBd = await prisma.persona.findUnique({ where: { id: "mp-pers-dora" } })
    expect(enBd?.datosGobernanza).toBeNull()

    const eventos = await prisma.eventoAuditoria.findMany({ where: { referenciaId: "mp-pers-dora" } })
    expect(eventos).toHaveLength(1)
    const [evento] = eventos
    expect(evento?.tipoAccion).toBe("AD_DIRECTIVA_DESVINCULADA")
    expect(evento?.categoria).toBe("AD")
    expect(evento?.comunidadId).toBe(comunidadA)
    expect(evento?.usuario).toBe("mp-usuario-admin")
    expect(evento?.descripcion.length).toBeGreaterThan(0)

    await prisma.persona.delete({ where: { id: "mp-pers-dora" } })
    await prisma.eventoAuditoria.deleteMany({ where: { referenciaId: "mp-pers-dora" } })
  })

  it("PUT que conserva el rol directiva no emite AD_DIRECTIVA_DESVINCULADA (T4.1)", async () => {
    await prisma.persona.create({
      data: {
        id: "mp-pers-eva",
        comunidadId: comunidadA,
        rut: "44444444-4",
        nombreCompleto: "Eva Directiva",
        nombres: "Eva",
        apellidos: "Directiva",
        email: "eva@test.cl",
        telefonoMovil: "+56955555555",
        estadoCuenta: "activa",
        condicionesEspecialesIds: [],
        roles: ["directiva"],
        datosGobernanza: { id: "g-eva", cargoDirectiva: "secretario", fechaAsuncion: "2025-04-01" },
      },
    })
    await conSesion(emailAdmin, async () => {
      const res = await PUT("mp-pers-eva", {
        roles: ["directiva"],
        datosGobernanza: { id: "g-eva", cargoDirectiva: "tesorero", fechaAsuncion: "2025-04-01" },
      })
      expect(res.status).toBe(200)
    })

    const enBd = await prisma.persona.findUnique({ where: { id: "mp-pers-eva" } })
    expect((enBd?.datosGobernanza as { cargoDirectiva?: string })?.cargoDirectiva).toBe("tesorero")
    expect(
      await prisma.eventoAuditoria.count({ where: { referenciaId: "mp-pers-eva" } })
    ).toBe(0)

    await prisma.persona.delete({ where: { id: "mp-pers-eva" } })
  })

  it("PUT que no toca la ficha no emite AD_DIRECTIVA_DESVINCULADA (negativo)", async () => {
    const ficha = { id: "g-noa", cargoDirectiva: "director", fechaAsuncion: "2025-05-01" }
    await prisma.persona.create({
      data: {
        id: "mp-pers-noa",
        comunidadId: comunidadA,
        rut: "55555555-5",
        nombreCompleto: "Noa Directiva",
        nombres: "Noa",
        apellidos: "Directiva",
        email: "noa@test.cl",
        telefonoMovil: "+56966666666",
        estadoCuenta: "activa",
        condicionesEspecialesIds: [],
        roles: ["propietario", "directiva"],
        datosGobernanza: ficha,
      },
    })
    await conSesion(emailAdmin, async () => {
      const res = await PUT("mp-pers-noa", { telefonoMovil: "+56977777777" })
      expect(res.status).toBe(200)
    })

    const enBd = await prisma.persona.findUnique({ where: { id: "mp-pers-noa" } })
    expect((enBd?.datosGobernanza as { id?: string })?.id).toBe("g-noa")
    expect(enBd?.telefonoMovil).toBe("+56977777777")
    expect(
      await prisma.eventoAuditoria.count({ where: { referenciaId: "mp-pers-noa" } })
    ).toBe(0)

    await prisma.persona.delete({ where: { id: "mp-pers-noa" } })
  })

  it("PUT que quita el rol directiva SIN la clave datosGobernanza → poda la ficha persistida y audita (camino real UI)", async () => {
    const ficha = { id: "g-luisa", cargoDirectiva: "presidente", fechaAsuncion: "2025-03-01" }
    await prisma.persona.create({
      data: {
        id: "mp-pers-luisa",
        comunidadId: comunidadA,
        rut: "66666666-6",
        nombreCompleto: "Luisa Directiva",
        nombres: "Luisa",
        apellidos: "Directiva",
        email: "luisa@test.cl",
        telefonoMovil: "+56988888888",
        estadoCuenta: "activa",
        condicionesEspecialesIds: [],
        roles: ["propietario", "directiva"],
        datosGobernanza: ficha,
      },
    })
    // Camino real de la UI: el formulario de persona reenvía los roles sin la
    // clave `datosGobernanza` (FormularioPersona no conoce la ficha).
    await conSesion(emailAdmin, async () => {
      const res = await PUT("mp-pers-luisa", { roles: ["propietario"] })
      expect(res.status).toBe(200)
    })

    const enBd = await prisma.persona.findUnique({ where: { id: "mp-pers-luisa" } })
    expect(enBd?.datosGobernanza).toBeNull()

    const eventos = await prisma.eventoAuditoria.findMany({
      where: { referenciaId: "mp-pers-luisa" },
    })
    expect(eventos).toHaveLength(1)
    expect(eventos[0]?.tipoAccion).toBe("AD_DIRECTIVA_DESVINCULADA")
    expect(eventos[0]?.categoria).toBe("AD")
    expect(eventos[0]?.comunidadId).toBe(comunidadA)

    await prisma.persona.delete({ where: { id: "mp-pers-luisa" } })
    await prisma.eventoAuditoria.deleteMany({ where: { referenciaId: "mp-pers-luisa" } })
  })

  it("PUT sin `roles` en el payload conserva la directiva de la fila y persiste la ficha sin evento", async () => {
    await prisma.persona.create({
      data: {
        id: "mp-pers-cons",
        comunidadId: comunidadA,
        rut: "77777777-7",
        nombreCompleto: "Cons Directiva",
        nombres: "Cons",
        apellidos: "Directiva",
        email: "cons@test.cl",
        telefonoMovil: "+56999999999",
        estadoCuenta: "activa",
        condicionesEspecialesIds: [],
        roles: ["directiva"],
        datosGobernanza: { id: "g-cons", cargoDirectiva: "secretario", fechaAsuncion: "2025-07-01" },
      },
    })
    await conSesion(emailAdmin, async () => {
      const res = await PUT("mp-pers-cons", {
        datosGobernanza: { id: "g-cons", cargoDirectiva: "tesorero", fechaAsuncion: "2025-07-01" },
      })
      expect(res.status).toBe(200)
    })

    const enBd = await prisma.persona.findUnique({ where: { id: "mp-pers-cons" } })
    expect((enBd?.datosGobernanza as { cargoDirectiva?: string })?.cargoDirectiva).toBe("tesorero")
    expect(await prisma.eventoAuditoria.count({ where: { referenciaId: "mp-pers-cons" } })).toBe(0)

    await prisma.persona.delete({ where: { id: "mp-pers-cons" } })
  })

  it("POST con ficha y roles sin directiva no persiste ficha fantasma (se depura en silencio)", async () => {
    await conSesion(emailAdmin, async () => {
      const res = await POST(
        personaValida({
          id: "mp-pers-post-fantasma",
          rut: "88888888-8",
          email: "post-fantasma@test.cl",
          roles: ["propietario"],
          datosGobernanza: { id: "g-pf", cargoDirectiva: "director", fechaAsuncion: "2025-06-01" },
        })
      )
      expect(res.status).toBe(201)
    })
    const enBd = await prisma.persona.findUnique({ where: { id: "mp-pers-post-fantasma" } })
    expect(enBd?.datosGobernanza).toBeNull()

    await prisma.persona.delete({ where: { id: "mp-pers-post-fantasma" } }).catch(() => {})
  })

  it("POST sobre una fila existente con ficha y roles sin directiva tampoco deja ficha fantasma (upsert)", async () => {
    await prisma.persona.create({
      data: {
        id: "mp-pers-post-upsert",
        comunidadId: comunidadA,
        rut: "99999999-9",
        nombreCompleto: "Upsi Directiva",
        nombres: "Upsi",
        apellidos: "Directiva",
        email: "upsi@test.cl",
        telefonoMovil: "+56910101010",
        estadoCuenta: "activa",
        condicionesEspecialesIds: [],
        roles: ["propietario", "directiva"],
        datosGobernanza: { id: "g-upsi", cargoDirectiva: "presidente", fechaAsuncion: "2025-08-01" },
      },
    })
    await conSesion(emailAdmin, async () => {
      const res = await POST(
        personaValida({
          id: "mp-pers-post-upsert",
          rut: "99999999-9",
          email: "upsi@test.cl",
          nombreCompleto: "Upsi Directiva",
          nombres: "Upsi",
          apellidos: "Directiva",
          telefonoMovil: "+56910101010",
          roles: ["propietario"],
        })
      )
      expect(res.status).toBe(200)
    })
    const enBd = await prisma.persona.findUnique({ where: { id: "mp-pers-post-upsert" } })
    expect(enBd?.datosGobernanza).toBeNull()

    await prisma.persona.delete({ where: { id: "mp-pers-post-upsert" } })
    await prisma.eventoAuditoria.deleteMany({ where: { referenciaId: "mp-pers-post-upsert" } })
  })
})
