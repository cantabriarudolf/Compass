// @vitest-environment node
/**
 * CO — el correo del envío masivo sale por una cola de salida (S2/S3/S4/S5/S6).
 *
 * Lo que fija este archivo:
 *
 *   1. el alta masiva (`POST /api/co/envios`) sigue creando el envío y sus filas
 *      de destinatarios como hoy, y ADEMÁS encola una fila de correo por
 *      destinatario con el asunto y el cuerpo del mensaje — sin duplicar cuando
 *      el mismo envío se vuelve a mandar;
 *   2. el drenaje con la credencial de la comunidad y el servidor de prueba
 *      aceptando deja `enviado`, con el id que devolvió el servidor y sin perder
 *      de vista que la credencial usada es la de la comunidad (no la global);
 *   3. sin emisor configurado la fila queda `pendiente` con `MOTIVO_SIN_SMTP` y
 *      NO se abre ninguna conexión: el contador TCP escucha en la dirección de
 *      CF y no recibe un solo socket;
 *   4. si el servidor rechaza el mensaje, la fila queda `fallido` con el motivo
 *      del servidor —nunca `pendiente`, nunca `enviado`, nunca `entregado`—;
 *   5. el lote es acotado: pedir 100 con tope 50 toma 50 y deja el saldo dicho;
 *   6. la ruta es administrativa: 401 sin sesión, 403 con un rol sin la clave
 *      del envío masivo, y 404 cuando el envío es de otra comunidad;
 *   7. el cron de Vercel drena por `GET` con `Authorization: Bearer
 *      <CRON_SECRET>` (`S3`), sin sesión; sin el secreto correcto —o sin la
 *      variable en el entorno— responde 401 y no toca ni una fila, y el `POST`
 *      manual y la métrica de la sesión conservan su contrato.
 *
 * El servidor SMTP es el falso en memoria de `test/lib/servidor-smtp-falso.ts`
 * (el mismo de F29/F43): escucha en `127.0.0.1` efímero y no abre conexiones.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { createServer, type Server, type Socket } from "node:net"
import { readFileSync } from "node:fs"
import path from "node:path"
import { prisma } from "@/lib/prisma"
import { configuracionDefault } from "@/data/admin/configuracion"
import { VARIABLE_CLAVE_MAESTRA, cifrarSecreto } from "@/lib/cifrado-secretos"
import { MOTIVO_SIN_SMTP } from "@/lib/entrega-aviso"
import { MAX_INTENTOS_COLA_SALIDA_CO, MOTIVO_PUENTE_FALLO } from "@/lib/co-cola"
import { cookieDeUsuario, cuerpoJson, invocarApi } from "../helpers/api-sesion"
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

/**
 * El puente lanza cuando el test lo pide (R3-004).
 *
 * `entregarPorCorreo` no debería lanzar (S6), pero SÍ puede: la constancia no se
 * pudo escribir DESPUÉS de que el servidor aceptó el mensaje, o la resolución de
 * la dirección falló. Este doble delega en el puente real salvo cuando
 * `fallosPendientes > 0`, así el resto del archivo mide el camino real y sólo el
 * test del puente que lanza lo fuerza. El defecto que se fija es del LLAMADOR:
 * qué hace el drenaje cuando el puente lanza.
 */
const puente = vi.hoisted(() => ({ fallosPendientes: 0 }))
vi.mock("@/lib/entrega/notificar", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/entrega/notificar")>()
  return {
    ...real,
    entregarPorCorreo: async (
      ...args: Parameters<typeof real.entregarPorCorreo>
    ): Promise<Awaited<ReturnType<typeof real.entregarPorCorreo>>> => {
      if (puente.fallosPendientes > 0) {
        puente.fallosPendientes -= 1
        throw new Error("falla forzada: el puente de entrega lanzó")
      }
      return real.entregarPorCorreo(...args)
    },
  }
})

const AUTH_SECRET = "test-secret-12345678"
/** Secreto inventado del cron: texto de prueba, no una credencial. */
const SECRETO_CRON = "secreto-cron-cola-co-inventado"
/** Contraseña inventada del emisor global: texto de prueba, no una credencial. */
const CLAVE_GLOBAL = "clave-inventada-cola-co"
/** Credencial de la comunidad: usuario y secreto DISTINTOS del camino global. */
const USUARIO_COMUNIDAD = "buzon@comunidad-cola-co.cl"
const SECRETO_COMUNIDAD = "secreto-comunidad-cola-co-inventado"
/** Clave maestra de prueba: 32 bytes, no una credencial real. */
const CLAVE_MAESTRA = Buffer.alloc(32, 17).toString("base64")

const COM = "co-cola-com"
const COM_B = "co-cola-com-b"
const ENV = "co-cola-env"
const ENV_B = "co-cola-env-b"
const ENV_CAP = "co-cola-env-lote"

const P_1 = "co-cola-p-1"
const P_2 = "co-cola-p-2"
const P_3 = "co-cola-p-3"
const EMAIL_1 = "vecina.uno@residencial-cola.cl"
const EMAIL_2 = "vecino.dos@residencial-cola.cl"
const EMAIL_3 = "vecino.tres@residencial-cola.cl"

const usuarios = {
  admin: "co-cola-admin@test.cl",
  residente: "co-cola-residente@test.cl",
  adminB: "co-cola-admin-b@test.cl",
}

/** Filas del lote del tope: destinatarios directos, sin padrón que sembrar. */
const LOTE_CANTIDAD = 52

const secretoPrevio = process.env.SMTP_PASSWORD
const clavePrevia = process.env[VARIABLE_CLAVE_MAESTRA]
const secretoCronPrevio = process.env.CRON_SECRET
const servidores: ServidorSMTPFalso[] = []
const contadores: Server[] = []

const moduloEnvios = () => import("@/app/api/co/envios/route")
const moduloCola = () => import("@/app/api/co/cola/route")

