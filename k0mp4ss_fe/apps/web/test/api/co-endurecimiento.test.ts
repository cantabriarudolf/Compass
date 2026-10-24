/**
 * @vitest-environment node
 *
 * Endurecimiento de CO (change co-lectura-residente, cierre de la verificación
 * independiente). Dos reglas:
 *
 * E1 — La lectura SOLO la registra el destinatario.
 *   El alta de un envío no puede aceptar `lecturas` declaradas por el cliente:
 *   aceptarlo reabriría la falsedad que el PR #11 eliminó al quitar «Simular
 *   lectura» (el badge «X/Y leídos» volvería a mentir). El alta arranca sin
 *   lecturas y solo `POST /api/co/envios/[id]/leer` marca `leidoEn`.
 *
 * E2 — Toda denegación de CO es auditable.
 *   RP §Menor Privilegio exige que un acceso denegado emita
 *   `RP_PERMISSION_DENIED`. Los 403 propios de CO (ver envíos, emitir difusión,
 *   consultar el desglose nominativo) lo emiten server-side.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest"
import { prisma } from "@/lib/prisma"
import { cookieDeUsuario, cuerpoJson, invocarApi } from "../helpers/api-sesion"

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

const loggerMock = vi.hoisted(() => ({
  trace: vi.fn(),
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  fatal: vi.fn(),
}))
vi.mock("@/lib/logger", () => ({ logger: loggerMock }))

const COM = "co-endurecer-com"
const P_A = "co-endurecer-p-a"
const P_B = "co-endurecer-p-b"
const ENV = "co-endurecer-env"

const usuarios = {
  admin: "co-endurecer-admin@test.cl",
  residente: "co-endurecer-res@test.cl",
}

type EnvioApi = { id: string }

async function conSesion<T>(email: string, fn: () => Promise<T>): Promise<T> {
  state.cookie = await cookieDeUsuario(email)
  try {
    return await fn()
  } finally {
    state.cookie = ""
  }
}

const moduloColeccion = () => import("@/app/api/co/envios/route")
const moduloDesglose = () => import("@/app/api/co/envios/[id]/lecturas/route")

/** Cuerpo válido de `EnvioCOSchema`, con `lecturas` parametrizable. */
function envio(lecturas: string[] = []): Record<string, unknown> {
  return {
    id: ENV,
    asunto: "Corte de agua programado",
    cuerpo: "El martes de 09:00 a 13:00 se corta el agua por mantención.",
    destinatarios: [
      { personaId: P_A, unidadId: "co-endurecer-u-1" },
      { personaId: P_B, unidadId: "co-endurecer-u-2" },
    ],
    fechaEnvio: "2026-10-25",
    lecturas,
  }
}

async function filas() {
  return prisma.envioDestinatarioCO.findMany({
    where: { envioId: ENV },
    orderBy: { personaId: "asc" },
  })
}

function negacionesRegistradas() {
  return loggerMock.warn.mock.calls.filter(
    ([contexto]) =>
      typeof contexto === "object" &&
      contexto !== null &&
      (contexto as { event?: string }).event === "RP_PERMISSION_DENIED"
  )
}

beforeAll(async () => {
  await prisma.comunidad.upsert({
    where: { id: COM },
    update: {},
    create: { id: COM, nombre: "Comunidad Endurecer CO", slug: "co-endurecer" },
  })
  const semilla = [
    { email: usuarios.admin, rol: "administrador", personaId: null },
    { email: usuarios.residente, rol: "residente", personaId: P_A },
  ]
  for (const u of semilla) {
    const usuario = await prisma.usuario.upsert({
      where: { email: u.email },
      update: { personaId: u.personaId, activo: true },
      create: { email: u.email, personaId: u.personaId, activo: true },
    })
    await prisma.membresia.deleteMany({ where: { usuarioId: usuario.id } })
    await prisma.membresia.create({
      data: { usuarioId: usuario.id, comunidadId: COM, rol: u.rol },
    })
  }
}, 30_000)

beforeEach(async () => {
  loggerMock.warn.mockClear()
  await prisma.envioCO.deleteMany({ where: { id: ENV } })
})

afterAll(async () => {
  try {
    state.cookie = ""
    await prisma.envioCO.deleteMany({ where: { id: ENV } })
    await prisma.membresia.deleteMany({
      where: { usuario: { email: { in: Object.values(usuarios) } } },
    })
    await prisma.usuario.deleteMany({ where: { email: { in: Object.values(usuarios) } } })
    await prisma.comunidad.delete({ where: { id: COM } })
  } catch {
    // intencional: limpieza best-effort (la base es descartable)
  }
}, 30_000)

describe("E1 — la lectura solo la registra el destinatario", () => {
  it("el alta con `lecturas` declaradas responde 400 y no persiste nada", async () => {
    await conSesion(usuarios.admin, async () => {
      const res = await invocarApi(moduloColeccion(), "POST", "co/envios", {
        body: envio([P_B]),
      })
      expect(res.status).toBe(400)
      const cuerpo = await cuerpoJson<{ error: string }>(res)
      expect(cuerpo.error).toMatch(/lectura/i)
    })
    expect(await prisma.envioCO.findUnique({ where: { id: ENV } })).toBeNull()
    expect(await filas()).toHaveLength(0)
  })

  it("el alta sin lecturas arranca con todos los destinatarios sin leer", async () => {
    await conSesion(usuarios.admin, async () => {
      const res = await invocarApi(moduloColeccion(), "POST", "co/envios", {
        body: envio([]),
      })
      expect(res.status).toBe(201)
      const creado = await cuerpoJson<EnvioApi>(res)
      expect(creado.id).toBe(ENV)
    })
    const registradas = await filas()
    expect(registradas.map((f) => f.personaId)).toEqual([P_A, P_B])
    expect(registradas.every((f) => f.leidoEn === null)).toBe(true)
  })
})

describe("E2 — los 403 de CO emiten RP_PERMISSION_DENIED", () => {
  it("un residente que intenta emitir una difusión recibe 403 y queda auditado", async () => {
    await conSesion(usuarios.residente, async () => {
      const res = await invocarApi(moduloColeccion(), "POST", "co/envios", {
        body: envio([]),
      })
      expect(res.status).toBe(403)
    })
    const denegaciones = negacionesRegistradas()
    expect(denegaciones).toHaveLength(1)
    expect(denegaciones[0]?.[0]).toMatchObject({
      event: "RP_PERMISSION_DENIED",
      rol: "residente",
    })
  })

  it("un residente que consulta el desglose nominativo recibe 403 y queda auditado", async () => {
    await prisma.envioCO.create({
      data: {
        id: ENV,
        comunidadId: COM,
        asunto: "Asunto del desglose",
        cuerpo: "Cuerpo del desglose",
        fechaEnvio: "2026-10-25",
        destinatarios: [{ personaId: P_A, unidadId: "co-endurecer-u-1" }],
        lecturas: [],
      },
    })
    await conSesion(usuarios.residente, async () => {
      const res = await invocarApi(moduloDesglose(), "GET", "co/envios/[id]/lecturas", {
        params: { id: ENV },
      })
      expect(res.status).toBe(403)
    })
    const denegaciones = negacionesRegistradas()
    expect(denegaciones).toHaveLength(1)
    expect(denegaciones[0]?.[0]).toMatchObject({
      event: "RP_PERMISSION_DENIED",
      rol: "residente",
    })
  })
})
