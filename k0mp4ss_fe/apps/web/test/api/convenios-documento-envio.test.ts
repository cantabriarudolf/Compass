/** @vitest-environment node */
/**
 * F29 · T2 — el envío REAL del papel firmado del convenio y su constancia (S2).
 *
 * El archivado del papel (`/api/convenios/documento`) deja de fabricar una
 * constancia `pendiente` para siempre: DESPUÉS del commit cursa el envío por el
 * emisor SMTP de la comunidad (la misma credencial cifrada del aviso de cobro,
 * `lib/smtp.ts` vía `lib/entrega-aviso.ts`), con el PDF ADJUNTO leído del
 * depósito privado, y la constancia dice lo que pasó:
 *
 *   1. con credencial configurada y el servidor aceptando, la constancia queda
 *      `entregado` con el destinatario (el deudor que firmó) registrado y el
 *      nombre del adjunto en el DATA que recibió el doble de SMTP;
 *   2. sin credencial de correo NO se finge el envío: la constancia queda
 *      `pendiente` con el motivo literal con el que nació y el PDF NO sale;
 *   3. si el SMTP rechaza, la constancia queda `fallido` con el error del
 *      servidor VERBATIM dentro del motivo;
 *   4. el reenvío manual sobre `fallido` pasa a `entregado` y SUMA UN EVENTO,
 *      sin crear una segunda constancia (una sola fila, actualizada);
 *   5. el reenvío sobre `entregado` responde 409: la aceptación ya está
 *      probada y no se repite;
 *   6. sin correo del deudor no hay envío (ni con credencial configurada): la
 *      constancia queda `pendiente` con su motivo literal;
 *   7. el reenvío sobre `pendiente` lo vuelve a intentar: si sigue sin emisor,
 *      queda `pendiente` y suma un evento.
 *
 * BD real + depósito HTTP falso + servidor SMTP falso, los dos en 127.0.0.1:
 * ninguna conexión sale a internet y ninguna credencial es real (S5).
 */
import { createServer, type Server, type ServerResponse } from "node:http"
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
import { http, passthrough } from "msw"
import { prisma } from "@/lib/prisma"
import { server as servidorMSW } from "../setup"
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

const AUTH_SECRET = "f29t2-secret-12345678"
/** Clave maestra de prueba: 32 bytes, no una credencial real. */
const CLAVE_MAESTRA = Buffer.alloc(32, 43).toString("base64")
/** Contraseña SMTP inventada: no es una credencial, es texto de prueba. */
const CLAVE_FALSA = "clave-f29t2-inventada"
const USUARIO_SMTP = "emisor@f29t2-convenios.cl"
const TOKEN_DEL_DEPOSITO = "f29t2-token-de-deposito"
const VERSION_API_DEL_DEPOSITO = "12"

const COM_A = "f29t2-com-a"
const COM_B = "f29t2-com-b"
const EMAIL_ADMIN_A = "f29t2-admin-a@test.cl"
const EMAIL_ADMIN_B = "f29t2-admin-b@test.cl"
const U_C1 = "f29t2-u-c1"
const U_C2 = "f29t2-u-c2"
const U_C3 = "f29t2-u-c3"
const U_C4 = "f29t2-u-c4"
const P_DEUDOR = "f29t2-p-deudor"
const P_SIN_CORREO = "f29t2-p-sin-correo"
const P_DEUDOR_B = "f29t2-p-deudor-b"
const EMAIL_DEUDOR = "deudor@f29t2-convenios.cl"
const ACUERDO_A = "f29t2-acuerdo-a"
const ACUERDO_B = "f29t2-acuerdo-b"
const C1 = "f29t2-convenio-c1"
const C2 = "f29t2-convenio-c2"
const C3 = "f29t2-convenio-c3"
const C4 = "f29t2-convenio-c4"

/** Motivo literal con el que nace la constancia (lib/convenio-documento.ts). */
const MOTIVO_LITERAL_DE_NACIMIENTO =
  "El convenio firmado quedó archivado, pero su entrega al deudor todavía no se cursó por ningún canal: la constancia queda pendiente hasta que exista un envío real. El estado `entregado` sólo se registra si el servidor de correo aceptó el mensaje."

