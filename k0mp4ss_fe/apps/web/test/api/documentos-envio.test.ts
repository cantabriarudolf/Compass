/**
 * @vitest-environment node
 *
 * F35 serie A / A3 · T13-T15 — la ENTREGA de un documento legal y su constancia
 * por destinatario (S7/S8). BD real, transporte de correo NUNCA real.
 *
 * S7 pide dos cosas que no se pueden separar: entregar a varios destinatarios en
 * UNA corrida y no duplicar el mismo envío por accidente. La clave de
 * idempotencia es `documento:persona:canal`; el reenvío explícito agrega
 * `:reenvio:<epoch>` y queda como fila nueva marcada `reenvio: true`.
 *
 * S8 separa las dos naturalezas: lo comunitario se PUBLICA a toda la comunidad
 * (visor) y su constancia es "publicado", así que no produce entregas por
 * persona — la ruta responde 409 en vez de fabricar una constancia que nadie
 * pidió. Lo legal conserva el envío con constancia por destinatario.
 *
 * Lo que este archivo fija, estado por estado (el registro nunca miente):
 *
 *   1. una corrida con N destinatarios escribe UNA fila por persona y, por el
 *      visor, la `Notificacion` que prueba cada entrega (`entregado` con
 *      `notificacionId`);
 *   2. dos corridas iguales no duplican ni una fila ni una notificación;
 *   3. el reenvío explícito agrega una fila con sufijo `:reenvio:<epoch>` y una
 *      notificación nueva por destinatario, sin tocar las anteriores;
 *   4. el correo sin emisor SMTP configurado queda `pendiente` con su motivo y
 *      NUNCA `entregado` (nadie aceptó nada);
 *   5. un correo que no puede llegar (dirección imposible o persona sin
 *      dirección) queda `fallido` con su motivo y sin abrir conexión (la guardia
 *      local de `lib/smtp.ts`), y el correo ACEPTADO por el servidor queda
 *      `entregado` — sólo entonces;
 *   6. lo comunitario no se entrega por persona (409) y no escribe nada;
 *   7. el documento y los destinatarios de otra comunidad no se tocan (404/400);
 *   8. sesión y permiso: 401 sin sesión, 403 del residente al enviar y al leer
 *      la constancia nominativa (es la vista de auditoría, no la bandeja del
 *      residente — su prueba de entrega es la notificación), comité sí puede
 *      enviar y auditar con la clave `doc`.
 *
 * Ninguna conexión sale a internet: los casos sin emisor no abren socket y el
 * único caso con emisor apunta al servidor SMTP FALSO de `test/lib` en
 * 127.0.0.1, con una contraseña inventada. Nunca se envía correo real.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest"
import { prisma } from "@/lib/prisma"
import { hoyISO } from "@/lib/date-utils"
import { configuracionDefault } from "@/data/admin/configuracion"
import { iniciarServidorSMTPFalso } from "../lib/servidor-smtp-falso"
import { invocarApi, cuerpoJson } from "../helpers/api-sesion"

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

const COM_A = "docenv-com-a"
const COM_B = "docenv-com-b"

const EMAIL_ADMIN = "docenv-admin@test.cl"
const EMAIL_COMITE = "docenv-comite@test.cl"
const EMAIL_RESIDENTE = "docenv-residente@test.cl"

/**
 * Emisor SMTP FALSO en 127.0.0.1 (el mismo de los tests del aviso): ninguna
 * conexión sale a internet y la contraseña es texto inventado acá, no una
 * credencial real.
 */
const USUARIO_SMTP = "emisor@ejemplo.test"
const CLAVE_SMTP = "clave-inventada-envio-documento"

/** Propietarios y arrendatario de la comunidad A (destinatarios legítimos). */
const P1 = "docenv-p-1"
const P2 = "docenv-p-2"
const P3 = "docenv-p-3"
/** Persona de la comunidad B: nunca recibe un documento de A. */
const PB = "docenv-p-b"
/** Persona con dirección ficticia: el correo se rechaza localmente. */
const P4 = "docenv-p-4"
/** Persona sin correo cargado: el canal email no se inventa como entregado. */
const P5 = "docenv-p-5"

const DOC_VISOR = "docenv-doc-visor"
const DOC_EMAIL = "docenv-doc-email"
const DOC_EMAIL_FALLIDO = "docenv-doc-email-fallido"
const DOC_PERMISOS = "docenv-doc-permisos"
const DOC_COMUNITARIO = "docenv-doc-comunitario"
const DOC_AJENO = "docenv-doc-ajeno"

