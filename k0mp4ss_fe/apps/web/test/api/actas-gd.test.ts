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

function actaValida(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "gd2-acta-1",
    fecha: "2026-09-10",
    hora: "19:00",
    lugar: "Sede comunitaria",
    tablaTemas: ["Gasto común"],
    presentes: ["gd2-m1", "gd2-m2"],
    ausentes: ["gd2-m3"],
    invitados: [],
    minuta: "Se acuerda el gasto común de septiembre.",
    adjuntos: [],
    estado: "borrador",
    aprobaciones: [],
    ...overrides,
  }
}

function ficha(cargo: string): Record<string, unknown> {
  return {
    id: `g-gd2-${cargo}`,
    cargoDirectiva: cargo,
    fechaAsuncion: "2026-01-15",
    periodoId: "gd2-per-vig",
  }
}

describe("/api/actas-gd — GD actas con BD real (Fase 2)", () => {
  const comunidadA = "gd2-comunidad-a"
  const comunidadB = "gd2-comunidad-b"
  const comunidadC = "gd2-comunidad-c"
  const emailAdmin = "gd2-admin@test.cl"
  const emailComite = "gd2-comite@test.cl"

  const cargaModulos = async () => ({
    coleccion: await import("@/app/api/actas-gd/route"),
    item: await import("@/app/api/actas-gd/[id]/route"),
    aprobar: await import("@/app/api/actas-gd/[id]/aprobar/route"),
  })

  beforeAll(async () => {
    process.env.AUTH_SECRET = AUTH_SECRET
    for (const c of [
      { id: comunidadA, nombre: "Comunidad A GD2", slug: "gd2-comunidad-a" },
      { id: comunidadB, nombre: "Comunidad B GD2", slug: "gd2-comunidad-b" },
      { id: comunidadC, nombre: "Comunidad C GD2", slug: "gd2-comunidad-c" },
    ]) {
      await prisma.comunidad.upsert({ where: { id: c.id }, update: {}, create: c })
    }
    // Directiva vigente: 3 miembros activos con ficha del período.
    const personas = [
      { id: "gd2-m1", rut: "11111111-1", nombre: "Miembro Uno", email: "gd2-m1@test.cl", datosGobernanza: ficha("presidente") },
      { id: "gd2-m2", rut: "22222222-2", nombre: "Miembro Dos", email: "gd2-m2@test.cl", datosGobernanza: ficha("tesorero") },
      { id: "gd2-m3", rut: "33333333-3", nombre: "Miembro Tres", email: "gd2-m3@test.cl", datosGobernanza: ficha("secretario") },
      { id: "gd2-out", rut: "44444444-4", nombre: "Vecino Externo", email: "gd2-out@test.cl", datosGobernanza: null },
    ]
    for (const p of personas) {
      await prisma.persona.upsert({
        where: { id: p.id },
        update: {},
        create: {
          id: p.id,
          comunidadId: comunidadA,
          rut: p.rut,
          nombreCompleto: p.nombre,
          nombres: p.nombre.split(" ")[0]!,
          apellidos: p.nombre.split(" ").slice(1).join(" "),
          email: p.email,
          telefonoMovil: "+56900000000",
          estadoCuenta: "activa",
          condicionesEspecialesIds: [],
          roles: p.datosGobernanza ? ["propietario", "directiva"] : ["propietario"],
          datosGobernanza: (p.datosGobernanza ?? undefined) as never,
        },
      })
    }
    await prisma.periodoDirectiva.upsert({
      where: { id: "gd2-per-vig" },
      update: {},
      create: {
        id: "gd2-per-vig",
        comunidadId: comunidadA,
        fechaInicio: "2026-01-15",
        duracionMeses: 24,
        fechaInscripcion: "2026-02-01",
        referenciaInscripcion: "Acta asamblea N° 1/2026",
        estado: "vigente",
        miembros: [],
      },
    })
    // Unidad + control AD que autoriza a residentes a ver actas (comunidad A).
    await prisma.unidad.upsert({
      where: { id: "gd2-u1" },
      update: {},
      create: {
        id: "gd2-u1",
        comunidadId: comunidadA,
        microSectorId: "gd2-ms1",
        numero: "101",
        etiqueta: "Depto",
        tipoUnidadId: "gd2-t1",
        metraje: 50,
        prorrateo: 1,
        rolSii: "1-1",
        estadoId: "habitada",
        servicios: {},
      },
    })
    await prisma.controlPropiedad.upsert({
      where: { id: "gd2-ctrl-1" },
      update: { residenteVeActas: true },
      create: {
        id: "gd2-ctrl-1",
        comunidadId: comunidadA,
        unidadId: "gd2-u1",
        residenteVeMorosidad: false,
        residenteVeActas: true,
        alertasResidentesActivas: true,
      },
    })
    const usuarios = [
      { id: "gd2-usuario-admin", email: emailAdmin, personaId: null },
      { id: "gd2-usuario-m1", email: "gd2-m1@test.cl", personaId: "gd2-m1" },
      { id: "gd2-usuario-m2", email: "gd2-m2@test.cl", personaId: "gd2-m2" },
      { id: "gd2-usuario-m3", email: "gd2-m3@test.cl", personaId: "gd2-m3" },
      { id: "gd2-usuario-out", email: "gd2-out@test.cl", personaId: "gd2-out" },
      { id: "gd2-usuario-res", email: emailComite, personaId: null },
      { id: "gd2-usuario-resc", email: "gd2-resc@test.cl", personaId: null },
    ]
    for (const u of usuarios) {
      await prisma.usuario.upsert({ where: { email: u.email }, update: {}, create: { id: u.id, email: u.email, activo: true, personaId: u.personaId } })
    }
    await prisma.membresia.deleteMany({
      where: { usuarioId: { in: usuarios.map((u) => u.id) } },
    })
    const membresias: [string, string, string][] = [
      ["gd2-usuario-admin", comunidadA, "administrador"],
      ["gd2-usuario-m1", comunidadA, "comite"],
      ["gd2-usuario-m2", comunidadA, "comite"],
      ["gd2-usuario-m3", comunidadA, "comite"],
      ["gd2-usuario-out", comunidadA, "comite"],
      ["gd2-usuario-res", comunidadA, "residente"],
      ["gd2-usuario-resc", comunidadC, "residente"],
    ]
    for (const [usuarioId, comunidadId, rol] of membresias) {
      await prisma.membresia.create({ data: { usuarioId, comunidadId, rol } })
    }
  }, 30_000)

  afterAll(async () => {
    try {
      state.cookie = ""
      await prisma.actaGD.deleteMany({ where: { comunidadId: { in: [comunidadA, comunidadB, comunidadC] } } })
      await prisma.controlPropiedad.deleteMany({ where: { comunidadId: comunidadA } })
      await prisma.unidad.deleteMany({ where: { comunidadId: comunidadA } })
      await prisma.periodoDirectiva.deleteMany({ where: { comunidadId: { in: [comunidadA, comunidadB, comunidadC] } } })
      await prisma.persona.deleteMany({ where: { comunidadId: comunidadA } })
      await prisma.membresia.deleteMany({ where: { comunidadId: { in: [comunidadA, comunidadB, comunidadC] } } })
      for (const email of [emailAdmin, emailComite, "gd2-m1@test.cl", "gd2-m2@test.cl", "gd2-m3@test.cl", "gd2-out@test.cl", "gd2-resc@test.cl"]) {
        await prisma.usuario.delete({ where: { email } }).catch(() => {})
      }
      for (const id of [comunidadA, comunidadB, comunidadC]) {
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
      new NextRequest("http://localhost/api/actas-gd", {
        method: "POST",
        body: JSON.stringify(body),
        headers: { "content-type": "application/json" },
      })
    )
  }

  async function GET(query = ""): Promise<Response> {
    const { coleccion } = await cargaModulos()
    return coleccion.GET(new NextRequest(`http://localhost/api/actas-gd${query}`))
  }

  async function GET_ONE(id: string): Promise<Response> {
    const { item } = await cargaModulos()
    return item.GET(new NextRequest(`http://localhost/api/actas-gd/${id}`), {
      params: Promise.resolve({ id }),
    })
  }

  async function PUT(id: string, body: unknown): Promise<Response> {
    const { item } = await cargaModulos()
    return item.PUT(
      new NextRequest(`http://localhost/api/actas-gd/${id}`, {
        method: "PUT",
        body: JSON.stringify(body),
        headers: { "content-type": "application/json" },
      }),
      { params: Promise.resolve({ id }) }
    )
  }

  async function DELETE(id: string): Promise<Response> {
    const { item } = await cargaModulos()
    return item.DELETE(new NextRequest(`http://localhost/api/actas-gd/${id}`, { method: "DELETE" }), {
      params: Promise.resolve({ id }),
    })
  }

  async function APROBAR(id: string, personaId: string): Promise<Response> {
    const { aprobar } = await cargaModulos()
    return aprobar.POST(
      new NextRequest(`http://localhost/api/actas-gd/${id}/aprobar`, {
        method: "POST",
        body: JSON.stringify({ personaId }),
        headers: { "content-type": "application/json" },
      }),
      { params: Promise.resolve({ id }) }
    )
  }

  it("401 sin sesión", async () => {
    state.cookie = ""
    expect((await GET()).status).toBe(401)
    expect((await POST(actaValida())).status).toBe(401)
  })

  it("admin crea acta → 201, queda en BD y hereda el período vigente", async () => {
    await conSesion(emailAdmin, async () => {
      const res = await POST(actaValida())
      expect(res.status).toBe(201)
      const enBd = await prisma.actaGD.findUnique({ where: { id: "gd2-acta-1" } })
      expect(enBd).not.toBeNull()
      expect(enBd?.comunidadId).toBe(comunidadA)
      expect(enBd?.periodoId).toBe("gd2-per-vig")
      expect(enBd?.estado).toBe("borrador")
    })
  })

  it("presente no-miembro de directiva → 400 y no persiste", async () => {
    await conSesion(emailAdmin, async () => {
      const res = await POST(actaValida({ id: "gd2-acta-mala", presentes: ["gd2-out"] }))
      expect(res.status).toBe(400)
      expect(await prisma.actaGD.findUnique({ where: { id: "gd2-acta-mala" } })).toBeNull()
    })
  })

  it("body inválido según ActaGDSchema (sin lugar) → 400", async () => {
    await conSesion(emailAdmin, async () => {
      const res = await POST(actaValida({ id: "gd2-acta-mala2", lugar: "" }))
      expect(res.status).toBe(400)
    })
  })

  it("directiva (comité) puede crear; residente no (403)", async () => {
    await conSesion("gd2-m1@test.cl", async () => {
      const res = await POST(actaValida({ id: "gd2-acta-comite" }))
      expect(res.status).toBe(201)
    })
    await conSesion(emailComite, async () => {
      const res = await POST(actaValida({ id: "gd2-acta-res" }))
      expect(res.status).toBe(403)
      expect(await prisma.actaGD.findUnique({ where: { id: "gd2-acta-res" } })).toBeNull()
    })
  })

  it("residente con residenteVeActas ve solo publicadas; sin autorización → 403", async () => {
    await conSesion(emailAdmin, async () => {
      const pub = await POST(actaValida({ id: "gd2-acta-pub", estado: "publicada", aprobaciones: ["gd2-m1", "gd2-m2", "gd2-m3"] }))
      expect(pub.status).toBe(201)
    })
    await conSesion(emailComite, async () => {
      const res = await GET()
      expect(res.status).toBe(200)
      const j = (await res.json()) as { data: { id: string; estado: string }[] }
      expect(j.data.length).toBeGreaterThan(0)
      expect(j.data.every((a) => a.estado === "publicada")).toBe(true)
    })
    // Comunidad C sin controles: residente → 403.
    await conSesion("gd2-resc@test.cl", async () => {
      const res = await GET()
      expect(res.status).toBe(403)
    })
  })

  it("GET_ONE propio → 200; de otra comunidad → 404", async () => {
    await prisma.actaGD.create({
      data: {
        ...(actaValida({ id: "gd2-acta-b" }) as Record<string, unknown>),
        comunidadId: comunidadB,
      } as never,
    })
    await conSesion(emailAdmin, async () => {
      expect((await GET_ONE("gd2-acta-1")).status).toBe(200)
      expect((await GET_ONE("gd2-acta-b")).status).toBe(404)
    })
  })

  it("PUT parcial actualiza lugar y persiste en BD", async () => {
    await conSesion(emailAdmin, async () => {
      const res = await PUT("gd2-acta-1", { lugar: "Salón multiuso" })
      expect(res.status).toBe(200)
      expect((await prisma.actaGD.findUnique({ where: { id: "gd2-acta-1" } }))?.lugar).toBe("Salón multiuso")
    })
  })

  it("DELETE borrador → 200; publicada → 409 y sigue en BD", async () => {
    await conSesion(emailAdmin, async () => {
      expect((await DELETE("gd2-acta-comite")).status).toBe(200)
      expect(await prisma.actaGD.findUnique({ where: { id: "gd2-acta-comite" } })).toBeNull()
      const pub = await DELETE("gd2-acta-pub")
      expect(pub.status).toBe(409)
      expect(await prisma.actaGD.findUnique({ where: { id: "gd2-acta-pub" } })).not.toBeNull()
    })
  })

  it("aprobar: firma, sin doble firma, sin suplantación, quórum publica", async () => {
    // Firma de m1 (sesión propia).
    await conSesion("gd2-m1@test.cl", async () => {
      const r1 = await APROBAR("gd2-acta-1", "gd2-m1")
      expect(r1.status).toBe(200)
      const j1 = (await r1.json()) as { publicada: boolean }
      expect(j1.publicada).toBe(false)
      const enBd = await prisma.actaGD.findUnique({ where: { id: "gd2-acta-1" } })
      expect((enBd?.aprobaciones as unknown as string[])).toContain("gd2-m1")
      expect(enBd?.estado).toBe("borrador")
      // Doble firma → 409.
      expect((await APROBAR("gd2-acta-1", "gd2-m1")).status).toBe(409)
      // Suplantación (firmar como m2) → 403.
      expect((await APROBAR("gd2-acta-1", "gd2-m2")).status).toBe(403)
    })
    // No-miembro (out) → 403.
    await conSesion("gd2-out@test.cl", async () => {
      expect((await APROBAR("gd2-acta-1", "gd2-out")).status).toBe(403)
    })
    // m2 firma (falta m3 para el quórum de 3).
    await conSesion("gd2-m2@test.cl", async () => {
      const r2 = await APROBAR("gd2-acta-1", "gd2-m2")
      expect((((await r2.json()) as { publicada: boolean }).publicada)).toBe(false)
    })
    // m3 completa el quórum → publicada con trazabilidad.
    await conSesion("gd2-m3@test.cl", async () => {
      const r3 = await APROBAR("gd2-acta-1", "gd2-m3")
      expect(r3.status).toBe(200)
      expect(((await r3.json()) as { publicada: boolean }).publicada).toBe(true)
      const enBd = await prisma.actaGD.findUnique({ where: { id: "gd2-acta-1" } })
      expect(enBd?.estado).toBe("publicada")
      expect(enBd?.fechaPublicacion).toBeTruthy()
      expect(enBd?.avisoCVReferencia).toBe("pendiente")
    })
    // Sobre publicada → 409.
    await conSesion("gd2-m1@test.cl", async () => {
      expect((await APROBAR("gd2-acta-1", "gd2-m1")).status).toBe(409)
    })
  })
})
