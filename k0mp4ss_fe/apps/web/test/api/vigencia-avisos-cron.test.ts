/** @vitest-environment node */
/**
 * Barrido AUTOMÁTICO de avisos de vigencia y correo real (S3 y S4 del plan
 * `odd/tasks/saldar-v2-pantallas-y-barrido.md`).
 *
 * Lo que se prueba, y por qué:
 *
 *   1. **El `GET` es del cron, no de una sesión.** sin `CRON_SECRET` en el
 *      entorno falla cerrado (500) y no escribe nada; con el encabezado ausente o
 *      con un secreto que no coincide responde 401 y NO emite ni un aviso.
 *   2. **Con el secreto corre para TODAS las comunidades con caso de vigencia**,
 *      no para una: las comunidades con unidades y sin caso no participan (sus
 *      avisos no se derivan de un registro que no existe).
 *   3. **El correo sale por la credencial de la comunidad** (F33): con una
 *      credencial viva el servidor SMTP de prueba recibe el mensaje del
 *      propietario y el resumen cuenta `enviados`; cuando el servidor rechaza,
 *      el resumen cuenta `fallidos` con el motivo redactado.
 *   4. **Sin credencial no se finge un envío**: el aviso queda escrito en la
 *      bandeja y el resumen dice cuántos quedaron sin enviar y por qué.
 *   5. **Idempotencia**: una segunda corrida del `GET` emite cero avisos y no
 *      vuelve a abrir una conexión SMTP (el índice único de `avisos_vigencia` ya
 *      garantiza la primera mitad; acá se prueba el efecto completo).
 *   6. **El botón manual conserva su contrato**: el `POST` con la sesión de la
 *      administración responde `{ ok, emitidos, omitidos }` y ve como omitidos
 *      exactamente los avisos que escribió el cron —es el MISMO barrido—, y un
 *      rol sin permiso sigue recibiendo 403 sin escribir nada.
 *
 * Fixture propio (`vig-cron-*`) contra la base descartable de la suite y el
 * servidor SMTP falso en memoria de `test/lib/servidor-smtp-falso.ts`: ninguna
 * conexión sale a internet y ningún secreto es real.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import { prisma } from "@/lib/prisma"
import { configuracionDefault } from "@/data/admin/configuracion"
import { VARIABLE_CLAVE_MAESTRA, cifrarSecreto } from "@/lib/cifrado-secretos"
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

/** Secreto del cron y de la clave maestra: valores de prueba, no credenciales. */
const SECRETO_CRON = "secreto-cron-de-prueba-inventado"
const SECRETO_SMTP = "secreto-smtp-del-barrido-inventado"
const CLAVE_MAESTRA = Buffer.alloc(32, 11).toString("base64")
const USUARIO_SMTP = "buzon@comunidad-vig-cron.cl"
const REMITENTE = "no-responder@comunidad-vig-cron.cl"

/** Comunidades del fixture, cada una con un desenlace de correo distinto. */
const COM_SIN_CREDENCIAL = "vig-cron-sin-credencial"
const COM_EMISOR_ACEPTA = "vig-cron-emisor-acepta"
const COM_EMISOR_RECHAZA = "vig-cron-emisor-rechaza"
const COM_SIN_CASOS = "vig-cron-sin-casos"
const COM_CREDENCIAL_SIN_CF = "vig-cron-credencial-sin-cf"
const COMUNIDADES = [
  COM_SIN_CREDENCIAL,
  COM_EMISOR_ACEPTA,
  COM_EMISOR_RECHAZA,
  COM_SIN_CASOS,
  COM_CREDENCIAL_SIN_CF,
] as const

const EMAIL_ADMIN = "vig-cron-admin@comunidad-vig-cron.cl"
const EMAIL_RESIDENTE = "vig-cron-residente@comunidad-vig-cron.cl"
const USER_ADMIN = "vig-cron-user-admin"
const USER_RESIDENTE = "vig-cron-user-residente"

