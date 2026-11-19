/** @vitest-environment node */
/**
 * F43 · T3 — el correo de bienvenida disparado por el alta y por el reenvío
 * (S1, S4, S5, S6). Base SQLite real + servidor SMTP falso en memoria en
 * 127.0.0.1: ninguna conexión sale a internet y ninguna credencial real entra
 * en el test.
 *
 * Qué fija este archivo (la constancia no miente y el enlace nunca queda
 * huérfano):
 *
 *   1. Con emisor configurado y el servidor aceptando el mensaje, la invitación
 *      queda `enviado` (nunca `entregado`, que es del visor), con el id del
 *      servidor en el motivo y con la fecha del envío, y la respuesta al
 *      administrador sigue trayendo el enlace.
 *   2. Sin emisor configurado la cuenta queda creada y la invitación `pendiente`
 *      con `MOTIVO_SIN_SMTP`: no se abre ninguna conexión —el servidor de prueba
 *      no ve autenticaciones ni mensajes— y la respuesta trae el enlace.
 *   3. Si el servidor lee el cuerpo y lo rechaza, la constancia es `fallido` con
 *      el motivo del servidor, la cuenta y la invitación siguen creadas y el
 *      enlace sigue en la respuesta: el correo es un atajo, no la única puerta.
 *   4. El reenvío emite una invitación NUEVA con su propia constancia y no toca
 *      la de la anterior: la cadena de invitaciones es el historial de envíos.
 *   5. El token en claro no queda en la constancia, ni en el motivo, ni en la
 *      auditoría, ni en el listado.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import { configuracionDefault } from "@/data/admin/configuracion"
import { MOTIVO_SIN_SMTP } from "@/lib/entrega-aviso"
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
/** Contraseña inventada del emisor de prueba: no es una credencial real. */
const CLAVE_FALSA = "clave-inventada-solo-para-tests"
/** Usuario que el servidor SMTP falso acepta (CF debe usar el mismo). */
const USUARIO_SMTP = "emisor@ejemplo.test"

const SFX = Date.now().toString(36)
const comunidadConEmisor = `f43-con-${SFX}`
const comunidadSinEmisor = `f43-sin-${SFX}`
const emailAdmin = `f43-admin-${SFX}@test.cl`

const servidores: ServidorSMTPFalso[] = []
const secretoPrevio = process.env.SMTP_PASSWORD

function fijarSecreto(valor: string | undefined): void {
  if (valor === undefined) delete process.env.SMTP_PASSWORD
  else process.env.SMTP_PASSWORD = valor
}

async function levantarServidor(
  opciones: Parameters<typeof iniciarServidorSMTPFalso>[0] = {}
): Promise<ServidorSMTPFalso> {
  const servidor = await iniciarServidorSMTPFalso({
    secreto: CLAVE_FALSA,
    ...opciones,
  })
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
    smtpFromName: "Comunidad F43 de prueba",
    smtpBcc: null,
    smtpRecepcion: null,
  }
  await prisma.configuracionGlobal.upsert({
    where: { comunidadId: comunidadConEmisor },
    update: data,
    create: { id: `cfg-${comunidadConEmisor}`, comunidadId: comunidadConEmisor, ...data },
  })
}

async function crearPersona(
  id: string,
  comunidadId: string,
  email: string
): Promise<void> {
  await prisma.persona.upsert({
    where: { id },
    update: {},
    create: {
      id,
      comunidadId,
      rut: `22.222.222-${id.slice(-1)}`,
      nombreCompleto: `Persona ${id}`,
      nombres: "Persona",
      apellidos: id,
      email,
      telefonoMovil: "+56911111111",
      estadoCuenta: "activa",
      condicionesEspecialesIds: [],
      roles: [],
    },
  })
}

async function conSesion<T>(fn: () => Promise<T>): Promise<T> {
  const usuario = await prisma.usuario.findUnique({ where: { email: emailAdmin } })
  if (!usuario) throw new Error("fixture: administrador no sembrado")
  const { cookieSesionAuthjs } = await import("../helpers/sesion-authjs")
  state.cookie = await cookieSesionAuthjs({ sub: usuario.id, email: usuario.email })
  try {
    return await fn()
  } finally {
    state.cookie = ""
  }
}

