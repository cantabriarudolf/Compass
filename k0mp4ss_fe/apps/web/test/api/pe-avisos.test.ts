/**
 * @vitest-environment node
 *
 * F5 + F13 (bloque «Privacidad y datos personales» del BACKLOG) — aviso al
 * residente de visitas y encomiendas, emitido server-side, y scoping de la
 * bandeja por `unidadId`.
 *
 * Paridad con el store legacy (lib/store.ts `saveBitacoraVisitaPE` /
 * `saveEncomiendaPE`): al recibir una visita o una encomienda, el residente
 * destinatario recibe UNA notificación dirigida a él (`destinatarioPersonaId`)
 * y a su unidad (`unidadId`, F5), SUJETA a los flags de CF
 * `notificarRegistroVisitas` / `notificarEncomiendas` con la semántica del
 * store (`!== false`: sin configuración, se notifica).
 *
 * Regla de lectura F5 (asesoría normativa 2026-10-25, minimización y
 * finalidad): el aviso va SÓLO al destinatario. En la bandeja el residente ve
 * lo suyo por persona, la difusión de rol sin unidad y la difusión de rol de
 * sus unidades vinculas vigentes; NUNCA la de otra unidad. administrador,
 * comité, conserjería y mantención conservan su visibilidad histórica.
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

const COMUNIDAD = "pe-avisos-comunidad"
const EMAIL_CONSERJERIA = "pe-av-conserjeria@test.cl"
const EMAIL_ADMIN = "pe-av-admin@test.cl"
const EMAIL_RESIDENTE_A = "pe-av-residente-a@test.cl"
const EMAIL_RESIDENTE_B = "pe-av-residente-b@test.cl"

/** Unidades ficticias: `Notificacion.unidadId` y `vinculos.unidadId` no tienen FK estricta. */
const UNIDAD_A = "pe-av-unidad-a"
const UNIDAD_B = "pe-av-unidad-b"

const PERSONA_A = "pe-av-persona-a"
const PERSONA_B = "pe-av-persona-b"

const FECHA = "2026-10-25"

const nuevoId = (prefijo: string): string =>
  `${prefijo}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`

const visitas = async () => import("@/app/api/pe/bitacora-visitas/route")
const encomiendas = async () => import("@/app/api/pe/encomiendas/route")
const notificacionesRuta = async () => import("@/app/api/notificaciones/route")

const POSTJson = (
  handler: (req: Request) => Promise<Response>,
  url: string,
  body: unknown
): Promise<Response> =>
  handler(
    new NextRequest(`http://localhost${url}`, {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    })
  )

const GETRuta = async (url: string): Promise<Response> =>
  (await notificacionesRuta()).GET(new NextRequest(`http://localhost${url}`))

const visitaBase = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: nuevoId("pe-av-vis"),
  fecha: FECHA,
  nombre: "Mario Pérez",
  dni: "12.345.678-9",
  jornadaId: "pe-av-jornada",
  origenAgenda: "sin_aviso",
  estado: "ingresada",
  horaIngreso: "14:30",
  unidadId: UNIDAD_A,
  destinoPersonaId: PERSONA_A,
  ...overrides,
})

const encomiendaBase = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: nuevoId("pe-av-enc"),
  courierId: "pe-av-courier",
  fechaRecepcion: FECHA,
  estado: "recibida",
  unidadId: UNIDAD_A,
  destinatarioPersonaId: PERSONA_A,
  ...overrides,
})

/** Cuenta las notificaciones de aviso PE de la comunidad de prueba. */
const avisosDe = (asunto: string, overrides: Record<string, unknown> = {}) =>
  prisma.notificacion.findMany({
    where: { comunidadId: COMUNIDAD, asunto, ...overrides },
    orderBy: { createdAt: "asc" },
  })

