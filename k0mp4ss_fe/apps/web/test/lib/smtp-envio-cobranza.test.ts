/** @vitest-environment node */
/**
 * Cobranza FI por email con el emisor SMTP real (F4). BD real + servidor SMTP
 * falso en memoria escuchando en 127.0.0.1: ninguna conexión sale a internet y
 * ninguna credencial real entra en el test.
 *
 * Lo que fija este archivo (el registro nunca miente):
 * - sin `SMTP_PASSWORD` el correo queda `pendiente` con el motivo que nombra la
 *   variable que falta, y no se abre conexión;
 * - si el servidor acepta, el registro pasa a `enviado` y el mensaje que llegó
 *   tiene el destinatario y el asunto de la gestión;
 * - si el servidor LEE el cuerpo y rechaza el mensaje, el registro queda
 *   `fallido`: `enviado` exige la aceptación del servidor, no solo la conexión;
 * - si el servidor rechaza la autenticación, el registro pasa a `fallido` con el
 *   motivo del servidor, sin la contraseña;
 * - un propietario sin correo no se inventa como enviado: queda `fallido`;
 * - el canal del visor no depende del SMTP (PRESERVE): sigue `enviado` y crea la
 *   notificación interna.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import { configuracionDefault } from "@/data/admin/configuracion"
import {
  iniciarServidorSMTPFalso,
  type ServidorSMTPFalso,
} from "./servidor-smtp-falso"

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
/** Contraseña inventada: no es una credencial, es texto de prueba. */
const CLAVE_FALSA = "clave-inventada-solo-para-tests"

const comunidad = "smtp-cob-comunidad"
const emailAdmin = "smtp-cob-admin@test.cl"
const unidadId = "smtp-cob-u-1"
const personaId = "smtp-cob-p-1"
const cobroId = "smtp-cob-c-1"

const emailToId = (email: string): string => email.split("@")[0] ?? email
const secretoPrevio = process.env.SMTP_PASSWORD

const servidores: ServidorSMTPFalso[] = []

function fijarSecreto(valor: string | undefined): void {
  if (valor === undefined) delete process.env.SMTP_PASSWORD
  else process.env.SMTP_PASSWORD = valor
}

async function levantarServidor(
  opciones: Parameters<typeof iniciarServidorSMTPFalso>[0] = {}
): Promise<ServidorSMTPFalso> {
  const servidor = await iniciarServidorSMTPFalso({ secreto: CLAVE_FALSA, ...opciones })
  servidores.push(servidor)
  return servidor
}

/** Usuario que el servidor SMTP falso acepta (CF debe usar el mismo). */
const USUARIO_SMTP = "emisor@ejemplo.test"

/** CF de la comunidad apuntando SIEMPRE al servidor falso de 127.0.0.1. */
async function configurarSMTP(puerto: number): Promise<void> {
  const data = {
    ...configuracionDefault,
    smtpHost: "127.0.0.1",
    smtpPort: puerto,
    // El usuario de CF TIENE que ser el que el servidor falso acepta: si no,
    // el caso "el servidor acepta" autenticaría con otra credencial y el
    // rechazo 535 lo haría pasar por un falso `enviado`/`fallido`.
    smtpUser: USUARIO_SMTP,
    smtpSecurity: "none",
    smtpFrom: "no-responder@ejemplo.test",
    smtpFromName: "Comunidad SMTP de prueba",
    smtpBcc: null,
    smtpRecepcion: null,
  }
  await prisma.configuracionGlobal.upsert({
    where: { comunidadId: comunidad },
    update: data,
    create: { id: `cfg-${comunidad}`, comunidadId: comunidad, ...data },
  })
}

const cargaCobranza = async () =>
  import("@/app/api/cobros-fi/[id]/cobranza/route")

const ejecutarCobranza = async (): Promise<Response> => {
  const { POST } = await cargaCobranza()
  return POST(
    new NextRequest(`http://localhost/api/cobros-fi/${cobroId}/cobranza`, {
      method: "POST",
      body: JSON.stringify({}),
      headers: { "content-type": "application/json" },
    }),
    { params: Promise.resolve({ id: cobroId }) }
  )
}

const envioEmail = () =>
  prisma.envioCobranzaFI.findFirst({
    where: { comunidadId: comunidad, unidadId: unidadId, canal: "email" },
  })

const envioVisor = () =>
  prisma.envioCobranzaFI.findFirst({
    where: { comunidadId: comunidad, unidadId: unidadId, canal: "visor" },
  })

async function conSesion(fn: () => Promise<void>): Promise<void> {
  const user = await prisma.usuario.findUnique({ where: { email: emailAdmin } })
  if (!user) throw new Error("usuario admin no sembrado")
  const { cookieSesionAuthjs } = await import("../helpers/sesion-authjs")
  state.cookie = await cookieSesionAuthjs({ sub: user.id, email: user.email })
  try {
    await fn()
  } finally {
    state.cookie = ""
  }
}

