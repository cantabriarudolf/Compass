/**
 * @vitest-environment node
 *
 * `/api/co/mensajes-buzon` — buzón de mensajes CO con alcance por rol (S10).
 *
 * Fija el contrato real de la ruta:
 * - GET: 401 sin sesión, 403 sin `co:buzon` ver, alcance por rol (admin todo,
 *   comité solo `visibilidadComite`, residente solo lo propio, residente sin
 *   persona vinculada lista vacía en vez de 403) y scoping por comunidad.
 * - POST: reportante derivado de la sesión (el body no puede elegirlo), el
 *   administrador sí puede nombrar un vecino de SU comunidad, upsert idempotente
 *   con 201/200, 404 cross-comunidad y 403 cuando el rol no puede editar.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest"
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

const comunidad = "cbz-comunidad-a"
const otraComunidad = "cbz-comunidad-b"
const emailAdmin = "cbz-admin@test.cl"
const emailComite = "cbz-comite@test.cl"
const emailResidente = "cbz-residente@test.cl"
const emailResidenteSinPersona = "cbz-residente-sin-persona@test.cl"
const emailConserje = "cbz-conserje@test.cl"
const emailAdminOtra = "cbz-admin-b@test.cl"
const personaResidente = "cbz-persona-res"
const personaVecino = "cbz-persona-vecino"
const personaOtraComunidad = "cbz-persona-b"

const idDe = (email: string): string => email.split("@")[0] ?? email

async function conSesion(email: string, fn: () => Promise<void>): Promise<void> {
  const usuario = await prisma.usuario.findUnique({ where: { email } })
  if (!usuario) throw new Error(`usuario no encontrado: ${email}`)
  const { cookieSesionAuthjs } = await import("../helpers/sesion-authjs")
  state.cookie = await cookieSesionAuthjs({ sub: usuario.id, email: usuario.email })
  try {
    await fn()
  } finally {
    state.cookie = ""
  }
}

async function GET(query = ""): Promise<Response> {
  const { GET: handler } = await import("@/app/api/co/mensajes-buzon/route")
  return handler(new NextRequest(`http://localhost/api/co/mensajes-buzon${query}`))
}

async function POST(body: unknown): Promise<Response> {
  const { POST: handler } = await import("@/app/api/co/mensajes-buzon/route")
  return handler(
    new NextRequest("http://localhost/api/co/mensajes-buzon", {
      method: "POST",
      ...(body === undefined
        ? {}
        : { body: JSON.stringify(body), headers: { "content-type": "application/json" } }),
    })
  )
}

function mensaje(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "cbz-msg-nuevo",
    folio: "BZ-0007",
    clasificacion: "reclamo",
    asunto: "Filtración en el estacionamiento",
    cuerpo: "La filtración vuelve cada vez que llueve fuerte.",
    visibilidadComite: true,
    fechaIngreso: "2026-06-01",
    estado: "recibido",
    respuestas: [],
    ...overrides,
  }
}

const sembrarMensaje = (
  id: string,
  comunidadId: string,
  reportantePersonaId: string | null,
  visibilidadComite: boolean
): Promise<unknown> =>
  prisma.mensajeBuzonCO.create({
    data: {
      id,
      comunidadId,
      folio: `BZ-${id}`,
      clasificacion: "reclamo",
      reportantePersonaId,
      reportanteNombre: "Reportante TEST",
      asunto: `Asunto ${id}`,
      cuerpo: `Cuerpo ${id}`,
      visibilidadComite,
      fechaIngreso: "2026-06-01",
      estado: "recibido",
      respuestas: [],
    },
  })

describe("/api/co/mensajes-buzon — alcance por rol y upsert scoped", () => {
  beforeAll(async () => {
    process.env.AUTH_SECRET = AUTH_SECRET
    for (const [id, slug] of [
      [comunidad, "cbz-a"],
      [otraComunidad, "cbz-b"],
    ] as const) {
      await prisma.comunidad.upsert({
        where: { id },
        update: {},
        create: { id, nombre: `Comunidad ${id}`, slug },
      })
    }
    // Personas del Maestro (el buzón no crea personas: las referencia).
    for (const [id, comunidadId, nombre] of [
      [personaResidente, comunidad, "Vecina Reclamante"],
      [personaVecino, comunidad, "Vecino Otro"],
      [personaOtraComunidad, otraComunidad, "Vecino Otra Comunidad"],
    ] as const) {
      await prisma.persona.upsert({
        where: { id },
        update: {},
        create: {
          id,
          comunidadId,
          rut: `cbz-${id}`,
          nombreCompleto: nombre,
          nombres: nombre,
          apellidos: "TEST",
          email: `${id}@test.cl`,
          telefonoMovil: "+56900000123",
          estadoCuenta: "activa",
          condicionesEspecialesIds: [],
          roles: ["propietario"],
        } as never,
      })
    }

    const usuarios: Array<[string, string, string, string | null]> = [
      [emailAdmin, "administrador", comunidad, null],
      [emailComite, "comite", comunidad, null],
      [emailResidente, "residente", comunidad, personaResidente],
      [emailResidenteSinPersona, "residente", comunidad, null],
      [emailConserje, "conserjeria", comunidad, null],
      [emailAdminOtra, "administrador", otraComunidad, null],
    ]
    for (const [email, rol, comunidadId, personaId] of usuarios) {
      await prisma.usuario.upsert({
        where: { email },
        update: { personaId },
        create: { id: idDe(email), email, activo: true, personaId },
      })
      await prisma.membresia.deleteMany({ where: { usuarioId: idDe(email) } })
      await prisma.membresia.create({
        data: { usuarioId: idDe(email), comunidadId, rol },
      })
    }
  }, 60_000)

  beforeEach(async () => {
    state.cookie = ""
    await prisma.mensajeBuzonCO.deleteMany({
      where: { comunidadId: { in: [comunidad, otraComunidad] } },
    })
    await sembrarMensaje("cbz-msg-propio", comunidad, personaResidente, true)
    await sembrarMensaje("cbz-msg-ajeno", comunidad, personaVecino, false)
    await sembrarMensaje("cbz-msg-b", otraComunidad, personaResidente, true)
  })

  afterAll(async () => {
    try {
      state.cookie = ""
      await prisma.mensajeBuzonCO.deleteMany({
        where: { comunidadId: { in: [comunidad, otraComunidad] } },
      })
      for (const email of [emailAdmin, emailComite, emailResidente, emailResidenteSinPersona, emailConserje, emailAdminOtra]) {
        await prisma.membresia.deleteMany({ where: { usuarioId: idDe(email) } })
        await prisma.usuario.delete({ where: { id: idDe(email) } }).catch(() => {})
      }
      await prisma.persona.deleteMany({
        where: { id: { in: [personaResidente, personaVecino, personaOtraComunidad] } },
      })
      await prisma.comunidad.delete({ where: { id: otraComunidad } }).catch(() => {})
      await prisma.comunidad.delete({ where: { id: comunidad } }).catch(() => {})
    } catch {
      // limpieza best-effort
    }
  })

  it("GET sin sesión → 401", async () => {
    state.cookie = ""
    const res = await GET()
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: "No autenticado." })
  })

  it("GET con rol sin co:buzon (conserjería) → 403", async () => {
    await conSesion(emailConserje, async () => {
      const res = await GET()
      expect(res.status).toBe(403)
      expect(await res.json()).toEqual({ error: "Permiso denegado." })
    })
  })

  it("GET admin ve todos los mensajes de SU comunidad (no los ajenos)", async () => {
    await conSesion(emailAdmin, async () => {
      const res = await GET()
      expect(res.status).toBe(200)
      const json = (await res.json()) as {
        data: Array<{ id: string; comunidadId: string }>
        page: number
        pageSize: number
        total: number
      }
      expect(json.total).toBe(2)
      expect(json.page).toBe(1)
      expect(json.pageSize).toBe(50)
      expect(json.data.map((m) => m.id).sort()).toEqual(["cbz-msg-ajeno", "cbz-msg-propio"])
      expect(json.data.every((m) => m.comunidadId === comunidad)).toBe(true)
    })
  })

  it("GET comité ve solo visibilidadComite = true", async () => {
    await conSesion(emailComite, async () => {
      const json = (await (await GET()).json()) as { data: Array<{ id: string }>; total: number }
      expect(json.total).toBe(1)
      expect(json.data.map((m) => m.id)).toEqual(["cbz-msg-propio"])
    })
  })

  it("GET residente ve solo lo que reportó él mismo", async () => {
    await conSesion(emailResidente, async () => {
      const json = (await (await GET()).json()) as { data: Array<{ id: string }>; total: number }
      expect(json.total).toBe(1)
      expect(json.data.map((m) => m.id)).toEqual(["cbz-msg-propio"])
    })
  })

  it("GET residente sin persona vinculada → 200 con lista vacía (no 403)", async () => {
    await conSesion(emailResidenteSinPersona, async () => {
      const res = await GET()
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ data: [], page: 1, pageSize: 50, total: 0 })
    })
  })

  it("GET acota pageSize a 100 y corrige page inválida a 1", async () => {
    await conSesion(emailAdmin, async () => {
      const json = (await (await GET("?page=0&pageSize=500")).json()) as {
        page: number
        pageSize: number
      }
      expect(json.page).toBe(1)
      expect(json.pageSize).toBe(100)
    })
  })

  it("POST sin sesión → 401", async () => {
    state.cookie = ""
    expect((await POST(mensaje())).status).toBe(401)
  })

  it("POST con rol sin co:buzon → 403", async () => {
    await conSesion(emailConserje, async () => {
      expect((await POST(mensaje())).status).toBe(403)
    })
  })

  it("POST con cuerpo que no es objeto JSON → 400", async () => {
    await conSesion(emailAdmin, async () => {
      const res = await POST(["no", "es", "objeto"])
      expect(res.status).toBe(400)
      expect(await res.json()).toEqual({ error: "Cuerpo JSON inválido." })
    })
  })

  it("POST sin asunto → 400 con detalles Zod y no escribe", async () => {
    await conSesion(emailAdmin, async () => {
      const { asunto: _asunto, ...incompleto } = mensaje()
      const res = await POST(incompleto)
      expect(res.status).toBe(400)
      const json = (await res.json()) as {
        error: string
        detalles?: { fieldErrors?: Record<string, string[]> }
      }
      expect(json.error).toBe("Datos inválidos.")
      expect(json.detalles?.fieldErrors?.asunto).toBeTruthy()
      expect(await prisma.mensajeBuzonCO.findUnique({ where: { id: "cbz-msg-nuevo" } })).toBeNull()
    })
  })

  it("POST residente: el reportante sale de la sesión, no del body → 201", async () => {
    await conSesion(emailResidente, async () => {
      const res = await POST(mensaje({ reportantePersonaId: personaVecino }))
      expect(res.status).toBe(201)
      const enBd = await prisma.mensajeBuzonCO.findUnique({ where: { id: "cbz-msg-nuevo" } })
      expect(enBd?.comunidadId).toBe(comunidad)
      expect(enBd?.reportantePersonaId).toBe(personaResidente)
      expect(enBd?.reportanteNombre).toBe("Vecina Reclamante")
    })
  })

  it("POST admin puede nombrar a un vecino de la comunidad → 201 con esa persona y nombre de ficha", async () => {
    await conSesion(emailAdmin, async () => {
      const res = await POST(mensaje({ reportantePersonaId: personaVecino }))
      expect(res.status).toBe(201)
      const enBd = await prisma.mensajeBuzonCO.findUnique({ where: { id: "cbz-msg-nuevo" } })
      expect(enBd?.reportantePersonaId).toBe(personaVecino)
      expect(enBd?.reportanteNombre).toBe("Vecino Otro")
    })
  })

  it("POST admin con persona de OTRA comunidad cae al reportante de la sesión", async () => {
    await conSesion(emailAdmin, async () => {
      const res = await POST(mensaje({ reportantePersonaId: personaOtraComunidad }))
      expect(res.status).toBe(201)
      const enBd = await prisma.mensajeBuzonCO.findUnique({ where: { id: "cbz-msg-nuevo" } })
      expect(enBd?.reportantePersonaId).toBeNull()
      // Sin persona vinculada, el nombre de respaldo es el email de la sesión.
      expect(enBd?.reportanteNombre).toBe(emailAdmin)
    })
  })

  it("POST sobre un id propio existente → 200 (upsert) y actualiza en BD", async () => {
    await conSesion(emailAdmin, async () => {
      const res = await POST(mensaje({ id: "cbz-msg-propio", asunto: "Asunto corregido" }))
      expect(res.status).toBe(200)
      const enBd = await prisma.mensajeBuzonCO.findUnique({ where: { id: "cbz-msg-propio" } })
      expect(enBd?.asunto).toBe("Asunto corregido")
      expect(await prisma.mensajeBuzonCO.count({ where: { id: "cbz-msg-propio" } })).toBe(1)
    })
  })

  it("POST sobre un id de otra comunidad → 404 y no toca la fila ajena", async () => {
    await conSesion(emailAdmin, async () => {
      const res = await POST(mensaje({ id: "cbz-msg-b", asunto: "Intento ajeno" }))
      expect(res.status).toBe(404)
      expect(await res.json()).toEqual({ error: "Registro no encontrado." })
      const ajena = await prisma.mensajeBuzonCO.findUnique({ where: { id: "cbz-msg-b" } })
      expect(ajena?.asunto).toBe("Asunto cbz-msg-b")
      expect(ajena?.comunidadId).toBe(otraComunidad)
    })
  })

  it("POST comité sobre un mensaje existente → 403 (co:buzon no tiene editar)", async () => {
    await conSesion(emailComite, async () => {
      const res = await POST(mensaje({ id: "cbz-msg-propio", asunto: "Editado por comité" }))
      expect(res.status).toBe(403)
      expect(await res.json()).toEqual({ error: "Permiso denegado." })
      const enBd = await prisma.mensajeBuzonCO.findUnique({ where: { id: "cbz-msg-propio" } })
      expect(enBd?.asunto).toBe("Asunto cbz-msg-propio")
    })
  })

  it("POST comité con un id nuevo → 201 (crear sí está permitido)", async () => {
    await conSesion(emailComite, async () => {
      const res = await POST(mensaje({ id: "cbz-msg-comite" }))
      expect(res.status).toBe(201)
      const enBd = await prisma.mensajeBuzonCO.findUnique({ where: { id: "cbz-msg-comite" } })
      expect(enBd?.comunidadId).toBe(comunidad)
      expect(enBd?.reportantePersonaId).toBeNull()
      expect(enBd?.reportanteNombre).toBe(emailComite)
    })
  })
})