/** 320 días: «por vencer» (más de 10 meses, menos de 12). 400 + requerimiento: multa. */
const DIA = 24 * 60 * 60 * 1000
const hace = (dias: number) => new Date(Date.now() - dias * DIA)

const CLAVES = ["por-vencer", "sin-declaracion", "vencida"] as const

const unidadDe = (comunidadId: string, clave: string) => `${comunidadId}-u-${clave}`
const personaDe = (comunidadId: string, clave: string) => `${comunidadId}-p-${clave}`
const emailDe = (comunidadId: string, clave: string) =>
  `propietario-${clave}@${comunidadId}.cl`

interface ResumenCron {
  comunidadId: string
  ok: boolean
  error: string | null
  emitidos: number
  omitidos: number
  enviados: number
  fallidos: number
  sinEmisor: number
  enBandeja: number
  motivos: string[]
}

interface CuerpoCron {
  ok?: boolean
  comunidades?: ResumenCron[]
  totales?: Record<string, number>
  error?: string
}

type Json = CuerpoCron & Record<string, unknown>

const secretoCronPrevio = process.env.CRON_SECRET
const clavePrevia = process.env[VARIABLE_CLAVE_MAESTRA]
const servidores: ServidorSMTPFalso[] = []
let servidorAcepta: ServidorSMTPFalso
let servidorRechaza: ServidorSMTPFalso
/** Cuerpo de la PRIMERA corrida autorizada: los detalles se leen de acá, no de
 * una corrida nueva (la segunda ya no emite nada por idempotencia). */
let primeraCorrida: Json = {}

async function crearUnidad(
  id: string,
  numero: string,
  comunidadId: string
): Promise<void> {
  await prisma.unidad.create({
    data: {
      id,
      comunidadId,
      microSectorId: `micro-${id}`,
      numero,
      etiqueta: `Unidad ${numero}`,
      tipoUnidadId: `tipo-${id}`,
      metraje: 50,
      prorrateo: 1,
      rolSii: `rol-${id}`,
      estadoId: "habitada",
      servicios: {},
    },
  })
}

/**
 * Tres unidades por comunidad: una «por vencer» (aviso al propietario), una sin
 * declaración (dos incidentes a roles) y una con el plazo vencido (dos a roles y
 * uno al propietario). Seis avisos por comunidad; dos de ellos son correo.
 */
async function sembrarComunidad(comunidadId: string): Promise<void> {
  await prisma.comunidad.upsert({
    where: { id: comunidadId },
    update: {},
    create: {
      id: comunidadId,
      nombre: `Comunidad ${comunidadId}`,
      slug: comunidadId,
    },
  })

  const casos = [
    {
      clave: "por-vencer",
      numero: "101",
      ultimaActualizacion: hace(320),
      requerimientoEn: null,
    },
    {
      clave: "sin-declaracion",
      numero: "102",
      ultimaActualizacion: null,
      requerimientoEn: null,
    },
    {
      clave: "vencida",
      numero: "103",
      ultimaActualizacion: hace(400),
      requerimientoEn: hace(100),
    },
  ] as const

  for (const caso of casos) {
    const unidadId = unidadDe(comunidadId, caso.clave)
    const personaId = personaDe(comunidadId, caso.clave)
    await crearUnidad(unidadId, caso.numero, comunidadId)
    await prisma.persona.create({
      data: {
        id: personaId,
        comunidadId,
        rut: "11.111.111-1",
        nombreCompleto: `Propietario ${caso.numero}`,
        nombres: "Propietario",
        apellidos: caso.numero,
        email: emailDe(comunidadId, caso.clave),
        telefonoMovil: "+56911111111",
        estadoCuenta: "activa",
        condicionesEspecialesIds: [],
        roles: ["propietario"],
      },
    })
    await prisma.vinculoUnidad.create({
      data: {
        id: `${unidadId}-vinculo`,
        comunidadId,
        personaId,
        unidadId,
        rol: "propietario",
        fechaInicio: "2020-01-01",
        fechaFin: null,
        permiteVerFinanzas: false,
      },
    })
    await prisma.vigenciaRegistroUnidad.create({
      data: {
        comunidadId,
        unidadId,
        ultimaActualizacion: caso.ultimaActualizacion,
        requerimientoEn: caso.requerimientoEn,
      },
    })
  }
}

