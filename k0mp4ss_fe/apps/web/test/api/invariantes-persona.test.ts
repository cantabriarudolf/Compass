/**
 * @vitest-environment node
 *
 * INV-01 — "email de Persona único por comunidad" (docs/INVARIANTES.md).
 *
 * La regla existía en una sola puerta (`POST/PUT /api/personas` → 409) y
 * `/api/mis-datos` la EVADÍA: el autoservicio escribía `Persona.email` sin
 * mirar si el correo ya era de otra persona de la comunidad. Centralizada en
 * `lib/invariantes/persona.ts`, las dos rutas tienen que responder igual.
 *
 * Dos pruebas por regla (pedido del owner):
 *   1. el caso que tiene que pasar  → email libre, 200 y persiste;
 *   2. el que tiene que FALLAR      → email de otra persona, 409 y nada cambia.
 *
 * Sesión simulada con el patrón repo (next/headers mockeado + JWE real).
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest"
import { NextRequest } from "next/server"
import bcrypt from "bcryptjs"
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

const SUFIJO = Date.now()
const COMUNIDAD_ID = `comunidad-inv01-${SUFIJO}`
const PERSONA_ID = `persona-inv01-${SUFIJO}`
const PERSONA_OTRA_ID = `persona-inv01-otra-${SUFIJO}`
const EMAIL_PROPIO = `inv01-propio-${SUFIJO}@test.cl`
const EMAIL_OTRA_PERSONA = `inv01-ajeno-${SUFIJO}@test.cl`
const EMAIL_LIBRE = `inv01-libre-${SUFIJO}@test.cl`
const PASSWORD = "Secret123"

let usuarioId = ""

async function sesionCookie(uid: string, email: string): Promise<string> {
  const { cookieSesionAuthjs } = await import("../helpers/sesion-authjs")
  return cookieSesionAuthjs({ sub: uid, email })
}

async function patch(body: unknown, cookie: string): Promise<Response> {
  state.cookie = cookie
  const { PATCH } = await import("@/app/api/mis-datos/route")
  const req = new NextRequest("http://localhost/api/mis-datos", {
    method: "PATCH",
    headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify(body),
  })
  const res = await PATCH(req)
  state.cookie = ""
  return res
}

describe("INV-01 — email de persona único por comunidad", () => {
  beforeAll(async () => {
    await prisma.comunidad.create({
      data: { id: COMUNIDAD_ID, nombre: "Comunidad INV01", slug: `inv01-${SUFIJO}` },
    })
    await prisma.persona.create({
      data: {
        id: PERSONA_ID,
        comunidadId: COMUNIDAD_ID,
        rut: "11.111.111-1",
        nombreCompleto: "Persona Propia",
        nombres: "Persona",
        apellidos: "Propia",
        email: EMAIL_PROPIO,
        telefonoMovil: "+56911111111",
        estadoCuenta: "activa",
        condicionesEspecialesIds: [],
        roles: [],
      },
    })
    // Otra persona de la MISMA comunidad ya usa EMAIL_OTRA_PERSONA.
    await prisma.persona.create({
      data: {
        id: PERSONA_OTRA_ID,
        comunidadId: COMUNIDAD_ID,
        rut: "22.222.222-2",
        nombreCompleto: "Persona Ajena",
        nombres: "Persona",
        apellidos: "Ajena",
        email: EMAIL_OTRA_PERSONA,
        telefonoMovil: "+56922222222",
        estadoCuenta: "activa",
        condicionesEspecialesIds: [],
        roles: [],
      },
    })
    const hash = await bcrypt.hash(PASSWORD, 10)
    const u = await prisma.usuario.create({
      data: { email: EMAIL_PROPIO, passwordHash: hash, activo: true, personaId: PERSONA_ID },
    })
    usuarioId = u.id
    await prisma.membresia.create({
      data: { usuarioId: u.id, comunidadId: COMUNIDAD_ID, rol: "residente" },
    })
  }, 30_000)

  afterAll(async () => {
    try {
      await prisma.eventoAuditoria.deleteMany({ where: { referenciaId: usuarioId } })
      await prisma.membresia.deleteMany({ where: { comunidadId: COMUNIDAD_ID } })
      await prisma.usuario.deleteMany({ where: { id: usuarioId } })
      await prisma.persona.deleteMany({
        where: { id: { in: [PERSONA_ID, PERSONA_OTRA_ID] } },
      })
      await prisma.comunidad.delete({ where: { id: COMUNIDAD_ID } }).catch(() => {})
    } catch {
      // intencional: limpieza best-effort
    }
  })

  it("acepta un email libre y lo persiste en la cuenta y en la ficha", async () => {
    const cookie = await sesionCookie(usuarioId, EMAIL_PROPIO)
    const res = await patch({ email: EMAIL_LIBRE }, cookie)
    expect(res.status).toBe(200)

    const persona = await prisma.persona.findUnique({ where: { id: PERSONA_ID } })
    const cuenta = await prisma.usuario.findUnique({ where: { id: usuarioId } })
    expect(persona?.email).toBe(EMAIL_LIBRE)
    expect(cuenta?.email).toBe(EMAIL_LIBRE)

    // restaurar para el test de rechazo
    await prisma.usuario.update({ where: { id: usuarioId }, data: { email: EMAIL_PROPIO } })
    await prisma.persona.update({ where: { id: PERSONA_ID }, data: { email: EMAIL_PROPIO } })
  })

  it("RECHAZA el email que ya usa otra persona de la comunidad y no escribe nada", async () => {
    const cookie = await sesionCookie(usuarioId, EMAIL_PROPIO)
    const res = await patch({ email: EMAIL_OTRA_PERSONA }, cookie)

    expect(res.status).toBe(409)
    const cuerpo = (await res.json()) as { error: string }
    expect(cuerpo.error).toBe(
      "Conflicto: el correo electrónico ya está registrado en esta comunidad."
    )

    // El rechazo no deja rastro de escritura: ni la cuenta ni la ficha cambian.
    const persona = await prisma.persona.findUnique({ where: { id: PERSONA_ID } })
    const cuenta = await prisma.usuario.findUnique({ where: { id: usuarioId } })
    expect(persona?.email).toBe(EMAIL_PROPIO)
    expect(cuenta?.email).toBe(EMAIL_PROPIO)

    // Ni la persona ajena se tocó.
    const ajena = await prisma.persona.findUnique({ where: { id: PERSONA_OTRA_ID } })
    expect(ajena?.email).toBe(EMAIL_OTRA_PERSONA)
  })
})