async function conSesion<T>(email: string | null, fn: () => Promise<T>): Promise<T> {
  if (email) state.cookie = await cookieDeUsuario(email)
  try {
    return await fn()
  } finally {
    state.cookie = ""
  }
}

function fijarSecreto(valor: string | undefined): void {
  if (valor === undefined) delete process.env.SMTP_PASSWORD
  else process.env.SMTP_PASSWORD = valor
}

function fijarClaveMaestra(valor: string | undefined): void {
  if (valor === undefined) delete process.env[VARIABLE_CLAVE_MAESTRA]
  else process.env[VARIABLE_CLAVE_MAESTRA] = valor
}

function fijarSecretoCron(valor: string | undefined): void {
  if (valor === undefined) delete process.env.CRON_SECRET
  else process.env.CRON_SECRET = valor
}

function envioBody(id: string = ENV, personas: string[] = [P_1, P_2]) {
  return {
    id,
    asunto: "Corte de agua programado",
    cuerpo: "El suministro se cortará el sábado de 09:00 a 13:00.",
    fechaEnvio: "2026-11-20",
    destinatarios: personas.map((personaId) => ({ personaId })),
    lecturas: [],
  }
}

async function enviarMasivo(body: Record<string, unknown>): Promise<Response> {
  return invocarApi(moduloEnvios(), "POST", "co/envios", { body })
}

async function drenar(body: Record<string, unknown> = {}): Promise<Response> {
  return invocarApi(moduloCola(), "POST", "co/cola", { body })
}

async function pedirMetrica(): Promise<Response> {
  return invocarApi(moduloCola(), "GET", "co/cola")
}

/**
 * `GET /api/co/cola` con el encabezado del cron (S3). El `Request` se arma acá y
 * no con `invocarApi` porque ese helper no acepta encabezados: el cron de Vercel
 * no manda cookie, su credencial es el secreto compartido.
 */
async function pedirCron(autorizacion?: string): Promise<Response> {
  const { GET } = await moduloCola()
  return GET(
    new Request("http://localhost/api/co/cola", {
      method: "GET",
      headers: autorizacion === undefined ? {} : { authorization: autorizacion },
    })
  )
}

/**
 * Foto de TODA la cola, sin filtrar por comunidad: el cron no tiene sesión y
 * drena lo que encuentre, así que «no drenó nada» se prueba sobre el estado
 * completo de la tabla y no sólo sobre el fixture de este archivo.
 */
async function fotoDeLaCola() {
  return prisma.colaSalidaCO.findMany({
    orderBy: [{ comunidadId: "asc" }, { id: "asc" }],
    select: { id: true, estado: true, intentos: true, enviadoEn: true, ultimoError: true },
  })
}

interface ResumenDrenaje {
  tomadas: number
  enviadas: number
  fallidas: number
  pendientes: number
  totales?: Resumen
  ultimoError?: string | null
  error?: string
}

interface Resumen {
  enviados: number
  fallidos: number
  pendientes: number
  ultimoError: string | null
  error?: string
}

/** Una comunidad dentro de la respuesta del cron (mismo envelope que el barrido). */
interface ResumenCronComunidad {
  comunidadId: string
  ok: boolean
  error: string | null
  tomadas: number
  enviadas: number
  fallidas: number
  pendientes: number
  ultimoError: string | null
}

interface ResumenCron {
  ok: boolean
  comunidades: ResumenCronComunidad[]
  totales: {
    comunidades: number
    tomadas: number
    enviadas: number
    fallidas: number
    pendientes: number
  }
}

async function filasDe(envioId: string = ENV) {
  return prisma.colaSalidaCO.findMany({
    where: { envioId },
    orderBy: [{ creadoEn: "asc" }, { personaId: "asc" }],
  })
}

/**
 * Las filas de la constancia compartida del canal correo (S3). El aviso in-app y
 * su entrega al visor viven en la MISMA tabla (`entregas_notificacion`), así que
 * el canal se filtra explícito en vez de asumir que la tabla trae una sola cosa.
 */
async function entregasDeCorreo() {
  return prisma.entregaNotificacion.findMany({
    where: { comunidadId: COM, canal: "email" },
    orderBy: [{ creadoEn: "asc" }, { id: "asc" }],
  })
}

/** CF de la comunidad apuntando al emisor de prueba. */
async function configurarCF(puerto: number, smtpUser: string): Promise<void> {
  const data = {
    ...configuracionDefault,
    smtpHost: "127.0.0.1",
    smtpPort: puerto,
    smtpUser,
    smtpSecurity: "none",
    smtpFrom: "no-responder@ejemplo.test",
    smtpFromName: "Comunidad Cola CO",
    smtpBcc: null,
    smtpRecepcion: null,
  }
  await prisma.configuracionGlobal.upsert({
    where: { comunidadId: COM },
    update: data,
    create: { id: `cfg-${COM}`, comunidadId: COM, ...data },
  })
}

/** Credencial CIFRADA de la comunidad, igual que la guarda `PUT /api/configuracion/correo`. */
async function guardarCredencialComunidad(puerto: number): Promise<void> {
  const paquete = cifrarSecreto(SECRETO_COMUNIDAD, { [VARIABLE_CLAVE_MAESTRA]: CLAVE_MAESTRA })
  await prisma.credencialCorreoComunidad.create({
    data: {
      id: `cred-${COM}`,
      comunidadId: COM,
      host: "127.0.0.1",
      puerto,
      usuario: USUARIO_COMUNIDAD,
      ...paquete,
      actualizadoPor: "test",
    },
  })
}

async function levantarServidor(
  opciones: Parameters<typeof iniciarServidorSMTPFalso>[0] = {}
): Promise<ServidorSMTPFalso> {
  const servidor = await iniciarServidorSMTPFalso(opciones)
  servidores.push(servidor)
  return servidor
}

/**
 * Contador TCP: escucha en `127.0.0.1` efímero y anota cada conexión aceptada.
 * Sirve para probar que el drenaje NO abre un socket cuando falta el emisor: el
 * servidor SMTP falso no puede ver una conexión sin mensaje, un `net` sí.
 */