async function guardarCF(comunidadId: string, puerto: number): Promise<void> {
  const data = {
    ...configuracionDefault,
    smtpHost: "127.0.0.1",
    smtpPort: puerto,
    smtpUser: USUARIO_SMTP,
    smtpSecurity: "none",
    smtpFrom: REMITENTE,
    smtpFromName: "Comunidad Vig Cron",
    smtpBcc: null,
    smtpRecepcion: null,
  }
  await prisma.configuracionGlobal.upsert({
    where: { comunidadId },
    update: data,
    create: { id: `cfg-${comunidadId}`, comunidadId, ...data },
  })
}

/** La credencial se guarda cifrada, igual que la escribe `/api/configuracion/correo`. */
async function guardarCredencial(
  comunidadId: string,
  puerto: number
): Promise<void> {
  const paquete = cifrarSecreto(SECRETO_SMTP, {
    [VARIABLE_CLAVE_MAESTRA]: CLAVE_MAESTRA,
  })
  await prisma.credencialCorreoComunidad.create({
    data: {
      id: `cred-${comunidadId}`,
      comunidadId,
      host: "127.0.0.1",
      puerto,
      usuario: USUARIO_SMTP,
      secretoCifrado: paquete.secretoCifrado,
      iv: paquete.iv,
      authTag: paquete.authTag,
      version: 1,
      actualizadoPor: USER_ADMIN,
    },
  })
}

async function limpiar(): Promise<void> {
  const where = { comunidadId: { in: [...COMUNIDADES] } }
  await prisma.avisoVigencia.deleteMany({ where })
  await prisma.notificacion.deleteMany({ where })
  await prisma.revalidacionVigencia.deleteMany({ where })
  await prisma.requerimientoVigencia.deleteMany({ where })
  await prisma.vigenciaRegistroUnidad.deleteMany({ where })
  await prisma.eventoAuditoria.deleteMany({ where })
  await prisma.vinculoUnidad.deleteMany({ where })
  await prisma.unidad.deleteMany({ where })
  await prisma.persona.deleteMany({ where })
  await prisma.credencialCorreoComunidad.deleteMany({ where })
  await prisma.configuracionGlobal.deleteMany({ where })
  await prisma.membresia.deleteMany({ where })
  await prisma.usuario.deleteMany({
    where: { id: { in: [USER_ADMIN, USER_RESIDENTE] } },
  })
  await prisma.comunidad.deleteMany({ where: { id: { in: [...COMUNIDADES] } } })
}

async function pedirCron(
  autorizacion?: string
): Promise<{ status: number; texto: string; json: Json }> {
  const { GET } = await import("@/app/api/vigencia-registro/avisos/route")
  const res = await GET(
    new Request("http://localhost/api/vigencia-registro/avisos", {
      method: "GET",
      headers: autorizacion ? { authorization: autorizacion } : {},
    })
  )
  const texto = await res.text()
  let json: Json = {}
  try {
    json = JSON.parse(texto) as Json
  } catch {
    json = {}
  }
  return { status: res.status, texto, json }
}

const autorizado = () => `Bearer ${SECRETO_CRON}`

function resumenDe(cuerpo: Json, comunidadId: string): ResumenCron | undefined {
  return cuerpo.comunidades?.find((fila) => fila.comunidadId === comunidadId)
}

const contarAvisos = () =>
  prisma.avisoVigencia.count({
    where: { comunidadId: { in: [...COMUNIDADES] } },
  })