beforeAll(async () => {
  process.env.AUTH_SECRET = AUTH_SECRET
  await prisma.comunidad.upsert({
    where: { id: comunidad },
    update: {},
    create: { id: comunidad, nombre: "Comunidad SMTP Cobranza", slug: "smtp-cob" },
  })
  await prisma.usuario.upsert({
    where: { email: emailAdmin },
    update: {},
    create: { id: emailToId(emailAdmin), email: emailAdmin, activo: true },
  })
  await prisma.membresia.upsert({
    where: {
      usuarioId_comunidadId: { usuarioId: emailToId(emailAdmin), comunidadId: comunidad },
    },
    update: { rol: "administrador" },
    create: {
      usuarioId: emailToId(emailAdmin),
      comunidadId: comunidad,
      rol: "administrador",
    },
  })
  await cargaCobranza()
}, 60_000)

beforeEach(async () => {
  state.cookie = ""
  fijarSecreto(CLAVE_FALSA)
  await prisma.envioCobranzaFI.deleteMany({ where: { comunidadId: comunidad } })
  await prisma.notificacion.deleteMany({ where: { comunidadId: comunidad } })
  await prisma.eventoAuditoria.deleteMany({ where: { comunidadId: comunidad } })
  await prisma.cobroFI.deleteMany({ where: { comunidadId: comunidad } })
  await prisma.vinculoUnidad.deleteMany({ where: { comunidadId: comunidad } })
  await prisma.persona.deleteMany({ where: { comunidadId: comunidad } })
  await prisma.unidad.deleteMany({ where: { comunidadId: comunidad } })
  await prisma.configuracionGlobal.deleteMany({ where: { comunidadId: comunidad } })

  await prisma.unidad.create({
    data: {
      id: unidadId,
      comunidadId: comunidad,
      microSectorId: `${unidadId}-micro`,
      numero: "101",
      etiqueta: "Torre A",
      tipoUnidadId: "tipo-depto",
      metraje: 62,
      prorrateo: 0.11,
      rolSii: `${unidadId}-sii`,
      estadoId: "estado-ocupada",
      servicios: [],
    },
  })
  await prisma.persona.create({
    data: {
      id: personaId,
      comunidadId: comunidad,
      rut: "11111111-1",
      nombreCompleto: "Rosa Soto",
      nombres: "Rosa",
      apellidos: "Soto",
      email: "rosa.soto@ejemplo.test",
      telefonoMovil: "+56911111111",
      estadoCuenta: "activa",
      condicionesEspecialesIds: [],
      roles: ["propietario"],
    },
  })
  await prisma.vinculoUnidad.create({
    data: {
      id: "smtp-cob-v-1",
      comunidadId: comunidad,
      personaId,
      unidadId,
      rol: "propietario",
      fechaInicio: "2026-01-01",
      permiteVerFinanzas: true,
    },
  })
  await prisma.cobroFI.create({
    data: {
      id: cobroId,
      comunidadId: comunidad,
      unidadId,
      periodo: "2026-03",
      concepto: "gasto_comun",
      origenModulo: "manual",
      fondoId: "smtp-cob-fondo",
      descripcion: "Gasto común marzo",
      montoBase: 120_000,
      fechaCargo: "2026-03-01",
      fechaVencimiento: "2020-01-10",
      moras: [],
      pagos: [],
      diferencias: [],
    },
  })
}, 60_000)

afterEach(async () => {
  while (servidores.length > 0) await servidores.pop()?.cerrar()
})

afterAll(async () => {
  fijarSecreto(secretoPrevio)
  try {
    await prisma.envioCobranzaFI.deleteMany({ where: { comunidadId: comunidad } })
    await prisma.notificacion.deleteMany({ where: { comunidadId: comunidad } })
    await prisma.eventoAuditoria.deleteMany({ where: { comunidadId: comunidad } })
    await prisma.cobroFI.deleteMany({ where: { comunidadId: comunidad } })
    await prisma.vinculoUnidad.deleteMany({ where: { comunidadId: comunidad } })
    await prisma.persona.deleteMany({ where: { comunidadId: comunidad } })
    await prisma.unidad.deleteMany({ where: { comunidadId: comunidad } })
    await prisma.configuracionGlobal.deleteMany({ where: { comunidadId: comunidad } })
    await prisma.membresia.deleteMany({
      where: { comunidadId: comunidad, usuarioId: emailToId(emailAdmin) },
    })
    await prisma.usuario.delete({ where: { id: emailToId(emailAdmin) } }).catch(() => {})
    await prisma.comunidad.delete({ where: { id: comunidad } }).catch(() => {})
  } catch {
    // limpieza best-effort
  }
})

