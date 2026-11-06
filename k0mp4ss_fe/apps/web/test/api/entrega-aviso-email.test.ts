/** @vitest-environment node */
/**
 * Entrega del aviso por correo con el emisor SMTP real (F4) — el canal email ya
 * NO asume que no hay emisor. BD real + servidor SMTP falso en memoria
 * escuchando en 127.0.0.1: ninguna conexión sale a internet y ninguna
 * credencial real entra en el test (la contraseña es texto inventado acá).
 *
 * Lo que fija este archivo, estado por estado (el registro nunca miente):
 *
 *   1. sin emisor configurado (sin fila de CF) el correo queda `pendiente` con
 *      el motivo del outbox y NO se abre ninguna conexión;
 *   2. si el servidor ACEPTA el mensaje el correo queda `enviado` con el id que
 *      devolvió el servidor, y ese estado NO se confunde con el `entregado` del
 *      visor: el visor se prueba con su `notificacionId`, el correo con la
 *      aceptación del servidor;
 *   3. si el servidor RECHAZA la autenticación el correo queda `fallido` y el
 *      motivo —el de la respuesta y el de la fila— no puede contener la
 *      contraseña, ni literal ni en base64;
 *   4. PRESERVE: el visor sigue `entregado` con su `notificacionId` en los tres
 *      desenlaces del correo, porque su prueba es la notificación, no el SMTP;
 *   5. un propietario sin correo no se inventa como enviado: queda `fallido`.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import { configuracionDefault } from "@/data/admin/configuracion"
import {
  iniciarServidorSMTPFalso,
  type ServidorSMTPFalso,
} from "../lib/servidor-smtp-falso"

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
const CLAVE_FALSA = "clave-inventada-entrega-aviso"
/** El servidor falso deja de aceptar si el usuario de CF no coincide. */
const USUARIO_SMTP = "emisor@ejemplo.test"

const COMUNIDAD = "ent-email-com"
const PERIODO = "2026-09"
const USUARIO_ADMIN = "ent-email-admin"
const EMAIL_ADMIN = "ent-email-admin@test.cl"
const UNIDAD = "ent-email-u-1"
const PERSONA = "ent-email-p-1"
const EMAIL_PERSONA = "propietaria@residenciallasacacias.cl"
const FONDO = "ent-email-fondo-gc"
const EMISION = "ent-email-egc"
const COBRO = "ent-email-cob-1"

const secretoPrevio = process.env.SMTP_PASSWORD
const servidores: ServidorSMTPFalso[] = []

type Json = Record<string, unknown>

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

/** CF de la comunidad apuntando SIEMPRE al servidor falso de 127.0.0.1. */
async function configurarSMTP(puerto: number): Promise<void> {
  const data = {
    ...configuracionDefault,
    smtpHost: "127.0.0.1",
    smtpPort: puerto,
    smtpUser: USUARIO_SMTP,
    smtpSecurity: "none",
    smtpFrom: "no-responder@ejemplo.test",
    smtpFromName: "Comunidad SMTP de prueba",
    smtpBcc: null,
    smtpRecepcion: null,
  }
  await prisma.configuracionGlobal.upsert({
    where: { comunidadId: COMUNIDAD },
    update: data,
    create: { id: `cfg-${COMUNIDAD}`, comunidadId: COMUNIDAD, ...data },
  })
}

async function limpiar(): Promise<void> {
  const where = { comunidadId: COMUNIDAD }
  await prisma.envioAvisoCobro.deleteMany({ where })
  await prisma.notificacion.deleteMany({ where })
  await prisma.eventoAuditoria.deleteMany({ where })
  await prisma.avisoCobro.deleteMany({ where })
  await prisma.cobroFI.deleteMany({ where })
  await prisma.emisionGC.deleteMany({ where })
  await prisma.fondoFI.deleteMany({ where })
  await prisma.vinculoUnidad.deleteMany({ where })
  await prisma.persona.deleteMany({ where })
  await prisma.unidad.deleteMany({ where })
  await prisma.configuracionGlobal.deleteMany({ where })
}