const usuarios = [
  { id: "docenv-user-admin", email: EMAIL_ADMIN, rol: "administrador" },
  { id: "docenv-user-comite", email: EMAIL_COMITE, rol: "comite" },
  { id: "docenv-user-residente", email: EMAIL_RESIDENTE, rol: "residente" },
]

type Json = Record<string, unknown>

const rutaEnvio = import("@/app/api/documentos/[id]/envio/route")

async function conUsuario<T>(email: string, fn: () => Promise<T>): Promise<T> {
  const user = await prisma.usuario.findUnique({ where: { email } })
  if (!user) throw new Error(`usuario no encontrado: ${email}`)
  const { cookieSesionAuthjs } = await import("../helpers/sesion-authjs")
  const previa = state.cookie
  state.cookie = await cookieSesionAuthjs({ sub: user.id, email: user.email })
  try {
    return await fn()
  } finally {
    state.cookie = previa
  }
}

function enviar(id: string, body: unknown): Promise<Response> {
  return invocarApi(rutaEnvio, "POST", `documentos/${id}/envio`, { params: { id }, body })
}

function constancia(id: string): Promise<Response> {
  return invocarApi(rutaEnvio, "GET", `documentos/${id}/envio`, { params: { id } })
}

/** Filas persistidas de la entrega del documento, más vieja primero. */
function filas(documentoId: string) {
  return prisma.envioDocumento.findMany({
    where: { documentoId },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  })
}

function notificacionesDeLaComunidad(): Promise<number> {
  return prisma.notificacion.count({ where: { comunidadId: COM_A } })
}

function documental(id: string, overrides: Partial<FilaDocumento> = {}): FilaDocumento {
  return {
    id,
    naturaleza: "legal",
    tipoDocumental: "actas-asamblea",
    glosa: `Documento legal ${id}`,
    referenciaAutentica: "Notaría 4ª, fojas 12, 2026-03-15",
    archivoNombre: `${id}.pdf`,
    archivoTipoMime: "application/pdf",
    archivoTamanoKB: 120,
    archivoUrl: `/archivo-documentos/${id}.pdf`,
    vigenteDesde: "2026-03-15",
    version: 1,
    ...overrides,
  }
}

/** Fila del archivo tal como se siembra en la base (no pasa por la ruta de A1). */
interface FilaDocumento {
  id: string
  naturaleza: string
  tipoDocumental: string
  glosa: string
  referenciaAutentica?: string
  archivoNombre: string
  archivoTipoMime: string
  archivoTamanoKB: number
  archivoUrl: string
  vigenteDesde: string
  version: number
}

