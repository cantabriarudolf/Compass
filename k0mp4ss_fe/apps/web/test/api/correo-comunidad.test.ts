/** @vitest-environment node */
/**
 * Credencial de correo POR COMUNIDAD, cifrada en la base (F33).
 *
 * Fixture propia (comunidad, tres roles y una fila de CF) contra la base
 * descartable de la suite, y un servidor SMTP falso en memoria escuchando en
 * 127.0.0.1: ninguna conexión sale a internet y ningún secreto es real (la
 * contraseña se inventa acá).
 *
 * Lo que se prueba, y por qué:
 *
 *   1. `PUT /api/configuracion/correo` guarda el secreto CIFRADO: la fila de la
 *      base no contiene el texto plano en ninguna columna, y el paquete se abre
 *      sólo con la clave maestra del entorno (`CLAVE_MAESTRA_SECRETOS`).
 *   2. Rotar la credencial cambia el IV y el ciphertext aunque el secreto sea el
 *      mismo: la base no delata que dos guardados llevan la misma contraseña.
 *   3. La lectura NUNCA devuelve el secreto: ni el cuerpo, ni el JSON completo
 *      del PUT, ni el del envío de prueba. La prueba es directa — se serializa la
 *      respuesta y se busca el secreto, su base64 y el paquete cifrado.
 *   4. Sin clave maestra (ausente o inválida) el PUT responde 500 con un mensaje
 *      que nombra la variable y NO se escribe ninguna fila: falla cerrada, nunca
 *      cae a texto plano.
 *   5. La bitácora registra `CF_CREDENCIAL_CORREO_ACTUALIZADA` con la comunidad,
 *      el usuario y la referencia, y la descripción no lleva el valor (ni el
 *      secreto, ni su base64, ni el ciphertext, ni el IV, ni el tag).
 *   6. `POST /api/configuracion/correo/probar` envía al email del propio usuario
 *      de sesión con la credencial guardada (no con `SMTP_PASSWORD`) y devuelve
 *      el texto exacto del proveedor cuando rebota, redactado.
 *   7. El gobierno es el recurso `cf`: `ver` para leer, `editar` para guardar y
 *      para probar. El comité lee y no escribe; el residente no entra.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import { configuracionDefault } from "@/data/admin/configuracion"
import {
  VARIABLE_CLAVE_MAESTRA,
  descifrarSecreto,
} from "@/lib/cifrado-secretos"
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

const COMUNIDAD = "f33-correo-com"
const USUARIO_ADMIN = "f33-correo-admin"
const EMAIL_ADMIN = "f33-correo-admin@comunidad-f33.cl"
const USUARIO_COMITE = "f33-correo-comite"
const EMAIL_COMITE = "f33-correo-comite@comunidad-f33.cl"
const USUARIO_RESIDENTE = "f33-correo-residente"
const EMAIL_RESIDENTE = "f33-correo-residente@comunidad-f33.cl"

/** Contraseña inventada: no es una credencial, es texto de prueba. */
const SECRETO = "secreto-smtp-f33-inventado"
const USUARIO_SMTP = "buzon@comunidad-f33.cl"
const REMITENTE = "no-responder@comunidad-f33.cl"
/** 32 bytes en base64: clave maestra de prueba, no una credencial. */
const CLAVE_MAESTRA = Buffer.alloc(32, 7).toString("base64")
/** El valor que vive en el entorno global: el envío de prueba NO debe usarlo. */
const SECRETO_GLOBAL = "secreto-global-que-no-corresponde"

const secretoPrevio = process.env.SMTP_PASSWORD
const clavePrevia = process.env[VARIABLE_CLAVE_MAESTRA]
const servidores: ServidorSMTPFalso[] = []

type Json = Record<string, unknown>

const CAMPO_SOLO_LECTURA = [
  "configurada",
  "host",
  "puerto",
  "usuario",
  "actualizadoEn",
  "actualizadoPor",
] as const

function fijarClaveMaestra(valor: string | undefined): void {
  if (valor === undefined) delete process.env[VARIABLE_CLAVE_MAESTRA]
  else process.env[VARIABLE_CLAVE_MAESTRA] = valor
}

function fijarSecretoGlobal(valor: string | undefined): void {
  if (valor === undefined) delete process.env.SMTP_PASSWORD
  else process.env.SMTP_PASSWORD = valor
}