/** Emite el aviso por la ruta real: el documento congelado que después se entrega. */
async function emitirAviso(): Promise<{ id: string; folio: string }> {
  const { POST } = await import("@/app/api/avisos-cobro/route")
  const res = await POST(
    new NextRequest("http://localhost/api/avisos-cobro", {
      method: "POST",
      body: JSON.stringify({ periodo: PERIODO, unidadId: UNIDAD }),
      headers: { "content-type": "application/json" },
    })
  )
  const json = (await res.json().catch(() => ({}))) as Json
  if (res.status !== 201) {
    throw new Error(`emisión de aviso falló (${res.status}): ${JSON.stringify(json)}`)
  }
  const aviso = (json.avisos as Array<{ id: string; folio: string }>)[0]
  if (!aviso) throw new Error("la emisión no devolvió ningún aviso")
  return aviso
}

async function entregar(
  avisoId: string,
  body: unknown = {}
): Promise<{ status: number; json: Json }> {
  const { POST } = await import("@/app/api/avisos-cobro/[id]/entrega/route")
  const res = await POST(
    new NextRequest(`http://localhost/api/avisos-cobro/${avisoId}/entrega`, {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    }),
    { params: Promise.resolve({ id: avisoId }) }
  )
  return { status: res.status, json: (await res.json().catch(() => ({}))) as Json }
}

async function historial(avisoId: string): Promise<Json> {
  const { GET } = await import("@/app/api/avisos-cobro/[id]/entrega/route")
  const res = await GET(
    new NextRequest(`http://localhost/api/avisos-cobro/${avisoId}/entrega`),
    { params: Promise.resolve({ id: avisoId }) }
  )
  return (await res.json().catch(() => ({}))) as Json
}

/** Filas persistidas de la entrega, indexadas por canal. */
async function envios(avisoId: string) {
  const filas = await prisma.envioAvisoCobro.findMany({ where: { avisoId } })
  return {
    visor: filas.find((f) => f.canal === "visor"),
    email: filas.find((f) => f.canal === "email"),
  }
}

const canales = (json: Json): { visor: Json; email: Json } =>
  json.canales as { visor: Json; email: Json }

let aviso: { id: string; folio: string }

beforeAll(async () => {
  process.env.AUTH_SECRET = AUTH_SECRET
  process.env.NEXT_PUBLIC_APP_ENV = "development"
  vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 })

  await prisma.comunidad.upsert({
    where: { id: COMUNIDAD },
    update: {},
    create: { id: COMUNIDAD, nombre: "Comunidad Entrega Email", slug: "ent-email-com" },
  })
  await prisma.usuario.upsert({
    where: { email: EMAIL_ADMIN },
    update: { activo: true },
    create: { id: USUARIO_ADMIN, email: EMAIL_ADMIN, activo: true },
  })
  await prisma.membresia.deleteMany({
    where: { usuarioId: USUARIO_ADMIN, comunidadId: COMUNIDAD },
  })
  await prisma.membresia.create({
    data: { usuarioId: USUARIO_ADMIN, comunidadId: COMUNIDAD, rol: "administrador" },
  })

  const { cookieSesionAuthjs } = await import("../helpers/sesion-authjs")
  state.cookie = await cookieSesionAuthjs({ sub: USUARIO_ADMIN, email: EMAIL_ADMIN })
}, 120_000)

