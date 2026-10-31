/**
 * @vitest-environment node
 *
 * `/api/liquidaciones/adelantos/[id]` — lectura de un adelanto PL (SERIE-FASE2 §V4).
 *
 * La ruta es solo lectura (la baja es `POST .../desestiminar`), así que el
 * contrato a fijar es el de `GET_ONE` de la factory: 401 sin sesión, 403 cuando
 * el rol no tiene `pl:adelantos` ver (conserjería y residente lo tienen vacío a
 * propósito), 404 cross-comunidad sin filtrar existencia, y 200 con el registro.
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

const comunidad = "aditem-comunidad-a"
const otraComunidad = "aditem-comunidad-b"
const emailAdmin = "aditem-admin@test.cl"
const emailComite = "aditem-comite@test.cl"
const emailConserje = "aditem-conserje@test.cl"
const emailResidente = "aditem-residente@test.cl"
const emailAdminOtra = "aditem-admin-otra@test.cl"

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

async function adelanto(id: string): Promise<Response> {
  const { GET } = await import("@/app/api/liquidaciones/adelantos/[id]/route")
  return GET(new NextRequest(`http://localhost/api/liquidaciones/adelantos/${id}`), {
    params: Promise.resolve({ id }),
  })
}

const sembrarAdelanto = (id: string, comunidadId: string): Promise<unknown> =>
  prisma.adelantoPL.create({
    data: {
      id,
      comunidadId,
      folio: `ADE-${id}`,
      trabajadorPersonaId: "aditem-trab-1",
      fecha: "2026-06-01",
      monto: 100_000,
      glosa: "Anticipo de quincena",
      estado: "pendiente",
      pacto: "anticipo_regular",
      saldo: 100_000,
      periodoImputacion: "2026-06",
    },
  })

describe("GET /api/liquidaciones/adelantos/[id] — lectura scoped", () => {
  beforeAll(async () => {
    process.env.AUTH_SECRET = AUTH_SECRET
    for (const [id, slug] of [
      [comunidad, "aditem-a"],
      [otraComunidad, "aditem-b"],
    ] as const) {
      await prisma.comunidad.upsert({
        where: { id },
        update: {},
        create: { id, nombre: `Comunidad ${id}`, slug },
      })
    }
    const usuarios: Array<[string, string, string]> = [
      [emailAdmin, "administrador", comunidad],
      [emailComite, "comite", comunidad],
      [emailConserje, "conserjeria", comunidad],
      [emailResidente, "residente", comunidad],
      [emailAdminOtra, "administrador", otraComunidad],
    ]
    for (const [email, rol, comunidadId] of usuarios) {
      await prisma.usuario.upsert({
        where: { email },
        update: {},
        create: { id: idDe(email), email, activo: true },
      })
      await prisma.membresia.deleteMany({ where: { usuarioId: idDe(email) } })
      await prisma.membresia.create({
        data: { usuarioId: idDe(email), comunidadId, rol },
      })
    }
  }, 30_000)

  beforeEach(async () => {
    state.cookie = ""
    await prisma.adelantoPL.deleteMany({
      where: { comunidadId: { in: [comunidad, otraComunidad] } },
    })
    await sembrarAdelanto("aditem-ade-1", comunidad)
    await sembrarAdelanto("aditem-ade-b-1", otraComunidad)
  })

  afterAll(async () => {
    try {
      state.cookie = ""
      await prisma.adelantoPL.deleteMany({
        where: { comunidadId: { in: [comunidad, otraComunidad] } },
      })
      for (const email of [emailAdmin, emailComite, emailConserje, emailResidente, emailAdminOtra]) {
        await prisma.membresia.deleteMany({ where: { usuarioId: idDe(email) } })
        await prisma.usuario.delete({ where: { id: idDe(email) } }).catch(() => {})
      }
      await prisma.comunidad.delete({ where: { id: otraComunidad } }).catch(() => {})
      await prisma.comunidad.delete({ where: { id: comunidad } }).catch(() => {})
    } catch {
      // limpieza best-effort
    }
  })

  it("sin sesión → 401", async () => {
    state.cookie = ""
    const res = await adelanto("aditem-ade-1")
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: "No autenticado." })
  })

  it("admin lee un adelanto de su comunidad → 200 con el registro", async () => {
    await conSesion(emailAdmin, async () => {
      const res = await adelanto("aditem-ade-1")
      expect(res.status).toBe(200)
      const json = (await res.json()) as { id: string; comunidadId: string; folio: string }
      expect(json.id).toBe("aditem-ade-1")
      expect(json.comunidadId).toBe(comunidad)
      expect(json.folio).toBe("ADE-aditem-ade-1")
    })
  })

  it("comité lee con pl:adelantos ver → 200", async () => {
    await conSesion(emailComite, async () => {
      expect((await adelanto("aditem-ade-1")).status).toBe(200)
    })
  })

  it("conserjería no tiene pl:adelantos → 403", async () => {
    await conSesion(emailConserje, async () => {
      const res = await adelanto("aditem-ade-1")
      expect(res.status).toBe(403)
      expect(await res.json()).toEqual({ error: "Permiso denegado." })
    })
  })

  it("residente tampoco (sin auto-servicio de adelantos) → 403", async () => {
    await conSesion(emailResidente, async () => {
      expect((await adelanto("aditem-ade-1")).status).toBe(403)
    })
  })

  it("adelanto inexistente → 404", async () => {
    await conSesion(emailAdmin, async () => {
      const res = await adelanto("aditem-no-existe")
      expect(res.status).toBe(404)
      expect(await res.json()).toEqual({ error: "Registro no encontrado." })
    })
  })

  it("adelanto de otra comunidad → 404 sin filtrar existencia", async () => {
    await conSesion(emailAdmin, async () => {
      const res = await adelanto("aditem-ade-b-1")
      expect(res.status).toBe(404)
      expect(await res.json()).toEqual({ error: "Registro no encontrado." })
    })
  })

  it("admin de la otra comunidad no ve el adelanto ajeno → 404", async () => {
    await conSesion(emailAdminOtra, async () => {
      expect((await adelanto("aditem-ade-1")).status).toBe(404)
    })
  })
})
