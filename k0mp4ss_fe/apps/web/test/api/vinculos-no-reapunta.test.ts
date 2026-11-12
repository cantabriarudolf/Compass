/**
 * @vitest-environment node
 *
 * POST /api/vinculos sobre un vínculo EXISTENTE — un vínculo no se re-apunta.
 *
 * `existente` se busca sólo por el `id` que manda el cliente. Si además se
 * aceptara cambiar `personaId` o `unidadId`, el vínculo se mudaría de unidad o de
 * persona con la misma fila: se pierde para quién y para qué unidad se declaró, y
 * el cierre automático del tramo anterior nunca se dispara porque cree que el
 * tramo es el mismo. El camino correcto —y el que deja historial— es cerrar el
 * actual y crear uno nuevo.
 *
 * Se fija el contrato completo del camino de update: 400 con el mensaje literal y
 * la fila intacta para los dos campos de identidad, y 200 cuando lo que cambia es
 * un flag del vínculo (ahí no hay nada que re-apuntar).
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

const COMUNIDAD = "vurp-comunidad"
const EMAIL_ADMIN = "vurp-admin@test.cl"
const USER_ADMIN = "vurp-user-admin"

const PERSONA_1 = "vurp-pers-1"
const PERSONA_2 = "vurp-pers-2"
const UNIDAD_1 = "vurp-unidad-1"
const UNIDAD_2 = "vurp-unidad-2"
const VINCULO = "vurp-vinculo-base"

const MENSAJE_NO_REAPUNTA =
  "Un vínculo no se re-apunta: la persona y la unidad de un vínculo existente no se cambian. Cerrá el vínculo actual y creá uno nuevo, así queda el historial y el cierre automático del tramo anterior hace su trabajo."

/** Cuerpo completo del POST de la colección (el schema exige el vínculo entero). */
function cuerpoVinculo(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: VINCULO,
    personaId: PERSONA_1,
    unidadId: UNIDAD_1,
    rol: "propietario",
    fechaInicio: "2026-01-01",
    permiteVerFinanzas: true,
    ...overrides,
  }
}

async function POST(body: unknown): Promise<Response> {
  const { POST: handler } = await import("@/app/api/vinculos/route")
  return handler(
    new NextRequest("http://localhost/api/vinculos", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    })
  )
}

async function conSesion(fn: () => Promise<void>): Promise<void> {
  const usuario = await prisma.usuario.findUnique({ where: { email: EMAIL_ADMIN } })
  if (!usuario) throw new Error(`usuario no encontrado: ${EMAIL_ADMIN}`)
  const { cookieSesionAuthjs } = await import("../helpers/sesion-authjs")
  state.cookie = await cookieSesionAuthjs({ sub: usuario.id, email: usuario.email })
  try {
    await fn()
  } finally {
    state.cookie = ""
  }
}