beforeEach(async () => {
  fijarSecreto(CLAVE_FALSA)
  await limpiar()

  await prisma.fondoFI.create({
    data: {
      id: FONDO,
      comunidadId: COMUNIDAD,
      nombre: "Fondo Gasto Común Entrega Email",
      tipo: "gasto_comun",
      activo: true,
      saldoInicial: 100_000,
    },
  })
  await prisma.unidad.create({
    data: {
      id: UNIDAD,
      comunidadId: COMUNIDAD,
      microSectorId: "ent-email-ms-1",
      numero: "101",
      etiqueta: "Depto 101",
      tipoUnidadId: "ent-email-tu-1",
      metraje: 60,
      prorrateo: 0.5,
      rolSii: "9999-101",
      estadoId: "ent-email-est-1",
      servicios: {},
    },
  })
  // El destinatario real: el propietario VIGENTE de la unidad, con correo.
  await prisma.persona.create({
    data: {
      id: PERSONA,
      comunidadId: COMUNIDAD,
      rut: "11111111-1",
      nombreCompleto: "Rosa Soto",
      nombres: "Rosa",
      apellidos: "Soto",
      email: EMAIL_PERSONA,
      telefonoMovil: "+56911111111",
      estadoCuenta: "activa",
      condicionesEspecialesIds: [],
      roles: ["propietario"],
    },
  })
  await prisma.vinculoUnidad.create({
    data: {
      id: "ent-email-v-1",
      comunidadId: COMUNIDAD,
      personaId: PERSONA,
      unidadId: UNIDAD,
      rol: "propietario",
      fechaInicio: "2026-02-01",
      fechaFin: null,
      permiteVerFinanzas: false,
    },
  })
  await prisma.emisionGC.create({
    data: {
      id: EMISION,
      comunidadId: COMUNIDAD,
      periodo: PERIODO,
      modo: "fijo",
      gastoTotal: 100_000,
      lineas: [],
      fechaEmision: `${PERIODO}-01`,
    },
  })
  await prisma.cobroFI.create({
    data: {
      id: COBRO,
      comunidadId: COMUNIDAD,
      unidadId: UNIDAD,
      periodo: PERIODO,
      concepto: "gasto_comun",
      origenModulo: "FI",
      fondoId: FONDO,
      descripcion: `Gasto Común ${PERIODO}`,
      montoBase: 60_000,
      lineas: [{ concepto: "gasto_comun", monto: 60_000, fondoId: FONDO }],
      fechaCargo: `${PERIODO}-01`,
      moras: [],
      pagos: [],
      diferencias: [],
    },
  })

  aviso = await emitirAviso()
}, 60_000)

afterEach(async () => {
  while (servidores.length > 0) await servidores.pop()?.cerrar()
})

afterAll(async () => {
  fijarSecreto(secretoPrevio)
  state.cookie = ""
  try {
    await limpiar()
    await prisma.membresia.deleteMany({
      where: { usuarioId: USUARIO_ADMIN, comunidadId: COMUNIDAD },
    })
    await prisma.usuario.delete({ where: { id: USUARIO_ADMIN } }).catch(() => {})
    await prisma.comunidad.delete({ where: { id: COMUNIDAD } }).catch(() => {})
  } catch {
    // limpieza best-effort
  }
}, 60_000)