const contarNotificaciones = () =>
  prisma.notificacion.count({
    where: { comunidadId: { in: [...COMUNIDADES] } },
  })

const eventos = (comunidadId: string) =>
  prisma.eventoAuditoria.findMany({
    where: { comunidadId, tipoAccion: "AD_VIGENCIA_AVISOS" },
    orderBy: { timestamp: "asc" },
  })

async function conSesion(email: string, fn: () => Promise<void>): Promise<void> {
  const user = await prisma.usuario.findUnique({ where: { email } })
  if (!user) throw new Error(`usuario no encontrado: ${email}`)
  const { cookieSesionAuthjs } = await import("../helpers/sesion-authjs")
  const previa = state.cookie
  state.cookie = await cookieSesionAuthjs({ sub: user.id, email: user.email })
  try {
    await fn()
  } finally {
    state.cookie = previa
  }
}

async function emitirAvisosManual(): Promise<Response> {
  const { POST } = await import("@/app/api/vigencia-registro/avisos/route")
  return POST(
    new Request("http://localhost/api/vigencia-registro/avisos", {
      method: "POST",
    })
  )
}

beforeAll(async () => {
  process.env.AUTH_SECRET ||= AUTH_SECRET
  process.env.CRON_SECRET = SECRETO_CRON
  process.env[VARIABLE_CLAVE_MAESTRA] = CLAVE_MAESTRA
  vi.setConfig({ testTimeout: 60_000, hookTimeout: 120_000 })

  // Dos servidores falsos: uno acepta el mensaje y otro lo rechaza al cerrar el DATA.
  servidorAcepta = await iniciarServidorSMTPFalso({
    usuario: USUARIO_SMTP,
    secreto: SECRETO_SMTP,
  })
  servidorRechaza = await iniciarServidorSMTPFalso({
    modo: "rechazar_mensaje",
    usuario: USUARIO_SMTP,
    secreto: SECRETO_SMTP,
  })
  servidores.push(servidorAcepta, servidorRechaza)

  await limpiar()

  for (const comunidadId of COMUNIDADES) {
    if (comunidadId === COM_SIN_CASOS) {
      // Unidades sin caso de vigencia: el cron NO barre esta comunidad.
      await prisma.comunidad.upsert({
        where: { id: comunidadId },
        update: {},
        create: {
          id: comunidadId,
          nombre: `Comunidad ${comunidadId}`,
          slug: comunidadId,
        },
      })
      await crearUnidad(`${comunidadId}-u-sin-caso`, "901", comunidadId)
      continue
    }
    await sembrarComunidad(comunidadId)
  }

  await prisma.usuario.upsert({
    where: { email: EMAIL_ADMIN },
    update: {},
    create: { id: USER_ADMIN, email: EMAIL_ADMIN, activo: true },
  })
  await prisma.usuario.upsert({
    where: { email: EMAIL_RESIDENTE },
    update: {},
    create: { id: USER_RESIDENTE, email: EMAIL_RESIDENTE, activo: true },
  })
  await prisma.membresia.deleteMany({
    where: { usuarioId: { in: [USER_ADMIN, USER_RESIDENTE] } },
  })
  await prisma.membresia.create({
    data: {
      usuarioId: USER_ADMIN,
      comunidadId: COM_SIN_CREDENCIAL,
      rol: "administrador",
    },
  })
  await prisma.membresia.create({
    data: {
      usuarioId: USER_RESIDENTE,
      comunidadId: COM_SIN_CREDENCIAL,
      rol: "residente",
    },
  })

  await guardarCF(COM_EMISOR_ACEPTA, servidorAcepta.port)
  await guardarCredencial(COM_EMISOR_ACEPTA, servidorAcepta.port)
  await guardarCF(COM_EMISOR_RECHAZA, servidorRechaza.port)
  await guardarCredencial(COM_EMISOR_RECHAZA, servidorRechaza.port)
  // Credencial sin fila de CF: no hay remitente con el que armar el mensaje.
  await guardarCredencial(COM_CREDENCIAL_SIN_CF, servidorAcepta.port)
})