/** Mensaje 409 del reenvío sobre un estado final (idéntico al de la ruta). */
const MENSAJE_REENVIO_SOBRE_ENTREGADO =
  "La constancia de entrega del convenio ya figura como entregado: el servidor de correo aceptó el mensaje y el reenvío no se cursa de nuevo."

const envPrevio = {
  auth: process.env.AUTH_SECRET,
  maestra: process.env[VARIABLE_CLAVE_MAESTRA],
  token: process.env.BLOB_READ_WRITE_TOKEN,
  base: process.env.BLOB_API_BASE_URL,
  smtpPassword: process.env.SMTP_PASSWORD,
}

const servidores: ServidorSMTPFalso[] = []

async function levantarServidor(
  opciones: Parameters<typeof iniciarServidorSMTPFalso>[0] = {}
): Promise<ServidorSMTPFalso> {
  const servidor = await iniciarServidorSMTPFalso({
    usuario: USUARIO_SMTP,
    secreto: CLAVE_FALSA,
    ...opciones,
  })
  servidores.push(servidor)
  return servidor
}

function fijar(variable: string, valor: string | undefined): void {
  if (valor === undefined) delete process.env[variable]
  else process.env[variable] = valor
}

// ── Depósito privado falso (misma API REST que usa lib/almacen-documentos) ──

interface ObjetoDelDeposito {
  bytes: Buffer
  tipoMime: string
}

interface ServidorDepositoFalso {
  readonly baseUrl: string
  readonly objetos: Map<string, ObjetoDelDeposito>
  cerrar(): Promise<void>
}