async function levantarContador(): Promise<{ puerto: number; conexiones: number[] }> {
  const conexiones: number[] = []
  const server = createServer((socket: Socket) => {
    conexiones.push(Date.now())
    socket.destroy()
  })
  contadores.push(server)
  const puerto = await new Promise<number>((resolver, rechazar) => {
    server.once("error", rechazar)
    server.listen(0, "127.0.0.1", () => {
      const direccion = server.address()
      if (direccion === null || typeof direccion === "string") {
        rechazar(new Error("el contador de prueba no obtuvo un puerto TCP"))
        return
      }
      resolver(direccion.port)
    })
  })
  return { puerto, conexiones }
}

async function crearPersona(id: string, email: string, nombre: string): Promise<void> {
  const [nombres = "", ...resto] = nombre.split(" ")
  await prisma.persona.create({
    data: {
      id,
      comunidadId: COM,
      rut: `66.${id.slice(-3)}.000-K`,
      nombreCompleto: nombre,
      nombres,
      apellidos: resto.join(" "),
      email,
      telefonoMovil: "+56922222222",
      estadoCuenta: "activa",
      condicionesEspecialesIds: [],
      roles: ["propietario"],
    },
  })
}

async function limpiar(): Promise<void> {
  const where = { comunidadId: COM }
  await prisma.colaSalidaCO.deleteMany({ where })
  await prisma.credencialCorreoComunidad.deleteMany({ where })
  await prisma.configuracionGlobal.deleteMany({ where })
  await prisma.envioDestinatarioCO.deleteMany({ where: { envio: { comunidadId: COM } } })
  await prisma.envioCO.deleteMany({ where })
  // El alta escribe el aviso in-app y su constancia de entrega (S1/S3): se limpian
  // con el resto del fixture para que cada test cuente desde cero. La constancia
  // primero, que es la que referencia a la notificación.
  await prisma.entregaNotificacion.deleteMany({ where })
  await prisma.notificacion.deleteMany({ where })
}

beforeAll(async () => {
  process.env.AUTH_SECRET = AUTH_SECRET
  process.env.NEXT_PUBLIC_APP_ENV = "development"
  vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 })

  for (const [id, nombre, slug] of [
    [COM, "Comunidad Cola CO", "co-cola"],
    [COM_B, "Comunidad Cola CO B", "co-cola-b"],
  ] as const) {
    await prisma.comunidad.upsert({ where: { id }, update: {}, create: { id, nombre, slug } })
  }

  const semilla = [
    { email: usuarios.admin, comunidadId: COM, rol: "administrador" },
    { email: usuarios.residente, comunidadId: COM, rol: "residente" },
    { email: usuarios.adminB, comunidadId: COM_B, rol: "administrador" },
  ]
  for (const u of semilla) {
    const usuario = await prisma.usuario.upsert({
      where: { email: u.email },
      update: { activo: true },
      create: { email: u.email, activo: true },
    })
    await prisma.membresia.deleteMany({ where: { usuarioId: usuario.id } })
    await prisma.membresia.create({
      data: { usuarioId: usuario.id, comunidadId: u.comunidadId, rol: u.rol },
    })
  }

  await prisma.colaSalidaCO.deleteMany({ where: { comunidadId: { in: [COM, COM_B] } } })
  await prisma.envioDestinatarioCO.deleteMany({
    where: { envio: { comunidadId: { in: [COM, COM_B] } } },
  })
  await prisma.envioCO.deleteMany({ where: { comunidadId: { in: [COM, COM_B] } } })
  await prisma.persona.deleteMany({ where: { comunidadId: { in: [COM, COM_B] } } })
  await crearPersona(P_1, EMAIL_1, "Ana Uno")
  await crearPersona(P_2, EMAIL_2, "Beto Dos")
  await crearPersona(P_3, EMAIL_3, "Carla Tres")
}, 120_000)

beforeEach(async () => {
  fijarSecreto(undefined)
  fijarClaveMaestra(CLAVE_MAESTRA)
  fijarSecretoCron(SECRETO_CRON)
  puente.fallosPendientes = 0
  await limpiar()
}, 60_000)

afterEach(async () => {
  while (servidores.length > 0) await servidores.pop()?.cerrar()
  while (contadores.length > 0) {
    const server = contadores.pop()
    if (server) await new Promise<void>((resolver) => server.close(() => resolver()))
  }
  fijarSecreto(secretoPrevio)
  fijarClaveMaestra(clavePrevia)
  fijarSecretoCron(secretoCronPrevio)
})

afterAll(async () => {
  try {
    state.cookie = ""
    fijarSecreto(secretoPrevio)
    fijarClaveMaestra(clavePrevia)
    fijarSecretoCron(secretoCronPrevio)
    await prisma.colaSalidaCO.deleteMany({ where: { comunidadId: { in: [COM, COM_B] } } })
    await prisma.envioDestinatarioCO.deleteMany({
      where: { envio: { comunidadId: { in: [COM, COM_B] } } },
    })
    await prisma.envioCO.deleteMany({ where: { comunidadId: { in: [COM, COM_B] } } })
    await prisma.credencialCorreoComunidad.deleteMany({
      where: { comunidadId: { in: [COM, COM_B] } },
    })
    await prisma.configuracionGlobal.deleteMany({ where: { comunidadId: { in: [COM, COM_B] } } })
    await prisma.entregaNotificacion.deleteMany({
      where: { comunidadId: { in: [COM, COM_B] } },
    })
    await prisma.notificacion.deleteMany({ where: { comunidadId: { in: [COM, COM_B] } } })
    await prisma.persona.deleteMany({ where: { comunidadId: { in: [COM, COM_B] } } })
    for (const email of Object.values(usuarios)) {
      const usuario = await prisma.usuario.findUnique({ where: { email } })
      if (usuario) {
        await prisma.membresia.deleteMany({ where: { usuarioId: usuario.id } })
        await prisma.usuario.delete({ where: { id: usuario.id } }).catch(() => {})
      }
    }
    await prisma.comunidad.delete({ where: { id: COM } }).catch(() => {})
    await prisma.comunidad.delete({ where: { id: COM_B } }).catch(() => {})
  } catch {
    // intencional: limpieza best-effort (la base es descartable)
  }
}, 120_000)