beforeAll(async () => {
  process.env.AUTH_SECRET = AUTH_SECRET

  await prisma.comunidad.upsert({
    where: { id: COMUNIDAD },
    update: {},
    create: { id: COMUNIDAD, nombre: "Comunidad PE Avisos", slug: COMUNIDAD },
  })

  const usuarios = [
    { id: "pe-av-user-conserjeria", email: EMAIL_CONSERJERIA, rol: "conserjeria" },
    { id: "pe-av-user-admin", email: EMAIL_ADMIN, rol: "administrador" },
    { id: "pe-av-user-res-a", email: EMAIL_RESIDENTE_A, rol: "residente" },
    { id: "pe-av-user-res-b", email: EMAIL_RESIDENTE_B, rol: "residente" },
  ] as const
  for (const u of usuarios) {
    await prisma.usuario.upsert({ where: { email: u.email }, update: {}, create: { id: u.id, email: u.email, activo: true } })
    await prisma.membresia.deleteMany({ where: { usuarioId: u.id } })
    await prisma.membresia.create({ data: { usuarioId: u.id, comunidadId: COMUNIDAD, rol: u.rol } })
  }
  // personaId del usuario de sesión (el servidor jamás lo toma del cliente).
  await prisma.usuario.update({ where: { email: EMAIL_RESIDENTE_A }, data: { personaId: PERSONA_A } })
  await prisma.usuario.update({ where: { email: EMAIL_RESIDENTE_B }, data: { personaId: PERSONA_B } })

  // Vínculos vigentes (fechaFin: null): residencial A ↔ unidad A, B ↔ unidad B.
  for (const [personaId, unidadId] of [
    [PERSONA_A, UNIDAD_A],
    [PERSONA_B, UNIDAD_B],
  ] as const) {
    await prisma.vinculoUnidad.create({
      data: {
        id: `pe-av-vinculo-${personaId}`,
        comunidadId: COMUNIDAD,
        personaId,
        unidadId,
        rol: "propietario",
        fechaInicio: FECHA,
        fechaFin: null,
        permiteVerFinanzas: false,
      },
    })
  }
}, 60_000)

beforeEach(async () => {
  await prisma.notificacion.deleteMany({ where: { comunidadId: COMUNIDAD } })
  await prisma.configuracionGlobal.deleteMany({ where: { comunidadId: COMUNIDAD } })
})

afterAll(async () => {
  try {
    state.cookie = ""
    await prisma.notificacion.deleteMany({ where: { comunidadId: COMUNIDAD } })
    await prisma.configuracionGlobal.deleteMany({ where: { comunidadId: COMUNIDAD } })
    await prisma.vinculoUnidad.deleteMany({ where: { id: { startsWith: "pe-av-vinculo-" } } })
    await prisma.membresia.deleteMany({ where: { comunidadId: COMUNIDAD } })
    await prisma.usuario.deleteMany({
      where: { id: { in: ["pe-av-user-conserjeria", "pe-av-user-admin", "pe-av-user-res-a", "pe-av-user-res-b"] } },
    })
    await prisma.comunidad.delete({ where: { id: COMUNIDAD } })
  } catch {
    // limpieza best-effort
  }
})

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

// --- F13: emisión del aviso ---------------------------------------------------

describe("POST /api/pe/bitacora-visitas — aviso al residente (F13)", () => {
  it("visita ingresada con destino → 1 notificación con unidadId y destinatarioPersonaId", async () => {
    await conSesion(EMAIL_CONSERJERIA, async () => {
      const res = await POSTJson(
        (await visitas()).POST,
        "/api/pe/bitacora-visitas",
        visitaBase()
      )
      expect(res.status).toBe(201)

      const avisos = await avisosDe("Visita recibida: Mario Pérez")
      expect(avisos).toHaveLength(1)
      const aviso = avisos[0]
      expect(aviso?.destinatarioRol).toBe("residente")
      expect(aviso?.destinatarioPersonaId).toBe(PERSONA_A)
      expect(aviso?.unidadId).toBe(UNIDAD_A)
      expect(aviso?.moduloOrigen).toBe("PE")
      expect(aviso?.fecha).toBe(FECHA)
      expect(aviso?.cuerpo).toBe("Mario Pérez fue ingresada por conserjería a las 14:30.")
    })
  })

  it("visita sin destinatario → 0 notificaciones", async () => {
    await conSesion(EMAIL_CONSERJERIA, async () => {
      const res = await POSTJson(
        (await visitas()).POST,
        "/api/pe/bitacora-visitas",
        visitaBase({ destinoPersonaId: undefined, unidadId: undefined, nombre: "Sin Destino" })
      )
      expect(res.status).toBe(201)
      expect(await avisosDe("Visita recibida: Sin Destino")).toHaveLength(0)
    })
  })

  it(`CF notificarRegistroVisitas: false → 0 notificaciones (sin configuración, se notifica)`, async () => {
    await prisma.configuracionGlobal.create({
      data: {
        id: "pe-av-cfg",
        comunidadId: COMUNIDAD,
        nombreComunidad: "Comunidad PE Avisos",
        rutComunidad: "11.111.111-1",
        direccionOficial: "Calle TEST 123",
        administradorResponsable: "Admin TEST",
        rutAdministrador: "12.345.678-5",
        telefonoAdmin: "+56900000001",
        modoCalculoGC: "prorrateo",
        diaCortePago: 5,
        limiteMesesAvisoCorte: 3,
        smtpHost: "localhost",
        smtpPort: 25,
        smtpUser: "test",
        smtpSecurity: "none",
        smtpFrom: "test@test.cl",
        smtpFromName: "TEST",
        notificarEmisionGC: false,
        notificarRegistroVisitas: false,
        notificarEncomiendas: false,
        notificarReservas: false,
        notificarAvisosSistema: false,
        notificarSugerenciasReclamos: false,
        diasMesComercial: 30,
        diasVacacionesMes: 1.25,
        jornadaSemanalEstandar: 45,
      } as never,
    })
    await conSesion(EMAIL_CONSERJERIA, async () => {
      const res = await POSTJson(
        (await visitas()).POST,
        "/api/pe/bitacora-visitas",
        visitaBase({ nombre: "CF Apagado" })
      )
      expect(res.status).toBe(201)
      expect(await avisosDe("Visita recibida: CF Apagado")).toHaveLength(0)
    })
  })
})