afterAll(async () => {
  try {
    while (servidores.length > 0) await servidores.pop()?.cerrar()
    await limpiar()
  } catch {
    // limpieza best-effort
  }
  if (secretoCronPrevio === undefined) delete process.env.CRON_SECRET
  else process.env.CRON_SECRET = secretoCronPrevio
  if (clavePrevia === undefined) delete process.env[VARIABLE_CLAVE_MAESTRA]
  else process.env[VARIABLE_CLAVE_MAESTRA] = clavePrevia
})

describe("el GET del cron falla cerrado", () => {
  it("sin CRON_SECRET en el entorno responde 500, lo dice y no escribe nada", async () => {
    delete process.env.CRON_SECRET
    try {
      const { status, json } = await pedirCron(autorizado())
      expect(status).toBe(500)
      expect(json.error).toBe(
        "No se puede correr el barrido automático: falta la variable de entorno CRON_SECRET en el servidor."
      )
    } finally {
      process.env.CRON_SECRET = SECRETO_CRON
    }
    expect(await contarAvisos()).toBe(0)
    expect(await contarNotificaciones()).toBe(0)
  })

  it("sin el encabezado Authorization responde 401 y no emite ni audita nada", async () => {
    const { status, json } = await pedirCron()
    expect(status).toBe(401)
    expect(json.error).toBe(
      "No autorizado: el barrido automático exige el secreto del cron en el encabezado Authorization (Bearer)."
    )
    expect(await contarAvisos()).toBe(0)
    expect(await contarNotificaciones()).toBe(0)
    for (const comunidadId of COMUNIDADES) {
      expect(await eventos(comunidadId)).toHaveLength(0)
    }
  })

  it("con un secreto que no coincide responde 401 y no emite nada", async () => {
    const { status } = await pedirCron("Bearer otro-secreto-cualquiera")
    expect(status).toBe(401)
    expect(await contarAvisos()).toBe(0)
    expect(await contarNotificaciones()).toBe(0)
  })
})