async function iniciarServidorDepositoFalso(): Promise<ServidorDepositoFalso> {
  const objetos = new Map<string, ObjetoDelDeposito>()

  const responder = (res: ServerResponse, status: number, cuerpo: unknown): void => {
    const texto = JSON.stringify(cuerpo)
    res.writeHead(status, {
      "content-type": "application/json",
      "content-length": String(Buffer.byteLength(texto)),
    })
    res.end(texto)
  }

  const servidor: Server = createServer((req, res) => {
    const trozos: Buffer[] = []
    req.on("data", (trozo: Buffer) => trozos.push(Buffer.from(trozo)))
    req.on("end", () => {
      const url = new URL(req.url ?? "/", "http://127.0.0.1")
      const pathname = decodeURIComponent(url.pathname.replace(/^\//, ""))
      const autorizacion = String(req.headers.authorization ?? "")
      const version = String(req.headers["x-api-version"] ?? "")
      const acceso = String(req.headers["x-vercel-blob-access"] ?? "")
      const metodo = req.method ?? ""

      if (autorizacion !== `Bearer ${TOKEN_DEL_DEPOSITO}`) {
        responder(res, 403, { error: "el depósito de prueba exige su token" })
        return
      }
      if (version !== VERSION_API_DEL_DEPOSITO) {
        responder(res, 400, { error: "el depósito de prueba exige x-api-version 12" })
        return
      }

      if (metodo === "PUT") {
        if (acceso !== "private") {
          responder(res, 400, { error: "el depósito de prueba es privado" })
          return
        }
        const tipoMime = String(req.headers["x-content-type"] ?? "application/octet-stream")
        objetos.set(pathname, { bytes: Buffer.concat(trozos), tipoMime })
        responder(res, 200, {
          pathname,
          url: `${url.origin}/${pathname}`,
          contentType: tipoMime,
        })
        return
      }

      if (metodo === "GET") {
        const objeto = objetos.get(pathname)
        if (!objeto) {
          responder(res, 404, { error: "el archivo no existe en el depósito" })
          return
        }
        res.writeHead(200, {
          "content-type": objeto.tipoMime,
          "content-length": String(objeto.bytes.length),
        })
        res.end(objeto.bytes)
        return
      }

      if (metodo === "DELETE") {
        objetos.delete(pathname)
        responder(res, 200, { deleted: true, pathname })
        return
      }

      responder(res, 405, { error: "método no soportado por el depósito de prueba" })
    })
  })

  const puerto = await new Promise<number>((resolver, rechazar) => {
    servidor.once("error", rechazar)
    servidor.listen(0, "127.0.0.1", () => {
      const direccion = servidor.address()
      if (direccion === null || typeof direccion === "string") {
        rechazar(new Error("el depósito de prueba no obtuvo un puerto TCP"))
        return
      }
      resolver(direccion.port)
    })
  })

  return {
    baseUrl: `http://127.0.0.1:${puerto}`,
    objetos,
    async cerrar(): Promise<void> {
      await new Promise<void>((resolver) => servidor.close(() => resolver()))
    },
  }
}

/** PDF mínimo REAL: cabecera mágica `%PDF-` y `%%EOF` (la ruta mira BYTES). */
function pdfMinimo(marca: string): Buffer {
  const lineas = [
    "%PDF-1.4",
    `% ${marca}`,
    "1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj",
    "2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj",
    "3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 400]>>endobj",
    "trailer<</Root 1 0 R>>",
    "startxref",
    "0",
    "%%EOF",
    "",
  ]
  return Buffer.from(lineas.join("\n"), "latin1")
}

/** El base64 del adjunto trozado a 76 columnas (RFC 2045). */
function base64Trozado(bytes: Buffer): string {
  return (bytes.toString("base64").match(/.{1,76}/g) ?? []).join("\r\n")
}

describe("F29 T2 · /api/convenios/documento — el envío real del papel firmado (S2)", () => {
  let deposito: ServidorDepositoFalso
  let servidorAcepta1: ServidorSMTPFalso
  let servidorRechaza: ServidorSMTPFalso
  let servidorAcepta2: ServidorSMTPFalso

  /** Constancia de C2, fijada por el caso 3 y reusada por los casos 4 y 5. */
  let constanciaDeC2: string | null = null

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

  async function POST_DOCUMENTO(body: Record<string, unknown>): Promise<Response> {
    const { POST } = await import("@/app/api/convenios/documento/route")
    return POST(
      new NextRequest("http://localhost/api/convenios/documento", {
        method: "POST",
        body: JSON.stringify(body),
        headers: { "content-type": "application/json" },
      })
    )
  }

  async function POST_REENVIAR(convenioId: string): Promise<Response> {
    const { POST } = await import("@/app/api/convenios/documento/reenviar/route")
    return POST(
      new NextRequest("http://localhost/api/convenios/documento/reenviar", {
        method: "POST",
        body: JSON.stringify({ convenioId }),
        headers: { "content-type": "application/json" },
      })
    )
  }

  interface VistaDocumentoFirmado {
    id: string
    convenioId: string
    constancia: { id: string; estado: string; personaId: string; motivo: string }
  }

  /** La constancia persistida del papel de un convenio (una sola fila siempre). */
  async function constanciaDe(convenioId: string) {
    const convenio = await prisma.convenioPago.findUnique({ where: { id: convenioId } })
    if (!convenio?.documentoId) throw new Error("el convenio no tiene documento archivado")
    const filas = await prisma.envioDocumento.findMany({
      where: { documentoId: convenio.documentoId },
    })
    expect(filas).toHaveLength(1)
    return filas[0]!
  }

  async function eventosDe(convenioId: string, tipoAccion: string): Promise<number> {
    return prisma.eventoAuditoria.count({
      where: { comunidadId: COM_A, tipoAccion, referenciaId: convenioId },
    })
  }

  beforeAll(async () => {
    fijar("AUTH_SECRET", AUTH_SECRET)
    fijar(VARIABLE_CLAVE_MAESTRA, CLAVE_MAESTRA)
    fijar("SMTP_PASSWORD", undefined)

    deposito = await iniciarServidorDepositoFalso()
    process.env.BLOB_READ_WRITE_TOKEN = TOKEN_DEL_DEPOSITO
    process.env.BLOB_API_BASE_URL = deposito.baseUrl

    servidorAcepta1 = await levantarServidor({ modo: "aceptar" })

    for (const c of [
      { id: COM_A, nombre: "Comunidad F29 Envío A", slug: "f29t2-com-a" },
      { id: COM_B, nombre: "Comunidad F29 Envío B", slug: "f29t2-com-b" },
    ]) {
      await prisma.comunidad.upsert({ where: { id: c.id }, update: {}, create: c })
    }

    // CF de A: remitente y nombre para la credencial de la comunidad (F33).
    const cf = {
      ...configuracionDefault,
      smtpHost: "127.0.0.1",
      smtpPort: servidorAcepta1.port,
      smtpUser: USUARIO_SMTP,
      smtpSecurity: "none",
      smtpFrom: "no-responder@f29t2-convenios.cl",
      smtpFromName: "Comunidad F29 Envío A",
      smtpBcc: null,
      smtpRecepcion: null,
    }
    await prisma.configuracionGlobal.upsert({
      where: { comunidadId: COM_A },
      update: cf,
      create: { id: `cfg-${COM_A}`, comunidadId: COM_A, ...cf },
    })

    // Credencial CIFRADA de la comunidad A, igual que PUT /api/configuracion/correo.
    const paquete = cifrarSecreto(CLAVE_FALSA, { [VARIABLE_CLAVE_MAESTRA]: CLAVE_MAESTRA })
    await prisma.credencialCorreoComunidad.upsert({
      where: { comunidadId: COM_A },
      update: { puerto: servidorAcepta1.port, ...paquete },
      create: {
        id: `cred-${COM_A}`,
        comunidadId: COM_A,
        host: "127.0.0.1",
        puerto: servidorAcepta1.port,
        usuario: USUARIO_SMTP,
        ...paquete,
        actualizadoPor: "test",
      },
    })

    // B no tiene CF ni credencial: la comunidad sin emisor de la regla S2.
    for (const p of [
      {
        id: P_DEUDOR,
        comunidadId: COM_A,
        rut: "20444444-4",
        nombreCompleto: "Deudor F29 T2",
        email: EMAIL_DEUDOR,
      },
      {
        // Sin correo cargado: la representación del modelo es la cadena vacía.
        id: P_SIN_CORREO,
        comunidadId: COM_A,
        rut: "20444445-4",
        nombreCompleto: "Deudor Sin Correo",
        email: "",
      },
      {
        id: P_DEUDOR_B,
        comunidadId: COM_B,
        rut: "20444446-4",
        nombreCompleto: "Deudor Sin Emisor",
        email: EMAIL_DEUDOR,
      },
    ]) {
      await prisma.persona.upsert({
        where: { id: p.id },
        update: {},
        create: {
          ...p,
          nombres: (p.nombreCompleto ?? "").split(" ")[0]!,
          apellidos: (p.nombreCompleto ?? "").split(" ").slice(1).join(" "),
          telefonoMovil: "+56900000000",
          estadoCuenta: "activa",
          condicionesEspecialesIds: [],
          roles: ["propietario"],
        },
      })
    }

    for (const u of [
      { id: U_C1, comunidadId: COM_A, numero: "201" },
      { id: U_C2, comunidadId: COM_A, numero: "202" },
      { id: U_C3, comunidadId: COM_A, numero: "203" },
      { id: U_C4, comunidadId: COM_B, numero: "901" },
    ]) {
      await prisma.unidad.upsert({
        where: { id: u.id },
        update: {},
        create: {
          ...u,
          microSectorId: `f29t2-ms-${u.numero}`,
          etiqueta: "Depto",
          tipoUnidadId: "f29t2-tu-1",
          metraje: 50,
          prorrateo: 10,
          rolSii: `f29t2-${u.numero}`,
          estadoId: "habitada",
          servicios: {},
        },
      })
    }

    for (const a of [
      {
        id: ACUERDO_A,
        comunidadId: COM_A,
        cuerpo: "comite",
        materia: "Convenio de pago F29 T2 (Ley 21.442 art. 6)",
        folio: "AD-2026-9101",
        estado: "aprobado",
        quorumRequerido: "un_voto_por_miembro",
        resueltoEn: new Date("2026-02-10T12:00:00.000Z"),
        creadoPor: "f29t2-usuario-admin",
      },
      {
        id: ACUERDO_B,
        comunidadId: COM_B,
        cuerpo: "comite",
        materia: "Convenio de pago F29 T2 de la otra comunidad",
        folio: "AD-2026-9201",
        estado: "aprobado",
        quorumRequerido: "un_voto_por_miembro",
        resueltoEn: new Date("2026-02-10T12:00:00.000Z"),
        creadoPor: "f29t2-usuario-admin",
      },
    ]) {
      await prisma.acuerdo.upsert({ where: { id: a.id }, update: {}, create: a })
    }

    for (const convenio of [
      { id: C1, comunidadId: COM_A, unidadId: U_C1, personaId: P_DEUDOR, acuerdoId: ACUERDO_A },
      { id: C2, comunidadId: COM_A, unidadId: U_C2, personaId: P_DEUDOR, acuerdoId: ACUERDO_A },
      {
        id: C3,
        comunidadId: COM_A,
        unidadId: U_C3,
        personaId: P_SIN_CORREO,
        acuerdoId: ACUERDO_A,
      },
      {
        id: C4,
        comunidadId: COM_B,
        unidadId: U_C4,
        personaId: P_DEUDOR_B,
        acuerdoId: ACUERDO_B,
      },
    ]) {
      const datos = {
        ...convenio,
        montoTotal: 400_000,
        numeroCuotas: 2,
        fechaSuscripcion: new Date("2026-03-31T12:00:00.000Z"),
        primeraCuota: 100_000,
        estado: "vigente",
        creadoPor: "f29t2-usuario-admin",
        documentoId: null,
      }
      await prisma.convenioPago.upsert({
        where: { id: convenio.id },
        update: datos,
        create: datos,
      })
    }

    for (const u of [
      { id: "f29t2-usuario-admin-a", email: EMAIL_ADMIN_A, comunidadId: COM_A },
      { id: "f29t2-usuario-admin-b", email: EMAIL_ADMIN_B, comunidadId: COM_B },
    ]) {
      await prisma.usuario.upsert({
        where: { email: u.email },
        update: {},
        create: { id: u.id, email: u.email, activo: true, personaId: null },
      })
      await prisma.membresia.deleteMany({ where: { usuarioId: u.id } })
      await prisma.membresia.create({
        data: { usuarioId: u.id, comunidadId: u.comunidadId, rol: "administrador" },
      })
    }
  }, 30_000)

  beforeEach(() => {
    // El depósito sale de verdad, pero sólo a 127.0.0.1 (lo deja pasar MSW).
    servidorMSW.use(http.all(/^http:\/\/127\.0\.0\.1:\d+\//, () => passthrough()))
  })

  afterAll(async () => {
    try {
      state.cookie = ""
      await deposito?.cerrar()
      while (servidores.length > 0) await servidores.pop()?.cerrar()

      await prisma.envioDocumento.deleteMany({ where: { comunidadId: { in: [COM_A, COM_B] } } })
      await prisma.documento.deleteMany({ where: { comunidadId: { in: [COM_A, COM_B] } } })
      await prisma.eventoAuditoria.deleteMany({
        where: { comunidadId: { in: [COM_A, COM_B] }, tipoAccion: { startsWith: "FI_CONVENIO" } },
      })
      await prisma.convenioPago.deleteMany({ where: { comunidadId: { in: [COM_A, COM_B] } } })
      await prisma.acuerdo.deleteMany({ where: { comunidadId: { in: [COM_A, COM_B] } } })
      await prisma.unidad.deleteMany({ where: { comunidadId: { in: [COM_A, COM_B] } } })
      await prisma.persona.deleteMany({ where: { comunidadId: { in: [COM_A, COM_B] } } })
      await prisma.credencialCorreoComunidad.deleteMany({
        where: { comunidadId: { in: [COM_A, COM_B] } },
      })
      await prisma.configuracionGlobal.deleteMany({
        where: { comunidadId: { in: [COM_A, COM_B] } },
      })
      await prisma.membresia.deleteMany({
        where: { usuarioId: { in: ["f29t2-usuario-admin-a", "f29t2-usuario-admin-b"] } },
      })
      await prisma.usuario.deleteMany({
        where: { email: { in: [EMAIL_ADMIN_A, EMAIL_ADMIN_B] } },
      })
      for (const id of [COM_A, COM_B]) {
        await prisma.comunidad.delete({ where: { id } }).catch(() => {})
      }
    } catch {
      // intencional: limpieza best-effort, la base de la suite es descartable
    }
    fijar("AUTH_SECRET", envPrevio.auth)
    fijar(VARIABLE_CLAVE_MAESTRA, envPrevio.maestra)
    fijar("BLOB_READ_WRITE_TOKEN", envPrevio.token)
    fijar("BLOB_API_BASE_URL", envPrevio.base)
    fijar("SMTP_PASSWORD", envPrevio.smtpPassword)
  }, 30_000)

  it("1 · con credencial configurada la constancia queda entregado, con el deudor registrado y el PDF adjunto en el DATA", async () => {
    const pdf = pdfMinimo("convenio firmado f29t2 del deudor")
    let vista: VistaDocumentoFirmado | null = null
    await conSesion(EMAIL_ADMIN_A, async () => {
      const res = await POST_DOCUMENTO({
        convenioId: C1,
        nombreArchivo: "convenio-firmado-f29t2.pdf",
        contenidoBase64: pdf.toString("base64"),
      })
      expect(res.status).toBe(201)
      vista = (await res.json()) as VistaDocumentoFirmado
    })
    const creado = vista!

    // La constancia de la respuesta dice la verdad del envío real.
    expect(creado.constancia.estado).toBe("entregado")
    expect(creado.constancia.personaId).toBe(P_DEUDOR)
    expect(creado.constancia.motivo).toMatch(/aceptado por el servidor SMTP/i)

    // La fila persistida: entregado, al deudor que firmó, por el canal email.
    const envio = await constanciaDe(C1)
    expect(envio.estado).toBe("entregado")
    expect(envio.personaId).toBe(P_DEUDOR)
    expect(envio.canal).toBe("email")
    expect(envio.motivo).toMatch(/aceptado por el servidor SMTP/i)
    expect(envio.motivo).toContain("falso-0001@ejemplo.test")

    // El doble de SMTP recibió UN mensaje, dirigido al deudor, con el PDF adjunto.
    expect(servidorAcepta1.mensajes).toHaveLength(1)
    const recibido = servidorAcepta1.mensajes[0]!
    expect(recibido.to).toEqual([EMAIL_DEUDOR])
    expect(recibido.crudo).toMatch(/^Content-Type: multipart\/mixed; boundary="[^\r]+"/m)
    expect(recibido.crudo).toContain('Content-Disposition: attachment; filename="convenio-firmado-f29t2.pdf"')
    expect(recibido.crudo).toContain("Content-Type: application/pdf")
    expect(recibido.crudo).toContain("Content-Transfer-Encoding: base64")
    // Los bytes adjuntos son los archivados: el mismo base64 del PDF subido.
    expect(recibido.crudo).toContain(base64Trozado(pdf))

    // El archivado sigue auditado como siempre, y el envío suma SU evento.
    const subido = await prisma.eventoAuditoria.findFirst({
      where: { comunidadId: COM_A, tipoAccion: "FI_CONVENIO_DOCUMENTO_SUBIDO", referenciaId: C1 },
    })
    expect(subido).not.toBeNull()
    expect(await eventosDe(C1, "FI_CONVENIO_DOCUMENTO_ENVIADO")).toBe(1)
    const evento = await prisma.eventoAuditoria.findFirst({
      where: { comunidadId: COM_A, tipoAccion: "FI_CONVENIO_DOCUMENTO_ENVIADO", referenciaId: C1 },
    })
    expect(evento?.descripcion).toContain(P_DEUDOR)
    expect(evento?.descripcion).toContain("entregado")
  })

  it("2 · sin credencial de correo no se finge el envío: pendiente con el motivo literal y el PDF no sale", async () => {
    // Contadores del doble ANTES del alta: lo que importa es que el intento de
    // esta comunidad (sin credencial) no añada ni una conexión ni un mensaje.
    const mensajesAntes = servidorAcepta1.mensajes.length
    const autenticacionesAntes = servidorAcepta1.autenticaciones.length

    const pdf = pdfMinimo("convenio de la comunidad sin emisor")
    let vista: VistaDocumentoFirmado | null = null
    await conSesion(EMAIL_ADMIN_B, async () => {
      const res = await POST_DOCUMENTO({
        convenioId: C4,
        nombreArchivo: "convenio-sin-emisor-f29t2.pdf",
        contenidoBase64: pdf.toString("base64"),
      })
      expect(res.status).toBe(201)
      vista = (await res.json()) as VistaDocumentoFirmado
    })
    const creado = vista!

    // La constancia queda como nació: pendiente, con el motivo literal.
    expect(creado.constancia.estado).toBe("pendiente")
    expect(creado.constancia.motivo).toBe(MOTIVO_LITERAL_DE_NACIMIENTO)

    const envio = await constanciaDe(C4)
    expect(envio.estado).toBe("pendiente")
    expect(envio.motivo).toBe(MOTIVO_LITERAL_DE_NACIMIENTO)

    // Y el PDF no se envió: ni una conexión SMTP ni un mensaje aceptado.
    expect(servidorAcepta1.mensajes).toHaveLength(mensajesAntes)
    expect(servidorAcepta1.autenticaciones).toHaveLength(autenticacionesAntes)
  })

  it("3 · si el SMTP falla, la constancia queda fallido con el error del servidor verbatim", async () => {
    // La credencial de A pasa a apuntar al servidor que rechaza la autenticación.
    servidorRechaza = await levantarServidor({ modo: "rechazar_auth" })
    await prisma.credencialCorreoComunidad.update({
      where: { comunidadId: COM_A },
      data: { puerto: servidorRechaza.port },
    })

    const pdf = pdfMinimo("convenio cuyo envío rebota")
    let vista: VistaDocumentoFirmado | null = null
    await conSesion(EMAIL_ADMIN_A, async () => {
      const res = await POST_DOCUMENTO({
        convenioId: C2,
        nombreArchivo: "convenio-rebote-f29t2.pdf",
        contenidoBase64: pdf.toString("base64"),
      })
      expect(res.status).toBe(201)
      vista = (await res.json()) as VistaDocumentoFirmado
    })
    const creado = vista!
    constanciaDeC2 = creado.constancia.id

    // El intento SÍ ocurrió (el doble autenticó el rechazo) y la constancia
    // queda `fallido`, con la respuesta del servidor SIN tocar.
    expect(creado.constancia.estado).toBe("fallido")
    expect(creado.constancia.motivo).toMatch(/^Falló el envío por SMTP:/)
    expect(creado.constancia.motivo).toContain("535 5.7.8 Autenticación rechazada")

    const envio = await constanciaDe(C2)
    expect(envio.estado).toBe("fallido")
    expect(envio.motivo).toContain("535 5.7.8 Autenticación rechazada")

    // El envío fallido también deja su evento, con el destinatario nombrado.
    expect(await eventosDe(C2, "FI_CONVENIO_DOCUMENTO_ENVIADO")).toBe(1)
    expect(servidorRechaza.autenticaciones.length).toBeGreaterThanOrEqual(1)
    expect(servidorRechaza.mensajes).toHaveLength(0)
  })

  it("4 · el reenvío sobre fallido pasa a entregado, suma un evento y NO crea una segunda constancia", async () => {
    if (!constanciaDeC2) throw new Error("el caso 3 no dejó constancia para reenviar")

    // La comunidad arregla su emisor: el reenvío ahora encuentra un servidor que acepta.
    servidorAcepta2 = await levantarServidor({ modo: "aceptar" })
    await prisma.credencialCorreoComunidad.update({
      where: { comunidadId: COM_A },
      data: { puerto: servidorAcepta2.port },
    })

    let res: Response | null = null
    await conSesion(EMAIL_ADMIN_A, async () => {
      res = await POST_REENVIAR(C2)
    })
    expect(res!.status).toBe(200)
    const json = (await res!.json()) as {
      ok: boolean
      convenioId: string
      constancia: { id: string; estado: string; personaId: string; motivo: string }
    }
    expect(json.ok).toBe(true)
    expect(json.convenioId).toBe(C2)
    // MISMA constancia, nuevo estado.
    expect(json.constancia.id).toBe(constanciaDeC2)
    expect(json.constancia.estado).toBe("entregado")
    expect(json.constancia.motivo).toMatch(/aceptado por el servidor SMTP/i)

    // Una sola fila de constancia, actualizada: el reenvío no duplica.
    const envio = await constanciaDe(C2)
    expect(envio.id).toBe(constanciaDeC2)
    expect(envio.estado).toBe("entregado")
    expect(envio.reenvio).toBe(false)

    // El reenvío SUMA UN evento (el de la primera cursada queda, y hay uno nuevo).
    expect(await eventosDe(C2, "FI_CONVENIO_DOCUMENTO_ENVIADO")).toBe(1)
    expect(await eventosDe(C2, "FI_CONVENIO_DOCUMENTO_REENVIO")).toBe(1)

    // El doble aceptó el mensaje del reenvío, dirigido al deudor.
    expect(servidorAcepta2.mensajes).toHaveLength(1)
    expect(servidorAcepta2.mensajes[0]!.to).toEqual([EMAIL_DEUDOR])
    expect(servidorAcepta2.mensajes[0]!.crudo).toContain(
      'Content-Disposition: attachment; filename="convenio-rebote-f29t2.pdf"'
    )
  })

  it("5 · el reenvío sobre entregado responde 409 y no duplica nada", async () => {
    if (!constanciaDeC2) throw new Error("el caso 3 no dejó constancia para reenviar")

    let res: Response | null = null
    await conSesion(EMAIL_ADMIN_A, async () => {
      res = await POST_REENVIAR(C2)
    })
    expect(res!.status).toBe(409)
    const json = (await res!.json()) as { error: string }
    expect(json.error).toBe(MENSAJE_REENVIO_SOBRE_ENTREGADO)

    // Nada cambió: una constancia, un evento de reenvío, ningún mensaje nuevo.
    const envio = await constanciaDe(C2)
    expect(envio.estado).toBe("entregado")
    expect(await eventosDe(C2, "FI_CONVENIO_DOCUMENTO_REENVIO")).toBe(1)
    expect(servidorAcepta2.mensajes).toHaveLength(1)
  })

  it("6 · sin correo del deudor no hay envío aunque la credencial esté configurada: pendiente con el motivo literal", async () => {
    const pdf = pdfMinimo("convenio del deudor sin correo")
    let vista: VistaDocumentoFirmado | null = null
    await conSesion(EMAIL_ADMIN_A, async () => {
      const res = await POST_DOCUMENTO({
        convenioId: C3,
        nombreArchivo: "convenio-sin-correo-f29t2.pdf",
        contenidoBase64: pdf.toString("base64"),
      })
      expect(res.status).toBe(201)
      vista = (await res.json()) as VistaDocumentoFirmado
    })
    const creado = vista!

    expect(creado.constancia.estado).toBe("pendiente")
    expect(creado.constancia.motivo).toBe(MOTIVO_LITERAL_DE_NACIMIENTO)

    const envio = await constanciaDe(C3)
    expect(envio.estado).toBe("pendiente")
    expect(envio.motivo).toBe(MOTIVO_LITERAL_DE_NACIMIENTO)

    // La credencial está configurada, pero no hay a dónde mandar: nada sale.
    expect(servidorAcepta2.mensajes).toHaveLength(1) // sólo el del caso 4
  })

  it("7 · el reenvío sobre pendiente lo vuelve a intentar y suma un evento, sin segunda constancia", async () => {
    let res: Response | null = null
    await conSesion(EMAIL_ADMIN_B, async () => {
      res = await POST_REENVIAR(C4)
    })
    expect(res!.status).toBe(200)
    const json = (await res!.json()) as {
      ok: boolean
      constancia: { id: string; estado: string; motivo: string }
    }
    expect(json.ok).toBe(true)
    expect(json.constancia.estado).toBe("pendiente")
    expect(json.constancia.motivo).toBe(MOTIVO_LITERAL_DE_NACIMIENTO)

    // Sigue habiendo UNA constancia, y los intentos quedan auditados: el de la
    // cursada del archivo y el del reenvío manual.
    const envio = await constanciaDe(C4)
    expect(envio.estado).toBe("pendiente")
    expect(
      await prisma.eventoAuditoria.count({
        where: { comunidadId: COM_B, tipoAccion: "FI_CONVENIO_DOCUMENTO_ENVIADO", referenciaId: C4 },
      })
    ).toBe(1)
    expect(
      await prisma.eventoAuditoria.count({
        where: { comunidadId: COM_B, tipoAccion: "FI_CONVENIO_DOCUMENTO_REENVIO", referenciaId: C4 },
      })
    ).toBe(1)

    // La comunidad B no tiene emisor: su reenvío no añadió ningún mensaje a los
    // dobles (los contadores quedan en lo que dejaron los casos anteriores).
    expect(servidorAcepta1.mensajes).toHaveLength(1)
    expect(servidorAcepta2.mensajes).toHaveLength(1)
    expect(servidorRechaza.mensajes).toHaveLength(0)
  })
})
