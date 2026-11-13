/** @vitest-environment node */
/**
 * Resolución de la credencial de correo POR COMUNIDAD en UN solo lugar (F33).
 *
 * Por qué este archivo: hasta acá la credencial cifrada existía en la base y el
 * emisor aceptaba una credencial explícita, pero los llamadores no la pasaban,
 * así que todo correo salía con `SMTP_PASSWORD`. La decisión es resolverla
 * DENTRO del emisor (`enviarCorreoComunidad`), no en cada llamador: un llamador
 * nuevo que se olvide no puede caer en silencio a la contraseña global.
 *
 * Lo que se fija acá:
 *
 *   1. `resolverCredencialDeComunidad` devuelve la credencial descifrada o UN
 *      motivo, nunca las dos cosas: `comunidad_sin_credencial` (no hay fila),
 *      `clave_maestra_ausente` (la variable falta o no mide 32 bytes) y
 *      `credencial_ilegible` (el paquete guardado no se abre). Ninguno lanza.
 *   2. Precedencia: credencial EXPLÍCITA > credencial de la comunidad > variable
 *      global `SMTP_PASSWORD`. Con credencial explícita no se resuelve la de la
 *      comunidad (es lo que hace el barrido de vigencia, y no se puede degradar).
 *   3. Cuando se cae a la variable global, el motivo persistido DICE por qué: la
 *      cola de salida no puede insinuar que se usó una credencial que no existe.
 *   4. El camino del aviso y el del documento (`lib/entrega-aviso.ts`) usan la
 *      credencial de la comunidad sin que su código cambie.
 *
 * BD real (descartable) + servidor SMTP falso en memoria en 127.0.0.1: ninguna
 * conexión sale a internet y ningún secreto es real (son textos de prueba).
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { prisma } from "@/lib/prisma"
import { configuracionDefault } from "@/data/admin/configuracion"
import {
  VARIABLE_CLAVE_MAESTRA,
  cifrarSecreto,
} from "@/lib/cifrado-secretos"
import { resolverCredencialDeComunidad } from "@/lib/correo-comunidad"
import { enviarCorreoComunidad, motivoSMTP } from "@/lib/smtp"
import { planDeCanal } from "@/lib/entrega-aviso"
import { planDeEnvioDocumento } from "@/app/api/documentos/_lib/envio-documento"
import {
  iniciarServidorSMTPFalso,
  type ServidorSMTPFalso,
} from "./servidor-smtp-falso"

const COMUNIDAD = "cc-resolucion-com"
const CLAVE_MAESTRA = Buffer.alloc(32, 23).toString("base64")
/** Otra clave de 32 bytes: descifrar con ella NO abre el paquete guardado. */
const OTRA_CLAVE = Buffer.alloc(32, 24).toString("base64")
const SECRETO_GLOBAL = "secreto-global-inventado"
const SECRETO_COMUNIDAD = "secreto-comunidad-inventado"
const USUARIO_GLOBAL = "emisor@ejemplo.test"
const USUARIO_COMUNIDAD = "buzon@comunidad-cc.cl"
const REMITENTE = "no-responder@ejemplo.test"
const DESTINATARIO = "propietaria@residenciallasacacias.cl"

const clavePrevia = process.env[VARIABLE_CLAVE_MAESTRA]
const secretoPrevio = process.env.SMTP_PASSWORD
const servidores: ServidorSMTPFalso[] = []

async function levantarServidor(
  opciones: Parameters<typeof iniciarServidorSMTPFalso>[0] = {}
): Promise<ServidorSMTPFalso> {
  const servidor = await iniciarServidorSMTPFalso({ modo: "aceptar", ...opciones })
  servidores.push(servidor)
  return servidor
}

/** Servidor que acepta SOLO la credencial de la comunidad. */
const levantarServidorDeComunidad = (): Promise<ServidorSMTPFalso> =>
  levantarServidor({ usuario: USUARIO_COMUNIDAD, secreto: SECRETO_COMUNIDAD })

/** Servidor que acepta SOLO el camino global (`smtpUser` + `SMTP_PASSWORD`). */
const levantarServidorGlobal = (): Promise<ServidorSMTPFalso> =>
  levantarServidor({ usuario: USUARIO_GLOBAL, secreto: SECRETO_GLOBAL })

function fijarClaveMaestra(valor: string | undefined): void {
  if (valor === undefined) delete process.env[VARIABLE_CLAVE_MAESTRA]
  else process.env[VARIABLE_CLAVE_MAESTRA] = valor
}

