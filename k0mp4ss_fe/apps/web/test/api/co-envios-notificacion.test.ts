/** @vitest-environment node */
/**
 * F45 · el envío masivo materializa la notificación in-app que la spec manda.
 *
 * La spec de CO dice, en «Envío Masivo con Filtros Dinámicos de Destinatarios», que el
 * envío «materializa una notificación por destinatario vía `notify()` con canal
 * `email_simulado`». Medido el 2026-11-20: `POST /api/co/envios` sólo persistía
 * `EnvioCO` y encolaba el correo, así que **la bandeja del residente nunca recibía el
 * mensaje masivo** — el envío existía y no llegaba.
 *
 * Este test pinea las tres cosas que hacen que la notificación sirva:
 *
 * 1. Una fila por destinatario, con su `destinatarioPersonaId` y su unidad cuando la
 *    trae, y el canal del catálogo (no un literal suelto).
 * 2. El `destinatarioRol` sale de los roles reales de la persona, no de una constante:
 *    es lo que el filtro de bandeja usa cuando la notificación no tiene destinatario
 *    puntual.
 * 3. Reprocesar el mismo envío **no duplica** la notificación (id determinista).
 */

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import { prisma } from "@/lib/prisma"
import { CANAL_NOTIFICACION_EMAIL_SIMULADO } from "@/lib/schemas"

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
const COMUNIDAD = "f45-comunidad"
const EMAIL_ADMIN = "f45-admin@test.cl"
const ENVIO_ID = "f45-envio-1"
const PERSONA_A = "f45-persona-propietaria"
const PERSONA_B = "f45-persona-personal"

describe("F45 · envío masivo de CO — la notificación in-app", () => {
  let cookieAdmin = ""

  beforeAll(async () => {
    process.env.AUTH_SECRET = AUTH_SECRET
    const { cookieSesionAuthjs } = await import("../helpers/sesion-authjs")

    await prisma.comunidad.upsert({
      where: { id: COMUNIDAD },
      update: {},
      create: { id: COMUNIDAD, nombre: "F45", slug: COMUNIDAD },
    })
    await prisma.usuario.upsert({
      where: { email: EMAIL_ADMIN },
      update: {},
      create: { id: "f45-usuario-admin", email: EMAIL_ADMIN, activo: true },
    })
    await prisma.membresia.deleteMany({ where: { usuarioId: "f45-usuario-admin" } })
    await prisma.membresia.create({
      data: { usuarioId: "f45-usuario-admin", comunidadId: COMUNIDAD, rol: "administrador" },
    })
    cookieAdmin = await cookieSesionAuthjs({ sub: "f45-usuario-admin", email: EMAIL_ADMIN })

    for (const persona of [
      { id: PERSONA_A, roles: ["propietario"] },
      { id: PERSONA_B, roles: ["personal"] },
    ]) {
      await prisma.persona.upsert({
        where: { id: persona.id },
        update: { roles: persona.roles },
        create: {
          id: persona.id,
          comunidadId: COMUNIDAD,
          rut: persona.id,
          nombreCompleto: `${persona.id} F45`,
          nombres: persona.id,
          apellidos: "F45",
          email: `${persona.id}@test.cl`,
          telefonoMovil: "+56900000000",
          estadoCuenta: "activa",
          roles: persona.roles,
          condicionesEspecialesIds: [],
        },
      })
    }
    await prisma.notificacion.deleteMany({ where: { comunidadId: COMUNIDAD } })
    await prisma.envioCO.deleteMany({ where: { comunidadId: COMUNIDAD } })
  }, 30_000)

  afterAll(async () => {
    state.cookie = ""
    try {
      await prisma.notificacion.deleteMany({ where: { comunidadId: COMUNIDAD } })
      await prisma.envioCO.deleteMany({ where: { comunidadId: COMUNIDAD } })
      await prisma.persona.deleteMany({ where: { id: { in: [PERSONA_A, PERSONA_B] } } })
      await prisma.membresia.deleteMany({ where: { usuarioId: "f45-usuario-admin" } })
      await prisma.usuario.deleteMany({ where: { id: "f45-usuario-admin" } })
      await prisma.comunidad.delete({ where: { id: COMUNIDAD } }).catch(() => {})
    } catch {
      // limpieza best-effort
    }
  })

  async function enviar() {
    state.cookie = cookieAdmin
    const { POST } = await import("@/app/api/co/envios/route")
    const req = new Request("http://localhost/api/co/envios", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: ENVIO_ID,
        asunto: "Corte de agua el martes",
        cuerpo: "El martes se corta el agua de 9 a 13 por mantención.",
        fechaEnvio: "2026-11-24",
        lecturas: [],
        destinatarios: [
          { personaId: PERSONA_A, unidadId: "f45-unidad-1" },
          { personaId: PERSONA_B },
        ],
      }),
    })
    return POST(req)
  }

  it("deja una notificación por destinatario, con canal del catálogo", async () => {
    const respuesta = await enviar()
    expect(respuesta.status).toBe(201)

    const filas = await prisma.notificacion.findMany({
      where: { comunidadId: COMUNIDAD, moduloOrigen: "CO" },
      orderBy: { destinatarioPersonaId: "asc" },
    })
    expect(filas).toHaveLength(2)

    const porPersona = new Map(filas.map((f) => [f.destinatarioPersonaId, f]))
    expect(porPersona.get(PERSONA_A)?.canal).toBe(CANAL_NOTIFICACION_EMAIL_SIMULADO)
    expect(porPersona.get(PERSONA_A)?.asunto).toBe("Corte de agua el martes")
    expect(porPersona.get(PERSONA_A)?.unidadId).toBe("f45-unidad-1")
    expect(porPersona.get(PERSONA_A)?.leida).toBe(false)
    // El rol de la notificación sale de los roles reales de la persona: es lo que el
    // filtro de bandeja usa cuando no hay destinatario puntual.
    expect(porPersona.get(PERSONA_A)?.destinatarioRol).toBe("residente")
    expect(porPersona.get(PERSONA_B)?.destinatarioRol).toBe("personal")
    expect(porPersona.get(PERSONA_B)?.unidadId).toBeNull()
  })

  it("reprocesar el mismo envío no duplica la notificación", async () => {
    const respuesta = await enviar()
    expect([200, 201]).toContain(respuesta.status)
    const total = await prisma.notificacion.count({
      where: { comunidadId: COMUNIDAD, moduloOrigen: "CO" },
    })
    expect(total).toBe(2)
  })
})