function requestJson(url: string, body: unknown): NextRequest {
  return new NextRequest(url, {
    method: "POST",
    body: JSON.stringify(body),
    headers: {
      "content-type": "application/json",
      "x-forwarded-proto": "http",
      ...(state.cookie ? { cookie: state.cookie } : {}),
    },
  })
}

/** POST /api/admin/usuarios (el alta), acotado a la comunidad pedida. */
async function alta(
  comunidadId: string,
  body: unknown
): Promise<Response> {
  const { POST } = await import("@/app/api/admin/usuarios/route")
  return POST(
    requestJson(
      `http://localhost/api/admin/usuarios?comunidadId=${encodeURIComponent(comunidadId)}`,
      body
    )
  )
}

/** POST /api/admin/usuarios/invitacion (el reenvío). */
async function reenviar(comunidadId: string, body: unknown): Promise<Response> {
  const { POST } = await import("@/app/api/admin/usuarios/invitacion/route")
  return POST(
    requestJson(
      `http://localhost/api/admin/usuarios/invitacion?comunidadId=${encodeURIComponent(comunidadId)}`,
      body
    )
  )
}

/** GET /api/admin/usuarios?comunidadId=… (el listado que alimenta la pantalla). */
async function listar(comunidadId: string): Promise<Response> {
  const { GET } = await import("@/app/api/admin/usuarios/route")
  return GET(
    new NextRequest(
      `http://localhost/api/admin/usuarios?comunidadId=${encodeURIComponent(comunidadId)}`,
      {
        headers: {
          "x-forwarded-proto": "http",
          ...(state.cookie ? { cookie: state.cookie } : {}),
        },
      }
    )
  )
}

/** Token en claro del enlace que revela una escritura (`/invitacion?token=…`). */
function tokenDe(enlace: string): string {
  return new URL(enlace).searchParams.get("token") ?? ""
}

async function usuarioPorEmail(email: string) {
  const usuario = await prisma.usuario.findUnique({ where: { email } })
  if (!usuario) throw new Error(`fixture: la cuenta ${email} no se creó`)
  return usuario
}