function fijarSecretoGlobal(valor: string | undefined): void {
  if (valor === undefined) delete process.env.SMTP_PASSWORD
  else process.env.SMTP_PASSWORD = valor
}

/** CF de la comunidad: remitente y seguridad, apuntando al servidor global. */
async function configurarCF(puerto: number): Promise<void> {
  const data = {
    ...configuracionDefault,
    smtpHost: "127.0.0.1",
    smtpPort: puerto,
    smtpUser: USUARIO_GLOBAL,
    smtpSecurity: "none",
    smtpFrom: REMITENTE,
    smtpFromName: "Comunidad CC",
    smtpBcc: null,
    smtpRecepcion: null,
  }
  await prisma.configuracionGlobal.upsert({
    where: { comunidadId: COMUNIDAD },
    update: data,
    create: { id: `cfg-${COMUNIDAD}`, comunidadId: COMUNIDAD, ...data },
  })
}

/**
 * Guarda la credencial CIFRADA, igual que `PUT /api/configuracion/correo`:
 * la clave usada para cifrar es la que se indica, y no tiene por qué ser la del
 * entorno en el momento de la prueba.
 */
async function guardarCredencial(
  puerto: number,
  opciones: { clave?: string; usuario?: string; secreto?: string } = {}
): Promise<void> {
  const paquete = cifrarSecreto(opciones.secreto ?? SECRETO_COMUNIDAD, {
    [VARIABLE_CLAVE_MAESTRA]: opciones.clave ?? CLAVE_MAESTRA,
  })
  await prisma.credencialCorreoComunidad.create({
    data: {
      id: `cred-${COMUNIDAD}`,
      comunidadId: COMUNIDAD,
      host: "127.0.0.1",
      puerto,
      usuario: opciones.usuario ?? USUARIO_COMUNIDAD,
      ...paquete,
      actualizadoPor: "test",
    },
  })
}

async function limpiar(): Promise<void> {
  const where = { comunidadId: COMUNIDAD }
  await prisma.credencialCorreoComunidad.deleteMany({ where })
  await prisma.configuracionGlobal.deleteMany({ where })
}

const mensaje = {
  to: DESTINATARIO,
  subject: "Aviso de prueba",
  text: "Cuerpo de prueba.",
}

beforeAll(async () => {
  await prisma.comunidad.upsert({
    where: { id: COMUNIDAD },
    update: {},
    create: { id: COMUNIDAD, nombre: "Comunidad CC", slug: "cc-resolucion-com" },
  })
})

beforeEach(async () => {
  fijarClaveMaestra(CLAVE_MAESTRA)
  fijarSecretoGlobal(SECRETO_GLOBAL)
  await limpiar()
})

afterEach(async () => {
  while (servidores.length > 0) await servidores.pop()?.cerrar()
  await limpiar()
})

afterAll(async () => {
  fijarClaveMaestra(clavePrevia)
  fijarSecretoGlobal(secretoPrevio)
  await limpiar()
  await prisma.comunidad.delete({ where: { id: COMUNIDAD } }).catch(() => {})
})

describe("resolverCredencialDeComunidad: devuelve la credencial o UN motivo", () => {
  it("sin fila devuelve comunidad_sin_credencial (no hay emisor por comunidad)", async () => {
    const resuelta = await resolverCredencialDeComunidad(COMUNIDAD)
    expect(resuelta).toEqual({ ok: false, motivo: "comunidad_sin_credencial" })
  })

  it("con fila y clave maestra devuelve la credencial con el secreto descifrado en memoria", async () => {
    await guardarCredencial(2525)

    const resuelta = await resolverCredencialDeComunidad(COMUNIDAD)
    expect(resuelta.ok).toBe(true)
    if (!resuelta.ok) return
    expect(resuelta.credencial).toEqual({
      host: "127.0.0.1",
      puerto: 2525,
      usuario: USUARIO_COMUNIDAD,
      secreto: SECRETO_COMUNIDAD,
    })

    // La fila guardada no contiene el texto plano en ninguna columna.
    const fila = await prisma.credencialCorreoComunidad.findUnique({
      where: { comunidadId: COMUNIDAD },
    })
    expect(fila).not.toBeNull()
    if (!fila) return
    expect(JSON.stringify(fila)).not.toContain(SECRETO_COMUNIDAD)
  })

  it("sin la clave maestra no lanza y devuelve clave_maestra_ausente", async () => {
    await guardarCredencial(2525)
    fijarClaveMaestra(undefined)

    const resuelta = await resolverCredencialDeComunidad(COMUNIDAD)
    expect(resuelta).toEqual({ ok: false, motivo: "clave_maestra_ausente" })
  })

  it("con una clave maestra que no mide 32 bytes devuelve clave_maestra_ausente", async () => {
    await guardarCredencial(2525)
    fijarClaveMaestra("clave-corta")

    const resuelta = await resolverCredencialDeComunidad(COMUNIDAD)
    expect(resuelta).toEqual({ ok: false, motivo: "clave_maestra_ausente" })
  })

  it("con el paquete cifrado con otra clave devuelve credencial_ilegible", async () => {
    await guardarCredencial(2525, { clave: OTRA_CLAVE })

    const resuelta = await resolverCredencialDeComunidad(COMUNIDAD)
    expect(resuelta).toEqual({ ok: false, motivo: "credencial_ilegible" })
  })
})

