/**
 * @vitest-environment node
 *
 * api-cobertura-fase4 (SERIE-DEUDA-1 P4) — /api/personas (72.82% → medido).
 *
 * Segunda capa sobre `test/api/personas.test.ts`: validaciones de negocio del
 * handler (`validarYLimpiarPersona`) que el camino principal no ejercitaba —
 * D1 media por referencia (foto y firma), GD herencia del período vigente,
 * PE FKs laborales contra los maestros MA, MP condiciones especiales, 404 de
 * scope y 403 por rol/ABAC residente. Prisma real, único mock `next/headers`.
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

const comunidadA = "mp4-com-a"
const comunidadB = "mp4-com-b"
const emailAdmin = "mp4-admin@test.cl"
const emailComite = "mp4-comite@test.cl"
const emailConserjeria = "mp4-conserjeria@test.cl"
const emailResidente = "mp4-residente@test.cl"

function personaValida(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "mp4-pers-1",
    rut: "12345678-5",
    nombreCompleto: "Ana MP4",
    nombres: "Ana",
    apellidos: "MP4",
    email: "ana.mp4@test.cl",
    telefonoMovil: "+56911110000",
    estadoCuenta: "activa",
    condicionesEspecialesIds: [],
    roles: [],
    ...overrides,
  }
}

describe("/api/personas (fase 4) — validaciones de negocio con BD real", () => {
  const coleccion = () => import("@/app/api/personas/route")
  const item = () => import("@/app/api/personas/[id]/route")

  beforeAll(async () => {
    process.env.AUTH_SECRET = AUTH_SECRET
    for (const c of [
      { id: comunidadA, nombre: "Comunidad MP4 A", slug: "mp4-a" },
      { id: comunidadB, nombre: "Comunidad MP4 B", slug: "mp4-b" },
    ]) {
      await prisma.comunidad.upsert({ where: { id: c.id }, update: {}, create: c })
    }
    for (const u of [
      { id: "mp4-user-admin", email: emailAdmin },
      { id: "mp4-user-comite", email: emailComite },
      { id: "mp4-user-conserjeria", email: emailConserjeria },
      { id: "mp4-user-residente", email: emailResidente },
    ]) {
      await prisma.usuario.upsert({
        where: { email: u.email },
        update: { activo: true },
        create: { ...u, activo: true },
      })
    }
    const membresias = [
      { usuarioId: "mp4-user-admin", comunidadId: comunidadA, rol: "administrador" },
      { usuarioId: "mp4-user-comite", comunidadId: comunidadA, rol: "comite" },
      { usuarioId: "mp4-user-conserjeria", comunidadId: comunidadA, rol: "conserjeria" },
      { usuarioId: "mp4-user-residente", comunidadId: comunidadA, rol: "residente" },
    ]
    await prisma.membresia.deleteMany({
      where: { usuarioId: { in: membresias.map((m) => m.usuarioId) } },
    })
    for (const m of membresias) await prisma.membresia.create({ data: m })

    await limpiar()
    await prisma.periodoDirectiva.create({
      data: {
        id: "mp4-periodo-vigente",
        comunidadId: comunidadA,
        fechaInicio: "2025-01-01",
        duracionMeses: 24,
        fechaInscripcion: "2025-01-05",
        referenciaInscripcion: "Acta asamblea N°1",
        estado: "vigente",
        miembros: [],
      },
    })
    await prisma.afp.create({
      data: { id: "mp4-afp-ok", comunidadId: comunidadA, nombre: "AFP Modelo", tasaCotizacion: 10 },
    })
    await prisma.condicionEspecial.create({
      data: { id: "mp4-cond-ok", comunidadId: comunidadA, nombre: "Movilidad reducida", color: "#000" },
    })
    // Persona de OTRA comunidad (para el 404 de scope en POST/UPSERT).
    await prisma.persona.create({
      data: {
        id: "mp4-pers-ajena",
        comunidadId: comunidadB,
        rut: "87654321-4",
        nombreCompleto: "Persona Ajena",
        nombres: "Persona",
        apellidos: "Ajena",
        email: "ajena.mp4@test.cl",
        telefonoMovil: "+56922220000",
        estadoCuenta: "activa",
        condicionesEspecialesIds: [],
        roles: [],
      },
    })
  }, 30_000)

  afterAll(async () => {
    state.cookie = ""
    await limpiar()
    await prisma.membresia.deleteMany({
      where: { usuarioId: { startsWith: "mp4-user-" } },
    })
    await prisma.usuario.deleteMany({ where: { email: { startsWith: "mp4-" } } })
    await prisma.comunidad.deleteMany({ where: { id: { in: [comunidadA, comunidadB] } } })
  })

  async function limpiar(): Promise<void> {
    const enComunidades = { in: [comunidadA, comunidadB] }
    await prisma.vinculoUnidad.deleteMany({ where: { comunidadId: enComunidades } })
    await prisma.eventoAuditoria.deleteMany({ where: { comunidadId: enComunidades } })
    await prisma.persona.deleteMany({ where: { comunidadId: enComunidades } })
    await prisma.periodoDirectiva.deleteMany({ where: { comunidadId: enComunidades } })
    await prisma.afp.deleteMany({ where: { comunidadId: enComunidades } })
    await prisma.condicionEspecial.deleteMany({ where: { comunidadId: enComunidades } })
  }

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
    const { POST } = await coleccion()
    return POST(
      new NextRequest("http://localhost/api/personas", {
        method: "POST",
        body: typeof body === "string" ? body : JSON.stringify(body),
        headers: { "content-type": "application/json" },
      })
    )
  }

  async function GET(): Promise<Response> {
    const { GET } = await coleccion()
    return GET(new NextRequest("http://localhost/api/personas"))
  }

  async function GET_ONE(id: string): Promise<Response> {
    const { GET } = await item()
    return GET(new NextRequest(`http://localhost/api/personas/${id}`), {
      params: Promise.resolve({ id }),
    })
  }

  async function PUT(id: string, body: unknown): Promise<Response> {
    const { PUT } = await item()
    return PUT(
      new NextRequest(`http://localhost/api/personas/${id}`, {
        method: "PUT",
        body: typeof body === "string" ? body : JSON.stringify(body),
        headers: { "content-type": "application/json" },
      }),
      { params: Promise.resolve({ id }) }
    )
  }

  async function DELETE(id: string): Promise<Response> {
    const { DELETE } = await item()
    return DELETE(new NextRequest(`http://localhost/api/personas/${id}`, { method: "DELETE" }), {
      params: Promise.resolve({ id }),
    })
  }

  it("guardia de sesión: 401 sin cookie en GET, POST, PUT y DELETE", async () => {
    state.cookie = ""
    expect((await GET()).status).toBe(401)
    expect((await POST(personaValida())).status).toBe(401)
    expect((await PUT("mp4-pers-1", {})).status).toBe(401)
    expect((await DELETE("mp4-pers-1")).status).toBe(401)
  })

  it("conserjería (sin permiso MP): GET → 403 y GET_ONE → 403", async () => {
    await conSesion(emailConserjeria, async () => {
      expect((await GET()).status).toBe(403)
      expect((await GET_ONE("mp4-pers-1")).status).toBe(403)
    })
  })

  it("GET con URL inválida → 400", async () => {
    await conSesion(emailAdmin, async () => {
      const { GET } = await coleccion()
      const res = await GET({ url: "::" } as unknown as Request)
      expect(res.status).toBe(400)
      expect(((await res.json()) as { error: string }).error).toBe("URL de solicitud inválida.")
    })
  })

  it("POST con JSON inválido y con schema inválido → 400", async () => {
    await conSesion(emailAdmin, async () => {
      const malJson = await POST("{no-json")
      expect(malJson.status).toBe(400)
      expect(((await malJson.json()) as { error: string }).error).toBe("Cuerpo JSON inválido.")
      const malSchema = await POST({})
      expect(malSchema.status).toBe(400)
      expect(((await malSchema.json()) as { error: string }).error).toBe("Datos inválidos.")
    })
  })

  it("residente (sin permiso MP crear): POST → 403 sin persistir", async () => {
    await conSesion(emailResidente, async () => {
      const res = await POST(personaValida({ id: "mp4-pers-residente-crea" }))
      expect(res.status).toBe(403)
      expect(await prisma.persona.findUnique({ where: { id: "mp4-pers-residente-crea" } })).toBeNull()
    })
  })

  it("comité (sin permiso MP crear): POST → 403", async () => {
    await conSesion(emailComite, async () => {
      const res = await POST(personaValida({ id: "mp4-pers-comite-crea" }))
      expect(res.status).toBe(403)
    })
  })

  it("D1: fotografía embebida (data:) → 400 y no persiste", async () => {
    await conSesion(emailAdmin, async () => {
      const res = await POST(
        personaValida({
          id: "mp4-pers-foto-data",
          fotografiaUrl: "data:image/png;base64,iVBORw0KGgo=",
        })
      )
      expect(res.status).toBe(400)
      expect(((await res.json()) as { error: string }).error).toMatch(/fotografía/)
      expect(await prisma.persona.findUnique({ where: { id: "mp4-pers-foto-data" } })).toBeNull()
    })
  })

  it("D1: firma larga (>2048) que pasa el schema pero no la referencia válida → 400", async () => {
    await conSesion(emailAdmin, async () => {
      const res = await POST(
        personaValida({
          id: "mp4-pers-firma-larga",
          roles: ["directiva"],
          datosGobernanza: {
            id: "mp4-g-firma",
            cargoDirectiva: "presidente",
            fechaAsuncion: "2025-01-01",
            firmaDigital: `https://x/${"a".repeat(3000)}`,
          },
        })
      )
      expect(res.status).toBe(400)
      expect(((await res.json()) as { error: string }).error).toMatch(/firma digitalizada/)
    })
  })

  it("GD: la ficha sin período hereda el período directiva vigente", async () => {
    await conSesion(emailAdmin, async () => {
      const res = await POST(
        personaValida({
          id: "mp4-pers-gobernanza",
          rut: "22222222-2",
          email: "gobernanza.mp4@test.cl",
          roles: ["directiva"],
          datosGobernanza: { id: "mp4-g-1", cargoDirectiva: "secretario", fechaAsuncion: "2025-02-01" },
        })
      )
      expect(res.status).toBe(201)
      const enBd = await prisma.persona.findUnique({ where: { id: "mp4-pers-gobernanza" } })
      expect((enBd?.datosGobernanza as { periodoId?: string })?.periodoId).toBe("mp4-periodo-vigente")
    })
  })

  it("PE: FK laboral inexistente → 400; existente → 201", async () => {
    await conSesion(emailAdmin, async () => {
      const fichaBase = {
        id: "mp4-dl-1",
        cargo: "Conserje",
        afp: "AFP Modelo",
        prevision: "Fonasa",
        fechaIngreso: "2025-01-01",
      }
      const mala = await POST(
        personaValida({
          id: "mp4-pers-fk-mala",
          rut: "33333333-3",
          email: "fk-mala.mp4@test.cl",
          datosLaborales: { ...fichaBase, afpId: "mp4-afp-inexistente" },
        })
      )
      expect(mala.status).toBe(400)
      expect(((await mala.json()) as { error: string }).error).toBe(
        "afpId no existe en el maestro correspondiente."
      )
      expect(await prisma.persona.findUnique({ where: { id: "mp4-pers-fk-mala" } })).toBeNull()

      const buena = await POST(
        personaValida({
          id: "mp4-pers-fk-ok",
          rut: "33333333-3",
          email: "fk-ok.mp4@test.cl",
          datosLaborales: { ...fichaBase, afpId: "mp4-afp-ok" },
        })
      )
      expect(buena.status).toBe(201)
      expect(await prisma.persona.findUnique({ where: { id: "mp4-pers-fk-ok" } })).not.toBeNull()
    })
  })

  it("MP: condición especial inexistente → 400; existente → 201", async () => {
    await conSesion(emailAdmin, async () => {
      const mala = await POST(
        personaValida({
          id: "mp4-pers-cond-mala",
          rut: "44444444-4",
          email: "cond-mala.mp4@test.cl",
          condicionesEspecialesIds: ["mp4-cond-inexistente"],
        })
      )
      expect(mala.status).toBe(400)
      expect(((await mala.json()) as { error: string }).error).toBe(
        "condicionEspecial mp4-cond-inexistente no existe."
      )

      const buena = await POST(
        personaValida({
          id: "mp4-pers-cond-ok",
          rut: "44444444-4",
          email: "cond-ok.mp4@test.cl",
          condicionesEspecialesIds: ["mp4-cond-ok"],
        })
      )
      expect(buena.status).toBe(201)
    })
  })

  it("POST con id de otra comunidad → 404 sin mutar la fila ajena", async () => {
    await conSesion(emailAdmin, async () => {
      const res = await POST(
        personaValida({ id: "mp4-pers-ajena", rut: "11111111-1", email: "intruso.mp4@test.cl" })
      )
      expect(res.status).toBe(404)
      const enBd = await prisma.persona.findUnique({ where: { id: "mp4-pers-ajena" } })
      expect(enBd?.comunidadId).toBe(comunidadB)
      expect(enBd?.email).toBe("ajena.mp4@test.cl")
    })
  })

  it("GET_ONE inexistente → 404; residente edita SU ficha (PUT → 200)", async () => {
    await conSesion(emailAdmin, async () => {
      expect((await GET_ONE("mp4-no-existe")).status).toBe(404)
      // Ficha del residente, ligada a su Usuario (mp:propios).
      const alta = await POST(
        personaValida({
          id: "mp4-pers-res",
          rut: "55555555-5",
          email: "res.mp4@test.cl",
          nombreCompleto: "Res MP4",
          nombres: "Res",
          apellidos: "MP4",
        })
      )
      expect(alta.status).toBe(201)
    })
    await prisma.usuario.update({
      where: { id: "mp4-user-residente" },
      data: { personaId: "mp4-pers-res" },
    })
    await conSesion(emailResidente, async () => {
      const res = await PUT("mp4-pers-res", { telefonoMovil: "+56933330000" })
      expect(res.status).toBe(200)
      expect((await prisma.persona.findUnique({ where: { id: "mp4-pers-res" } }))?.telefonoMovil).toBe(
        "+56933330000"
      )
      // El residente no puede editar la ficha de otro.
      expect((await PUT("mp4-pers-1", { telefonoMovil: "+56933330001" })).status).toBe(403)
      expect((await PUT("mp4-pers-res", { estadoCuenta: "invalido" })).status).toBe(400)
    })
  })

  it("PUT sobre id inexistente o de otra comunidad → 404", async () => {
    await conSesion(emailAdmin, async () => {
      expect((await PUT("mp4-no-existe", { telefonoMovil: "+56900000000" })).status).toBe(404)
      expect((await PUT("mp4-pers-ajena", { telefonoMovil: "+56900000000" })).status).toBe(404)
    })
  })

  it("DELETE: comité → 403; residente con id ajeno → 403; inexistente → 404", async () => {
    await conSesion(emailComite, async () => {
      expect((await DELETE("mp4-pers-1")).status).toBe(403)
    })
    await conSesion(emailResidente, async () => {
      expect((await DELETE("mp4-pers-1")).status).toBe(403)
      expect(((await (await DELETE("mp4-pers-1")).json()) as { error: string }).error).toMatch(/propia ficha/)
    })
    await conSesion(emailAdmin, async () => {
      expect((await DELETE("mp4-no-existe")).status).toBe(404)
    })
  })
})