describe("F35-A3 · envío de documentos legales con constancia por destinatario (S7/S8)", () => {
  beforeAll(async () => {
    process.env.AUTH_SECRET = AUTH_SECRET
    process.env.NEXT_PUBLIC_APP_ENV = "development"
    vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 })

    for (const c of [
      { id: COM_A, nombre: "Comunidad Envío Documentos A", slug: "docenv-a" },
      { id: COM_B, nombre: "Comunidad Envío Documentos B", slug: "docenv-b" },
    ]) {
      await prisma.comunidad.upsert({ where: { id: c.id }, update: {}, create: c })
    }
    for (const u of usuarios) {
      await prisma.usuario.upsert({
        where: { email: u.email },
        update: { activo: true },
        create: { id: u.id, email: u.email, activo: true },
      })
    }
    await prisma.membresia.deleteMany({
      where: { usuarioId: { in: usuarios.map((u) => u.id) } },
    })
    for (const u of usuarios) {
      await prisma.membresia.create({
        data: { usuarioId: u.id, comunidadId: COM_A, rol: u.rol },
      })
    }

    await limpiar()

    // Personas de A con correo plausible y una de B: el correo nunca se envía
    // (no hay CF), pero el destinatario de registro tiene que existir.
    for (const p of [
      { id: P1, comunidadId: COM_A, rut: "11111111-1", email: "docenv-p1@residenciallasacacias.cl" },
      { id: P2, comunidadId: COM_A, rut: "22222222-2", email: "docenv-p2@residenciallasacacias.cl" },
      { id: P3, comunidadId: COM_A, rut: "33333333-3", email: "docenv-p3@residenciallasacacias.cl" },
      { id: PB, comunidadId: COM_B, rut: "44444444-4", email: "docenv-pb@residenciallasacacias.cl" },
      // Dominio ficticio de los datos semilla: no existe como buzón.
      { id: P4, comunidadId: COM_A, rut: "55555555-5", email: "docenv-p4@email.com" },
      // Sin correo cargado: el destinatario existe, la dirección no.
      { id: P5, comunidadId: COM_A, rut: "66666666-6", email: "" },
    ]) {
      await prisma.persona.create({
        data: {
          ...p,
          nombreCompleto: `Persona ${p.id}`,
          nombres: "Persona",
          apellidos: p.id,
          telefonoMovil: "+56911111111",
          estadoCuenta: "activa",
          condicionesEspecialesIds: [],
          roles: ["propietario"],
        },
      })
    }

    for (const d of [
      documental(DOC_VISOR, { glosa: "Acta de asamblea ordinaria 2026" }),
      documental(DOC_EMAIL, { tipoDocumental: "polizas-seguro", glosa: "Póliza de seguro 2026" }),
      documental(DOC_EMAIL_FALLIDO, {
        tipoDocumental: "plan-emergencia",
        glosa: "Plan de emergencia 2026",
      }),
      documental(DOC_PERMISOS, { tipoDocumental: "actas-comite", glosa: "Acta de comité 2026" }),
      documental(DOC_COMUNITARIO, {
        naturaleza: "comunitario",
        tipoDocumental: "otros",
        glosa: "Circular de trabajos de fachada",
        referenciaAutentica: undefined,
      }),
      documental(DOC_AJENO, { glosa: "Acta de asamblea de la comunidad B" }),
    ]) {
      const { id, ...resto } = d
      await prisma.documento.create({
        data: {
          ...resto,
          id,
          comunidadId: id === DOC_AJENO ? COM_B : COM_A,
        },
      })
    }
  })

  afterAll(async () => {
    try {
      state.cookie = ""
      await limpiar()
      await prisma.membresia.deleteMany({
        where: { usuarioId: { in: usuarios.map((u) => u.id) } },
      })
      await prisma.usuario.deleteMany({ where: { id: { in: usuarios.map((u) => u.id) } } })
      await prisma.comunidad.deleteMany({ where: { id: { in: [COM_A, COM_B] } } })
    } catch {
      // intencional: limpieza best-effort
    }
  })

  async function limpiar(): Promise<void> {
    const where = { comunidadId: { in: [COM_A, COM_B] } }
    await prisma.envioDocumento.deleteMany({ where })
    await prisma.notificacion.deleteMany({ where })
    await prisma.eventoAuditoria.deleteMany({ where })
    await prisma.documento.deleteMany({ where })
    await prisma.persona.deleteMany({ where })
    // Sin emisor configurado el correo queda en cola: la prueba no puede
    // depender de una CF que otro archivo haya dejado.
    await prisma.configuracionGlobal.deleteMany({ where })
  }

  it("S7 · una corrida entrega a N destinatarios y registra una fila por persona", async () => {
    const res = await conUsuario(EMAIL_ADMIN, () =>
      enviar(DOC_VISOR, { personasIds: [P1, P2, P3], canal: "visor" })
    )
    expect(res.status).toBe(200)
    const json = await cuerpoJson<Json>(res)
    expect(json.ok).toBe(true)
    expect(json.documentoId).toBe(DOC_VISOR)
    expect(json.canal).toBe("visor")
    expect(json.reenvio).toBe(false)
    expect(json.idempotente).toBe(false)

    const resultados = json.resultados as Json[]
    expect(resultados).toHaveLength(3)
    expect(resultados.every((r) => r.estado === "entregado")).toBe(true)
    expect(resultados.every((r) => r.fecha === hoyISO())).toBe(true)
    expect(resultados.map((r) => r.personaId).sort()).toEqual([P1, P2, P3].sort())
    expect(resultados.every((r) => typeof r.notificacionId === "string")).toBe(true)
    expect(resultados.every((r) => typeof r.envioId === "string")).toBe(true)

    const persistidas = await filas(DOC_VISOR)
    expect(persistidas).toHaveLength(3)
    for (const fila of persistidas) {
      expect(fila.canal).toBe("visor")
      expect(fila.estado).toBe("entregado")
      expect(fila.fecha).toBe(hoyISO())
      expect(fila.reenvio).toBe(false)
      // La clave es documento+destinatario+canal: la misma forma que decide la
      // idempotencia de la corrida siguiente.
      expect(fila.claveEnvio).toBe(`${DOC_VISOR}:${fila.personaId}:visor`)
      expect(fila.notificacionId).not.toBeNull()

      // El visor ES la notificación: la fila de la bandeja existe, es de esa
      // persona y dice qué documento se le puso a disposición.
      const notificacion = await prisma.notificacion.findUnique({
        where: { id: fila.notificacionId ?? "" },
      })
      expect(notificacion).not.toBeNull()
      expect(notificacion?.comunidadId).toBe(COM_A)
      expect(notificacion?.destinatarioPersonaId).toBe(fila.personaId)
      expect(notificacion?.moduloOrigen).toBe("AD")
      expect(notificacion?.asunto).toContain("Acta de asamblea ordinaria 2026")
      expect(notificacion?.cuerpo).toContain("Acta de asamblea ordinaria 2026")
      expect(notificacion?.cuerpo).toContain("versión 1")
    }

    // El envío es un acto auditable: deja su evento en la bitácora.
    const evento = await prisma.eventoAuditoria.findFirst({
      where: { comunidadId: COM_A, referenciaId: DOC_VISOR, tipoAccion: "AD_DOC_ENVIO" },
    })
    expect(evento).not.toBeNull()
    expect(evento?.categoria).toBe("AD")
    expect(evento?.descripcion).toContain("Acta de asamblea ordinaria 2026")
  })

  it("S7 · dos corridas iguales no duplican ni filas ni notificaciones", async () => {
    const antes = await filas(DOC_VISOR)
    const notificacionesAntes = await notificacionesDeLaComunidad()
    const eventosAntes = await prisma.eventoAuditoria.count({
      where: { comunidadId: COM_A, referenciaId: DOC_VISOR },
    })

    const res = await conUsuario(EMAIL_ADMIN, () =>
      enviar(DOC_VISOR, { personasIds: [P1, P2, P3], canal: "visor" })
    )
    expect(res.status).toBe(200)
    const json = await cuerpoJson<Json>(res)
    expect(json.idempotente).toBe(true)
    expect(json.reenvio).toBe(false)

    const resultados = json.resultados as Json[]
    expect(resultados).toHaveLength(3)
    expect(resultados.every((r) => r.estado === "duplicado")).toBe(true)
    // El duplicado devuelve la fila que YA existe: no se inventa un id nuevo.
    const idsPrevios = new Map(antes.map((f) => [f.personaId, f.id]))
    for (const resultado of resultados) {
      expect(resultado.envioId).toBe(idsPrevios.get(String(resultado.personaId)))
      expect(String(resultado.motivo)).toMatch(/reenvío explícito/i)
    }

    expect(await filas(DOC_VISOR)).toHaveLength(antes.length)
    expect(await notificacionesDeLaComunidad()).toBe(notificacionesAntes)
    // Una corrida idempotente no escribe nada: tampoco un evento nuevo.
    expect(
      await prisma.eventoAuditoria.count({
        where: { comunidadId: COM_A, referenciaId: DOC_VISOR },
      })
    ).toBe(eventosAntes)
  })

  it("S7 · el reenvío explícito agrega una fila con sufijo :reenvio:<epoch>", async () => {
    const antes = await filas(DOC_VISOR)
    const notificacionesAntes = await notificacionesDeLaComunidad()

    const res = await conUsuario(EMAIL_ADMIN, () =>
      enviar(DOC_VISOR, { personasIds: [P1, P2, P3], canal: "visor", reenviar: true })
    )
    expect(res.status).toBe(200)
    const json = await cuerpoJson<Json>(res)
    expect(json.reenvio).toBe(true)
    expect(json.idempotente).toBe(false)
    expect((json.resultados as Json[]).every((r) => r.estado === "entregado")).toBe(true)

    const despues = await filas(DOC_VISOR)
    expect(despues).toHaveLength(antes.length + 3)
    const nuevas = despues.filter((f) => !antes.some((previa) => previa.id === f.id))
    expect(nuevas).toHaveLength(3)
    expect(nuevas.every((f) => f.reenvio)).toBe(true)
    for (const fila of nuevas) {
      // La clave del reenvío conserva la base (documento+persona+canal) y suma
      // el sufijo: nunca repite la fila anterior.
      expect(fila.claveEnvio).toMatch(
        new RegExp(`^${DOC_VISOR}:${fila.personaId}:visor:reenvio:\\d+$`)
      )
      expect(fila.estado).toBe("entregado")
      expect(fila.notificacionId).not.toBeNull()
      // Reenviar el visor entrega OTRA notificación (la persona la vuelve a ver).
      const previa = antes.find((f) => f.personaId === fila.personaId)
      expect(fila.notificacionId).not.toBe(previa?.notificacionId)
    }
    expect(await notificacionesDeLaComunidad()).toBe(notificacionesAntes + 3)

    const evento = await prisma.eventoAuditoria.findFirst({
      where: { comunidadId: COM_A, referenciaId: DOC_VISOR, tipoAccion: "AD_DOC_ENVIO_RESENT" },
    })
    expect(evento).not.toBeNull()
  })

  it("S7 · sin emisor SMTP el correo queda pendiente con su motivo y nunca entregado", async () => {
    const res = await conUsuario(EMAIL_ADMIN, () =>
      enviar(DOC_EMAIL, { personasIds: [P1], canal: "email" })
    )
    expect(res.status).toBe(200)
    const json = await cuerpoJson<Json>(res)
    const resultados = json.resultados as Json[]
    expect(resultados).toHaveLength(1)
    expect(resultados[0]?.estado).toBe("pendiente")
    const motivo = String(resultados[0]?.motivo)
    expect(motivo).toMatch(/sin emisor SMTP configurado/i)
    expect(motivo).toMatch(/cola de salida|outbox/)
    expect(motivo).toMatch(/no se reporta como enviado/i)
    // Nadie aceptó nada: el correo no se declara entregado.
    expect(resultados[0]?.estado).not.toBe("entregado")
    expect(resultados[0]?.notificacionId).toBeUndefined()

    const persistidas = await filas(DOC_EMAIL)
    expect(persistidas).toHaveLength(1)
    expect(persistidas[0]?.canal).toBe("email")
    expect(persistidas[0]?.estado).toBe("pendiente")
    expect(persistidas[0]?.motivo).toBe(motivo)
    expect(persistidas[0]?.notificacionId).toBeNull()

    // La constancia (GET) dice lo mismo que la respuesta: un estado `pendiente`
    // no se lee como entrega.
    const lectura = await conUsuario(EMAIL_ADMIN, () => constancia(DOC_EMAIL))
    expect(lectura.status).toBe(200)
    const cuerpoLectura = await cuerpoJson<Json>(lectura)
    const envios = cuerpoLectura.envios as Json[]
    expect(envios).toHaveLength(1)
    expect(cuerpoLectura.total).toBe(1)
    expect(envios[0]?.estado).toBe("pendiente")
    expect(envios[0]?.motivo).toMatch(/cola de salida|outbox/)
    expect(envios[0]?.personaNombre).toBe(`Persona ${P1}`)
    expect(envios.map((e) => e.estado)).not.toContain("entregado")
  })

  it("S7 · un correo que no puede llegar queda fallido con su motivo y sin conexión", async () => {
    const res = await conUsuario(EMAIL_ADMIN, () =>
      enviar(DOC_EMAIL_FALLIDO, { personasIds: [P4, P5], canal: "email" })
    )
    expect(res.status).toBe(200)
    const json = await cuerpoJson<Json>(res)
    const resultados = json.resultados as Json[]
    expect(resultados).toHaveLength(2)
    // Cada destinatario tiene su propio desenlace: una dirección imposible y una
    // persona sin dirección no se confunden entre sí.
    const porPersona = new Map(resultados.map((r) => [String(r.personaId), r]))
    expect(porPersona.get(P4)?.estado).toBe("fallido")
    expect(porPersona.get(P5)?.estado).toBe("fallido")
    // `fallido` es un intento rechazado, no una entrega ni una cola.
    expect(resultados.every((r) => r.estado === "fallido")).toBe(true)
    expect(resultados.every((r) => r.notificacionId === undefined)).toBe(true)

    const motivoDireccion = String(porPersona.get(P4)?.motivo)
    expect(motivoDireccion).toContain("docenv-p4@email.com")
    expect(motivoDireccion).toMatch(/dominio ficticio de los datos semilla/i)
    expect(motivoDireccion).toMatch(/no se envió nada/i)

    const motivoSinCorreo = String(porPersona.get(P5)?.motivo)
    expect(motivoSinCorreo).toMatch(/no tiene correo electrónico registrado/i)
    expect(motivoSinCorreo).toMatch(/falló el envío por smtp/i)
    // Nunca `pendiente` (eso es "sin emisor configurado") ni `entregado`.
    expect(motivoSinCorreo).not.toBe(motivoDireccion)

    const persistidas = await filas(DOC_EMAIL_FALLIDO)
    expect(persistidas).toHaveLength(2)
    expect(persistidas.every((fila) => fila.estado === "fallido")).toBe(true)
    expect(persistidas.every((fila) => fila.notificacionId === null)).toBe(true)
    const filaP4 = persistidas.find((fila) => fila.personaId === P4)
    expect(filaP4?.motivo).toBe(motivoDireccion)
    const filaP5 = persistidas.find((fila) => fila.personaId === P5)
    expect(filaP5?.motivo).toBe(motivoSinCorreo)
  })

  it("S7 · el correo queda entregado SOLO cuando el servidor SMTP acepta el mensaje", async () => {
    const servidor = await iniciarServidorSMTPFalso({ secreto: CLAVE_SMTP })
    const secretoPrevio = process.env.SMTP_PASSWORD
    process.env.SMTP_PASSWORD = CLAVE_SMTP
    const cf = {
      ...configuracionDefault,
      smtpHost: "127.0.0.1",
      smtpPort: servidor.port,
      smtpUser: USUARIO_SMTP,
      smtpSecurity: "none",
      smtpFrom: "no-responder@ejemplo.test",
      smtpFromName: "Comunidad de prueba",
      smtpBcc: null,
      smtpRecepcion: null,
    }
    try {
      await prisma.configuracionGlobal.upsert({
        where: { comunidadId: COM_A },
        update: cf,
        create: { id: `cfg-${COM_A}`, comunidadId: COM_A, ...cf },
      })

      const res = await conUsuario(EMAIL_ADMIN, () =>
        enviar(DOC_EMAIL, { personasIds: [P2], canal: "email" })
      )
      expect(res.status).toBe(200)
      const json = await cuerpoJson<Json>(res)
      const resultados = json.resultados as Json[]
      expect(resultados).toHaveLength(1)
      // Aceptación del servidor = `entregado` en el vocabulario del documento
      // (el aviso lo llama `enviado`): nunca se declara sin esa aceptación.
      expect(resultados[0]?.estado).toBe("entregado")
      const motivo = String(resultados[0]?.motivo)
      expect(motivo).toMatch(/aceptado por el servidor SMTP/i)
      expect(motivo).toContain("falso-0001@ejemplo.test")

      const persistida = (await filas(DOC_EMAIL)).find((fila) => fila.personaId === P2)
      expect(persistida?.estado).toBe("entregado")
      expect(persistida?.motivo).toBe(motivo)
      // El correo no crea notificación: su prueba es la aceptación del servidor.
      expect(persistida?.notificacionId).toBeNull()

      // El mensaje salió hacia el servidor falso de 127.0.0.1 (nada real) y su
      // texto es el del documento: glosa, tipo y versión.
      expect(servidor.mensajes).toHaveLength(1)
      expect(servidor.mensajes[0]?.to).toEqual(["docenv-p2@residenciallasacacias.cl"])
      expect(servidor.mensajes[0]?.crudo).toContain("Póliza de seguro 2026")
      expect(servidor.mensajes[0]?.crudo).toContain("versión 1")
      expect(servidor.mensajes[0]?.crudo).not.toContain(CLAVE_SMTP)
      expect(JSON.stringify(json)).not.toContain(CLAVE_SMTP)
    } finally {
      await prisma.configuracionGlobal.deleteMany({ where: { comunidadId: COM_A } })
      if (secretoPrevio === undefined) delete process.env.SMTP_PASSWORD
      else process.env.SMTP_PASSWORD = secretoPrevio
      await servidor.cerrar()
    }
  })

  it("S8 · un documento comunitario se publica y no se entrega por persona (409)", async () => {
    const notificacionesAntes = await notificacionesDeLaComunidad()

    const res = await conUsuario(EMAIL_ADMIN, () =>
      enviar(DOC_COMUNITARIO, { personasIds: [P1], canal: "visor" })
    )
    expect(res.status).toBe(409)
    const json = await cuerpoJson<Json>(res)
    expect(String(json.error)).toMatch(/comunitario/i)
    expect(String(json.error)).toMatch(/publicad/i)
    expect(String(json.error)).toMatch(/entrega por destinatario/i)

    // Nada escrito: ni constancia de entrega ni notificación.
    expect(await filas(DOC_COMUNITARIO)).toHaveLength(0)
    expect(await notificacionesDeLaComunidad()).toBe(notificacionesAntes)
  })

  it("S7 · el documento de otra comunidad no se entrega ni se lee (404)", async () => {
    const res = await conUsuario(EMAIL_ADMIN, () =>
      enviar(DOC_AJENO, { personasIds: [P1], canal: "visor" })
    )
    expect(res.status).toBe(404)
    expect((await cuerpoJson<Json>(res)).error).toBe("Registro no encontrado.")

    const lectura = await conUsuario(EMAIL_ADMIN, () => constancia(DOC_AJENO))
    expect(lectura.status).toBe(404)

    expect(await filas(DOC_AJENO)).toHaveLength(0)
  })

  it("S7 · un destinatario de otra comunidad se rechaza y no se escribe nada", async () => {
    const notificacionesAntes = await notificacionesDeLaComunidad()

    const res = await conUsuario(EMAIL_ADMIN, () =>
      enviar(DOC_PERMISOS, { personasIds: [P1, PB], canal: "visor" })
    )
    expect(res.status).toBe(400)
    const json = await cuerpoJson<Json>(res)
    expect(String(json.error)).toContain(PB)
    expect(String(json.error)).toMatch(/comunidad/i)

    expect(await filas(DOC_PERMISOS)).toHaveLength(0)
    expect(await notificacionesDeLaComunidad()).toBe(notificacionesAntes)
  })

  it("S7 · sesión y permiso: 401 sin sesión, 403 del residente, comité envía y audita", async () => {
    state.cookie = ""
    expect((await enviar(DOC_PERMISOS, { personasIds: [P1], canal: "visor" })).status).toBe(401)

    await conUsuario(EMAIL_RESIDENTE, async () => {
      const envio = await enviar(DOC_PERMISOS, { personasIds: [P1], canal: "visor" })
      expect(envio.status).toBe(403)
      expect((await cuerpoJson<Json>(envio)).error).toBe("Permiso denegado.")
      // La constancia nominativa es la vista de auditoría: el residente ve su
      // entrega como notificación, no la nómina de destinatarios de terceros.
      expect((await constancia(DOC_VISOR)).status).toBe(403)
    })

    // El comité tiene `doc` crear (sube sus actas): puede entregar y auditar.
    await conUsuario(EMAIL_COMITE, async () => {
      const envio = await enviar(DOC_PERMISOS, { personasIds: [P2], canal: "visor" })
      expect(envio.status).toBe(200)
      expect((await cuerpoJson<Json>(envio)).idempotente).toBe(false)

      const lectura = await constancia(DOC_VISOR)
      expect(lectura.status).toBe(200)
      const json = await cuerpoJson<Json>(lectura)
      expect(json.documentoId).toBe(DOC_VISOR)
      expect(json.glosa).toBe("Acta de asamblea ordinaria 2026")
      expect(json.naturaleza).toBe("legal")
      const envios = json.envios as Json[]
      expect(envios).toHaveLength(6)
      expect(envios.every((e) => typeof e.personaNombre === "string")).toBe(true)
    })
  })

  it("un cuerpo inválido no entrega nada", async () => {
    const antes = await filas(DOC_PERMISOS)
    const notificacionesAntes = await notificacionesDeLaComunidad()

    await conUsuario(EMAIL_ADMIN, async () => {
      for (const body of [
        { personasIds: [], canal: "visor" },
        { canal: "visor" },
        { personasIds: [P1], canal: "fax" },
        { personasIds: "P1", canal: "visor" },
      ]) {
        const res = await enviar(DOC_PERMISOS, body)
        expect(res.status).toBe(400)
        expect((await cuerpoJson<Json>(res)).error).toBe("Datos del envío inválidos.")
      }
    })

    expect(await filas(DOC_PERMISOS)).toHaveLength(antes.length)
    expect(await notificacionesDeLaComunidad()).toBe(notificacionesAntes)
  })
})