async function levantarServidor(
  opciones: Parameters<typeof iniciarServidorSMTPFalso>[0] = {}
): Promise<ServidorSMTPFalso> {
  const servidor = await iniciarServidorSMTPFalso({
    usuario: USUARIO_SMTP,
    secreto: SECRETO,
    ...opciones,
  })
  servidores.push(servidor)
  return servidor
}

/** CF de la comunidad apuntando SIEMPRE al servidor falso de 127.0.0.1. */
async function configurarCF(puerto: number): Promise<void> {
  const data = {
    ...configuracionDefault,
    smtpHost: "127.0.0.1",
    smtpPort: puerto,
    smtpUser: USUARIO_SMTP,
    smtpSecurity: "none",
    smtpFrom: REMITENTE,
    smtpFromName: "Comunidad F33",
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
  await prisma.credencialCorreoComunidad.deleteMany({ where })
  await prisma.eventoAuditoria.deleteMany({ where })
  await prisma.configuracionGlobal.deleteMany({ where })
}

async function conSesion(email: string, fn: () => Promise<void>): Promise<void> {
  const { cookieSesionAuthjs } = await import("../helpers/sesion-authjs")
  const previa = state.cookie
  const usuario = await prisma.usuario.findUnique({ where: { email } })
  if (!usuario) throw new Error(`usuario no encontrado: ${email}`)
  state.cookie = await cookieSesionAuthjs({ sub: usuario.id, email: usuario.email })
  try {
    await fn()
  } finally {
    state.cookie = previa
  }
}

async function pedir(
  metodo: "GET" | "PUT" | "POST",
  ruta: "" | "probar/",
  body?: unknown
): Promise<{ status: number; texto: string; json: Json }> {
  const modulo =
    ruta === "probar/"
      ? ((await import("@/app/api/configuracion/correo/probar/route")) as Record<
          string,
          ((req: NextRequest) => Promise<Response>) | undefined
        >)
      : ((await import("@/app/api/configuracion/correo/route")) as Record<
          string,
          ((req: NextRequest) => Promise<Response>) | undefined
        >)
  const handler = modulo[metodo]
  if (!handler) throw new Error(`handler no encontrado: ${metodo} ${ruta}`)
  const res = await handler(
    new NextRequest(`http://localhost/api/configuracion/correo/${ruta}`, {
      method: metodo,
      ...(body !== undefined
        ? { body: JSON.stringify(body), headers: { "content-type": "application/json" } }
        : {}),
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

const cuerpoCredencial = (extra: Json = {}): Json => ({
  host: "127.0.0.1",
  puerto: 2525,
  usuario: USUARIO_SMTP,
  secreto: SECRETO,
  ...extra,
})

const filaGuardada = () =>
  prisma.credencialCorreoComunidad.findUnique({ where: { comunidadId: COMUNIDAD } })

const eventos = () =>
  prisma.eventoAuditoria.findMany({
    where: { comunidadId: COMUNIDAD, tipoAccion: "CF_CREDENCIAL_CORREO_ACTUALIZADA" },
  })

beforeAll(async () => {
  process.env.AUTH_SECRET = AUTH_SECRET
  fijarClaveMaestra(CLAVE_MAESTRA)
  vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 })

  await prisma.comunidad.upsert({
    where: { id: COMUNIDAD },
    update: {},
    create: { id: COMUNIDAD, nombre: "Comunidad F33 Correo", slug: "f33-correo-com" },
  })

  const cuentas: Array<{ id: string; email: string; rol: string }> = [
    { id: USUARIO_ADMIN, email: EMAIL_ADMIN, rol: "administrador" },
    { id: USUARIO_COMITE, email: EMAIL_COMITE, rol: "comite" },
    { id: USUARIO_RESIDENTE, email: EMAIL_RESIDENTE, rol: "residente" },
  ]
  for (const cuenta of cuentas) {
    await prisma.usuario.upsert({
      where: { email: cuenta.email },
      update: { activo: true },
      create: { id: cuenta.id, email: cuenta.email, activo: true },
    })
    await prisma.membresia.deleteMany({
      where: { usuarioId: cuenta.id, comunidadId: COMUNIDAD },
    })
    await prisma.membresia.create({
      data: { usuarioId: cuenta.id, comunidadId: COMUNIDAD, rol: cuenta.rol },
    })
  }

  const { cookieSesionAuthjs } = await import("../helpers/sesion-authjs")
  state.cookie = await cookieSesionAuthjs({ sub: USUARIO_ADMIN, email: EMAIL_ADMIN })
}, 120_000)

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
  while (servidores.length > 0) await servidores.pop()?.cerrar()
  await limpiar()
  fijarClaveMaestra(clavePrevia)
  fijarSecretoGlobal(secretoPrevio)
})

describe("lectura: configurada / no configurada, sin el secreto", () => {
  it("sin credencial guardada devuelve configurada=false y ningún dato del emisor", async () => {
    const { status, json } = await pedir("GET", "")
    expect(status).toBe(200)
    expect(json).toEqual({
      configurada: false,
      host: null,
      puerto: null,
      usuario: null,
      actualizadoEn: null,
      actualizadoPor: null,
    })
    expect(JSON.stringify(json)).not.toContain(SECRETO)
  })

  it("PRESERVE: el comité lee (cf ver) y recibe el mismo contrato sin secreto", async () => {
    await pedir("PUT", "", cuerpoCredencial())
    await conSesion(EMAIL_COMITE, async () => {
      const { status, texto, json } = await pedir("GET", "")
      expect(status).toBe(200)
      expect(json.configurada).toBe(true)
      expect(json.usuario).toBe(USUARIO_SMTP)
      expect(texto).not.toContain(SECRETO)
    })
  })

  it("el residente no lee la configuración de correo (403)", async () => {
    await conSesion(EMAIL_RESIDENTE, async () => {
      const { status, json } = await pedir("GET", "")
      expect(status).toBe(403)
      expect(json.error).toBe("Permiso denegado.")
    })
  })
})

describe("guardado: el secreto queda cifrado y nunca vuelve", () => {
  it("guarda el paquete cifrado: ni el ciphertext ni ninguna columna contienen el secreto", async () => {
    const { status, texto, json } = await pedir("PUT", "", cuerpoCredencial())

    expect(status).toBe(201)
    expect(texto).not.toContain(SECRETO)
    expect(JSON.stringify(json)).not.toContain(SECRETO)
    expect(Object.keys(json).sort()).toEqual([...CAMPO_SOLO_LECTURA].sort())
    expect(json.configurada).toBe(true)
    expect(json.host).toBe("127.0.0.1")
    expect(json.puerto).toBe(2525)
    expect(json.usuario).toBe(USUARIO_SMTP)
    expect(json.actualizadoPor).toBe(USUARIO_ADMIN)
    expect(typeof json.actualizadoEn).toBe("string")

    const fila = await filaGuardada()
    expect(fila).not.toBeNull()
    if (!fila) return
    expect(fila.secretoCifrado).not.toBe(SECRETO)
    expect(fila.secretoCifrado).not.toContain(SECRETO)
    expect(fila.iv).not.toContain(SECRETO)
    expect(fila.authTag).not.toContain(SECRETO)
    expect(fila.usuario).toBe(USUARIO_SMTP)
    expect(fila.version).toBe(1)
    expect(fila.actualizadoPor).toBe(USUARIO_ADMIN)
    expect(fila.iv.length).toBeGreaterThan(0)
    expect(fila.authTag.length).toBeGreaterThan(0)

    // La única forma de recuperar el valor es con la clave maestra del entorno.
    expect(
      descifrarSecreto(
        {
          secretoCifrado: fila.secretoCifrado,
          iv: fila.iv,
          authTag: fila.authTag,
        },
        { [VARIABLE_CLAVE_MAESTRA]: CLAVE_MAESTRA }
      )
    ).toBe(SECRETO)
  })

  it("una segunda carga rota el IV y el ciphertext, y sigue habiendo UNA fila", async () => {
    await pedir("PUT", "", cuerpoCredencial())
    const primera = await filaGuardada()
    const { status } = await pedir("PUT", "", cuerpoCredencial())
    const segunda = await filaGuardada()

    expect(status).toBe(200)
    expect(primera).not.toBeNull()
    expect(segunda).not.toBeNull()
    if (!primera || !segunda) return
    expect(segunda.id).toBe(primera.id)
    expect(segunda.iv).not.toBe(primera.iv)
    expect(segunda.secretoCifrado).not.toBe(primera.secretoCifrado)
    expect(
      descifrarSecreto(
        { secretoCifrado: segunda.secretoCifrado, iv: segunda.iv, authTag: segunda.authTag },
        { [VARIABLE_CLAVE_MAESTRA]: CLAVE_MAESTRA }
      )
    ).toBe(SECRETO)
    expect(
      await prisma.credencialCorreoComunidad.count({ where: { comunidadId: COMUNIDAD } })
    ).toBe(1)
  })

  it("cambiar el secreto cambia lo que se puede descifrar", async () => {
    await pedir("PUT", "", cuerpoCredencial())
    const otro = "otra-clave-smtp-inventada"
    await pedir("PUT", "", cuerpoCredencial({ secreto: otro }))
    const fila = await filaGuardada()
    expect(fila).not.toBeNull()
    if (!fila) return
    const descifrado = descifrarSecreto(
      { secretoCifrado: fila.secretoCifrado, iv: fila.iv, authTag: fila.authTag },
      { [VARIABLE_CLAVE_MAESTRA]: CLAVE_MAESTRA }
    )
    expect(descifrado).toBe(otro)
    expect(descifrado).not.toBe(SECRETO)
  })

  it("el cuerpo inválido responde 400, no escribe fila y no audita la carga", async () => {
    for (const invalido of [
      cuerpoCredencial({ usuario: "" }),
      cuerpoCredencial({ puerto: 0 }),
      cuerpoCredencial({ secreto: "   " }),
      { host: "127.0.0.1" },
    ]) {
      const { status, json } = await pedir("PUT", "", invalido)
      expect(status).toBe(400)
      expect(json.error).toBe("Datos inválidos.")
    }
    expect(await filaGuardada()).toBeNull()
    expect(await eventos()).toHaveLength(0)
  })

  it("el residente no guarda la credencial (403) y no se escribe fila", async () => {
    await conSesion(EMAIL_RESIDENTE, async () => {
      const { status, json } = await pedir("PUT", "", cuerpoCredencial())
      expect(status).toBe(403)
      expect(json.error).toBe("Permiso denegado.")
    })
    expect(await filaGuardada()).toBeNull()
  })

  it("PRESERVE: el comité lee pero no guarda (cf editar es de la administración)", async () => {
    await conSesion(EMAIL_COMITE, async () => {
      const { status } = await pedir("PUT", "", cuerpoCredencial())
      expect(status).toBe(403)
    })
    expect(await filaGuardada()).toBeNull()
  })
})

describe("fail-closed sin clave maestra", () => {
  it("sin la variable el PUT responde 500 nombrando la variable y no escribe fila", async () => {
    fijarClaveMaestra(undefined)
    const { status, json } = await pedir("PUT", "", cuerpoCredencial())
    expect(status).toBe(500)
    expect(String(json.error)).toContain(VARIABLE_CLAVE_MAESTRA)
    expect(JSON.stringify(json)).not.toContain(SECRETO)
    expect(await filaGuardada()).toBeNull()
    expect(await eventos()).toHaveLength(0)
  })

  it("con una clave de longitud inválida el PUT responde 500 y no escribe fila", async () => {
    fijarClaveMaestra("clave-corta")
    const { status, json } = await pedir("PUT", "", cuerpoCredencial())
    expect(status).toBe(500)
    expect(String(json.error)).toContain(VARIABLE_CLAVE_MAESTRA)
    expect(await filaGuardada()).toBeNull()
  })
})

describe("auditoría: el cambio queda registrado sin el valor", () => {
  it("registra CF_CREDENCIAL_CORREO_ACTUALIZADA con comunidad, usuario y referencia, sin el secreto", async () => {
    await pedir("PUT", "", cuerpoCredencial())
    const fila = await filaGuardada()
    const registrados = await eventos()

    expect(registrados).toHaveLength(1)
    const evento = registrados[0]
    expect(evento).toBeDefined()
    if (!evento || !fila) return
    expect(evento.usuario).toBe(USUARIO_ADMIN)
    expect(evento.categoria).toBe("CF")
    expect(evento.referenciaId).toBe(fila.id)
    expect(evento.descripcion.length).toBeGreaterThan(0)

    for (const prohibido of [
      SECRETO,
      Buffer.from(SECRETO, "utf8").toString("base64"),
      fila.secretoCifrado,
      fila.iv,
      fila.authTag,
    ]) {
      expect(evento.descripcion).not.toContain(prohibido)
    }
  })

  it("la rotación deja un segundo evento y tampoco lleva el valor", async () => {
    await pedir("PUT", "", cuerpoCredencial())
    await pedir("PUT", "", cuerpoCredencial())
    const registrados = await eventos()
    expect(registrados).toHaveLength(2)
    for (const evento of registrados) {
      expect(evento.descripcion).not.toContain(SECRETO)
      expect(evento.descripcion).not.toContain(Buffer.from(SECRETO, "utf8").toString("base64"))
    }
  })
})

describe("envío de prueba: usa la credencial guardada y dice el error exacto", () => {
  it("envía al email del propio usuario de sesión con la credencial de la comunidad", async () => {
    const servidor = await levantarServidor()
    await configurarCF(servidor.port)
    await pedir("PUT", "", cuerpoCredencial({ puerto: servidor.port }))

    const { status, texto, json } = await pedir("POST", "probar/")

    expect(status).toBe(200)
    expect(json.enviado).toBe(true)
    expect(typeof json.messageId).toBe("string")
    expect(texto).not.toContain(SECRETO)

    expect(servidor.mensajes).toHaveLength(1)
    const mensaje = servidor.mensajes[0]
    expect(mensaje?.to).toEqual([EMAIL_ADMIN])
    expect(mensaje?.from).toBe(REMITENTE)
    expect(mensaje?.crudo).toContain("correo de prueba")

    // La autenticación usa el secreto de la BASE, no la SMTP_PASSWORD global.
    expect(servidor.autenticaciones).toHaveLength(1)
    expect(servidor.autenticaciones[0]).toEqual({
      usuario: USUARIO_SMTP,
      secreto: SECRETO,
    })
    expect(servidor.autenticaciones[0]?.secreto).not.toBe(SECRETO_GLOBAL)
  })

  it("si el proveedor rechaza, devuelve su texto exacto y sin el secreto", async () => {
    const servidor = await levantarServidor({ modo: "rechazar_auth" })
    await configurarCF(servidor.port)
    await pedir("PUT", "", cuerpoCredencial({ puerto: servidor.port }))

    const { status, texto, json } = await pedir("POST", "probar/")

    expect(status).toBe(200)
    expect(json.enviado).toBe(false)
    const motivo = String(json.motivo)
    // El texto del proveedor, tal como lo respondió (código y detalle).
    expect(motivo).toContain("535 5.7.8 Autenticación rechazada: credenciales inválidas")
    expect(texto).not.toContain(SECRETO)
    expect(texto).not.toContain(Buffer.from(SECRETO, "utf8").toString("base64"))
  })

  it("sin credencial guardada no abre ninguna conexión y dice por qué", async () => {
    const servidor = await levantarServidor()
    await configurarCF(servidor.port)

    const { status, json } = await pedir("POST", "probar/")

    expect(status).toBe(200)
    expect(json.enviado).toBe(false)
    expect(String(json.motivo)).toContain("credencial de correo")
    expect(servidor.mensajes).toHaveLength(0)
    expect(servidor.autenticaciones).toHaveLength(0)
  })

  it("sin clave maestra el envío de prueba se rechaza sin abrir conexión", async () => {
    const servidor = await levantarServidor()
    await configurarCF(servidor.port)
    await pedir("PUT", "", cuerpoCredencial({ puerto: servidor.port }))
    fijarClaveMaestra(undefined)

    const { status, json } = await pedir("POST", "probar/")

    expect(status).toBe(500)
    expect(String(json.error)).toContain(VARIABLE_CLAVE_MAESTRA)
    expect(servidor.mensajes).toHaveLength(0)
    expect(servidor.autenticaciones).toHaveLength(0)
  })

  it("el residente no puede probar el envío (403)", async () => {
    await conSesion(EMAIL_RESIDENTE, async () => {
      const { status } = await pedir("POST", "probar/")
      expect(status).toBe(403)
    })
  })

  it("PRESERVE: el comité no puede probar el envío (cf editar es de la administración)", async () => {
    await conSesion(EMAIL_COMITE, async () => {
      const { status } = await pedir("POST", "probar/")
      expect(status).toBe(403)
    })
  })
})