describe("POST /api/co/envios — el alta encola además de notificar (S1/S2)", () => {
  it("crea una fila de cola por destinatario con el asunto y el cuerpo del mensaje", async () => {
    await conSesion(usuarios.admin, async () => {
      const res = await enviarMasivo(envioBody())
      expect(res.status).toBe(201)
    })

    const filas = await filasDe()
    expect(filas).toHaveLength(2)
    expect(filas.map((f) => f.personaId)).toEqual([P_1, P_2])
    expect(filas.map((f) => f.destinatario)).toEqual([EMAIL_1, EMAIL_2])
    for (const fila of filas) {
      expect(fila.comunidadId).toBe(COM)
      expect(fila.envioId).toBe(ENV)
      expect(fila.asunto).toBe("Corte de agua programado")
      expect(fila.cuerpo).toBe("El suministro se cortará el sábado de 09:00 a 13:00.")
      expect(fila.estado).toBe("pendiente")
      expect(fila.intentos).toBe(0)
      expect(fila.ultimoError).toBeNull()
      expect(fila.enviadoEn).toBeNull()
    }

    // PRESERVE (S1): el alta sigue escribiendo el envío y su nómina como hoy.
    const envio = await prisma.envioCO.findUnique({ where: { id: ENV } })
    expect(envio?.asunto).toBe("Corte de agua programado")
    expect(envio?.destinatarios).toEqual([{ personaId: P_1 }, { personaId: P_2 }])
    expect(envio?.lecturas).toEqual([])
    const destinatarios = await prisma.envioDestinatarioCO.findMany({ where: { envioId: ENV } })
    expect(destinatarios).toHaveLength(2)
  })

  it("reenviar el mismo envío no duplica filas ni pisa la que ya salió", async () => {
    const servidor = await levantarServidor({ secreto: CLAVE_GLOBAL })
    await configurarCF(servidor.port, "emisor@ejemplo.test")
    fijarSecreto(CLAVE_GLOBAL)

    await conSesion(usuarios.admin, async () => {
      expect((await enviarMasivo(envioBody())).status).toBe(201)
      const primera = await cuerpoJson<ResumenDrenaje>(await drenar())
      expect(primera.enviadas).toBe(2)

      // El mismo envío se vuelve a mandar con un destinatario nuevo: la nómina
      // se reconcilia y SÓLO la persona nueva entra a la cola.
      const res = await enviarMasivo(envioBody(ENV, [P_1, P_2, P_3]))
      expect(res.status).toBe(200)
    })

    const filas = await filasDe()
    expect(filas.map((f) => f.personaId)).toEqual([P_1, P_2, P_3])
    expect(filas.filter((f) => f.estado === "enviado")).toHaveLength(2)
    const nueva = filas.find((f) => f.personaId === P_3)
    expect(nueva?.estado).toBe("pendiente")
    // Las enviadas conservan su desenlace: reenviar el alta no reescribe la cola.
    for (const fila of filas.filter((f) => f.personaId !== P_3)) {
      expect(fila.enviadoEn).not.toBeNull()
      expect(fila.intentos).toBe(1)
    }
  })
})

