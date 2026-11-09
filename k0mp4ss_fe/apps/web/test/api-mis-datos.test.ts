/**
 * @vitest-environment node
 *
 * SERIE-PRODUCCION-FASE2 P6 — API de derechos ARCO (/api/mis-datos).
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
const EMAIL = `arco-${SUFIJO}@test.cl`
const EMAIL_OTRO = `arco-otro-${SUFIJO}@test.cl`
const EMAIL_SIN_PERSONA = `arco-nopersona-${SUFIJO}@test.cl`
const COMUNIDAD_ID = `comunidad-arco-${SUFIJO}`
const PERSONA_ID = `persona-arco-${SUFIJO}`
const PASSWORD = "Secret123"

// ── A1b · la puerta `mp:propios` ────────────────────────────────────────────
// Tres cuentas con ficha propia para separar «tiene la clave» de «no la tiene»:
// la matriz se la concede a los cinco roles (al administrador por comodín), así
// que el caso negativo se ejerce con un rol que la matriz no conoce: la ruta
// tiene que fallar cerrado, igual que el resto de la serie.
const EMAIL_GATE = `arco-gate-${SUFIJO}`
const PERSONA_GATE = `persona-gate-${SUFIJO}`
const EMAIL_HUERFANA = `arco-huerfano-${SUFIJO}`
const PERSONA_HUERFANA = `persona-huerfana-${SUFIJO}`
const EMAIL_ADMIN = `arco-admin-${SUFIJO}`
const PERSONA_ADMIN = `persona-admin-${SUFIJO}`
const EMAIL_TERCERO = `arco-tercero-${SUFIJO}`
const PERSONA_TERCERO = `persona-tercero-${SUFIJO}`

let usuarioId = ""

async function sesionCookie(uid: string, email: string): Promise<string> {
  const { cookieSesionAuthjs } = await import("./helpers/sesion-authjs")
  return cookieSesionAuthjs({ sub: uid, email })
}

async function call(
  metodo: { GET?: (req: NextRequest) => Promise<Response>; POST?: (req: NextRequest) => Promise<Response>; PATCH?: (req: NextRequest) => Promise<Response>; DELETE?: (req: NextRequest) => Promise<Response> },
  verbo: "GET" | "PATCH" | "DELETE",
  body?: unknown,
  cookie?: string
): Promise<Response> {
  state.cookie = cookie ?? ""
  const req = new NextRequest("http://localhost/api/mis-datos", {
    method: verbo,
    headers: {
      "Content-Type": "application/json",
      "x-forwarded-proto": "http",
      ...(state.cookie ? { cookie: state.cookie } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  const fn = metodo[verbo]
  if (!fn) throw new Error(`sin handler ${verbo}`)
  const res = await fn(req)
  state.cookie = ""
  return res
}

describe("P6 — /api/mis-datos (derechos ARCO)", () => {
  beforeAll(async () => {
    await prisma.comunidad.create({ data: { id: COMUNIDAD_ID, nombre: "Comunidad ARCO", slug: `arco-${SUFIJO}` } })
    await prisma.persona.create({
      data: {
        id: PERSONA_ID,
        comunidadId: COMUNIDAD_ID,
        rut: "12.345.678-9",
        nombreCompleto: "Persona Arco Test",
        nombres: "Persona",
        apellidos: "Arco Test",
        email: EMAIL,
        telefonoMovil: "+56911111111",
        estadoCuenta: "activa",
        condicionesEspecialesIds: [],
        roles: [],
      },
    })
    const hash = await bcrypt.hash(PASSWORD, 10)
    const u = await prisma.usuario.create({
      data: { email: EMAIL, passwordHash: hash, activo: true, personaId: PERSONA_ID },
    })
    usuarioId = u.id
    await prisma.membresia.create({ data: { usuarioId: u.id, comunidadId: COMUNIDAD_ID, rol: "residente" } })
    await prisma.usuario.create({ data: { email: EMAIL_OTRO, passwordHash: hash, activo: true } })
    await prisma.usuario.create({ data: { email: EMAIL_SIN_PERSONA, passwordHash: hash, activo: true } })
  }, 30_000)

  afterAll(async () => {
    try {
      await prisma.eventoAuditoria.deleteMany({ where: { referenciaId: usuarioId } })
      await prisma.membresia.deleteMany({ where: { comunidadId: COMUNIDAD_ID } })
      await prisma.usuario.deleteMany({ where: { email: { in: [EMAIL, EMAIL_OTRO, EMAIL_SIN_PERSONA, "nuevo-arco@test.cl"] } } })
      await prisma.persona.deleteMany({ where: { id: PERSONA_ID } })
      await prisma.comunidad.delete({ where: { id: COMUNIDAD_ID } }).catch(() => {})
    } catch {
      // intencional: vacío por diseño
    }
  })

  it("GET sin sesión → 401", async () => {
    const { GET } = await import("@/app/api/mis-datos/route")
    expect((await call({ GET }, "GET")).status).toBe(401)
  })

  it("GET retorna cuenta + persona + membresías + actividad", async () => {
    const { GET } = await import("@/app/api/mis-datos/route")
    const cookie = await sesionCookie(usuarioId, EMAIL)
    const res = await call({ GET }, "GET", undefined, cookie)
    expect(res.status).toBe(200)
    const j = (await res.json()) as {
      cuenta: { email: string; solicitudEliminacion: boolean }
      persona: { rut: string } | null
      membresias: Array<{ rol: string }>
      actividad: unknown[]
    }
    expect(j.cuenta.email).toBe(EMAIL)
    expect(j.cuenta.solicitudEliminacion).toBe(false)
    expect(j.persona?.rut).toBe("12.345.678-9")
    expect(j.membresias).toHaveLength(1)
    expect(j.membresias[0]!.rol).toBe("residente")
    expect(Array.isArray(j.actividad)).toBe(true)
  })

  it("PATCH actualiza email/teléfonos y audita", async () => {
    const { PATCH } = await import("@/app/api/mis-datos/route")
    const cookie = await sesionCookie(usuarioId, EMAIL)
    const res = await call(
      { PATCH },
      "PATCH",
      { email: "nuevo-arco@test.cl", telefonoMovil: "+56922222222", telefonoFijo: null },
      cookie
    )
    expect(res.status).toBe(200)
    const j = (await res.json()) as { ok: boolean }
    expect(j.ok).toBe(true)
    const persona = await prisma.persona.findUnique({ where: { id: PERSONA_ID } })
    expect(persona?.telefonoMovil).toBe("+56922222222")
    const cuenta = await prisma.usuario.findUnique({ where: { id: usuarioId } })
    expect(cuenta?.email).toBe("nuevo-arco@test.cl")
    const eventos = await prisma.eventoAuditoria.findMany({
      where: { referenciaId: usuarioId, tipoAccion: "ARCO_RECTIFICACION" },
    })
    expect(eventos.length).toBeGreaterThanOrEqual(1)
    // restaurar email para los demás tests
    await prisma.usuario.update({ where: { id: usuarioId }, data: { email: EMAIL } })
    await prisma.persona.update({ where: { id: PERSONA_ID }, data: { email: EMAIL } })
  })

  it("PATCH con email en uso → 409; inválido → 400; sin persona → 409", async () => {
    const { PATCH } = await import("@/app/api/mis-datos/route")
    const cookie = await sesionCookie(usuarioId, EMAIL)
    const ocupado = await call({ PATCH }, "PATCH", { email: EMAIL_OTRO }, cookie)
    expect(ocupado.status).toBe(409)
    const invalido = await call({ PATCH }, "PATCH", { email: "no-es-email" }, cookie)
    expect(invalido.status).toBe(400)
    const vacio = await call({ PATCH }, "PATCH", {}, cookie)
    expect(vacio.status).toBe(400)
    const otro = await prisma.usuario.findUnique({ where: { email: EMAIL_SIN_PERSONA } })
    const sinPersona = await call(
      { PATCH },
      "PATCH",
      { telefonoMovil: "+56933333333" },
      await sesionCookie(otro!.id, EMAIL_SIN_PERSONA)
    )
    expect(sinPersona.status).toBe(409)
  })

  it("DELETE registra solicitud (30 días) e idempotente", async () => {
    const { DELETE } = await import("@/app/api/mis-datos/route")
    const cookie = await sesionCookie(usuarioId, EMAIL)
    const res = await call({ DELETE }, "DELETE", undefined, cookie)
    expect(res.status).toBe(200)
    const j = (await res.json()) as { ok: boolean; mensaje: string }
    expect(j.ok).toBe(true)
    expect(j.mensaje).toMatch(/30 días/)
    const cuenta = await prisma.usuario.findUnique({ where: { id: usuarioId } })
    expect(cuenta?.solicitudEliminacion).toBe(true)
    expect(cuenta?.solicitudEliminacionAt).toBeTruthy()
    const eventos = await prisma.eventoAuditoria.findMany({
      where: { referenciaId: usuarioId, tipoAccion: "ARCO_ELIMINACION_SOLICITADA" },
    })
    expect(eventos.length).toBeGreaterThanOrEqual(1)
    const segunda = await call({ DELETE }, "DELETE", undefined, cookie)
    expect((await segunda.json() as { mensaje: string }).mensaje).toMatch(/en curso/)
  })

  it("DELETE sin sesión → 401", async () => {
    const { DELETE } = await import("@/app/api/mis-datos/route")
    expect((await call({ DELETE }, "DELETE")).status).toBe(401)
  })
})


/**
 * A1b — `mp:propios` es la clave que la matriz declara para «editar sus propios
 * datos» y hasta hoy la ruta no la pedía: `/api/mis-datos` escribía la ficha de
 * `Usuario.personaId` mirando sólo la sesión. El alcance por persona se queda
 * (nadie puede tocar la ficha de otro); lo que se agrega es la puerta.
 *
 * El veredicto se pide por caso, no por implementación: 403 cuando la matriz no
 * concede `editar` sobre `mp:propios`, 200 cuando sí, y la fila intacta siempre
 * que la respuesta sea una negativa.
 *
 * Suite independiente de la de arriba: comunidad y cuentas propias, porque el
 * `afterAll` del describe anterior borra las suyas antes de que estos casos corran.
 */