describe("con el secreto corre el barrido de todas las comunidades con caso", () => {
  it("emite los avisos de cada comunidad con caso y deja fuera a la que no tiene ninguno", async () => {
    const { status, texto, json } = await pedirCron(autorizado())
    expect(status).toBe(200)
    expect(texto).not.toContain(SECRETO_CRON)
    expect(texto).not.toContain(SECRETO_SMTP)

    // Cuatro comunidades barridas: las tres con caso de vigencia y la que tiene
    // credencial sin CF. La de unidades sin caso no aparece.
    primeraCorrida = json
    expect(json.ok).toBe(true)
    expect(json.comunidades?.length ?? 0).toBeGreaterThanOrEqual(4)
    expect(resumenDe(json, COM_SIN_CASOS)).toBeUndefined()

    for (const comunidadId of [
      COM_SIN_CREDENCIAL,
      COM_EMISOR_ACEPTA,
      COM_EMISOR_RECHAZA,
      COM_CREDENCIAL_SIN_CF,
    ]) {
      const resumen = resumenDe(json, comunidadId)
      expect(resumen).toBeDefined()
      expect(resumen?.ok).toBe(true)
      expect(resumen?.emitidos).toBe(6)
      expect(resumen?.omitidos).toBe(0)
      expect(resumen?.enBandeja).toBe(4)
      // Cada aviso emitido tiene EXACTAMENTE un desenlace de correo.
      expect(
        (resumen?.enviados ?? 0) +
          (resumen?.fallidos ?? 0) +
          (resumen?.sinEmisor ?? 0) +
          (resumen?.enBandeja ?? 0)
      ).toBe(resumen?.emitidos)
    }

    // Los totales son la suma de las comunidades barridas, sin inventar cifras.
    const sumas = (json.comunidades ?? []).reduce(
      (acc, fila) => ({
        emitidos: acc.emitidos + fila.emitidos,
        omitidos: acc.omitidos + fila.omitidos,
        enviados: acc.enviados + fila.enviados,
        fallidos: acc.fallidos + fila.fallidos,
        sinEmisor: acc.sinEmisor + fila.sinEmisor,
        enBandeja: acc.enBandeja + fila.enBandeja,
      }),
      { emitidos: 0, omitidos: 0, enviados: 0, fallidos: 0, sinEmisor: 0, enBandeja: 0 }
    )
    expect(json.totales).toMatchObject({
      comunidades: json.comunidades?.length,
      ...sumas,
    })

    expect(await contarAvisos()).toBe(24)
    expect(await contarNotificaciones()).toBe(24)

    // La comunidad con unidades y sin caso no tiene ni un aviso ni una notificación.
    expect(
      await prisma.notificacion.count({ where: { comunidadId: COM_SIN_CASOS } })
    ).toBe(0)
    expect(
      await prisma.avisoVigencia.count({ where: { comunidadId: COM_SIN_CASOS } })
    ).toBe(0)
    expect(await eventos(COM_SIN_CASOS)).toHaveLength(0)
  })

  it("S4: sin credencial el aviso queda en la bandeja y el resumen dice cuántos y por qué", async () => {
    const resumen = resumenDe(primeraCorrida, COM_SIN_CREDENCIAL)
    expect(resumen?.sinEmisor).toBe(2)
    expect(resumen?.enviados).toBe(0)
    expect(resumen?.motivos).toContain(
      "La comunidad no tiene credencial de correo guardada: el aviso queda en la bandeja y no se envió ningún correo."
    )
    // El aviso del propietario existe igual: la bandeja es el canal real.
    const avisosDelPropietario = await prisma.notificacion.findMany({
      where: {
        comunidadId: COM_SIN_CREDENCIAL,
        unidadId: unidadDe(COM_SIN_CREDENCIAL, "por-vencer"),
        destinatarioRol: "propietario",
      },
    })
    expect(avisosDelPropietario).toHaveLength(1)
    expect(avisosDelPropietario[0]?.destinatarioPersonaId).toBe(
      personaDe(COM_SIN_CREDENCIAL, "por-vencer")
    )
  })

  it("S4: con la credencial de la comunidad el servidor recibe el correo del propietario y se cuenta como enviado", () => {
    // Dos avisos con correo a dónde ir (los dos del propietario vigente).
    expect(resumenDe(primeraCorrida, COM_EMISOR_ACEPTA)?.enviados).toBe(2)
    expect(resumenDe(primeraCorrida, COM_EMISOR_ACEPTA)?.fallidos).toBe(0)
    const mensajes = servidorAcepta.mensajes
    expect(mensajes).toHaveLength(2)
    expect(mensajes.map((mensaje) => mensaje.to.join(",")).sort()).toEqual(
      [
        emailDe(COM_EMISOR_ACEPTA, "por-vencer"),
        emailDe(COM_EMISOR_ACEPTA, "vencida"),
      ].sort()
    )
    // El secreto de la credencial no viaja en el asunto ni en el cuerpo.
    for (const mensaje of mensajes) {
      expect(mensaje.crudo).not.toContain(SECRETO_SMTP)
    }
  })

  it("S4: cuando el servidor rechaza el mensaje el desenlace es fallido con el motivo redactado", () => {
    const resumen = resumenDe(primeraCorrida, COM_EMISOR_RECHAZA)
    expect(resumen?.fallidos).toBe(2)
    expect(resumen?.enviados).toBe(0)
    expect(resumen?.motivos.length).toBeGreaterThan(0)
    // El rechazo del servidor queda con el motivo del emisor, y el secreto no
    // aparece en ninguno de los motivos que el resumen devuelve.
    expect(
      (resumen?.motivos ?? []).some((motivo) =>
        motivo.startsWith("Falló el envío por SMTP:")
      )
    ).toBe(true)
    for (const motivo of resumen?.motivos ?? []) {
      expect(motivo).not.toContain(SECRETO_SMTP)
    }
  })

  it("S4: con credencial y sin configuración global no se intenta el envío y el aviso queda en la bandeja", () => {
    const resumen = resumenDe(primeraCorrida, COM_CREDENCIAL_SIN_CF)
    expect(resumen?.sinEmisor).toBe(2)
    expect(resumen?.enviados).toBe(0)
    expect(
      (resumen?.motivos ?? []).some((motivo) =>
        motivo.includes("no tiene configuración global (CF)")
      )
    ).toBe(true)
  })

  it("es idempotente: una segunda corrida no emite avisos ni vuelve a abrir el SMTP", async () => {
    const conexiones = servidorAcepta.autenticaciones.length
    const rechazos = servidorRechaza.autenticaciones.length

    const { status, json } = await pedirCron(autorizado())
    expect(status).toBe(200)
    expect(json.totales).toMatchObject({
      comunidades: json.comunidades?.length,
      emitidos: 0,
      omitidos: 24,
      enviados: 0,
      fallidos: 0,
      sinEmisor: 0,
      enBandeja: 0,
    })
    expect(await contarAvisos()).toBe(24)
    expect(await contarNotificaciones()).toBe(24)
    // Ni una conexión nueva: no se reenvía lo que ya está emitido.
    expect(servidorAcepta.autenticaciones.length).toBe(conexiones)
    expect(servidorRechaza.autenticaciones.length).toBe(rechazos)
  })

  it("cada corrida deja un evento de auditoría con lo emitido, lo omitido y los correos", async () => {
    const propios = await eventos(COM_SIN_CREDENCIAL)
    // Dos corridas autorizadas del cron; el 500 y los dos 401 no auditaron nada.
    expect(propios).toHaveLength(2)
    const primera = propios[0]
    expect(primera?.usuario).toBe("cron")
    expect(primera?.descripcion).toContain("6 emitido(s)")
    expect(primera?.descripcion).toContain("0 omitido(s)")
    expect(primera?.descripcion.toLowerCase()).toContain("bandeja")
    expect(primera?.descripcion).not.toContain(SECRETO_SMTP)
  })
})