describe("POST /api/co/cola — el proceso drena un lote acotado (S3/S4/S6)", () => {
  it("con la credencial de la comunidad y el servidor aceptando, la fila queda enviado", async () => {
    // El servidor falso sólo acepta a la credencial de la COMUNIDAD; CF apunta a
    // un puerto muerto para probar que el envío usa la credencial resuelta y no
    // la configuración cruda. La clave global tampoco coincide.
    fijarSecreto("clave-global-que-no-debe-usarse")
    const servidor = await levantarServidor({
      usuario: USUARIO_COMUNIDAD,
      secreto: SECRETO_COMUNIDAD,
    })
    await guardarCredencialComunidad(servidor.port)
    await configurarCF(1, "emisor@ejemplo.test")

    await conSesion(usuarios.admin, async () => {
      expect((await enviarMasivo(envioBody())).status).toBe(201)
      const res = await drenar()
      expect(res.status).toBe(200)
      const resumen = await cuerpoJson<ResumenDrenaje>(res)
      expect(resumen.tomadas).toBe(2)
      expect(resumen.enviadas).toBe(2)
      expect(resumen.fallidas).toBe(0)
      expect(resumen.pendientes).toBe(0)
      expect(resumen.totales).toMatchObject({ enviados: 2, fallidos: 0, pendientes: 0 })
      expect(resumen.ultimoError).toBeNull()
    })

    const filas = await filasDe()
    expect(filas.map((f) => f.estado)).toEqual(["enviado", "enviado"])
    for (const fila of filas) {
      expect(fila.intentos).toBe(1)
      expect(fila.enviadoEn).not.toBeNull()
      expect(fila.ultimoError).toContain("falso-0001@ejemplo.test")
    }
    // El mensaje que llegó al servidor es el del envío masivo, a cada destinatario.
    expect(servidor.mensajes).toHaveLength(2)
    expect(servidor.mensajes.map((m) => m.to)).toEqual([[EMAIL_1], [EMAIL_2]])
    for (const mensaje of servidor.mensajes) {
      expect(mensaje.crudo).toContain("Corte de agua programado")
      expect(mensaje.crudo).toContain("El suministro se cortará el sábado")
    }
    // S3: la credencial usada es la de la comunidad, no el emisor global.
    expect(servidor.autenticaciones).toEqual([
      { usuario: USUARIO_COMUNIDAD, secreto: SECRETO_COMUNIDAD },
      { usuario: USUARIO_COMUNIDAD, secreto: SECRETO_COMUNIDAD },
    ])
    // `enviado` es aceptación del servidor, no la palabra `entregado` del visor.
    expect(filas.map((f) => f.estado)).not.toContain("entregado")
  })

  it("sin emisor configurado queda pendiente con MOTIVO_SIN_SMTP y no abre una sola conexión", async () => {
    // CF completa apuntando al contador, pero SIN secreto: ni credencial de la
    // comunidad ni `SMTP_PASSWORD`. Es la condición `no_configurado` de F4, y
    // ocurre antes de abrir el socket.
    const contador = await levantarContador()
    await configurarCF(contador.puerto, "emisor@ejemplo.test")

    await conSesion(usuarios.admin, async () => {
      expect((await enviarMasivo(envioBody())).status).toBe(201)
      const res = await drenar()
      expect(res.status).toBe(200)
      const resumen = await cuerpoJson<ResumenDrenaje>(res)
      expect(resumen.tomadas).toBe(2)
      expect(resumen.enviadas).toBe(0)
      expect(resumen.fallidas).toBe(0)
      // Nada se envió: la cola sigue pendiente y así se declara.
      expect(resumen.pendientes).toBe(2)
      expect(resumen.totales).toMatchObject({ enviados: 0, fallidos: 0, pendientes: 2 })
    })

    const filas = await filasDe()
    for (const fila of filas) {
      expect(fila.estado).toBe("pendiente")
      expect(fila.ultimoError).toBe(MOTIVO_SIN_SMTP)
      // Sin intento real no se consume un intento ni se fecha un envío.
      expect(fila.intentos).toBe(0)
      expect(fila.enviadoEn).toBeNull()
    }
    expect(contador.conexiones).toHaveLength(0)

    // S3: la evaluación sin emisor también deja su fila compartida, y dice lo
    // mismo que la cola. NO consume un intento real (`pendiente` es una condición
    // de configuración): la cola sigue en 0 y su fila compartida registra 1
    // evaluación, sin fecha de envío.
    const correo = await entregasDeCorreo()
    expect(correo).toHaveLength(2)
    for (const fila of correo) {
      expect(fila.estado).toBe("pendiente")
      expect(fila.motivo).toBe(MOTIVO_SIN_SMTP)
      expect(fila.enviadoEn).toBeNull()
      expect(fila.intentos).toBe(1)
    }
  })

  it("si el servidor rechaza el mensaje queda fallido con el motivo del servidor", async () => {
    const servidor = await levantarServidor({
      modo: "rechazar_mensaje",
      secreto: CLAVE_GLOBAL,
    })
    await configurarCF(servidor.port, "emisor@ejemplo.test")
    fijarSecreto(CLAVE_GLOBAL)

    await conSesion(usuarios.admin, async () => {
      expect((await enviarMasivo(envioBody())).status).toBe(201)
      const resumen = await cuerpoJson<ResumenDrenaje>(await drenar())
      expect(resumen.enviadas).toBe(0)
      expect(resumen.fallidas).toBe(2)
      expect(resumen.totales).toMatchObject({ enviados: 0, fallidos: 2, pendientes: 0 })

      const lectura = await cuerpoJson<Resumen>(await pedirMetrica())
      expect(lectura.enviados).toBe(0)
      expect(lectura.fallidos).toBe(2)
      expect(lectura.pendientes).toBe(0)
      expect(String(lectura.ultimoError)).toContain("554")
      expect(String(lectura.ultimoError)).toContain("Mensaje rechazado por política")
    })

    const filas = await filasDe()
    for (const fila of filas) {
      expect(fila.estado).toBe("fallido")
      expect(fila.intentos).toBe(1)
      expect(fila.enviadoEn).toBeNull()
      expect(fila.ultimoError).toContain("Mensaje rechazado por política")
    }
  })

  it("el tope del lote se respeta: pedir 100 con tope 50 toma 50", async () => {
    const servidor = await levantarServidor({ secreto: CLAVE_GLOBAL })
    await configurarCF(servidor.port, "emisor@ejemplo.test")
    fijarSecreto(CLAVE_GLOBAL)

    await prisma.envioCO.create({
      data: {
        id: ENV_CAP,
        comunidadId: COM,
        asunto: "Lote acotado",
        cuerpo: "Un correo por destinatario del lote.",
        destinatarios: [],
        fechaEnvio: "2026-11-20",
        lecturas: [],
      },
    })
    // El drenaje resuelve la dirección por PERSONA (una sola resolución de
    // correo, S1): cada fila del lote necesita su persona en el Maestro, igual
    // que la deja `encolarEnvioCO`. Antes el drenaje leía el snapshot de la cola.
    for (let i = 1; i <= LOTE_CANTIDAD; i++) {
      const n = String(i).padStart(3, "0")
      await crearPersona(
        `co-cola-lote-p-${n}`,
        `lote-${n}@residencial-cola.cl`,
        `Lote ${n}`
      )
    }
    await prisma.colaSalidaCO.createMany({
      data: Array.from({ length: LOTE_CANTIDAD }, (_, i) => {
        const n = String(i + 1).padStart(3, "0")
        return {
          id: `co-cola-lote-fila-${n}`,
          comunidadId: COM,
          envioId: ENV_CAP,
          personaId: `co-cola-lote-p-${n}`,
          destinatario: `lote-${n}@residencial-cola.cl`,
          asunto: "Lote acotado",
          cuerpo: "Un correo por destinatario del lote.",
          estado: "pendiente",
        }
      }),
    })

    await conSesion(usuarios.admin, async () => {
      const resumen = await cuerpoJson<ResumenDrenaje>(await drenar({ limite: 100 }))
      expect(resumen.tomadas).toBe(50)
      expect(resumen.enviadas).toBe(50)
      expect(resumen.fallidas).toBe(0)
      expect(resumen.pendientes).toBe(LOTE_CANTIDAD - 50)
      expect(resumen.totales).toMatchObject({
        enviados: 50,
        fallidos: 0,
        pendientes: LOTE_CANTIDAD - 50,
      })
    })

    expect(await prisma.colaSalidaCO.count({ where: { envioId: ENV_CAP, estado: "enviado" } })).toBe(50)
    expect(await prisma.colaSalidaCO.count({ where: { envioId: ENV_CAP, estado: "pendiente" } })).toBe(
      LOTE_CANTIDAD - 50
    )
  })
})