describe("precedencia: explícita > comunidad > variable global", () => {
  it("con credencial explícita NO se resuelve la de la comunidad (PRESERVE del barrido)", async () => {
    const servidorExplicito = await levantarServidor({
      usuario: USUARIO_GLOBAL,
      secreto: SECRETO_GLOBAL,
    })
    const servidorComunidad = await levantarServidorDeComunidad()
    await configurarCF(servidorExplicito.port)
    // La comunidad tiene OTRA credencial guardada: si se re-resolviera, el
    // correo saldría por este servidor y con este usuario.
    await guardarCredencial(servidorComunidad.port)

    const resultado = await enviarCorreoComunidad(COMUNIDAD, mensaje, {
      credencial: {
        host: "127.0.0.1",
        puerto: servidorExplicito.port,
        usuario: USUARIO_GLOBAL,
        secreto: SECRETO_GLOBAL,
      },
    })

    expect(resultado.estado).toBe("enviado")
    expect(servidorExplicito.autenticaciones).toEqual([
      { usuario: USUARIO_GLOBAL, secreto: SECRETO_GLOBAL },
    ])
    expect(servidorExplicito.mensajes).toHaveLength(1)
    expect(servidorComunidad.autenticaciones).toHaveLength(0)
    expect(servidorComunidad.mensajes).toHaveLength(0)
    // Sin caída al camino global no hay nada que explicar en el motivo.
    expect(motivoSMTP(resultado)).not.toContain("comunidad_sin_credencial")
  })

  it("sin credencial explícita usa la de la comunidad, no la variable global", async () => {
    const servidorGlobal = await levantarServidorGlobal()
    const servidorComunidad = await levantarServidorDeComunidad()
    await configurarCF(servidorGlobal.port)
    await guardarCredencial(servidorComunidad.port)

    const resultado = await enviarCorreoComunidad(COMUNIDAD, mensaje)

    expect(resultado.estado).toBe("enviado")
    expect(servidorComunidad.autenticaciones).toEqual([
      { usuario: USUARIO_COMUNIDAD, secreto: SECRETO_COMUNIDAD },
    ])
    expect(servidorComunidad.mensajes).toHaveLength(1)
    expect(servidorGlobal.autenticaciones).toHaveLength(0)
    expect(servidorGlobal.mensajes).toHaveLength(0)
  })
})