describe("POST /api/pe/encomiendas — aviso al residente (F13)", () => {
  it("encomienda recibida con destinatario → 1 notificación con los textos del store", async () => {
    await conSesion(EMAIL_CONSERJERIA, async () => {
      const res = await POSTJson(
        (await encomiendas()).POST,
        "/api/pe/encomiendas",
        encomiendaBase()
      )
      expect(res.status).toBe(201)

      const avisos = await avisosDe("Encomienda recibida en conserjería")
      expect(avisos).toHaveLength(1)
      const aviso = avisos[0]
      expect(aviso?.destinatarioRol).toBe("residente")
      expect(aviso?.destinatarioPersonaId).toBe(PERSONA_A)
      expect(aviso?.unidadId).toBe(UNIDAD_A)
      expect(aviso?.moduloOrigen).toBe("PE")
      expect(aviso?.fecha).toBe(FECHA)
      expect(aviso?.cuerpo).toBe(
        `Tiene una encomienda recibida el ${FECHA}. Retírela presentando su identificación.`
      )
    })
  })

  it("encomienda sin destinatario → 0 notificaciones", async () => {
    await conSesion(EMAIL_CONSERJERIA, async () => {
      const res = await POSTJson(
        (await encomiendas()).POST,
        "/api/pe/encomiendas",
        encomiendaBase({ destinatarioPersonaId: undefined, unidadId: undefined })
      )
      expect(res.status).toBe(201)
      expect(await avisosDe("Encomienda recibida en conserjería")).toHaveLength(0)
    })
  })

  it("CF notificarEncomiendas: false → 0 notificaciones", async () => {
    await prisma.configuracionGlobal.create({
      data: {
        id: "pe-av-cfg",
        comunidadId: COMUNIDAD,
        nombreComunidad: "Comunidad PE Avisos",
        rutComunidad: "11.111.111-1",
        direccionOficial: "Calle TEST 123",
        administradorResponsable: "Admin TEST",
        rutAdministrador: "12.345.678-5",
        telefonoAdmin: "+56900000001",
        modoCalculoGC: "prorrateo",
        diaCortePago: 5,
        limiteMesesAvisoCorte: 3,
        smtpHost: "localhost",
        smtpPort: 25,
        smtpUser: "test",
        smtpSecurity: "none",
        smtpFrom: "test@test.cl",
        smtpFromName: "TEST",
        notificarEmisionGC: false,
        notificarRegistroVisitas: false,
        notificarEncomiendas: false,
        notificarReservas: false,
        notificarAvisosSistema: false,
        notificarSugerenciasReclamos: false,
        diasMesComercial: 30,
        diasVacacionesMes: 1.25,
        jornadaSemanalEstandar: 45,
      } as never,
    })
    await conSesion(EMAIL_CONSERJERIA, async () => {
      const res = await POSTJson(
        (await encomiendas()).POST,
        "/api/pe/encomiendas",
        encomiendaBase()
      )
      expect(res.status).toBe(201)
      expect(await avisosDe("Encomienda recibida en conserjería")).toHaveLength(0)
    })
  })
})

// --- F5: scoping de la bandeja ------------------------------------------------