describe("el barrido manual es el MISMO código", () => {
  it("el POST de la administración ve como omitidos los avisos que escribió el cron", async () => {
    await conSesion(EMAIL_ADMIN, async () => {
      const respuesta = await emitirAvisosManual()
      expect(respuesta.status).toBe(200)
      expect(await respuesta.json()).toEqual({
        ok: true,
        emitidos: 0,
        omitidos: 6,
      })
    })
    const propios = await eventos(COM_SIN_CREDENCIAL)
    expect(propios).toHaveLength(3)
    expect(propios[2]?.usuario).toBe(USER_ADMIN)
    // No se duplicó nada: el cron y el botón escriben la misma constancia.
    expect(
      await prisma.avisoVigencia.count({
        where: { comunidadId: COM_SIN_CREDENCIAL },
      })
    ).toBe(6)
    expect(
      await prisma.notificacion.count({
        where: { comunidadId: COM_SIN_CREDENCIAL },
      })
    ).toBe(6)
  })

  it("PRESERVE: un rol sin permiso sigue recibiendo 403 y nada escrito", async () => {
    const antes = await prisma.notificacion.count({
      where: { comunidadId: COM_SIN_CREDENCIAL },
    })
    await conSesion(EMAIL_RESIDENTE, async () => {
      const respuesta = await emitirAvisosManual()
      expect(respuesta.status).toBe(403)
      expect(await respuesta.json()).toEqual({ error: "Permiso denegado." })
    })
    expect(
      await prisma.notificacion.count({
        where: { comunidadId: COM_SIN_CREDENCIAL },
      })
    ).toBe(antes)
  })
})