describe("POST /api/vinculos — un vínculo existente no se re-apunta", () => {
  beforeAll(async () => {
    process.env.AUTH_SECRET = AUTH_SECRET
    await prisma.comunidad.upsert({
      where: { id: COMUNIDAD },
      update: {},
      create: { id: COMUNIDAD, nombre: "Comunidad no re-apunta", slug: "vurp-comunidad" },
    })
    await prisma.usuario.upsert({
      where: { email: EMAIL_ADMIN },
      update: {},
      create: { id: USER_ADMIN, email: EMAIL_ADMIN, activo: true },
    })
    await prisma.membresia.deleteMany({ where: { usuarioId: USER_ADMIN } })
    await prisma.membresia.create({
      data: { usuarioId: USER_ADMIN, comunidadId: COMUNIDAD, rol: "administrador" },
    })
  }, 60_000)

  beforeEach(async () => {
    state.cookie = ""
    await prisma.controlPropiedad.deleteMany({ where: { comunidadId: COMUNIDAD } })
    await prisma.vinculoUnidad.deleteMany({ where: { comunidadId: COMUNIDAD } })
    await prisma.unidad.deleteMany({ where: { comunidadId: COMUNIDAD } })
    await prisma.persona.deleteMany({ where: { comunidadId: COMUNIDAD } })

    for (const [id, rut, nombres] of [
      [PERSONA_1, "12000001-1", "Ana"],
      [PERSONA_2, "12000002-2", "Beto"],
    ] as const) {
      await prisma.persona.create({
        data: {
          id,
          comunidadId: COMUNIDAD,
          rut,
          nombreCompleto: `${nombres} Titular`,
          nombres,
          apellidos: "Titular",
          email: `${id}@test.cl`,
          telefonoMovil: "+56911111111",
          estadoCuenta: "activa",
          condicionesEspecialesIds: [],
          roles: [],
        },
      })
    }
    for (const [id, numero] of [
      [UNIDAD_1, "101"],
      [UNIDAD_2, "102"],
    ] as const) {
      await prisma.unidad.create({
        data: {
          id,
          comunidadId: COMUNIDAD,
          microSectorId: "vurp-micro",
          numero,
          etiqueta: `Depto ${numero}`,
          tipoUnidadId: "vurp-tipo",
          metraje: 55,
          prorrateo: 1,
          rolSii: `rol-${numero}`,
          estadoId: "habitada",
          servicios: {},
        },
      })
    }
    // El vínculo existente: la fila que un update NO puede mudar.
    await prisma.vinculoUnidad.create({
      data: {
        id: VINCULO,
        comunidadId: COMUNIDAD,
        personaId: PERSONA_1,
        unidadId: UNIDAD_1,
        rol: "propietario",
        fechaInicio: "2026-01-01",
        permiteVerFinanzas: true,
        puedeDeclararRegistro: false,
      },
    })
  })

  afterAll(async () => {
    try {
      state.cookie = ""
      await prisma.controlPropiedad.deleteMany({ where: { comunidadId: COMUNIDAD } })
      await prisma.vinculoUnidad.deleteMany({ where: { comunidadId: COMUNIDAD } })
      await prisma.unidad.deleteMany({ where: { comunidadId: COMUNIDAD } })
      await prisma.persona.deleteMany({ where: { comunidadId: COMUNIDAD } })
      await prisma.membresia.deleteMany({ where: { usuarioId: USER_ADMIN } })
      await prisma.usuario.delete({ where: { id: USER_ADMIN } }).catch(() => {})
      await prisma.comunidad.delete({ where: { id: COMUNIDAD } }).catch(() => {})
    } catch {
      // limpieza best-effort
    }
  })

  it("cambiar la unidad del vínculo → 400 y la fila queda intacta", async () => {
    await conSesion(async () => {
      const res = await POST(cuerpoVinculo({ unidadId: UNIDAD_2 }))
      expect(res.status).toBe(400)
      expect(await res.json()).toEqual({ error: MENSAJE_NO_REAPUNTA })
    })

    const enBd = await prisma.vinculoUnidad.findUnique({ where: { id: VINCULO } })
    expect(enBd?.unidadId).toBe(UNIDAD_1)
    expect(enBd?.personaId).toBe(PERSONA_1)
    expect(enBd?.permiteVerFinanzas).toBe(true)
    expect(enBd?.puedeDeclararRegistro).toBe(false)
    expect(enBd?.fechaFin).toBeNull()
  })

  it("cambiar la persona del vínculo → 400 y la fila queda intacta", async () => {
    await conSesion(async () => {
      const res = await POST(cuerpoVinculo({ personaId: PERSONA_2 }))
      expect(res.status).toBe(400)
      expect(await res.json()).toEqual({ error: MENSAJE_NO_REAPUNTA })
    })

    const enBd = await prisma.vinculoUnidad.findUnique({ where: { id: VINCULO } })
    expect(enBd?.personaId).toBe(PERSONA_1)
    expect(enBd?.unidadId).toBe(UNIDAD_1)
    expect(enBd?.permiteVerFinanzas).toBe(true)
    expect(enBd?.puedeDeclararRegistro).toBe(false)
  })

  it("editar sólo los flags del vínculo → 200 y se persisten", async () => {
    await conSesion(async () => {
      const res = await POST(
        cuerpoVinculo({
          permiteVerFinanzas: false,
          puedeDeclararRegistro: true,
        })
      )
      expect(res.status).toBe(200)
    })

    const enBd = await prisma.vinculoUnidad.findUnique({ where: { id: VINCULO } })
    expect(enBd?.permiteVerFinanzas).toBe(false)
    expect(enBd?.puedeDeclararRegistro).toBe(true)
    // La identidad del vínculo sigue siendo la misma: es un update, no un alta.
    expect(enBd?.personaId).toBe(PERSONA_1)
    expect(enBd?.unidadId).toBe(UNIDAD_1)
    expect(
      await prisma.vinculoUnidad.count({ where: { comunidadId: COMUNIDAD } })
    ).toBe(1)
  })

  it("el alta de un vínculo nuevo sigue igual → 201", async () => {
    await conSesion(async () => {
      const res = await POST(
        cuerpoVinculo({
          id: "vurp-vinculo-nuevo",
          personaId: PERSONA_2,
          unidadId: UNIDAD_2,
          rol: "arrendatario",
        })
      )
      expect(res.status).toBe(201)
    })

    const nuevo = await prisma.vinculoUnidad.findUnique({
      where: { id: "vurp-vinculo-nuevo" },
    })
    expect(nuevo).toMatchObject({
      personaId: PERSONA_2,
      unidadId: UNIDAD_2,
      rol: "arrendatario",
      comunidadId: COMUNIDAD,
    })
    // El vínculo existente no se toca al crear otro.
    expect(
      (await prisma.vinculoUnidad.findUnique({ where: { id: VINCULO } }))?.unidadId
    ).toBe(UNIDAD_1)
  })
})
