/**
 * @vitest-environment node
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest"
import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import { CANAL_NOTIFICACION_EMAIL_SIMULADO } from "@/lib/schemas"
import { MOTIVO_SIN_CASILLA_COMUNIDAD } from "@/lib/entrega/notificar"

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

/**
 * El doble del transporte (mismo criterio que `test/entrega/notificar.test.ts`):
 * `planDeCanal` —la política canal→estado— corre de verdad y lo único que se
 * decide acá es qué responde el servidor de correo. Sin el doble, S2 no se
 * puede medir: el correo al rol interno sale con el emisor real.
 */
const transporte = vi.hoisted(() => ({ enviar: vi.fn() }))
vi.mock("@/lib/smtp", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/smtp")>()
  return { ...real, enviarCorreoComunidad: transporte.enviar }
})

const AUTH_SECRET = "test-secret-12345678"

function publicacionValida(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "pi-pub-1",
    unidadId: "pi-unidad-1",
    operacion: "venta",
    precio: 8500000,
    moneda: "CLP",
    imagenes: [],
    activa: true,
    fechaPublicacion: "2026-09-29",
    ...overrides,
  }
}

function leadValido(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "pi-lead-1",
    publicacionId: "pi-pub-1",
    nombreContacto: "Interesado TEST",
    contacto: "+56 9 0000 0001",
    fecha: "2026-09-29",
    atendido: false,
    ...overrides,
  }
}

