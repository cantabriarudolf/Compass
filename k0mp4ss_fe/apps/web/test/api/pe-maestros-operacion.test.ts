/**
 * @vitest-environment node
 *
 * `GET /api/pe/maestros/[tipo]` — los maestros operativos que monta la conserjería.
 *
 * `jornadas`, `couriers` y `contratistas` viven en `/api/maestros/[tipo]`, detrás del recurso `mp`:
 * conserjería solo tiene `mp:propios` (ABAC del propio vínculo), así que esa ruta le responde 403
 * y los selects de la bitácora quedaban vacíos para el rol que registra la visita. Es el mismo
 * defecto H9 que ya se resolvió para el padrón de unidades y el de personas.
 *
 * Los códigos HTTP se afirman por rol, no por lectura de la matriz.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
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

const COMUNIDAD = "pe-mae-comunidad"
const COMUNIDAD_AJENA = "pe-mae-comunidad-ajena"

const CUENTAS = {
  conserjeria: { id: "pe-mae-user-conserjeria", email: "pe-mae-conserjeria@test.cl", rol: "conserjeria" },
  residente: { id: "pe-mae-user-residente", email: "pe-mae-residente@test.cl", rol: "residente" },
  administrador: { id: "pe-mae-user-admin", email: "pe-mae-admin@test.cl", rol: "administrador" },
} as const

interface RespuestaMaestros {
  data: { id: string; nombre: string }[]
  total?: number
}

const JORNADAS = [
  { id: "pe-mae-j-manana", comunidadId: COMUNIDAD, nombre: "Mañana" },
  { id: "pe-mae-j-noche", comunidadId: COMUNIDAD, nombre: "Noche" },
  { id: "pe-mae-j-ajena", comunidadId: COMUNIDAD_AJENA, nombre: "Jornada de otra comunidad" },
]
const COURIERS = [
  { id: "pe-mae-c-chilexpress", comunidadId: COMUNIDAD, nombre: "Chilexpress" },
  { id: "pe-mae-c-ajeno", comunidadId: COMUNIDAD_AJENA, nombre: "Courier ajeno" },
]
const CONTRATISTAS = [
  { id: "pe-mae-k-ascensores", comunidadId: COMUNIDAD, nombre: "Ascensores Andinos" },
  { id: "pe-mae-k-ajeno", comunidadId: COMUNIDAD_AJENA, nombre: "Contratista ajeno" },
]

describe("GET /api/pe/maestros/[tipo] — maestros de la operación", () => {
  let GET: (
    req: Request,
    ctx: { params: Promise<{ tipo: string }> }
  ) => Promise<Response>
  const cookies: Record<keyof typeof CUENTAS, string> = {
    conserjeria: "",
    residente: "",
    administrador: "",
  }

  beforeAll(async () => {
    process.env.AUTH_SECRET = AUTH_SECRET

    for (const c of [
      { id: COMUNIDAD, nombre: "Comunidad PE maestros", slug: COMUNIDAD },
      { id: COMUNIDAD_AJENA, nombre: "Comunidad PE maestros ajena", slug: COMUNIDAD_AJENA },
    ]) {
      await prisma.comunidad.upsert({ where: { id: c.id }, update: {}, create: c })
    }

    const { cookieSesionAuthjs } = await import("../helpers/sesion-authjs")
    for (const [clave, cuenta] of Object.entries(CUENTAS)) {
      await prisma.usuario.upsert({
        where: { email: cuenta.email },
        update: {},
        create: { id: cuenta.id, email: cuenta.email, activo: true },
      })
      await prisma.membresia.deleteMany({ where: { usuarioId: cuenta.id } })
      await prisma.membresia.create({
        data: { usuarioId: cuenta.id, comunidadId: COMUNIDAD, rol: cuenta.rol },
      })
      cookies[clave as keyof typeof CUENTAS] = await cookieSesionAuthjs({
        sub: cuenta.id,
        email: cuenta.email,
      })
    }

    await prisma.jornada.deleteMany({ where: { comunidadId: { in: [COMUNIDAD, COMUNIDAD_AJENA] } } })
    await prisma.courier.deleteMany({ where: { comunidadId: { in: [COMUNIDAD, COMUNIDAD_AJENA] } } })
    await prisma.contratista.deleteMany({ where: { comunidadId: { in: [COMUNIDAD, COMUNIDAD_AJENA] } } })
    await prisma.jornada.createMany({ data: JORNADAS })
    await prisma.courier.createMany({ data: COURIERS })
    await prisma.contratista.createMany({ data: CONTRATISTAS })

    const ruta = await import("@/app/api/pe/maestros/[tipo]/route")
    GET = ruta.GET
  }, 30_000)

  afterAll(async () => {
    state.cookie = ""
    try {
      const ids = Object.values(CUENTAS).map((c) => c.id)
      const comunidades = [COMUNIDAD, COMUNIDAD_AJENA]
      await prisma.jornada.deleteMany({ where: { comunidadId: { in: comunidades } } })
      await prisma.courier.deleteMany({ where: { comunidadId: { in: comunidades } } })
      await prisma.contratista.deleteMany({ where: { comunidadId: { in: comunidades } } })
      await prisma.membresia.deleteMany({ where: { usuarioId: { in: ids } } })
      await prisma.usuario.deleteMany({ where: { id: { in: ids } } })
      await prisma.comunidad.deleteMany({ where: { id: { in: comunidades } } })
    } catch {
      // intencional: limpieza best-effort
    }
  })

  async function pedir(
    rol: keyof typeof CUENTAS | "sin-sesion",
    tipo: string
  ): Promise<Response> {
    state.cookie = rol === "sin-sesion" ? "" : cookies[rol]
    return GET(new NextRequest(`http://localhost/api/pe/maestros/${tipo}`), {
      params: Promise.resolve({ tipo }),
    })
  }

  it("conserjería lee jornadas, couriers y contratistas de su comunidad", async () => {
    const jornadas = (await (await pedir("conserjeria", "jornadas")).json()) as RespuestaMaestros
    expect(jornadas.data.map((m) => m.id)).toEqual(["pe-mae-j-manana", "pe-mae-j-noche"])
    expect(jornadas.total).toBe(2)

    const couriers = (await (await pedir("conserjeria", "couriers")).json()) as RespuestaMaestros
    expect(couriers.data.map((m) => m.id)).toEqual(["pe-mae-c-chilexpress"])

    const contratistas = (await (await pedir("conserjeria", "contratistas")).json()) as RespuestaMaestros
    expect(contratistas.data.map((m) => m.id)).toEqual(["pe-mae-k-ascensores"])
  })

  it("proyecta solo id y nombre: nada más del maestro sale de la operación", async () => {
    const jornadas = (await (await pedir("conserjeria", "jornadas")).json()) as RespuestaMaestros

    expect(Object.keys(jornadas.data[0]!).sort()).toEqual(["id", "nombre"])
  })

  it("el administrador también entra (wildcard)", async () => {
    expect((await pedir("administrador", "jornadas")).status).toBe(200)
  })

  it("un rol sin la bitácora no lee los maestros", async () => {
    expect((await pedir("residente", "jornadas")).status).toBe(403)
  })

  it("sin sesión responde 401 antes de consultar la base", async () => {
    expect((await pedir("sin-sesion", "jornadas")).status).toBe(401)
  })

  it("un tipo fuera de la lista cerrada responde 404", async () => {
    expect((await pedir("conserjeria", "afps")).status).toBe(404)
    expect((await pedir("conserjeria", "bancos")).status).toBe(404)
  })
})