/** La última invitación emitida para la cuenta (el alta o el reenvío). */
async function ultimaInvitacion(usuarioId: string) {
  const fila = await prisma.invitacionAcceso.findFirst({
    where: { usuarioId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  })
  if (!fila) throw new Error("fixture: la invitación no se creó")
  return fila
}

type EnvioPublico = {
  estado: string
  motivo: string | null
  enviadoEn: string | null
} | null

type Listado = {
  membresias: Array<{
    usuario: { email: string }
    invitacion: { envio: EnvioPublico } | null
  }>
}

describe("F43 T3 — correo de bienvenida en el alta y en el reenvío", () => {
  beforeAll(async () => {
    process.env.AUTH_SECRET = AUTH_SECRET
    process.env.NEXT_PUBLIC_APP_ENV = "development"

    for (const c of [
      { id: comunidadConEmisor, nombre: "Comunidad F43 con emisor", slug: `f43-con-${SFX}` },
      { id: comunidadSinEmisor, nombre: "Comunidad F43 sin emisor", slug: `f43-sin-${SFX}` },
    ]) {
      await prisma.comunidad.upsert({ where: { id: c.id }, update: {}, create: c })
    }

    await prisma.usuario.upsert({
      where: { email: emailAdmin },
      update: { activo: true },
      create: { id: `f43-admin-${SFX}`, email: emailAdmin, activo: true },
    })
    const admin = await prisma.usuario.findUnique({ where: { email: emailAdmin } })
    if (!admin) throw new Error("fixture: administrador no creado")
    for (const cid of [comunidadConEmisor, comunidadSinEmisor]) {
      await prisma.membresia.upsert({
        where: { usuarioId_comunidadId: { usuarioId: admin.id, comunidadId: cid } },
        update: { rol: "administrador" },
        create: { usuarioId: admin.id, comunidadId: cid, rol: "administrador" },
      })
    }

    await import("@/app/api/admin/usuarios/route")
    await import("@/app/api/admin/usuarios/invitacion/route")
  }, 60_000)

  beforeEach(async () => {
    state.cookie = ""
    fijarSecreto(undefined)
    await prisma.configuracionGlobal.deleteMany({
      where: { comunidadId: { in: [comunidadConEmisor, comunidadSinEmisor] } },
    })
    await prisma.credencialCorreoComunidad.deleteMany({
      where: { comunidadId: { in: [comunidadConEmisor, comunidadSinEmisor] } },
    })
    await prisma.eventoAuditoria.deleteMany({
      where: { comunidadId: { in: [comunidadConEmisor, comunidadSinEmisor] } },
    })
  })

  afterEach(async () => {
    while (servidores.length > 0) await servidores.pop()?.cerrar()
  })

  afterAll(async () => {
    fijarSecreto(secretoPrevio)
    delete process.env.NEXT_PUBLIC_APP_ENV
    try {
      await prisma.configuracionGlobal.deleteMany({
        where: { comunidadId: { in: [comunidadConEmisor, comunidadSinEmisor] } },
      })
      await prisma.credencialCorreoComunidad.deleteMany({
        where: { comunidadId: { in: [comunidadConEmisor, comunidadSinEmisor] } },
      })
      await prisma.usuario.deleteMany({ where: { email: { endsWith: `-${SFX}@test.cl` } } })
      await prisma.usuario.deleteMany({ where: { email: emailAdmin } })
      await prisma.persona.deleteMany({
        where: { comunidadId: { in: [comunidadConEmisor, comunidadSinEmisor] } },
      })
      await prisma.comunidad.deleteMany({
        where: { id: { in: [comunidadConEmisor, comunidadSinEmisor] } },
      })
    } catch {
      // limpieza best-effort: la base de la suite es descartable
    }
  })

  it("envío aceptado: la constancia es enviado y la respuesta sigue trayendo el enlace", async () => {
    const servidor = await levantarServidor({ modo: "aceptar" })
    await configurarSMTP(servidor.port)
    fijarSecreto(CLAVE_FALSA)

    const email = `f43-enviado-${SFX}@test.cl`
    const personaId = `f43-persona-enviado-${SFX}`
    await crearPersona(personaId, comunidadConEmisor, email)

    const res = await conSesion(() =>
      alta(comunidadConEmisor, { personaId, rol: "residente" })
    )
    expect(res.status).toBe(201)
    const cuerpo = (await res.json()) as {
      enlace: string
      usuario: { email: string }
      invitacion: { estado: string }
    }
    expect(new URL(cuerpo.enlace).pathname).toBe("/invitacion")
    const token = tokenDe(cuerpo.enlace)
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(cuerpo.invitacion.estado).toBe("pendiente")

    const usuario = await usuarioPorEmail(email)
    const invitacion = await ultimaInvitacion(usuario.id)
    expect(invitacion.envioEstado).toBe("enviado")
    expect(String(invitacion.envioMotivo)).toMatch(/aceptado por el servidor SMTP/i)
    expect(invitacion.envioEn).not.toBeNull()

    // El mensaje REAL que salió: destinatario, asunto, rol, viñetas y enlace.
    expect(servidor.mensajes).toHaveLength(1)
    const recibido = servidor.mensajes[0]!
    expect(recibido.to).toEqual([email])
    expect(recibido.crudo).toContain("Subject: Tu acceso a Comunidad F43 con emisor en Compass")
    expect(recibido.crudo).toContain("Tu rol es residente.")
    expect(recibido.crudo).toContain("- Ver los avisos de cobro de tus unidades.")
    expect(recibido.crudo).toContain(cuerpo.enlace)
    expect(recibido.crudo).not.toContain(CLAVE_FALSA)

    // La constancia no lleva el token; la lectura expone la constancia sin él.
    expect(JSON.stringify(invitacion)).not.toContain(token)
    const listado = await conSesion(() => listar(comunidadConEmisor))
    const texto = await listado.text()
    expect(texto).not.toContain(token)
    const json = JSON.parse(texto) as Listado
    const fila = json.membresias.find((m) => m.usuario.email === email)
    expect(fila?.invitacion?.envio).toEqual({
      estado: "enviado",
      motivo: String(invitacion.envioMotivo),
      enviadoEn: invitacion.envioEn!.toISOString(),
    })
  })

  it("comunidad sin emisor: la constancia queda pendiente con MOTIVO_SIN_SMTP, sin conexión y con el enlace", async () => {
    // El servidor escucha, pero la comunidad no tiene CF: no hay host ni puerto
    // que abrir. Que no reciba nada es la prueba de que no se fingió el envío.
    const servidor = await levantarServidor({ modo: "aceptar" })
    fijarSecreto(undefined)

    const email = `f43-pendiente-${SFX}@test.cl`
    const personaId = `f43-persona-pendiente-${SFX}`
    await crearPersona(personaId, comunidadSinEmisor, email)

    const res = await conSesion(() =>
      alta(comunidadSinEmisor, { personaId, rol: "comite" })
    )
    expect(res.status).toBe(201)
    const cuerpo = (await res.json()) as { enlace: string }
    expect(String(cuerpo.enlace)).toContain("/invitacion?token=")
    const token = tokenDe(cuerpo.enlace)

    const usuario = await usuarioPorEmail(email)
    expect(usuario.passwordHash).toBeNull()
    const invitacion = await ultimaInvitacion(usuario.id)
    expect(invitacion.envioEstado).toBe("pendiente")
    expect(invitacion.envioMotivo).toBe(MOTIVO_SIN_SMTP)
    expect(invitacion.envioEn).toBeNull()
    expect(servidor.mensajes).toHaveLength(0)
    expect(servidor.autenticaciones).toHaveLength(0)

    const listado = await conSesion(() => listar(comunidadSinEmisor))
    const texto = await listado.text()
    expect(texto).not.toContain(token)
    const fila = (JSON.parse(texto) as Listado).membresias.find(
      (m) => m.usuario.email === email
    )
    expect(fila?.invitacion?.envio).toEqual({
      estado: "pendiente",
      motivo: MOTIVO_SIN_SMTP,
      enviadoEn: null,
    })
  })

  it("rebotado: la constancia es fallido con el motivo del servidor, la cuenta queda creada y el enlace sigue en la respuesta", async () => {
    const servidor = await levantarServidor({ modo: "rechazar_mensaje" })
    await configurarSMTP(servidor.port)
    fijarSecreto(CLAVE_FALSA)

    const email = `f43-rebotado-${SFX}@test.cl`
    const personaId = `f43-persona-rebotado-${SFX}`
    await crearPersona(personaId, comunidadConEmisor, email)

    const res = await conSesion(() =>
      alta(comunidadConEmisor, { personaId, rol: "conserjeria" })
    )
    expect(res.status).toBe(201)
    const cuerpo = (await res.json()) as { enlace: string }
    expect(new URL(cuerpo.enlace).pathname).toBe("/invitacion")
    const token = tokenDe(cuerpo.enlace)

    const usuario = await usuarioPorEmail(email)
    expect(usuario.passwordHash).toBeNull()
    expect(
      await prisma.invitacionAcceso.count({ where: { usuarioId: usuario.id } })
    ).toBe(1)

    const invitacion = await ultimaInvitacion(usuario.id)
    expect(invitacion.envioEstado).toBe("fallido")
    // El motivo es el del servidor, no un texto inventado por la plataforma.
    expect(String(invitacion.envioMotivo)).toContain("Mensaje rechazado por política")
    expect(invitacion.envioEn).toBeNull()
    expect(String(invitacion.envioMotivo)).not.toContain(token)
    // El servidor leyó el cuerpo y lo rechazó: no hay mensaje aceptado.
    expect(servidor.mensajes).toHaveLength(0)
  })

  it("el reenvío registra un envío nuevo y no pisa la constancia de la anterior", async () => {
    const servidor = await levantarServidor({ modo: "aceptar" })
    await configurarSMTP(servidor.port)
    fijarSecreto(CLAVE_FALSA)

    const email = `f43-reenvio-${SFX}@test.cl`
    const personaId = `f43-persona-reenvio-${SFX}`
    await crearPersona(personaId, comunidadConEmisor, email)

    const altaRes = await conSesion(() =>
      alta(comunidadConEmisor, { personaId, rol: "mantencion" })
    )
    expect(altaRes.status).toBe(201)
    const altaCuerpo = (await altaRes.json()) as { enlace: string }
    const tokenAlta = tokenDe(altaCuerpo.enlace)
    const usuario = await usuarioPorEmail(email)
    const primera = await ultimaInvitacion(usuario.id)
    const fotoDeLaPrimera = {
      id: primera.id,
      envioEstado: primera.envioEstado,
      envioMotivo: primera.envioMotivo,
      envioEn: primera.envioEn?.getTime() ?? null,
    }
    expect(fotoDeLaPrimera.envioEstado).toBe("enviado")

    // Dos `createdAt` distintos: la constancia y el orden del listado son por fila.
    await new Promise((resolver) => setTimeout(resolver, 10))

    const reenvioRes = await conSesion(() =>
      reenviar(comunidadConEmisor, { usuarioId: usuario.id })
    )
    expect(reenvioRes.status).toBe(201)
    const reenvioCuerpo = (await reenvioRes.json()) as {
      enlace: string
      invitacion: { id: string }
    }
    const tokenReenvio = tokenDe(reenvioCuerpo.enlace)
    expect(tokenReenvio).not.toBe(tokenAlta)
    expect(reenvioCuerpo.invitacion.id).not.toBe(fotoDeLaPrimera.id)

    const filas = await prisma.invitacionAcceso.findMany({
      where: { usuarioId: usuario.id },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    })
    expect(filas).toHaveLength(2)
    const [vieja, nueva] = filas
    expect(vieja!.id).toBe(fotoDeLaPrimera.id)
    // La constancia de la anterior no se modificó ni se borró.
    expect(vieja!.envioEstado).toBe(fotoDeLaPrimera.envioEstado)
    expect(vieja!.envioMotivo).toBe(fotoDeLaPrimera.envioMotivo)
    expect(vieja!.envioEn?.getTime() ?? null).toBe(fotoDeLaPrimera.envioEn)
    // La anterior deja de servir en el mismo acto (F42), con su rastro intacto.
    expect(vieja!.expiraEn.getTime()).toBeLessThanOrEqual(Date.now())

    // La nueva tiene su propia constancia y su propio enlace en el mensaje.
    expect(nueva!.envioEstado).toBe("enviado")
    expect(String(nueva!.envioMotivo)).toMatch(/aceptado por el servidor SMTP/i)
    expect(nueva!.envioEn).not.toBeNull()
    expect(servidor.mensajes).toHaveLength(2)
    expect(servidor.mensajes[1]!.crudo).toContain(reenvioCuerpo.enlace)
    expect(servidor.mensajes[0]!.crudo).not.toContain(reenvioCuerpo.enlace)

    const texto = await (await conSesion(() => listar(comunidadConEmisor))).text()
    expect(texto).not.toContain(tokenAlta)
    expect(texto).not.toContain(tokenReenvio)
    const fila = (JSON.parse(texto) as Listado).membresias.find(
      (m) => m.usuario.email === email
    )
    expect(fila?.invitacion?.envio?.estado).toBe("enviado")
  })

  it("el token en claro no queda escrito en la constancia, el motivo ni la auditoría", async () => {
    const servidor = await levantarServidor({ modo: "rechazar_mensaje" })
    await configurarSMTP(servidor.port)
    fijarSecreto(CLAVE_FALSA)

    const email = `f43-secreto-${SFX}@test.cl`
    const personaId = `f43-persona-secreto-${SFX}`
    await crearPersona(personaId, comunidadConEmisor, email)

    const res = await conSesion(() =>
      alta(comunidadConEmisor, { personaId, rol: "administrador" })
    )
    expect(res.status).toBe(201)
    const cuerpo = (await res.json()) as { enlace: string }
    const token = tokenDe(cuerpo.enlace)
    expect(token).not.toBe("")

    const usuario = await usuarioPorEmail(email)
    const invitacion = await ultimaInvitacion(usuario.id)
    // El motivo existe (el servidor rebotó) y no lleva el secreto ni su forma.
    expect(invitacion.envioMotivo).not.toBeNull()
    expect(JSON.stringify(invitacion)).not.toContain(token)
    expect(String(invitacion.envioMotivo)).not.toContain("token=")
    expect(String(invitacion.envioMotivo)).not.toContain("/invitacion?")

    const eventos = await prisma.eventoAuditoria.findMany({
      where: { comunidadId: comunidadConEmisor },
    })
    expect(eventos.length).toBeGreaterThan(0)
    expect(JSON.stringify(eventos)).not.toContain(token)

    const texto = await (await conSesion(() => listar(comunidadConEmisor))).text()
    expect(texto).not.toContain(token)
    expect(texto.toLowerCase()).not.toContain("token")
  })
})