describe("A1b — `mp:propios` gobierna el autoservicio de la ficha", () => {
  const COMUNIDAD_GATE = `comunidad-gate-${SUFIJO}`
  const EMAIL_RESIDENTE = `arco-residente-${SUFIJO}`
  const PERSONA_RESIDENTE = `persona-residente-${SUFIJO}`
  const cuentas: Record<string, { usuarioId: string; email: string }> = {}

  const crear = async (email: string, personaId: string, nombre: string) => {
    await prisma.persona.create({
      data: {
        id: personaId,
        comunidadId: COMUNIDAD_GATE,
        rut: `77.${String(SUFIJO).slice(-7)}-${SUFIJO % 10}`,
        nombreCompleto: nombre,
        nombres: nombre.split(" ")[0]!,
        apellidos: "GATE_TEST",
        email,
        telefonoMovil: "+56944444444",
        estadoCuenta: "activa",
        condicionesEspecialesIds: [],
        roles: [],
      },
    })
    const u = await prisma.usuario.create({
      data: { email, passwordHash: await bcrypt.hash(PASSWORD, 10), activo: true, personaId },
    })
    cuentas[email] = { usuarioId: u.id, email }
    return u.id
  }

  beforeAll(async () => {
    await prisma.comunidad.create({
      data: { id: COMUNIDAD_GATE, nombre: "Comunidad Gate", slug: `gate-${SUFIJO}` },
    })
    // Residente: tiene `mp:propios` con ver+editar. Edita lo suyo.
    const residente = await crear(EMAIL_RESIDENTE, PERSONA_RESIDENTE, "Residente Gate")
    await prisma.membresia.create({ data: { usuarioId: residente, comunidadId: COMUNIDAD_GATE, rol: "residente" } })
    // Rol que la matriz no conoce: no tiene `mp:propios` ni ninguna otra clave.
    const gate = await crear(EMAIL_GATE, PERSONA_GATE, "Gate Rol")
    await prisma.membresia.create({ data: { usuarioId: gate, comunidadId: COMUNIDAD_GATE, rol: "invitado" } })
    // Ficha propia y ninguna membresía: antes escribía, ahora falla cerrado.
    await crear(EMAIL_HUERFANA, PERSONA_HUERFANA, "Huerfana Rol")
    // Administrador: entra por comodín, el gate no lo cambia.
    const admin = await crear(EMAIL_ADMIN, PERSONA_ADMIN, "Admin Rol")
    await prisma.membresia.create({ data: { usuarioId: admin, comunidadId: COMUNIDAD_GATE, rol: "administrador" } })
    // Tercero: su ficha no puede cambiar por el PATCH de nadie.
    await crear(EMAIL_TERCERO, PERSONA_TERCERO, "Tercero Rol")
  }, 30_000)

  afterAll(async () => {
    try {
      await prisma.eventoAuditoria.deleteMany({
        where: { referenciaId: { in: Object.values(cuentas).map((c) => c.usuarioId) } },
      })
      await prisma.usuario.deleteMany({ where: { email: { in: Object.keys(cuentas) } } })
      // Las personas caen con la comunidad (onDelete: Cascade).
      await prisma.comunidad.delete({ where: { id: COMUNIDAD_GATE } }).catch(() => {})
    } catch {
      // intencional: vacío por diseño
    }
  })

  it("residente (tiene la clave) edita su ficha → 200 y la fila cambia", async () => {
    const { PATCH } = await import("@/app/api/mis-datos/route")
    const cuenta = cuentas[EMAIL_RESIDENTE]!
    const res = await call(
      { PATCH },
      "PATCH",
      { telefonoMovil: "+56955555555" },
      await sesionCookie(cuenta.usuarioId, cuenta.email)
    )
    expect(res.status).toBe(200)
    const persona = await prisma.persona.findUnique({ where: { id: PERSONA_RESIDENTE } })
    expect(persona?.telefonoMovil).toBe("+56955555555")
  })

  it("rol sin la clave → 403 y la ficha queda intacta", async () => {
    const { PATCH } = await import("@/app/api/mis-datos/route")
    const cuenta = cuentas[EMAIL_GATE]!
    const res = await call(
      { PATCH },
      "PATCH",
      { telefonoMovil: "+56966666666" },
      await sesionCookie(cuenta.usuarioId, cuenta.email)
    )
    expect(res.status).toBe(403)
    const j = (await res.json()) as { error: string }
    expect(j.error).toMatch(/permiso/i)
    const persona = await prisma.persona.findUnique({ where: { id: PERSONA_GATE } })
    expect(persona?.telefonoMovil).toBe("+56944444444")
  })

  it("cuenta con ficha y sin membresía → 403 (falla cerrado) y la ficha queda intacta", async () => {
    const { PATCH } = await import("@/app/api/mis-datos/route")
    const cuenta = cuentas[EMAIL_HUERFANA]!
    const res = await call(
      { PATCH },
      "PATCH",
      { telefonoMovil: "+56977777777" },
      await sesionCookie(cuenta.usuarioId, cuenta.email)
    )
    expect(res.status).toBe(403)
    const persona = await prisma.persona.findUnique({ where: { id: PERSONA_HUERFANA } })
    expect(persona?.telefonoMovil).toBe("+56944444444")
  })

  it("administrador entra por comodín → 200", async () => {
    const { PATCH } = await import("@/app/api/mis-datos/route")
    const cuenta = cuentas[EMAIL_ADMIN]!
    const res = await call(
      { PATCH },
      "PATCH",
      { telefonoMovil: "+56988888888" },
      await sesionCookie(cuenta.usuarioId, cuenta.email)
    )
    expect(res.status).toBe(200)
    const persona = await prisma.persona.findUnique({ where: { id: PERSONA_ADMIN } })
    expect(persona?.telefonoMovil).toBe("+56988888888")
  })

  it("el alcance por personaId se queda: el PATCH no toca la ficha de otro", async () => {
    const { PATCH } = await import("@/app/api/mis-datos/route")
    const cuenta = cuentas[EMAIL_RESIDENTE]!
    const res = await call(
      { PATCH },
      "PATCH",
      { telefonoMovil: "+56999999999" },
      await sesionCookie(cuenta.usuarioId, cuenta.email)
    )
    expect(res.status).toBe(200)
    const tercero = await prisma.persona.findUnique({ where: { id: PERSONA_TERCERO } })
    expect(tercero?.telefonoMovil).toBe("+56944444444")
    expect(tercero?.email).toBe(EMAIL_TERCERO)
  })
})