describe("POST /api/co/cola — la entrega compartida del correo (S1/S3)", () => {
  it("deja una fila de correo por intento, colgada del aviso in-app del envío", async () => {
    const servidor = await levantarServidor({ secreto: CLAVE_GLOBAL })
    await configurarCF(servidor.port, "emisor@ejemplo.test")
    fijarSecreto(CLAVE_GLOBAL)

    await conSesion(usuarios.admin, async () => {
      expect((await enviarMasivo(envioBody())).status).toBe(201)
      const resumen = await cuerpoJson<ResumenDrenaje>(await drenar())
      expect(resumen.enviadas).toBe(2)
    })

    // El aviso in-app lo escribe el alta por el puente, con su id determinista.
    const avisos = await prisma.notificacion.findMany({
      where: { comunidadId: COM },
      select: { id: true },
      orderBy: { id: "asc" },
    })
    expect(avisos.map((a) => a.id)).toEqual([`not-co-${ENV}-${P_1}`, `not-co-${ENV}-${P_2}`])
    const idsAviso = new Set(avisos.map((a) => a.id))

    // Y su constancia de visor: UNA por aviso, `entregado` porque la notificación
    // se escribió en la misma transacción.
    const todas = await prisma.entregaNotificacion.findMany({
      where: { comunidadId: COM },
      orderBy: [{ creadoEn: "asc" }, { id: "asc" }],
    })
    const visor = todas.filter((e) => e.canal === "visor")
    expect(visor).toHaveLength(2)
    for (const fila of visor) {
      expect(fila.estado).toBe("entregado")
      expect(fila.motivo).toBeNull()
      expect(fila.enviadoEn).toBeNull()
      expect(fila.intentos).toBe(1)
      expect(idsAviso.has(String(fila.notificacionId))).toBe(true)
    }

    // El intento de correo del drenaje deja SU fila compartida: `enviado` con la
    // fecha del envío y colgada del mismo aviso.
    const correo = await entregasDeCorreo()
    expect(correo).toHaveLength(2)
    for (const fila of correo) {
      expect(fila.estado).toBe("enviado")
      expect(fila.intentos).toBe(1)
      expect(fila.enviadoEn).not.toBeNull()
      expect(String(fila.motivo)).toContain("Aceptado por el servidor SMTP")
      expect(idsAviso.has(String(fila.notificacionId))).toBe(true)
    }
    expect(new Set(correo.map((e) => e.notificacionId))).toEqual(idsAviso)
  })

  it("un intento fallido se reintenta hasta el tope y cada intento deja su fila", async () => {
    const servidor = await levantarServidor({
      modo: "rechazar_mensaje",
      secreto: CLAVE_GLOBAL,
    })
    await configurarCF(servidor.port, "emisor@ejemplo.test")
    fijarSecreto(CLAVE_GLOBAL)

    await conSesion(usuarios.admin, async () => {
      expect((await enviarMasivo(envioBody())).status).toBe(201)
      // Tres drenajes: cada uno vuelve a tomar las dos filas mientras queden
      // intentos. La cola suma uno por intento real y sigue `fallido`.
      for (const intento of [1, 2, 3]) {
        const resumen = await cuerpoJson<ResumenDrenaje>(await drenar())
        expect(resumen.tomadas).toBe(2)
        expect(resumen.enviadas).toBe(0)
        expect(resumen.fallidas).toBe(2)
        const filas = await filasDe()
        expect(filas.map((f) => f.estado)).toEqual(["fallido", "fallido"])
        expect(filas.map((f) => f.intentos)).toEqual([intento, intento])
      }

      // Tope alcanzado: la fila ya no se toma, aunque el proceso se invoque.
      const cuarto = await cuerpoJson<ResumenDrenaje>(await drenar())
      expect(cuarto.tomadas).toBe(0)
      expect(cuarto.fallidas).toBe(0)
    })

    const filas = await filasDe()
    for (const fila of filas) {
      expect(fila.estado).toBe("fallido")
      expect(fila.intentos).toBe(3)
      expect(fila.enviadoEn).toBeNull()
      expect(fila.ultimoError).toContain("Mensaje rechazado por política")
    }

    // Tres intentos por destinatario, tres filas compartidas por destinatario.
    const correo = await entregasDeCorreo()
    expect(correo).toHaveLength(6)
    for (const fila of correo) {
      expect(fila.estado).toBe("fallido")
      expect(fila.intentos).toBe(1)
      expect(fila.enviadoEn).toBeNull()
      expect(String(fila.motivo)).toContain("Mensaje rechazado por política")
    }
    expect(new Set(correo.map((e) => e.notificacionId))).toEqual(
      new Set([`not-co-${ENV}-${P_1}`, `not-co-${ENV}-${P_2}`])
    )
  })

  it("si el puente lanza, el lote sigue y la fila no se reintenta: no reenvía un correo aceptado", async () => {
    const servidor = await levantarServidor({ secreto: CLAVE_GLOBAL })
    await configurarCF(servidor.port, "emisor@ejemplo.test")
    fijarSecreto(CLAVE_GLOBAL)
    // Lanza en la PRIMERA fila que toma el drenaje: el lote no puede abortarse
    // ni esa fila puede quedar sin desenlace (R3-004).
    puente.fallosPendientes = 1

    await conSesion(usuarios.admin, async () => {
      expect((await enviarMasivo(envioBody())).status).toBe(201)
      const res = await drenar()
      expect(res.status).toBe(200)
      const resumen = await cuerpoJson<ResumenDrenaje>(res)
      expect(resumen.tomadas).toBe(2)
      // La otra fila se mandó igual: un throw no aborta el lote.
      expect(resumen.enviadas).toBe(1)
      expect(resumen.fallidas).toBe(1)
      expect(resumen.pendientes).toBe(0)
      expect(resumen.ultimoError).toBe(MOTIVO_PUENTE_FALLO)
    })

    const filas = await filasDe()
    const fallidasFilas = filas.filter((f) => f.estado === "fallido")
    const enviadasFilas = filas.filter((f) => f.estado === "enviado")
    expect(fallidasFilas).toHaveLength(1)
    expect(enviadasFilas).toHaveLength(1)
    const fallida = fallidasFilas[0]!
    const enviada = enviadasFilas[0]!
    // El desenlace de la fila que falló es DESCONOCIDO (el correo pudo haber
    // salido antes de que fallara la escritura de su constancia), así que la
    // fila se declara fallida y agotada: no se reintenta a ciegas.
    expect(fallida.estado).toBe("fallido")
    expect(fallida.intentos).toBe(MAX_INTENTOS_COLA_SALIDA_CO)
    expect(fallida.ultimoError).toBe(MOTIVO_PUENTE_FALLO)
    expect(fallida.enviadoEn).toBeNull()
    expect(enviada.intentos).toBe(1)
    expect(enviada.enviadoEn).not.toBeNull()

    // Un único mensaje salió: el de la fila que no falló.
    const correoDe = (personaId: string): string => (personaId === P_1 ? EMAIL_1 : EMAIL_2)
    expect(servidor.mensajes.map((m) => m.to)).toEqual([[correoDe(enviada.personaId)]])
    expect(await entregasDeCorreo()).toHaveLength(1)

    // Un drenaje posterior no vuelve a mandar nada: ni la fila agotada ni el
    // correo que ya salió.
    await conSesion(usuarios.admin, async () => {
      const segundo = await cuerpoJson<ResumenDrenaje>(await drenar())
      expect(segundo.tomadas).toBe(0)
      expect(segundo.enviadas).toBe(0)
      expect(segundo.pendientes).toBe(0)
    })
    expect(servidor.mensajes).toHaveLength(1)
    expect(await entregasDeCorreo()).toHaveLength(1)
  })

  it("un envío aceptado no se reintenta: el segundo drenaje no manda otro correo", async () => {
    const servidor = await levantarServidor({ secreto: CLAVE_GLOBAL })
    await configurarCF(servidor.port, "emisor@ejemplo.test")
    fijarSecreto(CLAVE_GLOBAL)

    await conSesion(usuarios.admin, async () => {
      expect((await enviarMasivo(envioBody())).status).toBe(201)
      expect((await cuerpoJson<ResumenDrenaje>(await drenar())).enviadas).toBe(2)

      const segundo = await cuerpoJson<ResumenDrenaje>(await drenar())
      expect(segundo.tomadas).toBe(0)
      expect(segundo.enviadas).toBe(0)
    })

    // Ni un mensaje más al servidor, ni una fila compartida de más.
    expect(servidor.mensajes).toHaveLength(2)
    expect(await entregasDeCorreo()).toHaveLength(2)
    const filas = await filasDe()
    expect(filas.map((f) => f.intentos)).toEqual([1, 1])
  })
})