describe("cobranza por email con el emisor SMTP real", () => {
  it("sin SMTP_PASSWORD el email queda pendiente y no se abre ninguna conexión", async () => {
    const servidor = await levantarServidor({ modo: "aceptar" })
    await configurarSMTP(servidor.port)
    fijarSecreto(undefined)

    await conSesion(async () => {
      const res = await ejecutarCobranza()
      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.canales.email.estado).toBe("pendiente")
      expect(json.canales.email.motivo).toMatch(/sin emisor SMTP configurado/i)
      expect(json.canales.email.motivo).toMatch(/SMTP_PASSWORD/)
      // PRESERVE: el visor no depende del SMTP.
      expect(json.canales.visor.estado).toBe("enviado")
    })

    const email = await envioEmail()
    expect(email?.estado).toBe("pendiente")
    expect(email?.motivo).toMatch(/no se reporta como enviado/i)
    expect(email?.personaId).toBe(personaId)
    // `pendiente` es configuración, no intento: el servidor no vio nada.
    expect(servidor.mensajes).toHaveLength(0)
    expect(servidor.autenticaciones).toHaveLength(0)

    const visor = await envioVisor()
    expect(visor?.estado).toBe("enviado")
    expect(await prisma.notificacion.count({ where: { comunidadId: comunidad } })).toBe(1)
  })

  it("si el servidor acepta, el registro dice enviado y el mensaje lleva destinatario y asunto", async () => {
    const servidor = await levantarServidor({ modo: "aceptar" })
    await configurarSMTP(servidor.port)

    await conSesion(async () => {
      const res = await ejecutarCobranza()
      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.canales.email.estado).toBe("enviado")
      expect(json.canales.visor.estado).toBe("enviado")
    })

    const email = await envioEmail()
    expect(email?.estado).toBe("enviado")
    expect(email?.motivo).toMatch(/aceptado por el servidor SMTP/i)

    expect(servidor.mensajes).toHaveLength(1)
    // La autenticación ocurrió de verdad, con el usuario de CF.
    expect(servidor.autenticaciones).toEqual([
      { usuario: USUARIO_SMTP, secreto: CLAVE_FALSA },
    ])
    const recibido = servidor.mensajes[0]
    expect(recibido?.to).toEqual(["rosa.soto@ejemplo.test"])
    expect(recibido?.crudo).toContain("To: <rosa.soto@ejemplo.test>")
    expect(recibido?.crudo).toContain("Subject: Recordatorio de deuda vencida (Torre A 101)")
    expect(recibido?.crudo).toContain("$120.000")
    // El mensaje que viaja tampoco lleva la contraseña.
    expect(recibido?.crudo).not.toContain(CLAVE_FALSA)
  })

  it("si el servidor lee el cuerpo y rechaza el mensaje, el registro no se inventa enviado", async () => {
    const servidor = await levantarServidor({ modo: "rechazar_mensaje" })
    await configurarSMTP(servidor.port)

    await conSesion(async () => {
      const res = await ejecutarCobranza()
      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.canales.email.estado).toBe("fallido")
      expect(json.canales.email.motivo).toMatch(/554/)
    })

    const email = await envioEmail()
    // El transporte llegó hasta DATA y el servidor leyó el cuerpo, pero lo
    // rechazó: `enviado` exige el 250 final. Si alguien devolviera `enviado`
    // sin esperar esa respuesta, este caso lo delata.
    expect(email?.estado).toBe("fallido")
    expect(String(email?.motivo)).toMatch(/554/)
    expect(servidor.mensajes).toHaveLength(0)
  })

  it("si el servidor rechaza la autenticación el registro queda fallido, sin la contraseña", async () => {
    const servidor = await levantarServidor({
      modo: "rechazar_auth",
      ecoDelSecretoEnElRechazo: true,
    })
    await configurarSMTP(servidor.port)

    await conSesion(async () => {
      const res = await ejecutarCobranza()
      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.canales.email.estado).toBe("fallido")
      expect(json.canales.email.motivo).toMatch(/535/)
      expect(String(json.canales.email.motivo)).not.toContain(CLAVE_FALSA)
      // La respuesta completa tampoco filtra el secreto.
      expect(JSON.stringify(json)).not.toContain(CLAVE_FALSA)
    })

    const email = await envioEmail()
    expect(email?.estado).toBe("fallido")
    expect(email?.motivo).toMatch(/falló el envío por SMTP/i)
    expect(email?.motivo).toContain("[redactado]")
    expect(String(email?.motivo)).not.toContain(CLAVE_FALSA)
    // Nada se aceptó: no hay mensaje registrado en el servidor.
    expect(servidor.mensajes).toHaveLength(0)
  })

  it("un propietario sin correo queda fallido: no se inventa un envío", async () => {
    const servidor = await levantarServidor({ modo: "aceptar" })
    await configurarSMTP(servidor.port)
    await prisma.persona.update({ where: { id: personaId }, data: { email: "" } })

    await conSesion(async () => {
      const res = await ejecutarCobranza()
      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.canales.email.estado).toBe("fallido")
      expect(json.canales.email.motivo).toMatch(/no tiene correo electrónico/i)
    })

    const email = await envioEmail()
    expect(email?.estado).toBe("fallido")
    expect(servidor.mensajes).toHaveLength(0)
  })
})