describe("caída al emisor global: se envía y el motivo dice por qué", () => {
  it("sin credencial guardada envía con SMTP_PASSWORD y nombra comunidad_sin_credencial", async () => {
    const servidorGlobal = await levantarServidorGlobal()
    await configurarCF(servidorGlobal.port)

    const resultado = await enviarCorreoComunidad(COMUNIDAD, mensaje)

    expect(resultado.estado).toBe("enviado")
    expect(servidorGlobal.autenticaciones).toEqual([
      { usuario: USUARIO_GLOBAL, secreto: SECRETO_GLOBAL },
    ])
    expect(servidorGlobal.mensajes).toHaveLength(1)
    expect(resultado).toMatchObject({ motivoGlobal: "comunidad_sin_credencial" })
    expect(motivoSMTP(resultado)).toContain("comunidad_sin_credencial")
    expect(motivoSMTP(resultado)).toContain("SMTP_PASSWORD")
  })

  it("sin clave maestra envía igual con el emisor global y nombra clave_maestra_ausente", async () => {
    const servidorGlobal = await levantarServidorGlobal()
    const servidorComunidad = await levantarServidorDeComunidad()
    await configurarCF(servidorGlobal.port)
    await guardarCredencial(servidorComunidad.port)
    fijarClaveMaestra(undefined)

    const resultado = await enviarCorreoComunidad(COMUNIDAD, mensaje)

    expect(resultado.estado).toBe("enviado")
    expect(servidorGlobal.autenticaciones).toEqual([
      { usuario: USUARIO_GLOBAL, secreto: SECRETO_GLOBAL },
    ])
    expect(servidorComunidad.autenticaciones).toHaveLength(0)
    expect(resultado).toMatchObject({ motivoGlobal: "clave_maestra_ausente" })
    expect(motivoSMTP(resultado)).toContain("clave_maestra_ausente")
  })

  it("con la credencial ilegible envía igual con el emisor global y nombra credencial_ilegible", async () => {
    const servidorGlobal = await levantarServidorGlobal()
    const servidorComunidad = await levantarServidorDeComunidad()
    await configurarCF(servidorGlobal.port)
    await guardarCredencial(servidorComunidad.port, { clave: OTRA_CLAVE })

    const resultado = await enviarCorreoComunidad(COMUNIDAD, mensaje)

    expect(resultado.estado).toBe("enviado")
    expect(servidorGlobal.autenticaciones).toEqual([
      { usuario: USUARIO_GLOBAL, secreto: SECRETO_GLOBAL },
    ])
    expect(servidorComunidad.autenticaciones).toHaveLength(0)
    expect(resultado).toMatchObject({ motivoGlobal: "credencial_ilegible" })
    expect(motivoSMTP(resultado)).toContain("credencial_ilegible")
  })
})

describe("aviso y documento: usan la credencial de la comunidad sin cambiar su código", () => {
  it("el aviso (planDeCanal) se autentica con la credencial de la comunidad", async () => {
    const servidorGlobal = await levantarServidorGlobal()
    const servidorComunidad = await levantarServidorDeComunidad()
    await configurarCF(servidorGlobal.port)
    await guardarCredencial(servidorComunidad.port)

    const plan = await planDeCanal("email", {
      email: { comunidadId: COMUNIDAD, destinatario: DESTINATARIO, asunto: "Aviso", cuerpo: "Cuerpo" },
    })

    expect(plan.estado).toBe("enviado")
    expect(servidorComunidad.autenticaciones).toEqual([
      { usuario: USUARIO_COMUNIDAD, secreto: SECRETO_COMUNIDAD },
    ])
    expect(servidorComunidad.mensajes).toHaveLength(1)
    expect(servidorGlobal.mensajes).toHaveLength(0)
  })

  it("el aviso sin credencial usa el emisor global y lo escribe en el motivo", async () => {
    const servidorGlobal = await levantarServidorGlobal()
    await configurarCF(servidorGlobal.port)

    const plan = await planDeCanal("email", {
      email: { comunidadId: COMUNIDAD, destinatario: DESTINATARIO, asunto: "Aviso", cuerpo: "Cuerpo" },
    })

    expect(plan.estado).toBe("enviado")
    expect(servidorGlobal.mensajes).toHaveLength(1)
    expect(String(plan.motivo)).toContain("comunidad_sin_credencial")
  })

  it("el documento (planDeEnvioDocumento) se autentica con la credencial de la comunidad", async () => {
    const servidorGlobal = await levantarServidorGlobal()
    const servidorComunidad = await levantarServidorDeComunidad()
    await configurarCF(servidorGlobal.port)
    await guardarCredencial(servidorComunidad.port)

    const plan = await planDeEnvioDocumento("email", {
      comunidadId: COMUNIDAD,
      destinatario: DESTINATARIO,
      asunto: "Documento",
      cuerpo: "Cuerpo",
    })

    expect(plan.estado).toBe("entregado")
    expect(servidorComunidad.autenticaciones).toEqual([
      { usuario: USUARIO_COMUNIDAD, secreto: SECRETO_COMUNIDAD },
    ])
    expect(servidorComunidad.mensajes).toHaveLength(1)
    expect(servidorGlobal.mensajes).toHaveLength(0)
  })

  it("el documento sin credencial usa el emisor global y lo escribe en el motivo", async () => {
    const servidorGlobal = await levantarServidorGlobal()
    await configurarCF(servidorGlobal.port)

    const plan = await planDeEnvioDocumento("email", {
      comunidadId: COMUNIDAD,
      destinatario: DESTINATARIO,
      asunto: "Documento",
      cuerpo: "Cuerpo",
    })

    expect(plan.estado).toBe("entregado")
    expect(servidorGlobal.mensajes).toHaveLength(1)
    expect(String(plan.motivo)).toContain("comunidad_sin_credencial")
  })
})