describe("S1 — CO no escribe su aviso ni habla SMTP fuera del puente", () => {
  const RAIZ = path.resolve(__dirname, "../..")
  /** La escritura que el puente prohíbe fuera de él (mismo criterio que T3). */
  const RE_ESCRITURA_INLINE = /\.notificacion\s*\.\s*(create|upsert)\s*\(/

  it("el aviso del envío se escribe con `avisar()`, no inline", () => {
    const fuente = readFileSync(path.join(RAIZ, "lib/co-notificacion-envio.ts"), "utf8")
    expect(fuente).not.toMatch(RE_ESCRITURA_INLINE)
    expect(fuente).toContain("avisar(")
  })

  it("el drenaje manda por `entregarPorCorreo()` y no resuelve el canal por su cuenta", () => {
    const fuente = readFileSync(path.join(RAIZ, "lib/co-cola.ts"), "utf8")
    expect(fuente).not.toMatch(RE_ESCRITURA_INLINE)
    expect(fuente).toContain("entregarPorCorreo(")
    expect(fuente).not.toContain("enviarCorreoSMTP")
    expect(fuente).not.toContain("planDeCanal(")
  })
})

describe("POST/GET /api/co/cola — compuertas del endpoint administrativo", () => {
  it("sin sesión responde 401", async () => {
    const res = await conSesion(null, () => drenar())
    expect(res.status).toBe(401)
    expect(await cuerpoJson<ResumenDrenaje>(res)).toEqual({ error: "No autenticado." })
  })

  it("un rol sin la clave del envío masivo recibe 403 literal", async () => {
    const res = await conSesion(usuarios.residente, () => drenar())
    expect(res.status).toBe(403)
    expect(await cuerpoJson<ResumenDrenaje>(res)).toEqual({ error: "Permiso denegado." })
    expect(res.status).not.toBe(200)
  })

  it("un envío de otra comunidad responde 404 en el drenaje y en la métrica", async () => {
    // Envío de la comunidad B, cola con una fila pendiente: la sesión es de A.
    await prisma.envioCO.create({
      data: {
        id: ENV_B,
        comunidadId: COM_B,
        asunto: "Envío de otra comunidad",
        cuerpo: "No es de la comunidad de la sesión.",
        destinatarios: [],
        fechaEnvio: "2026-11-20",
        lecturas: [],
      },
    })
    await prisma.colaSalidaCO.create({
      data: {
        id: "co-cola-fila-ajena",
        comunidadId: COM_B,
        envioId: ENV_B,
        personaId: "co-cola-p-ajena",
        destinatario: "ajena@residencial-cola-b.cl",
        asunto: "Envío de otra comunidad",
        cuerpo: "No es de la comunidad de la sesión.",
        estado: "pendiente",
      },
    })

    await conSesion(usuarios.admin, async () => {
      const drenaje = await drenar({ envioId: ENV_B })
      expect(drenaje.status).toBe(404)
      expect(await cuerpoJson<ResumenDrenaje>(drenaje)).toEqual({ error: "Registro no encontrado." })

      const lectura = await invocarApi(moduloCola(), "GET", `co/cola?envioId=${ENV_B}`)
      expect(lectura.status).toBe(404)
      expect(await cuerpoJson<Resumen>(lectura)).toEqual({ error: "Registro no encontrado." })
    })

    // La fila ajena no se tocó: sigue pendiente y no se envió nada.
    const ajena = await prisma.colaSalidaCO.findUnique({ where: { id: "co-cola-fila-ajena" } })
    expect(ajena?.estado).toBe("pendiente")
  })
})

describe("GET /api/co/cola — el cron drena la cola (S3)", () => {
  /** Siembra un envío masivo con su cola pendiente, con el emisor de prueba listo. */
  async function sembrarColaConEmisor(): Promise<ServidorSMTPFalso> {
    const servidor = await levantarServidor({ secreto: CLAVE_GLOBAL })
    await configurarCF(servidor.port, "emisor@ejemplo.test")
    fijarSecreto(CLAVE_GLOBAL)
    await conSesion(usuarios.admin, async () => {
      expect((await enviarMasivo(envioBody())).status).toBe(201)
    })
    return servidor
  }

  it("con Authorization: Bearer <CRON_SECRET> drena la cola sin sesión", async () => {
    const servidor = await sembrarColaConEmisor()
    expect((await filasDe()).map((f) => f.estado)).toEqual(["pendiente", "pendiente"])

    // Sin cookie de sesión: el cron de Vercel no la tiene.
    const res = await pedirCron(`Bearer ${SECRETO_CRON}`)
    expect(res.status).toBe(200)
    const cuerpo = await cuerpoJson<ResumenCron>(res)
    expect(cuerpo.ok).toBe(true)
    // Cada comunidad con filas drenables aparece con su propio lote.
    const propia = cuerpo.comunidades.find((fila) => fila.comunidadId === COM)
    expect(propia).toEqual({
      comunidadId: COM,
      ok: true,
      error: null,
      tomadas: 2,
      enviadas: 2,
      fallidas: 0,
      pendientes: 0,
      ultimoError: null,
    })
    expect(cuerpo.totales.comunidades).toBe(cuerpo.comunidades.length)
    expect(cuerpo.totales.enviadas).toBeGreaterThanOrEqual(2)

    // El estado guardado es el del drenaje: las filas del fixture salieron.
    const filas = await filasDe()
    expect(filas.map((f) => f.estado)).toEqual(["enviado", "enviado"])
    for (const fila of filas) {
      expect(fila.intentos).toBe(1)
      expect(fila.enviadoEn).not.toBeNull()
    }
    // Y el drenaje mandó de verdad: el emisor recibió un mensaje por fila.
    expect(servidor.mensajes.map((m) => m.to)).toEqual([[EMAIL_1], [EMAIL_2]])
  })

  it("sin el secreto correcto responde 401 y no drena nada", async () => {
    const servidor = await sembrarColaConEmisor()
    const antes = await fotoDeLaCola()

    // Un secreto que no coincide: 401 con el cuerpo de error del vecino.
    const ajeno = await pedirCron("Bearer otro-secreto-cualquiera")
    expect(ajeno.status).toBe(401)
    expect(await cuerpoJson<Resumen>(ajeno)).toEqual({
      error:
        "No autorizado: la cola de salida de CO exige el secreto del cron en el encabezado Authorization (Bearer).",
    })

    // Una sesión válida tampoco convierte un bearer equivocado en autorización:
    // el encabezado elige el camino del cron, y ese camino no se salta.
    const conSesionValida = await conSesion(usuarios.admin, () =>
      pedirCron("Bearer otro-secreto-cualquiera")
    )
    expect(conSesionValida.status).toBe(401)

    // Sin encabezado no es el cron: es una consulta sin sesión, y también 401.
    const sinEncabezado = await pedirCron()
    expect(sinEncabezado.status).toBe(401)
    expect(await cuerpoJson<Resumen>(sinEncabezado)).toEqual({ error: "No autenticado." })

    // Ninguna fila cambió y no salió un solo correo.
    expect(await fotoDeLaCola()).toEqual(antes)
    expect(servidor.mensajes).toHaveLength(0)
  })

  it("sin CRON_SECRET en el entorno responde 401 y no drena nada", async () => {
    const servidor = await sembrarColaConEmisor()
    const antes = await fotoDeLaCola()
    fijarSecretoCron(undefined)

    // Falla cerrada: sin secreto configurado no hay forma de autorizar al cron,
    // así que el encabezado correcto tampoco abre la puerta.
    const res = await pedirCron(`Bearer ${SECRETO_CRON}`)
    expect(res.status).toBe(401)
    expect(await cuerpoJson<Resumen>(res)).toEqual({
      error:
        "No autorizado: falta la variable de entorno CRON_SECRET en el servidor, así que la cola de salida de CO no se drena.",
    })

    expect(await fotoDeLaCola()).toEqual(antes)
    expect(servidor.mensajes).toHaveLength(0)
  })

  it("el POST manual y la métrica de la sesión conservan su contrato", async () => {
    const servidor = await sembrarColaConEmisor()

    await conSesion(usuarios.admin, async () => {
      const drenaje = await cuerpoJson<ResumenDrenaje>(await drenar())
      expect(drenaje.tomadas).toBe(2)
      expect(drenaje.enviadas).toBe(2)

      // El `GET` de la sesión sigue siendo la lectura, no el drenaje: sin
      // encabezado `Authorization` no hay camino de cron que tomar.
      expect(await cuerpoJson<Resumen>(await pedirMetrica())).toEqual({
        enviados: 2,
        fallidos: 0,
        pendientes: 0,
        ultimoError: null,
      })
    })

    expect(servidor.mensajes).toHaveLength(2)
    expect((await filasDe()).map((f) => f.estado)).toEqual(["enviado", "enviado"])
  })
})
