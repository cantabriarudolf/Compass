/**
 * @vitest-environment node
 *
 * Cobranza FI multicanal con interruptores (SERIE-FASE2 §V5). BD real.
 *
 * La acción que `app/finanzas/gastos-comunes/page.tsx` ejecutaba contra el store
 * legacy (`enviarCobranzaFI(unidadId)`) ahora tiene ruta propia y tres piezas de
 * persistencia: interruptor global, preferencia por residente y registro de cada
 * envío. Este archivo fija el contrato de la ventana:
 *
 * - ambos canales encendidos → notificación del visor + email `pendiente`
 *   (nunca "enviado": la plataforma no tiene emisor SMTP);
 * - interruptor global apagado → no se encola y queda el motivo registrado;
 * - preferencia del residente que apaga email → solo visor;
 * - 401 sin sesión, 403 del comité al ejecutar, 404 cross-comunidad;
 * - idempotencia del reenvío (y el reenvío explícito como fila nueva).
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

const comunidad = "cob-fi-comunidad"
const otraComunidad = "cob-fi-otra-comunidad"
const emailAdmin = "cob-fi-admin@test.cl"
const emailComite = "cob-fi-comite@test.cl"
const emailResidente = "cob-fi-residente@test.cl"
const emailAdminOtra = "cob-fi-admin-otra@test.cl"

const unidadId = "cob-fi-u-1"
const unidadOtra = "cob-fi-u-otra"
const propietarioId = "cob-fi-p-1"
const cobroId = "cob-fi-c-1"
const cobroOtraComunidad = "cob-fi-c-otra"

const emailToId = (email: string): string => email.split("@")[0] ?? email

const cargaModulos = async () => ({
  cobranza: await import("@/app/api/cobros-fi/[id]/cobranza/route"),
  canales: await import("@/app/api/cobros-fi/canales/route"),
})

const postJson = async (
  modulo: unknown,
  url: string,
  body: unknown,
  params?: Record<string, string>
): Promise<Response> => {
  const { POST } = modulo as {
    POST: (req: Request, ctx?: { params: Promise<Record<string, string>> }) => Promise<Response>
  }
  return POST(
    new NextRequest(`http://localhost${url}`, {
      method: "POST",
      body: JSON.stringify(body ?? {}),
      headers: { "content-type": "application/json" },
    }),
    params ? { params: Promise.resolve(params) } : undefined
  )
}

const putJson = async (modulo: unknown, url: string, body: unknown): Promise<Response> => {
  const { PUT } = modulo as { PUT: (req: Request) => Promise<Response> }
  return PUT(
    new NextRequest(`http://localhost${url}`, {
      method: "PUT",
      body: JSON.stringify(body ?? {}),
      headers: { "content-type": "application/json" },
    })
  )
}

const getCanales = async (): Promise<Response> => {
  const { canales } = await cargaModulos()
  return canales.GET()
}

const ejecutarCobranza = async (
  id: string,
  body: unknown = {}
): Promise<Response> =>
  postJson(
    (await cargaModulos()).cobranza,
    `/api/cobros-fi/${id}/cobranza`,
    body,
    { id }
  )

const leerHistorial = async (id: string): Promise<Response> => {
  const { cobranza } = await cargaModulos()
  return cobranza.GET(new NextRequest(`http://localhost/api/cobros-fi/${id}/cobranza`), {
    params: Promise.resolve({ id }),
  })
}

async function sembrarUsuarios(): Promise<void> {
  const roles: Array<[string, string, string, string | null]> = [
    [emailAdmin, "administrador", comunidad, null],
    [emailComite, "comite", comunidad, null],
    [emailResidente, "residente", comunidad, propietarioId],
    [emailAdminOtra, "administrador", otraComunidad, null],
  ]
  const ids = roles.map(([email]) => emailToId(email))
  await prisma.membresia.deleteMany({ where: { usuarioId: { in: ids } } })
  for (const [email, rol, comunidadId, personaId] of roles) {
    await prisma.usuario.upsert({
      where: { email },
      update: { personaId },
      create: { id: emailToId(email), email, activo: true, personaId },
    })
    await prisma.membresia.create({
      data: { usuarioId: emailToId(email), comunidadId, rol },
    })
  }
}

async function sembrarUnidad(id: string, comunidadId: string, numero: string): Promise<void> {
  await prisma.unidad.create({
    data: {
      id,
      comunidadId,
      microSectorId: `${id}-micro`,
      numero,
      etiqueta: "Torre A",
      tipoUnidadId: "tipo-depto",
      metraje: 62,
      prorrateo: 0.11,
      rolSii: `${id}-sii`,
      estadoId: "estado-ocupada",
      servicios: [],
    },
  })
}

async function sembrarCobroVencido(
  id: string,
  comunidadId: string,
  unidad: string,
  montoBase = 120_000
): Promise<void> {
  await prisma.cobroFI.create({
    data: {
      id,
      comunidadId,
      unidadId: unidad,
      periodo: "2026-03",
      concepto: "gasto_comun",
      origenModulo: "manual",
      fondoId: "cob-fi-fondo",
      descripcion: "Gasto común marzo",
      montoBase,
      fechaCargo: "2026-03-01",
      fechaVencimiento: "2020-01-10",
      moras: [],
      pagos: [],
      diferencias: [],
    },
  })
}

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

const enviosDe = (unidad: string) =>
  prisma.envioCobranzaFI.findMany({
    where: { comunidadId: comunidad, unidadId: unidad },
    orderBy: { createdAt: "asc" },
  })

const notificacionesDe = () =>
  prisma.notificacion.findMany({
    where: { comunidadId: comunidad, moduloOrigen: "FI" },
    orderBy: { createdAt: "asc" },
  })

beforeAll(async () => {
  process.env.AUTH_SECRET = AUTH_SECRET
  await prisma.comunidad.upsert({
    where: { id: comunidad },
    update: {},
    create: { id: comunidad, nombre: "Comunidad Cobranza FI", slug: "cob-fi-comunidad" },
  })
  await prisma.comunidad.upsert({
    where: { id: otraComunidad },
    update: {},
    create: {
      id: otraComunidad,
      nombre: "Comunidad Cobranza Otra",
      slug: "cob-fi-otra",
    },
  })
  await sembrarUsuarios()
  // Los módulos de ruta importan el stack de Auth.js: se cargan acá (timeout
  // largo) para que el primer test no pague ese costo.
  await cargaModulos()
}, 60_000)

beforeEach(async () => {
  state.cookie = ""
  await prisma.envioCobranzaFI.deleteMany({
    where: { comunidadId: { in: [comunidad, otraComunidad] } },
  })
  await prisma.preferenciaCanalCobranzaFI.deleteMany({
    where: { comunidadId: { in: [comunidad, otraComunidad] } },
  })
  await prisma.configuracionCobranzaFI.deleteMany({
    where: { comunidadId: { in: [comunidad, otraComunidad] } },
  })
  await prisma.notificacion.deleteMany({
    where: { comunidadId: { in: [comunidad, otraComunidad] } },
  })
  await prisma.eventoAuditoria.deleteMany({
    where: { comunidadId: { in: [comunidad, otraComunidad] }, categoria: "FI" },
  })
  await prisma.cobroFI.deleteMany({
    where: { comunidadId: { in: [comunidad, otraComunidad] } },
  })
  await prisma.vinculoUnidad.deleteMany({
    where: { comunidadId: { in: [comunidad, otraComunidad] } },
  })
  await prisma.persona.deleteMany({
    where: { comunidadId: { in: [comunidad, otraComunidad] } },
  })
  await prisma.unidad.deleteMany({
    where: { comunidadId: { in: [comunidad, otraComunidad] } },
  })

  // Fixture base: una unidad con propietario vigente y un cobro vencido.
  await sembrarUnidad(unidadId, comunidad, "101")
  await prisma.persona.create({
    data: {
      id: propietarioId,
      comunidadId: comunidad,
      rut: "11111111-1",
      nombreCompleto: "Rosa Soto",
      nombres: "Rosa",
      apellidos: "Soto",
      email: "rosa.soto@test.cl",
      telefonoMovil: "+56911111111",
      estadoCuenta: "activa",
      condicionesEspecialesIds: [],
      roles: ["propietario"],
    },
  })
  await prisma.vinculoUnidad.create({
    data: {
      id: "cob-fi-v-1",
      comunidadId: comunidad,
      personaId: propietarioId,
      unidadId,
      rol: "propietario",
      fechaInicio: "2026-01-01",
      permiteVerFinanzas: true,
    },
  })
  await sembrarCobroVencido(cobroId, comunidad, unidadId)

  // Unidad + cobro de la OTRA comunidad para la guarda cross-comunidad.
  await sembrarUnidad(unidadOtra, otraComunidad, "999")
  await sembrarCobroVencido(cobroOtraComunidad, otraComunidad, unidadOtra)
}, 60_000)

afterAll(async () => {
  try {
    state.cookie = ""
    await prisma.envioCobranzaFI.deleteMany({
      where: { comunidadId: { in: [comunidad, otraComunidad] } },
    })
    await prisma.preferenciaCanalCobranzaFI.deleteMany({
      where: { comunidadId: { in: [comunidad, otraComunidad] } },
    })
    await prisma.configuracionCobranzaFI.deleteMany({
      where: { comunidadId: { in: [comunidad, otraComunidad] } },
    })
    await prisma.notificacion.deleteMany({
      where: { comunidadId: { in: [comunidad, otraComunidad] } },
    })
    await prisma.eventoAuditoria.deleteMany({
      where: { comunidadId: { in: [comunidad, otraComunidad] } },
    })
    await prisma.cobroFI.deleteMany({
      where: { comunidadId: { in: [comunidad, otraComunidad] } },
    })
    await prisma.vinculoUnidad.deleteMany({
      where: { comunidadId: { in: [comunidad, otraComunidad] } },
    })
    await prisma.persona.deleteMany({
      where: { comunidadId: { in: [comunidad, otraComunidad] } },
    })
    await prisma.unidad.deleteMany({
      where: { comunidadId: { in: [comunidad, otraComunidad] } },
    })
    const ids = [emailAdmin, emailComite, emailResidente, emailAdminOtra].map(emailToId)
    await prisma.membresia.deleteMany({ where: { usuarioId: { in: ids } } })
    for (const id of ids) {
      await prisma.usuario.delete({ where: { id } }).catch(() => {})
    }
    await prisma.comunidad.delete({ where: { id: otraComunidad } }).catch(() => {})
    await prisma.comunidad.delete({ where: { id: comunidad } }).catch(() => {})
  } catch {
    // limpieza best-effort
  }
})

// --- 1. Ambos canales habilitados -------------------------------------------

describe("POST /api/cobros-fi/[id]/cobranza — ambos canales encendidos", () => {
  it("crea la notificación del visor y deja el email en outbox `pendiente`", async () => {
    await conSesion(emailAdmin, async () => {
      const res = await ejecutarCobranza(cobroId)
      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.ok).toBe(true)
      expect(json.unidadRef).toBe("Torre A 101")
      expect(json.destinatarioPersonaId).toBe(propietarioId)
      expect(json.montoTotal).toBe(120_000)
      expect(json.canales.visor.estado).toBe("enviado")
      // Sin SMTP el email NUNCA se reporta como enviado.
      expect(json.canales.email.estado).toBe("pendiente")
      expect(json.canales.email.motivo).toMatch(/SMTP/i)
      expect(json.idempotente).toBe(false)
      expect(json.notificacionId).toBeTruthy()
    })

    // Notificación interna: canal visor real, dirigida al propietario.
    const notificaciones = await notificacionesDe()
    expect(notificaciones).toHaveLength(1)
    expect(notificaciones[0]?.destinatarioPersonaId).toBe(propietarioId)
    expect(notificaciones[0]?.destinatarioRol).toBe("propietario")
    expect(notificaciones[0]?.asunto).toMatch(/deuda vencida/i)
    expect(notificaciones[0]?.cuerpo).toMatch(/120\.000/)

    // Un envío registrado por canal, con fecha, destinatario y estado.
    const envios = await enviosDe(unidadId)
    expect(envios).toHaveLength(2)
    const visor = envios.find((e) => e.canal === "visor")
    const email = envios.find((e) => e.canal === "email")
    expect(visor?.estado).toBe("enviado")
    expect(email?.estado).toBe("pendiente")
    expect(email?.personaId).toBe(propietarioId)
    expect(email?.fecha).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(email?.motivo).toMatch(/sin emisor SMTP/i)
    expect(visor?.cobrosIncluidos).toEqual([cobroId])

    // Auditoría: el evento FI deja escrito el estado de cada canal.
    const evento = await prisma.eventoAuditoria.findFirst({
      where: { comunidadId: comunidad, tipoAccion: "FI_COBRANZA_SENT" },
    })
    expect(evento?.usuario).toBe(emailToId(emailAdmin))
    expect(evento?.descripcion).toMatch(/visor: enviado/)
    expect(evento?.descripcion).toMatch(/email: pendiente/)
  })
})

// --- 2. Interruptor global apagado ------------------------------------------

describe("interruptor global de la comunidad", () => {
  it("apaga el email: no se encola y queda registrado el motivo", async () => {
    await conSesion(emailAdmin, async () => {
      const put = await putJson((await cargaModulos()).canales, "/api/cobros-fi/canales", {
        global: { canalEmail: false },
      })
      expect(put.status).toBe(200)

      const res = await ejecutarCobranza(cobroId)
      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.canales.visor.estado).toBe("enviado")
      expect(json.canales.email.estado).toBe("omitido")
      expect(json.canales.email.motivo).toMatch(/Interruptor global/i)
    })

    // Nada se encoló para el canal apagado.
    const envios = await enviosDe(unidadId)
    expect(envios.filter((e) => e.canal === "email")).toHaveLength(0)
    expect(envios.filter((e) => e.canal === "visor")).toHaveLength(1)

    // El motivo queda en el evento de auditoría, no solo en la respuesta.
    const evento = await prisma.eventoAuditoria.findFirst({
      where: { comunidadId: comunidad, tipoAccion: "FI_COBRANZA_SENT" },
    })
    expect(evento?.descripcion).toMatch(/email: omitido \(Interruptor global/)
    const config = await prisma.configuracionCobranzaFI.findUnique({
      where: { comunidadId: comunidad },
    })
    expect(config?.canalEmail).toBe(false)
    expect(config?.actualizadoPor).toBe(emailToId(emailAdmin))
  })

  it("el interruptor global apagado también silencia el visor interno", async () => {
    await conSesion(emailAdmin, async () => {
      const put = await putJson((await cargaModulos()).canales, "/api/cobros-fi/canales", {
        global: { canalVisor: false },
      })
      expect(put.status).toBe(200)

      const res = await ejecutarCobranza(cobroId)
      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.canales.visor.estado).toBe("omitido")
      expect(json.canales.email.estado).toBe("pendiente")
      expect(json.notificacionId).toBeNull()
    })
    expect(await notificacionesDe()).toHaveLength(0)
  })
})

// --- 3. Preferencia del residente -------------------------------------------

describe("interruptor por residente", () => {
  it("si el residente apaga el email, la gestión sale solo por el visor", async () => {
    await conSesion(emailAdmin, async () => {
      const put = await putJson((await cargaModulos()).canales, "/api/cobros-fi/canales", {
        personaId: propietarioId,
        canalEmail: false,
      })
      expect(put.status).toBe(200)

      const res = await ejecutarCobranza(cobroId)
      const json = await res.json()
      expect(json.canales.visor.estado).toBe("enviado")
      expect(json.canales.email.estado).toBe("omitido")
      expect(json.canales.email.motivo).toMatch(/preferencia individual/i)
    })

    const envios = await enviosDe(unidadId)
    expect(envios.map((e) => e.canal)).toEqual(["visor"])
    const preferencia = await prisma.preferenciaCanalCobranzaFI.findUnique({
      where: { comunidadId_personaId: { comunidadId: comunidad, personaId: propietarioId } },
    })
    expect(preferencia?.canalEmail).toBe(false)
    expect(preferencia?.canalVisor).toBe(true)
  })

  it("el propio residente puede apagar/encender su canal; el comité no", async () => {
    await conSesion(emailResidente, async () => {
      const put = await putJson((await cargaModulos()).canales, "/api/cobros-fi/canales", {
        personaId: propietarioId,
        canalEmail: false,
      })
      expect(put.status).toBe(200)
      const lectura = await getCanales()
      const json = await lectura.json()
      expect(json.propio).toEqual({ personaId: propietarioId, visor: true, email: false })
      expect(json.personas).toEqual([])
    })

    await conSesion(emailComite, async () => {
      const put = await putJson((await cargaModulos()).canales, "/api/cobros-fi/canales", {
        global: { canalEmail: true },
      })
      expect(put.status).toBe(403)
    })
  })

  it("el residente no puede tocar la preferencia de otra persona", async () => {
    await prisma.persona.create({
      data: {
        id: "cob-fi-p-2",
        comunidadId: comunidad,
        rut: "22222222-2",
        nombreCompleto: "Otro Vecino",
        nombres: "Otro",
        apellidos: "Vecino",
        email: "otro@test.cl",
        telefonoMovil: "+56922222222",
        estadoCuenta: "activa",
        condicionesEspecialesIds: [],
        roles: ["residente"],
      },
    })
    await conSesion(emailResidente, async () => {
      const put = await putJson((await cargaModulos()).canales, "/api/cobros-fi/canales", {
        personaId: "cob-fi-p-2",
        canalEmail: false,
      })
      expect(put.status).toBe(403)
    })
  })
})

// --- 4. Guardas de sesión y permisos ---------------------------------------

describe("guardas de authz", () => {
  it("401 sin sesión", async () => {
    const res = await ejecutarCobranza(cobroId)
    expect(res.status).toBe(401)
  })

  it("403 del comité al ejecutar la cobranza (solo `ver`)", async () => {
    await conSesion(emailComite, async () => {
      const res = await ejecutarCobranza(cobroId)
      expect(res.status).toBe(403)
      // El comité sí puede auditar el historial y los interruptores.
      const lectura = await leerHistorial(cobroId)
      expect(lectura.status).toBe(200)
      const canales = await getCanales()
      expect(canales.status).toBe(200)
    })
    expect(await enviosDe(unidadId)).toHaveLength(0)
  })

  it("403 del residente al ejecutar su propia cobranza", async () => {
    await conSesion(emailResidente, async () => {
      const res = await ejecutarCobranza(cobroId)
      expect(res.status).toBe(403)
    })
  })

  it("404 cross-comunidad: el cobro de otra comunidad no se gestiona", async () => {
    await conSesion(emailAdminOtra, async () => {
      const res = await ejecutarCobranza(cobroId)
      expect(res.status).toBe(404)
    })
    expect(await enviosDe(unidadId)).toHaveLength(0)
  })
})

// --- 5. Idempotencia del reenvío -------------------------------------------

describe("idempotencia", () => {
  it("reenviar la misma gestión no duplica envíos ya registrados", async () => {
    await conSesion(emailAdmin, async () => {
      const primera = await ejecutarCobranza(cobroId)
      expect(primera.status).toBe(200)
      expect((await primera.json()).idempotente).toBe(false)

      const segunda = await ejecutarCobranza(cobroId)
      expect(segunda.status).toBe(200)
      const json = await segunda.json()
      expect(json.idempotente).toBe(true)
      expect(json.canales.visor.estado).toBe("duplicado")
      expect(json.canales.email.estado).toBe("duplicado")
      expect(json.canales.visor.motivo).toMatch(/Ya existe un envío/i)
      expect(json.notificacionId).toBeNull()
    })

    // Sigue habiendo exactamente dos envíos y una notificación.
    expect(await enviosDe(unidadId)).toHaveLength(2)
    expect(await notificacionesDe()).toHaveLength(1)
  })

  it("el reenvío explícito registra un envío nuevo marcado como reenvío", async () => {
    await conSesion(emailAdmin, async () => {
      await ejecutarCobranza(cobroId)
      const res = await ejecutarCobranza(cobroId, { reenviar: true })
      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.reenvio).toBe(true)
      expect(json.idempotente).toBe(false)
      expect(json.canales.visor.estado).toBe("enviado")
      expect(json.canales.email.estado).toBe("pendiente")
    })

    const envios = await enviosDe(unidadId)
    expect(envios).toHaveLength(4)
    expect(envios.filter((e) => e.reenvio)).toHaveLength(2)
    expect(await notificacionesDe()).toHaveLength(2)
    const evento = await prisma.eventoAuditoria.findFirst({
      where: { comunidadId: comunidad, tipoAccion: "FI_COBRANZA_RESENT" },
    })
    expect(evento?.descripcion).toMatch(/Reenvío explícito/i)
  })

  it("la gestión exige deuda vencida y responsable de cobro", async () => {
    await conSesion(emailAdmin, async () => {
      // Cobro no vencido: se mueve el vencimiento al futuro.
      await prisma.cobroFI.update({
        where: { id: cobroId },
        data: { fechaVencimiento: "2999-12-31" },
      })
      const sinDeuda = await ejecutarCobranza(cobroId)
      expect(sinDeuda.status).toBe(400)
      expect((await sinDeuda.json()).error).toMatch(/no registra deuda vencida/i)

      // Con deuda vencida pero sin propietario vigente.
      await prisma.cobroFI.update({
        where: { id: cobroId },
        data: { fechaVencimiento: "2020-01-10" },
      })
      await prisma.vinculoUnidad.update({
        where: { id: "cob-fi-v-1" },
        data: { fechaFin: "2026-02-01" },
      })
      const sinResponsable = await ejecutarCobranza(cobroId)
      expect(sinResponsable.status).toBe(400)
      expect((await sinResponsable.json()).error).toMatch(/responsable de cobro/i)
    })
  })
})
