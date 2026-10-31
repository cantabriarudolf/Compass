/**
 * @vitest-environment node
 *
 * `/api/pe/turnos` — inicios de turno PE del día para el panel de monitoreo.
 *
 * El recurso es `pe:cierre_turno` ver (no `am:ver`): quien opera el turno es
 * conserjería. Se fija acá el scoping por comunidad, el filtro por día y tipo
 * de evento, el orden descendente y el contrato paginado del resto de la API.
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

const comunidad = "petur-comunidad-a"
const otraComunidad = "petur-comunidad-b"
const emailAdmin = "petur-admin@test.cl"
const emailConserje = "petur-conserje@test.cl"
const emailComite = "petur-comite@test.cl"
const emailResidente = "petur-residente@test.cl"
const emailMantencion = "petur-mantencion@test.cl"

const idDe = (email: string): string => email.split("@")[0] ?? email

const hoy = (): string => new Date().toISOString().slice(0, 10)
const ayer = (): string =>
  new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

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

async function turnos(query = ""): Promise<Response> {
  const { GET } = await import("@/app/api/pe/turnos/route")
  return GET(new NextRequest(`http://localhost/api/pe/turnos${query}`))
}

const evento = (
  id: string,
  comunidadId: string,
  timestamp: string,
  tipoAccion = "PE_START_SHIFT"
): Promise<unknown> =>
  prisma.eventoAuditoria.create({
    data: {
      id,
      comunidadId,
      timestamp,
      usuario: "petur-usuario",
      categoria: "PE",
      tipoAccion,
      referenciaId: id,
      descripcion: `Evento ${id}`,
    },
  })

describe("GET /api/pe/turnos — inicios de turno de hoy scoped", () => {
  beforeAll(async () => {
    process.env.AUTH_SECRET = AUTH_SECRET
    for (const [id, slug] of [
      [comunidad, "petur-a"],
      [otraComunidad, "petur-b"],
    ] as const) {
      await prisma.comunidad.upsert({
        where: { id },
        update: {},
        create: { id, nombre: `Comunidad ${id}`, slug },
      })
    }
    const usuarios: Array<[string, string, string]> = [
      [emailAdmin, "administrador", comunidad],
      [emailConserje, "conserjeria", comunidad],
      [emailComite, "comite", comunidad],
      [emailResidente, "residente", comunidad],
      [emailMantencion, "mantencion", comunidad],
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
    await prisma.eventoAuditoria.deleteMany({
      where: { id: { startsWith: "petur-" } },
    })
    // Dos inicios de turno HOY (orden por timestamp desc), uno ayer, uno con
    // otra acción PE hoy y uno de otra comunidad HOY.
    await evento("petur-ev-1", comunidad, `${hoy()}T01:00:00.000Z`)
    await evento("petur-ev-2", comunidad, `${hoy()}T02:00:00.000Z`)
    await evento("petur-ev-ayer", comunidad, `${ayer()}T23:00:00.000Z`)
    await evento("petur-ev-otra-accion", comunidad, `${hoy()}T03:00:00.000Z`, "PE_CLOSE_SHIFT")
    await evento("petur-ev-b", otraComunidad, `${hoy()}T04:00:00.000Z`)
  }, 30_000)

  afterAll(async () => {
    try {
      state.cookie = ""
      await prisma.eventoAuditoria.deleteMany({ where: { id: { startsWith: "petur-" } } })
      for (const email of [emailAdmin, emailConserje, emailComite, emailResidente, emailMantencion]) {
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
    const res = await turnos()
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: "No autenticado." })
  })

  it("residente no tiene pe:cierre_turno → 403", async () => {
    await conSesion(emailResidente, async () => {
      const res = await turnos()
      expect(res.status).toBe(403)
      expect(await res.json()).toEqual({ error: "Permiso denegado." })
    })
  })

  it("comité lee la vista por el fallback de prefijo `pe` ver → 200", async () => {
    // El comité no tiene entrada propia para `pe:cierre_turno`; `puede()` cae a
    // la base `pe`, donde sí tiene `ver`. Se fija el comportamiento real.
    await conSesion(emailComite, async () => {
      const res = await turnos()
      expect(res.status).toBe(200)
      const json = (await res.json()) as { total: number }
      expect(json.total).toBe(2)
    })
  })

  it("mantención tampoco inicia turno → 403", async () => {
    await conSesion(emailMantencion, async () => {
      expect((await turnos()).status).toBe(403)
    })
  })

  it("conserjería ve solo los PE_START_SHIFT de HOY de su comunidad, en orden desc", async () => {
    await conSesion(emailConserje, async () => {
      const res = await turnos()
      expect(res.status).toBe(200)
      const json = (await res.json()) as {
        data: Array<{ id: string; timestamp: string }>
        page: number
        pageSize: number
        total: number
      }
      expect(json.total).toBe(2)
      expect(json.page).toBe(1)
      expect(json.pageSize).toBe(100)
      expect(json.data.map((e) => e.id)).toEqual(["petur-ev-2", "petur-ev-1"])
      // No se expone la columna interna `categoria` ni el evento de otra acción.
      expect(json.data.some((e) => e.id === "petur-ev-otra-accion")).toBe(false)
      expect(json.data.some((e) => e.id === "petur-ev-ayer")).toBe(false)
      expect(json.data.some((e) => e.id === "petur-ev-b")).toBe(false)
    })
  })

  it("admin también lee la vista → 200 con el mismo total", async () => {
    await conSesion(emailAdmin, async () => {
      const json = (await (await turnos()).json()) as { total: number }
      expect(json.total).toBe(2)
    })
  })

  it("pagina con page/pageSize y paginaSize se acota a 100", async () => {
    await conSesion(emailConserje, async () => {
      const paginado = (await (await turnos("?page=2&pageSize=1")).json()) as {
        data: Array<{ id: string }>
        page: number
        pageSize: number
        total: number
      }
      expect(paginado.page).toBe(2)
      expect(paginado.pageSize).toBe(1)
      expect(paginado.total).toBe(2)
      expect(paginado.data.map((e) => e.id)).toEqual(["petur-ev-1"])

      const tope = (await (await turnos("?pageSize=500")).json()) as { pageSize: number }
      expect(tope.pageSize).toBe(100)

      const cero = (await (await turnos("?page=0&pageSize=0")).json()) as {
        page: number
        pageSize: number
      }
      expect(cero.page).toBe(1)
      // pageSize inválido (0) cae al default de la lista del día.
      expect(cero.pageSize).toBe(100)
    })
  })
})