describe("/api/publicaciones-portal + /api/leads-portal — PI con BD real", () => {
  const comunidadA = "pi-comunidad-a"
  const comunidadB = "pi-comunidad-b"
  const emailAdmin = "pi-admin@test.cl"
  const emailResidente = "pi-residente@test.cl"
  /** Casilla de recepción de la comunidad: `ConfiguracionGlobal.smtpRecepcion`. */
  const casillaComunidad = "pi-recepcion@test.cl"

  const cargaModulos = async () => ({
    pubs: await import("@/app/api/publicaciones-portal/route"),
    pubItem: await import("@/app/api/publicaciones-portal/[id]/route"),
    leads: await import("@/app/api/leads-portal/route"),
    leadItem: await import("@/app/api/leads-portal/[id]/route"),
  })

  beforeAll(async () => {
    process.env.AUTH_SECRET = AUTH_SECRET
    for (const [cid, nombre, slug] of [
      [comunidadA, "Comunidad A PI", "pi-comunidad-a"],
      [comunidadB, "Comunidad B PI", "pi-comunidad-b"],
    ] as const) {
      await prisma.comunidad.upsert({
        where: { id: cid },
        update: {},
        create: { id: cid, nombre, slug },
      })
    }
    // CF de la comunidad A con la forma que YA existe (S2 no agrega campos): la
    // casilla de recepción nace vacía y cada caso de S2 la decide.
    await prisma.configuracionGlobal.upsert({
      where: { comunidadId: comunidadA },
      update: { smtpRecepcion: null },
      create: {
        id: "pi-cfg-a",
        comunidadId: comunidadA,
        nombreComunidad: "Comunidad A PI",
        rutComunidad: "11.111.111-1",
        direccionOficial: "Calle PI 742",
        administradorResponsable: "Administración PI",
        rutAdministrador: "12.345.678-5",
        telefonoAdmin: "+56900000001",
        modoCalculoGC: "prorrateo",
        diaCortePago: 5,
        limiteMesesAvisoCorte: 3,
        smtpHost: "localhost",
        smtpPort: 25,
        smtpUser: "pi",
        smtpSecurity: "none",
        smtpFrom: "publicaciones@test.cl",
        smtpFromName: "Comunidad A PI",
        smtpRecepcion: null,
        notificarEmisionGC: false,
        notificarRegistroVisitas: false,
        notificarEncomiendas: false,
        notificarReservas: false,
        notificarAvisosSistema: false,
        notificarSugerenciasReclamos: false,
        diasMesComercial: 30,
        diasVacacionesMes: 1.25,
        jornadaSemanalEstandar: 45,
      },
    })
    await prisma.usuario.upsert({
      where: { email: emailAdmin },
      update: {},
      create: { id: "pi-usuario-admin", email: emailAdmin, activo: true },
    })
    await prisma.usuario.upsert({
      where: { email: emailResidente },
      update: {},
      create: { id: "pi-usuario-residente", email: emailResidente, activo: true },
    })
    await prisma.membresia.deleteMany({ where: { usuarioId: { in: ["pi-usuario-admin", "pi-usuario-residente"] } } })
    await prisma.membresia.create({
      data: { usuarioId: "pi-usuario-admin", comunidadId: comunidadA, rol: "administrador" },
    })
    await prisma.membresia.create({
      data: { usuarioId: "pi-usuario-residente", comunidadId: comunidadA, rol: "residente" },
    })
    await prisma.leadPortal.deleteMany({ where: { comunidadId: { in: [comunidadA, comunidadB] } } })
    await prisma.publicacionPortal.deleteMany({ where: { comunidadId: { in: [comunidadA, comunidadB] } } })
    await prisma.eventoAuditoria.deleteMany({
      where: { comunidadId: comunidadA, tipoAccion: "PI_LEAD_CONTACT" },
    })
  }, 30_000)

  afterAll(async () => {
    try {
      state.cookie = ""
      await prisma.leadPortal.deleteMany({ where: { comunidadId: { in: [comunidadA, comunidadB] } } })
      await prisma.publicacionPortal.deleteMany({ where: { comunidadId: { in: [comunidadA, comunidadB] } } })
      await prisma.notificacion.deleteMany({ where: { comunidadId: comunidadA, moduloOrigen: "PI" } })
      await prisma.entregaNotificacion.deleteMany({ where: { comunidadId: comunidadA } })
      await prisma.eventoAuditoria.deleteMany({
        where: { comunidadId: comunidadA, tipoAccion: "PI_LEAD_CONTACT" },
      })
      await prisma.membresia.deleteMany({ where: { usuarioId: { in: ["pi-usuario-admin", "pi-usuario-residente"] } } })
      await prisma.usuario.delete({ where: { id: "pi-usuario-admin" } }).catch(() => {})
      await prisma.usuario.delete({ where: { id: "pi-usuario-residente" } }).catch(() => {})
      await prisma.comunidad.delete({ where: { id: comunidadA } }).catch(() => {})
      await prisma.comunidad.delete({ where: { id: comunidadB } }).catch(() => {})
    } catch { /* best-effort */ }
  })

  beforeEach(() => {
    transporte.enviar.mockReset()
    transporte.enviar.mockResolvedValue({
      estado: "enviado",
      messageId: "<pi-mensaje-de-prueba@servidor>",
    })
  })

  async function conSesion(email: string, fn: () => Promise<void>): Promise<void> {
    const user = await prisma.usuario.findUnique({ where: { email } })
    if (!user) throw new Error(`usuario no encontrado: ${email}`)
    const { cookieSesionAuthjs } = await import("../helpers/sesion-authjs")
    state.cookie = await cookieSesionAuthjs({ sub: user.id, email: user.email })
    try { await fn() } finally { state.cookie = "" }
  }

  async function req(
    mod: { GET?: (r: NextRequest) => Promise<Response>; POST?: (r: NextRequest) => Promise<Response> },
    metodo: "GET" | "POST",
    url: string,
    body?: unknown
  ): Promise<Response> {
    if (metodo === "GET") return mod.GET!(new NextRequest(url))
    return mod.POST!(
      new NextRequest(url, {
        method: "POST",
        body: JSON.stringify(body),
        headers: { "content-type": "application/json" },
      })
    )
  }

  async function item(
    mod: { PUT?: (r: NextRequest, c: { params: Promise<{ id: string }> }) => Promise<Response>; DELETE?: (r: NextRequest, c: { params: Promise<{ id: string }> }) => Promise<Response>; GET?: (r: NextRequest, c: { params: Promise<{ id: string }> }) => Promise<Response> },
    metodo: "GET" | "PUT" | "DELETE",
    url: string,
    id: string,
    body?: unknown
  ): Promise<Response> {
    const ctx = { params: Promise.resolve({ id }) }
    if (metodo === "PUT") {
      return mod.PUT!(
        new NextRequest(url, {
          method: "PUT",
          body: JSON.stringify(body),
          headers: { "content-type": "application/json" },
        }),
        ctx
      )
    }
    if (metodo === "DELETE") return mod.DELETE!(new NextRequest(url, { method: "DELETE" }), ctx)
    return mod.GET!(new NextRequest(url), ctx)
  }

  it("401 sin sesión", async () => {
    const { pubs, leads } = await cargaModulos()
    state.cookie = ""
    expect((await req(pubs, "GET", "http://localhost/api/publicaciones-portal")).status).toBe(401)
    expect((await req(pubs, "POST", "http://localhost/api/publicaciones-portal", publicacionValida())).status).toBe(401)
    expect((await req(leads, "GET", "http://localhost/api/leads-portal")).status).toBe(401)
    expect((await req(leads, "POST", "http://localhost/api/leads-portal", leadValido())).status).toBe(401)
  })

  it("admin crea publicación → 201 y queda en BD", async () => {
    const { pubs } = await cargaModulos()
    await conSesion(emailAdmin, async () => {
      const res = await req(pubs, "POST", "http://localhost/api/publicaciones-portal", publicacionValida())
      expect(res.status).toBe(201)
      const enBd = await prisma.publicacionPortal.findUnique({ where: { id: "pi-pub-1" } })
      expect(enBd).not.toBeNull()
      expect(enBd?.comunidadId).toBe(comunidadA)
      expect(enBd?.precio).toBe(8500000)
    })
  })

  it("residente lee vitrina pero no publica", async () => {
    const { pubs, pubItem } = await cargaModulos()
    await conSesion(emailResidente, async () => {
      const get = await req(pubs, "GET", "http://localhost/api/publicaciones-portal")
      expect(get.status).toBe(200)
      const post = await req(pubs, "POST", "http://localhost/api/publicaciones-portal", publicacionValida({ id: "pi-pub-x" }))
      expect(post.status).toBe(403)
      const del = await item(pubItem, "DELETE", "http://localhost/api/publicaciones-portal/pi-pub-1", "pi-pub-1")
      expect(del.status).toBe(403)
    })
  })

  it("404 cross-comunidad (no filtra existencia)", async () => {
    const { pubs, pubItem } = await cargaModulos()
    await prisma.publicacionPortal.create({
      data: { ...publicacionValida({ id: "pi-pub-b" }), comunidadId: comunidadB } as never,
    })
    await conSesion(emailAdmin, async () => {
      const get = await item(pubItem, "GET", "http://localhost/api/publicaciones-portal/pi-pub-b", "pi-pub-b")
      expect(get.status).toBe(404)
      const post = await req(pubs, "POST", "http://localhost/api/publicaciones-portal", publicacionValida({ id: "pi-pub-b" }))
      expect(post.status).toBe(404)
    })
    await prisma.publicacionPortal.delete({ where: { id: "pi-pub-b" } }).catch(() => {})
  })

  it("residente registra interés → 201 + notificación + evento", async () => {
    const { leads } = await cargaModulos()
    await conSesion(emailResidente, async () => {
      const res = await req(leads, "POST", "http://localhost/api/leads-portal", leadValido())
      expect(res.status).toBe(201)
      expect(await prisma.leadPortal.findUnique({ where: { id: "pi-lead-1" } })).not.toBeNull()
      const notif = await prisma.notificacion.findMany({
        where: { comunidadId: comunidadA, moduloOrigen: "PI" },
      })
      expect(notif.length).toBeGreaterThanOrEqual(1)
      expect(notif[0]!.cuerpo).toContain("Interesado TEST")
      const evento = await prisma.eventoAuditoria.findMany({
        where: { comunidadId: comunidadA, tipoAccion: "PI_LEAD_CONTACT" },
      })
      expect(evento.length).toBeGreaterThanOrEqual(1)
    })
  })

  it("el aviso del lead pasa por el camino único: canal declarado y entrega al visor", async () => {
    // S2/S3: el aviso de PI es el MISMO que la ruta escribía a mano (campo por
    // campo), con el canal declarado en el llamador y su constancia de entrega.
    const { leads } = await cargaModulos()
    const hoy = new Date().toISOString().slice(0, 10)
    const cuerpo =
      "Interesado CAMINO mostró interés en pi-unidad-1 (venta). Contacto: +56 9 0000 0007"
    await conSesion(emailResidente, async () => {
      const res = await req(
        leads,
        "POST",
        "http://localhost/api/leads-portal",
        leadValido({
          id: "pi-lead-camino",
          nombreContacto: "Interesado CAMINO",
          contacto: "+56 9 0000 0007",
        })
      )
      expect(res.status).toBe(201)

      const aviso = await prisma.notificacion.findFirst({
        where: { comunidadId: comunidadA, moduloOrigen: "PI", cuerpo },
      })
      expect(aviso).toMatchObject({
        comunidadId: comunidadA,
        destinatarioRol: "propietario",
        destinatarioPersonaId: null,
        unidadId: null,
        asunto: "Nuevo interesado en tu propiedad",
        cuerpo,
        canal: CANAL_NOTIFICACION_EMAIL_SIMULADO,
        moduloOrigen: "PI",
        fecha: hoy,
        leida: false,
        fechaLectura: null,
      })

      const entregas = await prisma.entregaNotificacion.findMany({
        where: { notificacionId: aviso!.id },
      })
      // S2: el aviso del lead es de un rol interno sin dirección propia, así que
      // además del visor deja su intento de correo a la casilla de la comunidad.
      // Sin casilla configurada queda `pendiente` con su motivo — nunca
      // `enviado` en falso.
      expect(entregas).toHaveLength(2)
      expect(entregas.find((entrega) => entrega.canal === "visor")).toMatchObject({
        comunidadId: comunidadA,
        notificacionId: aviso!.id,
        canal: "visor",
        estado: "entregado",
        motivo: null,
        intentos: 1,
        enviadoEn: null,
      })
      expect(entregas.find((entrega) => entrega.canal === "email")).toMatchObject({
        comunidadId: comunidadA,
        notificacionId: aviso!.id,
        canal: "email",
        estado: "pendiente",
        motivo: MOTIVO_SIN_CASILLA_COMUNIDAD,
        intentos: 1,
        enviadoEn: null,
      })

      // El lead de este caso no puede alterar el flujo del test de borrado que
      // viene después: la publicación no se borra mientras le queden leads.
      await prisma.leadPortal.deleteMany({ where: { id: "pi-lead-camino" } })
    })
  })

  it("S2: el correo del lead va a la casilla de recepción de la comunidad", async () => {
    const { leads } = await cargaModulos()
    await prisma.configuracionGlobal.update({
      where: { comunidadId: comunidadA },
      data: { smtpRecepcion: casillaComunidad },
    })
    try {
      await conSesion(emailResidente, async () => {
        const res = await req(
          leads,
          "POST",
          "http://localhost/api/leads-portal",
          leadValido({
            id: "pi-lead-casilla",
            nombreContacto: "Interesado CASILLA",
            contacto: "+56 9 0000 0008",
          })
        )
        expect(res.status).toBe(201)

        const aviso = await prisma.notificacion.findFirst({
          where: {
            comunidadId: comunidadA,
            moduloOrigen: "PI",
            cuerpo: { contains: "Interesado CASILLA" },
          },
        })
        // El aviso in-app no cambia: sigue siendo del rol que lo recibe.
        expect(aviso).toMatchObject({
          destinatarioRol: "propietario",
          destinatarioPersonaId: null,
        })

        const entregas = await prisma.entregaNotificacion.findMany({
          where: { notificacionId: aviso!.id },
        })
        expect(entregas).toHaveLength(2)
        const email = entregas.find((entrega) => entrega.canal === "email")
        expect(email).toMatchObject({ estado: "enviado", intentos: 1 })
        expect(email?.enviadoEn).toBeInstanceOf(Date)

        // El transporte recibió la casilla configurada, no una persona.
        expect(transporte.enviar).toHaveBeenCalledTimes(1)
        expect(transporte.enviar).toHaveBeenCalledWith(
          comunidadA,
          expect.objectContaining({ to: casillaComunidad })
        )
      })
    } finally {
      await prisma.configuracionGlobal.update({
        where: { comunidadId: comunidadA },
        data: { smtpRecepcion: null },
      })
      await prisma.leadPortal.deleteMany({ where: { id: "pi-lead-casilla" } })
    }
  })

  it("S2: sin casilla de la comunidad el correo queda `pendiente` y el aviso existe", async () => {
    const { leads } = await cargaModulos()
    await prisma.configuracionGlobal.update({
      where: { comunidadId: comunidadA },
      data: { smtpRecepcion: null },
    })
    try {
      await conSesion(emailResidente, async () => {
        const res = await req(
          leads,
          "POST",
          "http://localhost/api/leads-portal",
          leadValido({
            id: "pi-lead-sin-casilla",
            nombreContacto: "Interesado SIN CASILLA",
            contacto: "+56 9 0000 0009",
          })
        )
        expect(res.status).toBe(201)

        const aviso = await prisma.notificacion.findFirst({
          where: {
            comunidadId: comunidadA,
            moduloOrigen: "PI",
            cuerpo: { contains: "Interesado SIN CASILLA" },
          },
        })
        expect(aviso).not.toBeNull()

        const entregas = await prisma.entregaNotificacion.findMany({
          where: { notificacionId: aviso!.id },
        })
        expect(entregas).toHaveLength(2)
        expect(entregas.find((entrega) => entrega.canal === "email")).toMatchObject(
          {
            estado: "pendiente",
            motivo: MOTIVO_SIN_CASILLA_COMUNIDAD,
            intentos: 1,
            enviadoEn: null,
          }
        )
        // Sin casilla no hay a dónde mandar: no se abre ninguna conexión.
        expect(transporte.enviar).not.toHaveBeenCalled()
      })
    } finally {
      await prisma.leadPortal.deleteMany({ where: { id: "pi-lead-sin-casilla" } })
    }
  })

  it("interés en publicación retirada o inexistente → 400", async () => {
    const { pubItem, leads } = await cargaModulos()
    await conSesion(emailAdmin, async () => {
      await item(pubItem, "PUT", "http://localhost/api/publicaciones-portal/pi-pub-1", "pi-pub-1", { activa: false })
      const r1 = await req(leads, "POST", "http://localhost/api/leads-portal", leadValido({ id: "pi-lead-2" }))
      expect(r1.status).toBe(400)
      const r2 = await req(leads, "POST", "http://localhost/api/leads-portal", leadValido({ id: "pi-lead-3", publicacionId: "pi-inexistente" }))
      expect(r2.status).toBe(400)
      // Reactivar para el resto del flujo
      await item(pubItem, "PUT", "http://localhost/api/publicaciones-portal/pi-pub-1", "pi-pub-1", { activa: true })
    })
    await prisma.leadPortal.deleteMany({ where: { id: { in: ["pi-lead-2", "pi-lead-3"] } } })
  })

  it("DELETE con leads → 409; sin leads → 200", async () => {
    const { pubItem, leadItem } = await cargaModulos()
    await conSesion(emailAdmin, async () => {
      const bloqueado = await item(pubItem, "DELETE", "http://localhost/api/publicaciones-portal/pi-pub-1", "pi-pub-1")
      expect(bloqueado.status).toBe(409)
      expect(await prisma.publicacionPortal.findUnique({ where: { id: "pi-pub-1" } })).not.toBeNull()
      const delLead = await item(leadItem, "DELETE", "http://localhost/api/leads-portal/pi-lead-1", "pi-lead-1")
      expect(delLead.status).toBe(200)
      const delPub = await item(pubItem, "DELETE", "http://localhost/api/publicaciones-portal/pi-pub-1", "pi-pub-1")
      expect(delPub.status).toBe(200)
      expect(await prisma.publicacionPortal.findUnique({ where: { id: "pi-pub-1" } })).toBeNull()
    })
  })
})