describe("GET /api/notificaciones — scoping por unidadId (F5)", () => {
  /** Triple de notificaciones de prueba: puntual, difusión de unidad A y difusión sin unidad. */
  const sembrar = async (): Promise<void> => {
    await prisma.notificacion.createMany({
      data: [
        {
          id: "pe-av-not-puntual",
          comunidadId: COMUNIDAD,
          destinatarioRol: "residente",
          destinatarioPersonaId: PERSONA_A,
          unidadId: UNIDAD_A,
          asunto: "Puntual A",
          cuerpo: "cuerpo puntual a",
          canal: "email_simulado",
          moduloOrigen: "PE",
          fecha: FECHA,
          leida: false,
        },
        {
          id: "pe-av-not-unidad",
          comunidadId: COMUNIDAD,
          destinatarioRol: "residente",
          unidadId: UNIDAD_A,
          asunto: "Difusión unidad A",
          cuerpo: "cuerpo unidad a",
          canal: "email_simulado",
          moduloOrigen: "PE",
          fecha: FECHA,
          leida: false,
        },
        {
          id: "pe-av-not-rol",
          comunidadId: COMUNIDAD,
          destinatarioRol: "residente",
          asunto: "Difusión rol sin unidad",
          cuerpo: "cuerpo rol",
          canal: "email_simulado",
          moduloOrigen: "PE",
          fecha: FECHA,
          leida: false,
        },
      ] as never,
    })
  }

  const idsDe = async (email: string): Promise<string[]> => {
    let ids: string[] = []
    await conSesion(email, async () => {
      const res = await GETRuta("/api/notificaciones")
      expect(res.status).toBe(200)
      const json = (await res.json()) as { data: { id: string }[] }
      ids = json.data.map((n) => n.id).sort()
    })
    return ids
  }

  it("el residente destinatario ve: lo puntual, la difusión de su unidad y la difusión de rol sin unidad", async () => {
    await sembrar()
    expect(await idsDe(EMAIL_RESIDENTE_A)).toEqual([
      "pe-av-not-puntual",
      "pe-av-not-rol",
      "pe-av-not-unidad",
    ])
  })

  it("el residente de OTRA unidad no ve la puntual ni la de la unidad ajena", async () => {
    await sembrar()
    expect(await idsDe(EMAIL_RESIDENTE_B)).toEqual(["pe-av-not-rol"])
  })

  it("el administrador la ve (visibilidad histórica sin cambios)", async () => {
    await sembrar()
    expect(await idsDe(EMAIL_ADMIN)).toEqual([
      "pe-av-not-puntual",
      "pe-av-not-rol",
      "pe-av-not-unidad",
    ])
  })

  it("la notificación emitida por F13 aparece con la cookie del residente destinatario", async () => {
    const visitaId = nuevoId("pe-av-vis")
    await conSesion(EMAIL_CONSERJERIA, async () => {
      const res = await POSTJson(
        (await visitas()).POST,
        "/api/pe/bitacora-visitas",
        visitaBase({ id: visitaId, nombre: "En Bandeja", horaIngreso: "09:15" })
      )
      expect(res.status).toBe(201)
    })
    const ids = await idsDe(EMAIL_RESIDENTE_A)
    expect(ids).toHaveLength(1)
    const aviso = await prisma.notificacion.findFirst({ where: { comunidadId: COMUNIDAD, asunto: "Visita recibida: En Bandeja" } })
    expect(aviso?.id).toBe(ids[0])
  })
})

// --- F13 en la transición pre-agendada → ingresada ---------------------------

describe("PUT /api/pe/bitacora-visitas/[id] — el aviso sale cuando la visita entra", () => {
  it("pre-agendada: no avisa al agendar y avisa UNA vez al confirmar el ingreso", async () => {
    const visitaId = nuevoId("pe-av-vis")

    // 1) Se agenda: la visita todavía no ocurrió, así que no hay aviso.
    await conSesion(EMAIL_CONSERJERIA, async () => {
      const res = await POSTJson(
        (await visitas()).POST,
        "/api/pe/bitacora-visitas",
        visitaBase({
          id: visitaId,
          nombre: "Agendada Aviso",
          estado: "agendada",
          origenAgenda: "pre_agendada",
          horaIngreso: undefined,
        })
      )
      expect(res.status).toBe(201)
    })
    expect(await avisosDe("Visita recibida: Agendada Aviso")).toHaveLength(0)

    // 2) El conserje confirma el ingreso: ahí sí el residente se entera.
    const { PUT } = await import("@/app/api/pe/bitacora-visitas/[id]/route")
    const respuestaPut = async (hora: string) =>
      conSesion(EMAIL_CONSERJERIA, async () => {
        const res = await PUT(
          new Request(`http://localhost/api/pe/bitacora-visitas/${visitaId}`, {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ estado: "ingresada", horaIngreso: hora }),
          }),
          { params: Promise.resolve({ id: visitaId }) }
        )
        expect(res.status).toBe(200)
      })

    await respuestaPut("14:30")
    const avisos = await avisosDe("Visita recibida: Agendada Aviso")
    expect(avisos).toHaveLength(1)
    expect(avisos[0]?.unidadId).toBe(UNIDAD_A)
    expect(avisos[0]?.destinatarioPersonaId).toBe(PERSONA_A)
    expect(avisos[0]?.cuerpo).toBe("Agendada Aviso fue ingresada por conserjería a las 14:30.")

    // 3) Un reintento idéntico del PUT no repite el aviso (dedup por estado previo).
    await respuestaPut("14:30")
    expect(await avisosDe("Visita recibida: Agendada Aviso")).toHaveLength(1)
  })
})