describe("entrega del aviso por correo: los tres estados del emisor SMTP", () => {
  it("sin emisor configurado el correo queda pendiente con el motivo del outbox y no se abre conexión", async () => {
    // El servidor existe, pero la comunidad NO tiene CF: sin emisor no hay
    // conexión, así que el servidor falso no puede ver nada.
    const servidor = await levantarServidor({ modo: "aceptar" })

    const { status, json } = await entregar(aviso.id)

    expect(status).toBe(200)
    const email = canales(json).email
    expect(email.estado).toBe("pendiente")
    expect(String(email.motivo)).toMatch(/sin emisor SMTP configurado/i)
    expect(String(email.motivo)).toMatch(/cola de salida|outbox/)
    expect(String(email.motivo)).toMatch(/no se reporta como enviado/i)

    // PRESERVE: el visor no depende del SMTP.
    const visor = canales(json).visor
    expect(visor.estado).toBe("entregado")
    expect(visor.notificacionId).toBeTruthy()

    const filas = await envios(aviso.id)
    expect(filas.email?.estado).toBe("pendiente")
    expect(filas.email?.motivo).toMatch(/cola de salida|outbox/)
    // `pendiente` es una condición de configuración, no un envío declarado:
    // la fila del correo no tiene notificación que la pruebe.
    expect(filas.email?.notificacionId).toBeNull()
    expect(filas.visor?.estado).toBe("entregado")
    expect(filas.visor?.notificacionId).not.toBeNull()

    expect(servidor.mensajes).toHaveLength(0)
    expect(servidor.autenticaciones).toHaveLength(0)
  })

  it("si el servidor acepta, el correo queda enviado con el id del servidor y se distingue del entregado del visor", async () => {
    const servidor = await levantarServidor({ modo: "aceptar" })
    await configurarSMTP(servidor.port)

    const { status, json } = await entregar(aviso.id)

    expect(status).toBe(200)
    const emailJson = canales(json).email
    expect(emailJson.estado).toBe("enviado")
    expect(String(emailJson.motivo)).toMatch(/aceptado por el servidor SMTP/i)
    // El id del proveedor viaja y queda escrito: es lo único que distingue
    // "el servidor lo aceptó" de "creemos que salió".
    expect(String(emailJson.motivo)).toContain("falso-0001@ejemplo.test")

    const visorJson = canales(json).visor
    expect(visorJson.estado).toBe("entregado")
    expect(visorJson.notificacionId).toBeTruthy()
    // Nunca uno por el otro: el visor se prueba con la notificación, el correo
    // con la aceptación del servidor.
    expect(emailJson.notificacionId).toBeUndefined()
    expect(emailJson.estado).not.toBe("entregado")
    expect(visorJson.estado).not.toBe("enviado")

    const filas = await envios(aviso.id)
    expect(filas.email?.estado).toBe("enviado")
    expect(filas.email?.motivo).toContain("falso-0001@ejemplo.test")
    expect(filas.email?.notificacionId).toBeNull()
    expect(filas.visor?.estado).toBe("entregado")
    expect(filas.visor?.notificacionId).not.toBeNull()

    // El mensaje que llegó al servidor es el del aviso: folio y período.
    expect(servidor.mensajes).toHaveLength(1)
    expect(servidor.autenticaciones).toEqual([
      { usuario: USUARIO_SMTP, secreto: CLAVE_FALSA },
    ])
    const recibido = servidor.mensajes[0]
    expect(recibido?.to).toEqual([EMAIL_PERSONA])
    expect(recibido?.crudo).toContain(`To: <${EMAIL_PERSONA}>`)
    expect(recibido?.crudo).toContain(aviso.folio)
    expect(recibido?.crudo).toContain(PERIODO)
    // Ni el mensaje ni la respuesta llevan la contraseña.
    expect(recibido?.crudo).not.toContain(CLAVE_FALSA)
    expect(JSON.stringify(json)).not.toContain(CLAVE_FALSA)

    // El historial (GET) dice lo mismo que la respuesta: los dos estados se
    // distinguen al leerlos.
    const lectura = await historial(aviso.id)
    const enviosJson = lectura.envios as Json[]
    const emailLeido = enviosJson.find((e) => e.canal === "email")
    const visorLeido = enviosJson.find((e) => e.canal === "visor")
    expect(emailLeido?.estado).toBe("enviado")
    expect(String(emailLeido?.motivo)).toContain("falso-0001@ejemplo.test")
    expect(emailLeido?.notificacionId).toBeNull()
    expect(visorLeido?.estado).toBe("entregado")
    expect(visorLeido?.notificacionId).not.toBeNull()
  })

  it("un residente sembrado con dirección ficticia (@email.com) queda fallido con su razón y sin conexión", async () => {
    // El caso del incidente: la semilla trae direcciones `@email.com` que no
    // existen, y el servidor aceptaba el mensaje (rebote). Ahora el correo se
    // rechaza localmente y la fila dice por qué.
    const servidor = await levantarServidor({ modo: "aceptar" })
    await configurarSMTP(servidor.port)
    await prisma.persona.update({
      where: { id: PERSONA },
      data: { email: "juan.perez@email.com" },
    })

    const { status, json } = await entregar(aviso.id)

    expect(status).toBe(200)
    const emailJson = canales(json).email
    expect(emailJson.estado).toBe("fallido")
    const motivo = String(emailJson.motivo)
    expect(motivo).toContain("juan.perez@email.com")
    expect(motivo).toMatch(/dirección de prueba o inexistente/i)
    expect(motivo).toMatch(/dominio ficticio de los datos semilla/i)
    expect(motivo).toMatch(/no se envió nada/i)
    // Nunca `pendiente`: eso significa "sin emisor configurado", otro estado.
    expect(emailJson.estado).not.toBe("pendiente")
    expect(emailJson.estado).not.toBe("enviado")

    const filas = await envios(aviso.id)
    expect(filas.email?.estado).toBe("fallido")
    expect(filas.email?.motivo).toBe(motivo)
    expect(filas.email?.notificacionId).toBeNull()

    // PRESERVE: el visor no depende del SMTP y sigue entregado.
    expect(canales(json).visor.estado).toBe("entregado")
    expect(filas.visor?.estado).toBe("entregado")
    expect(filas.visor?.notificacionId).not.toBeNull()

    // Y no hubo ni un intento: el servidor falso no vio conexión, auth ni mensaje.
    expect(servidor.mensajes).toHaveLength(0)
    expect(servidor.autenticaciones).toHaveLength(0)
  })

  it("si el servidor rechaza la autenticación el correo queda fallido y el motivo no lleva la contraseña", async () => {
    // El servidor copia la contraseña recibida dentro del rechazo: el emisor
    // tiene que redactarla antes de armar el motivo y de escribir la fila.
    const servidor = await levantarServidor({
      modo: "rechazar_auth",
      ecoDelSecretoEnElRechazo: true,
    })
    await configurarSMTP(servidor.port)

    const { status, json } = await entregar(aviso.id)

    expect(status).toBe(200)
    const emailJson = canales(json).email
    expect(emailJson.estado).toBe("fallido")
    expect(String(emailJson.motivo)).toMatch(/535/)
    expect(String(emailJson.motivo)).toContain("[redactado]")
    expect(String(emailJson.motivo)).not.toContain(CLAVE_FALSA)
    expect(JSON.stringify(json)).not.toContain(CLAVE_FALSA)

    const filas = await envios(aviso.id)
    const base64 = Buffer.from(CLAVE_FALSA, "utf8").toString("base64")
    expect(filas.email?.estado).toBe("fallido")
    expect(filas.email?.motivo).toMatch(/535/)
    expect(filas.email?.motivo).not.toContain(CLAVE_FALSA)
    expect(filas.email?.motivo).not.toContain(base64)

    // El rechazo no aceptó ningún mensaje.
    expect(servidor.mensajes).toHaveLength(0)

    // PRESERVE: el visor se entrega igual, porque su prueba es la notificación.
    expect(filas.visor?.estado).toBe("entregado")
    expect(filas.visor?.notificacionId).not.toBeNull()

    const lectura = await historial(aviso.id)
    expect(JSON.stringify(lectura)).not.toContain(CLAVE_FALSA)
    expect(JSON.stringify(lectura)).not.toContain(base64)
  })

  it("un propietario sin correo queda fallido: no se inventa un envío", async () => {
    const servidor = await levantarServidor({ modo: "aceptar" })
    await configurarSMTP(servidor.port)
    await prisma.persona.update({ where: { id: PERSONA }, data: { email: "" } })

    const { json } = await entregar(aviso.id)

    const emailJson = canales(json).email
    expect(emailJson.estado).toBe("fallido")
    expect(String(emailJson.motivo)).toMatch(/no tiene correo electrónico/i)
    expect(servidor.mensajes).toHaveLength(0)

    const filas = await envios(aviso.id)
    expect(filas.email?.estado).toBe("fallido")
    expect(filas.email?.notificacionId).toBeNull()
    expect(filas.visor?.estado).toBe("entregado")
  })
})
