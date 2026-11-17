/**
 * @vitest-environment node
 *
 * Acuerdo presencial · T2 — los papeles al archivo legal (S1/S3 de
 * `odd/tasks/acuerdo-presencial-y-respaldo.md`).
 *
 * El acta firmada se SUBE al archivo legal como `Documento` con su hash, igual
 * que el papel firmado del convenio; el cierre del acuerdo presencial la EXIGE:
 * sin ese papel no hay acuerdo presencial (S1, pedido textual del owner). La
 * lista de asistencia y los poderes se suben cuando existen (S3). Lo observable:
 *
 *   1. 401 sin sesión; 403 sin `gd:crear`; ninguna fila ni objeto cambia;
 *   2. el acuerdo de otra comunidad es 404 ANTES de cualquier 409;
 *   3. un acuerdo resuelto no acepta papeles nuevos (409, S5);
 *   4. sin el acta subida el cierre responde 409 con SU mensaje —distinguible
 *      del 409 de acta no publicada— y la fila no cambia; con el papel subido
 *      el acuerdo cierra (S1);
 *   5. el `Documento` archivado lleva el hash del contenido, el tamaño y la
 *      ruta del depósito privado — nunca una URL (S3);
 *   6. un archivo que no es PDF por sus BYTES → 400 literal;
 *   7. el papel se sube UNA vez: segundo intento 409 y lo archivado queda
 *      intacto (S5);
 *   8. asistencia y poderes se suben cuando existen, cada papel una vez (S3);
 *   9. si la transacción falla, el binario no queda huérfano en el depósito;
 *  10. si el depósito rechaza la subida, no se escribe ninguna fila;
 *  11. `reclamarPapel` exige el acuerdo ABIERTO en el `where` —no basta la
 *      compuerta previa de la ruta—: el acuerdo que otro administrador resolvió
 *      en el medio de la subida no reclama fila (S5 en concurrencia).
 *
 * BD real + depósito HTTP falso en 127.0.0.1: ninguna conexión sale a internet
 * y ninguna credencial es real (el mismo criterio del envío del convenio).
 */
import { createHash } from "node:crypto"
import { createServer, type Server, type ServerResponse } from "node:http"
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
import { http, passthrough } from "msw"
import { prisma } from "@/lib/prisma"
import { server as servidorMSW } from "../setup"

const state = vi.hoisted(() => ({ cookie: "", fallarAuditoria: false }))
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

// La auditoría es el ÚNICO punto donde el arnés puede tumbar la transacción
// desde adentro: el flag deja pasar todas las llamadas salvo la marcada, y
// fuera del flag el módulo real hace su trabajo.
vi.mock("@/lib/auditoria", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auditoria")>()
  return {
    ...actual,
    registrarEventoAuditoria: (
      ...args: Parameters<typeof actual.registrarEventoAuditoria>
    ) => {
      if (state.fallarAuditoria) {
        throw new Error("la auditoría de prueba está caída a propósito")
      }
      return actual.registrarEventoAuditoria(...args)
    },
  }
})

const AUTH_SECRET = "apd-secret-12345678"
const TOKEN_DEL_DEPOSITO = "apd-token-de-deposito"
const VERSION_API_DEL_DEPOSITO = "12"

const COM_A = "apd-com-a"
const COM_B = "apd-com-b"
const PERIODO = "apd-per-vig"
const EMAIL_ADMIN = "apd-admin@test.cl"
const EMAIL_OWN = "apd-own@test.cl"

const ACTA_PUBLICADA = "apd-acta-publicada"

/** Mensajes literales de las compuertas (distinguibles entre sí). */
const SIN_ACTA_PUBLICADA =
  "No se puede cerrar un acuerdo presencial sin su acta firmada archivada en esta comunidad."
const SIN_PAPEL_SUBIDO =
  "No se puede cerrar un acuerdo presencial sin el acta firmada subida al archivo legal: la documentación se sube, no se referencia por URL."
const ACUERDO_RESUELTO =
  "El acuerdo ya fue resuelto: su resultado y sus papeles no se editan ni se borran (el acta archivada con folio congela lo declarado)."
const PAPEL_REPETIDO =
  "El acuerdo ya tiene este papel subido al archivo legal: cada papel se sube una sola vez."
const NO_ES_PDF =
  "El archivo no es un PDF: el papel se firma a mano y la administración lo escanea en PDF, así que un archivo con otro formato no entra al archivo legal."
const DEPOSITO_FALLO =
  "No se pudo guardar el archivo en el depósito de documentos: no se escribió ninguna fila."

// ── Depósito privado falso (misma API REST que usa lib/almacen-documentos) ──

interface ObjetoDelDeposito {
  bytes: Buffer
  tipoMime: string
}

interface ServidorDepositoFalso {
  readonly baseUrl: string
  readonly objetos: Map<string, ObjetoDelDeposito>
  /** Las próximas N subidas responden 500 (el resto funciona). */
  fallosPutRestantes: number
  cerrar(): Promise<void>
}

async function iniciarServidorDepositoFalso(): Promise<ServidorDepositoFalso> {
  const objetos = new Map<string, ObjetoDelDeposito>()
  let origen = ""
  const deposito: ServidorDepositoFalso = {
    get baseUrl() {
      return origen
    },
    objetos,
    fallosPutRestantes: 0,
    async cerrar(): Promise<void> {
      await new Promise<void>((resolver) => servidor.close(() => resolver()))
    },
  }

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
        if (deposito.fallosPutRestantes > 0) {
          deposito.fallosPutRestantes -= 1
          responder(res, 500, { error: "el depósito de prueba rechazó la subida" })
          return
        }
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
  origen = `http://127.0.0.1:${puerto}`
  return deposito
}

/** PDF mínimo REAL: cabecera mágica `%PDF-` (la ruta mira BYTES). */
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

/** Bytes que NO son un PDF aunque el nombre diga `.pdf`. */
function noPdf(): Buffer {
  return Buffer.concat([
    Buffer.from([0xff, 0xd8, 0xff, 0xe0]), // cabecera mágica de JPEG
    Buffer.from("imagen del papel, no el papel escaneado en PDF", "utf8"),
  ])
}

function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex")
}

function tamanoEnKB(bytes: Buffer): number {
  return Math.round((bytes.length / 1024) * 10) / 10
}

/** El resultado que la sala proclamó, tal como entra por el body del cierre. */
function proclamado(sobre: {
  aFavor: number
  enContra: number
  abstenciones: number
  presentes: number
  quorumAlcanzado: boolean
}) {
  return sobre
}

describe("/api/acuerdos/[id]/documento — los papeles al archivo legal (S1/S3)", () => {
  let deposito: ServidorDepositoFalso

  const envPrevio = {
    auth: process.env.AUTH_SECRET,
    token: process.env.BLOB_READ_WRITE_TOKEN,
    base: process.env.BLOB_API_BASE_URL,
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

  async function POST_DOCUMENTO(id: string, body: Record<string, unknown>): Promise<Response> {
    const { POST } = await import("@/app/api/acuerdos/[id]/documento/route")
    return POST(
      new NextRequest(`http://localhost/api/acuerdos/${id}/documento`, {
        method: "POST",
        body: JSON.stringify(body),
        headers: { "content-type": "application/json" },
      }),
      { params: Promise.resolve({ id }) }
    )
  }

  async function CERRAR(id: string, body: unknown): Promise<Response> {
    const { POST } = await import("@/app/api/acuerdos/[id]/route")
    return POST(
      new NextRequest(`http://localhost/api/acuerdos/${id}`, {
        method: "POST",
        body: JSON.stringify(body),
        headers: { "content-type": "application/json" },
      }),
      { params: Promise.resolve({ id }) }
    )
  }

  /**
   * Alta de una fila presencial directa en la base (la subida del papel es el
   * trámite bajo prueba; el alta presencial por API llega con la pantalla, T3).
   */
  async function crearPresencial(sobre: {
    folio: string
    actaId?: string
    estado?: string
    resueltoEn?: Date
    comunidadId?: string
    fecha?: Date
  }): Promise<{ id: string }> {
    const id = `apd-acu-${sobre.folio.slice(-4)}`
    const creado = await prisma.acuerdo.create({
      data: {
        id,
        comunidadId: sobre.comunidadId ?? COM_A,
        cuerpo: "comite",
        materia: "Corte de servicios de la unidad por tres cuotas impagas (Ley 21.442 art. 20 N°9)",
        folio: sobre.folio,
        estado: sobre.estado ?? "abierto",
        resueltoEn: sobre.resueltoEn ?? null,
        quorumRequerido: "un_voto_por_miembro",
        modalidad: "presencial",
        fecha: sobre.fecha ?? new Date("2026-11-10T14:00:00.000Z"),
        actaId: sobre.actaId ?? null,
        creadoPor: "apd-usuario-admin",
      } as never,
    })
    return { id: creado.id }
  }

  async function subirActa(id: string, bytes: Buffer, nombre = "acta-firmada-comite.pdf") {
    return POST_DOCUMENTO(id, {
      tipo: "acta",
      nombreArchivo: nombre,
      contenidoBase64: bytes.toString("base64"),
    })
  }

  async function filaDelAcuerdo(id: string) {
    return prisma.acuerdo.findUnique({ where: { id } })
  }

  /**
   * Los documentos legales de las comunidades de ESTE archivo: los conteos son
   * RELATIVOS (antes/después) porque la base de la suite es compartida entre
   * tests y los documentos de otros archivos y de este mismo quedan en ella.
   */
  async function contarDocumentos(): Promise<number> {
    return prisma.documento.count({ where: { comunidadId: { in: [COM_A, COM_B] } } })
  }

  beforeAll(async () => {
    process.env.AUTH_SECRET = AUTH_SECRET
    deposito = await iniciarServidorDepositoFalso()
    process.env.BLOB_READ_WRITE_TOKEN = TOKEN_DEL_DEPOSITO
    process.env.BLOB_API_BASE_URL = deposito.baseUrl

    for (const c of [
      { id: COM_A, nombre: "Comunidad Papel Acuerdo A", slug: "apd-com-a" },
      { id: COM_B, nombre: "Comunidad Papel Acuerdo B", slug: "apd-com-b" },
    ]) {
      await prisma.comunidad.upsert({ where: { id: c.id }, update: {}, create: c })
    }

    await prisma.periodoDirectiva.upsert({
      where: { id: PERIODO },
      update: {},
      create: {
        id: PERIODO,
        comunidadId: COM_A,
        fechaInicio: "2026-01-15",
        duracionMeses: 24,
        fechaInscripcion: "2026-02-01",
        referenciaInscripcion: "Acta de asamblea N° 1/2026",
        estado: "vigente",
        miembros: [],
      },
    })

    // El acta publicada en el libro: la compuerta digital del cierre.
    await prisma.actaGD.upsert({
      where: { id: ACTA_PUBLICADA },
      update: { estado: "publicada" },
      create: {
        id: ACTA_PUBLICADA,
        comunidadId: COM_A,
        fecha: "2026-11-10",
        hora: "19:00",
        lugar: "Sala de reuniones",
        tablaTemas: ["Votación del acuerdo"],
        presentes: [],
        ausentes: [],
        invitados: [],
        minuta: "Reunión del comité con la votación proclamada en la sala.",
        adjuntos: [],
        estado: "publicada",
        aprobaciones: [],
        folio: "AD-2026-8801",
        periodoId: PERIODO,
      } as never,
    })

    for (const u of [
      { id: "apd-usuario-admin", email: EMAIL_ADMIN, rol: "administrador" },
      { id: "apd-usuario-own", email: EMAIL_OWN, rol: "residente" },
    ]) {
      await prisma.usuario.upsert({
        where: { email: u.email },
        update: {},
        create: { id: u.id, email: u.email, activo: true, personaId: null },
      })
      await prisma.membresia.deleteMany({ where: { usuarioId: u.id } })
      await prisma.membresia.create({
        data: { usuarioId: u.id, comunidadId: COM_A, rol: u.rol },
      })
    }
  }, 30_000)

  beforeEach(() => {
    // El depósito sale de verdad, pero sólo a 127.0.0.1 (lo deja pasar MSW), y
    // cada test arranca con el depósito vacío: los objetos que un test ve son
    // los suyos.
    servidorMSW.use(http.all(/^http:\/\/127\.0\.0\.1:\d+\//, () => passthrough()))
    deposito.objetos.clear()
  })

  afterAll(async () => {
    try {
      state.cookie = ""
      state.fallarAuditoria = false
      await deposito?.cerrar()

      await prisma.eventoAuditoria.deleteMany({
        where: { comunidadId: { in: [COM_A, COM_B] }, tipoAccion: { startsWith: "AD_ACUERDO" } },
      })
      await prisma.documento.deleteMany({ where: { comunidadId: { in: [COM_A, COM_B] } } })
      await prisma.acuerdo.deleteMany({ where: { comunidadId: { in: [COM_A, COM_B] } } })
      await prisma.actaGD.deleteMany({ where: { comunidadId: COM_A } })
      await prisma.periodoDirectiva.deleteMany({ where: { comunidadId: COM_A } })
      await prisma.membresia.deleteMany({
        where: { usuarioId: { in: ["apd-usuario-admin", "apd-usuario-own"] } },
      })
      await prisma.usuario.deleteMany({
        where: { email: { in: [EMAIL_ADMIN, EMAIL_OWN] } },
      })
      for (const id of [COM_A, COM_B]) {
        await prisma.comunidad.delete({ where: { id } }).catch(() => {})
      }
    } catch {
      // intencional: limpieza best-effort
    }
    if (envPrevio.auth === undefined) delete process.env.AUTH_SECRET
    else process.env.AUTH_SECRET = envPrevio.auth
    if (envPrevio.token === undefined) delete process.env.BLOB_READ_WRITE_TOKEN
    else process.env.BLOB_READ_WRITE_TOKEN = envPrevio.token
    if (envPrevio.base === undefined) delete process.env.BLOB_API_BASE_URL
    else process.env.BLOB_API_BASE_URL = envPrevio.base
  }, 30_000)

  it("401 sin sesión; 403 sin gd:crear; ninguna fila ni objeto cambia", async () => {
    const acuerdo = await crearPresencial({ folio: "AD-2026-8001" })
    const documentosAntes = await contarDocumentos()
    state.cookie = ""
    expect(
      (
        await POST_DOCUMENTO(acuerdo.id, {
          tipo: "acta",
          nombreArchivo: "acta-firmada-comite.pdf",
          contenidoBase64: pdfMinimo("sin sesion").toString("base64"),
        })
      ).status
    ).toBe(401)

    await conSesion(EMAIL_OWN, async () => {
      const res = await subirActa(acuerdo.id, pdfMinimo("residente no sube papeles"))
      expect(res.status).toBe(403)
      const j = (await res.json()) as { error: string }
      expect(j.error).toBe("Permiso denegado.")
    })

    const fila = await filaDelAcuerdo(acuerdo.id)
    expect(fila?.actaDocumentoId).toBeNull()
    expect(fila?.asistenciaDocumentoId).toBeNull()
    expect(fila?.poderesDocumentoId).toBeNull()
    expect(deposito.objetos.size).toBe(0)
    expect(await contarDocumentos()).toBe(documentosAntes)
  })

  it("404 antes de cualquier 409: el acuerdo de otra comunidad no existe, aunque esté resuelto", async () => {
    const documentosAntes = await contarDocumentos()
    // Resuelto a propósito: si el 404 no fuera el primero, este acuerdo recibiría
    // el 409 de S5 en vez del 404 de pertenencia.
    await crearPresencial({
      folio: "AD-2026-8901",
      comunidadId: COM_B,
      estado: "aprobado",
      resueltoEn: new Date("2026-11-11T12:00:00.000Z"),
    })
    const propio = await crearPresencial({
      folio: "AD-2026-8002",
      estado: "aprobado",
      resueltoEn: new Date("2026-11-11T12:00:00.000Z"),
    })

    await conSesion(EMAIL_ADMIN, async () => {
      const ajeno = await POST_DOCUMENTO("apd-acu-8901", {
        tipo: "acta",
        nombreArchivo: "acta-firmada-comite.pdf",
        contenidoBase64: pdfMinimo("acuerdo ajeno").toString("base64"),
      })
      expect(ajeno.status).toBe(404)
      const j = (await ajeno.json()) as { error: string }
      expect(j.error).toBe("Acuerdo no encontrado.")

      const inexistente = await subirActa("apd-no-existe", pdfMinimo("no existe"))
      expect(inexistente.status).toBe(404)
      expect(((await inexistente.json()) as { error: string }).error).toBe(
        "Acuerdo no encontrado."
      )
    })

    // El propio resuelto SÍ llega al 409 de S5: la pertenencia ya pasó.
    await conSesion(EMAIL_ADMIN, async () => {
      const res = await subirActa(propio.id, pdfMinimo("acuerdo resuelto"))
      expect(res.status).toBe(409)
      const j = (await res.json()) as { error: string }
      expect(j.error).toBe(ACUERDO_RESUELTO)
    })
    expect(deposito.objetos.size).toBe(0)
    expect(await contarDocumentos()).toBe(documentosAntes)
  })

  it("S5: un acuerdo resuelto no acepta papeles nuevos — 409 literal y nada archivado", async () => {
    const documentosAntes = await contarDocumentos()
    const acuerdo = await crearPresencial({
      folio: "AD-2026-8011",
      estado: "rechazado",
      resueltoEn: new Date("2026-11-11T12:00:00.000Z"),
    })
    await conSesion(EMAIL_ADMIN, async () => {
      const res = await subirActa(acuerdo.id, pdfMinimo("papel sobre acuerdo resuelto"))
      expect(res.status).toBe(409)
      const j = (await res.json()) as { error: string }
      expect(j.error).toBe(ACUERDO_RESUELTO)
    })
    const fila = await filaDelAcuerdo(acuerdo.id)
    expect(fila?.actaDocumentoId).toBeNull()
    expect(deposito.objetos.size).toBe(0)
    expect(await contarDocumentos()).toBe(documentosAntes)
  })

  it("S5 en concurrencia: reclamarPapel sólo reclama un acuerdo ABIERTO — el resuelto en el medio no toma fila", async () => {
    const { reclamarPapel } = await import("@/app/api/acuerdos/[id]/documento/route")

    // (1) Acuerdo abierto: la reclamación toma UNA fila y deja el papel ligado.
    const abierto = await crearPresencial({ folio: "AD-2026-9021" })
    const docAbierto = "apd-doc-r3-abierto"
    const reclamadoAbierto = await prisma.$transaction((tx) =>
      reclamarPapel(tx, "acta", abierto.id, COM_A, docAbierto)
    )
    expect(reclamadoAbierto.count).toBe(1)
    const filaAbierta = await filaDelAcuerdo(abierto.id)
    expect(filaAbierta?.actaDocumentoId).toBe(docAbierto)

    // (2) Otro administrador resolvió el acuerdo ENTRE la compuerta previa y la
    // transacción: el `where` exige `estado: "abierto"`, así que la reclamación
    // no toma fila y la columna sigue en null — sin esa condición en el `where`,
    // la fila resuelta matcheaba y el papel se archivaba sobre lo cerrado (S5).
    for (const estado of ["aprobado", "rechazado"] as const) {
      const resuelto = await crearPresencial({
        folio: estado === "aprobado" ? "AD-2026-9022" : "AD-2026-9023",
      })
      await prisma.acuerdo.update({
        where: { id: resuelto.id },
        data: { estado, resueltoEn: new Date("2026-11-11T12:00:00.000Z") },
      })
      const docResuelto = `apd-doc-r3-${estado}`
      const reclamadoResuelto = await prisma.$transaction((tx) =>
        reclamarPapel(tx, "acta", resuelto.id, COM_A, docResuelto)
      )
      expect(reclamadoResuelto.count).toBe(0)
      const filaResuelta = await filaDelAcuerdo(resuelto.id)
      expect(filaResuelta?.estado).toBe(estado)
      expect(filaResuelta?.actaDocumentoId).toBeNull()
    }
  })

  it("sin el acta subida no hay cierre (409 con SU mensaje); con el papel subido el acuerdo cierra (S1)", async () => {
    // (a) Sin acta declarada: el 409 de hoy, por acta no publicada.
    const sinActa = await crearPresencial({ folio: "AD-2026-8012" })
    await conSesion(EMAIL_ADMIN, async () => {
      const res = await CERRAR(sinActa.id, {
        resultado: proclamado({ aFavor: 3, enContra: 1, abstenciones: 0, presentes: 4, quorumAlcanzado: true }),
      })
      expect(res.status).toBe(409)
      const j = (await res.json()) as { error: string }
      expect(j.error).toBe(SIN_ACTA_PUBLICADA)
    })

    // (b) Acta publicada en el libro pero SIN el papel subido: el 409 NUEVO,
    //     distinguible del anterior en el mensaje.
    const conActa = await crearPresencial({ folio: "AD-2026-8013", actaId: ACTA_PUBLICADA })
    await conSesion(EMAIL_ADMIN, async () => {
      const res = await CERRAR(conActa.id, {
        resultado: proclamado({ aFavor: 3, enContra: 1, abstenciones: 0, presentes: 4, quorumAlcanzado: true }),
      })
      expect(res.status).toBe(409)
      const j = (await res.json()) as { error: string }
      expect(j.error).toBe(SIN_PAPEL_SUBIDO)
    })
    const sinPapel = await filaDelAcuerdo(conActa.id)
    expect(sinPapel?.estado).toBe("abierto")
    expect(sinPapel?.resultado).toBeNull()
    expect(sinPapel?.resueltoEn).toBeNull()

    // (c) El acta firmada se SUBE y entonces el presencial cierra.
    const bytes = pdfMinimo("acta firmada del comité, escaneo del papel")
    await conSesion(EMAIL_ADMIN, async () => {
      const subida = await subirActa(conActa.id, bytes)
      expect(subida.status).toBe(201)
      const sj = (await subida.json()) as {
        id: string
        acuerdoId: string
        tipo: string
        hash: string
        tamanoBytes: number
        archivoNombre: string
      }
      expect(sj.acuerdoId).toBe(conActa.id)
      expect(sj.tipo).toBe("acta")
      expect(sj.hash).toBe(sha256(bytes))
      expect(sj.tamanoBytes).toBe(bytes.length)
      expect(sj.archivoNombre).toBe("acta-firmada-comite.pdf")

      const cierre = await CERRAR(conActa.id, {
        resultado: proclamado({ aFavor: 3, enContra: 1, abstenciones: 0, presentes: 4, quorumAlcanzado: true }),
      })
      expect(cierre.status).toBe(200)
      const cj = (await cierre.json()) as { ok: boolean; resultado: { resultado: string } }
      expect(cj.ok).toBe(true)
      expect(cj.resultado.resultado).toBe("aprobado")
    })
    const cerrado = await filaDelAcuerdo(conActa.id)
    expect(cerrado?.estado).toBe("aprobado")
    expect(cerrado?.resueltoEn).not.toBeNull()
    expect(cerrado?.resultado).toEqual({
      aFavor: 3,
      enContra: 1,
      abstenciones: 0,
      presentes: 4,
      quorumAlcanzado: true,
    })
    expect(cerrado?.actaDocumentoId).not.toBeNull()

    // La subida del papel del cierre queda auditada.
    const evento = await prisma.eventoAuditoria.findFirst({
      where: {
        comunidadId: COM_A,
        tipoAccion: "AD_ACUERDO_DOCUMENTO_SUBIDO",
        referenciaId: conActa.id,
      },
    })
    expect(evento).not.toBeNull()
  })

  it("el Documento archivado lleva el hash, el tamaño y la ruta del depósito privado — nunca una URL (S3)", async () => {
    const acuerdo = await crearPresencial({ folio: "AD-2026-8014" })
    // La versión se numera por (comunidad, tipo documental): relativa al máximo
    // previo del contador «otros» de ESTA comunidad, no al número absoluto.
    const versionAntes = (
      await prisma.documento.aggregate({
        where: { comunidadId: COM_A, tipoDocumental: "otros" },
        _max: { version: true },
      })
    )._max.version ?? 0
    const bytes = pdfMinimo("el papel que prueba la firma")
    await conSesion(EMAIL_ADMIN, async () => {
      expect((await subirActa(acuerdo.id, bytes)).status).toBe(201)
    })

    const fila = await filaDelAcuerdo(acuerdo.id)
    const documento = await prisma.documento.findFirst({
      where: { id: fila!.actaDocumentoId!, comunidadId: COM_A },
    })
    expect(documento).not.toBeNull()
    expect(documento!.naturaleza).toBe("legal")
    expect(documento!.tipoDocumental).toBe("otros")
    expect(documento!.hash).toBe(sha256(bytes))
    expect(documento!.archivoTamanoKB).toBe(tamanoEnKB(bytes))
    expect(documento!.archivoTipoMime).toBe("application/pdf")
    expect(documento!.archivoNombre).toBe("acta-firmada-comite.pdf")
    // La ruta archivada es el pathname del DEPÓSITO PRIVADO: ni http ni https.
    expect(documento!.archivoUrl).toMatch(
      /^acuerdos\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\.pdf$/
    )
    expect(documento!.archivoUrl.startsWith("http")).toBe(false)
    expect(documento!.version).toBe(versionAntes + 1)
    expect(documento!.vigenteDesde).toBe("2026-11-10")
    // El binario está en el depósito, exactamente en la ruta archivada.
    const enDeposito = deposito.objetos.get(documento!.archivoUrl)
    expect(enDeposito).toBeDefined()
    expect(enDeposito!.bytes.equals(bytes)).toBe(true)
    expect(enDeposito!.tipoMime).toBe("application/pdf")
  })

  it("un archivo que no es PDF por sus bytes → 400 literal, sin fila ni objeto", async () => {
    const acuerdo = await crearPresencial({ folio: "AD-2026-8015" })
    const documentosAntes = await contarDocumentos()
    await conSesion(EMAIL_ADMIN, async () => {
      const res = await POST_DOCUMENTO(acuerdo.id, {
        tipo: "acta",
        // El nombre dice .pdf, pero los bytes dicen otra cosa: manda el contenido.
        nombreArchivo: "foto-del-papel.pdf",
        contenidoBase64: noPdf().toString("base64"),
      })
      expect(res.status).toBe(400)
      const j = (await res.json()) as { error: string }
      expect(j.error).toBe(NO_ES_PDF)
    })
    const fila = await filaDelAcuerdo(acuerdo.id)
    expect(fila?.actaDocumentoId).toBeNull()
    expect(await contarDocumentos()).toBe(documentosAntes)
    expect(deposito.objetos.size).toBe(0)
  })

  it("el papel se sube UNA vez: el segundo intento responde 409 y lo archivado queda intacto (S5)", async () => {
    const acuerdo = await crearPresencial({ folio: "AD-2026-8016" })
    const documentosAntes = await contarDocumentos()
    const bytes = pdfMinimo("primera y única subida del acta firmada")
    await conSesion(EMAIL_ADMIN, async () => {
      const primera = await subirActa(acuerdo.id, bytes)
      expect(primera.status).toBe(201)
      const idPrimero = ((await primera.json()) as { id: string }).id

      // Segundo intento, con OTRO contenido: no toca lo archivado.
      const segunda = await subirActa(
        acuerdo.id,
        pdfMinimo("intentando reemplazar el papel archivado")
      )
      expect(segunda.status).toBe(409)
      const j = (await segunda.json()) as { error: string }
      expect(j.error).toBe(PAPEL_REPETIDO)

      // El documento original sigue intacto y es el ÚNICO nuevo de este test.
      expect(await contarDocumentos()).toBe(documentosAntes + 1)
      const documento = await prisma.documento.findUnique({ where: { id: idPrimero } })
      expect(documento?.hash).toBe(sha256(bytes))
      const fila = await filaDelAcuerdo(acuerdo.id)
      expect(fila?.actaDocumentoId).toBe(idPrimero)
    })
    // El depósito conserva SOLO los bytes del papel bueno.
    expect(deposito.objetos.size).toBe(1)
    const [objeto] = [...deposito.objetos.values()]
    expect(objeto!.bytes.equals(bytes)).toBe(true)
  })

  it("asistencia y poderes se suben cuando existen, cada papel una vez (S3)", async () => {
    const acuerdo = await crearPresencial({ folio: "AD-2026-8017", actaId: ACTA_PUBLICADA })
    const documentosAntes = await contarDocumentos()
    const asistencia = pdfMinimo("lista de asistencia de la sesión")
    const poderes = pdfMinimo("poderes acreditados en la sala")
    await conSesion(EMAIL_ADMIN, async () => {
      const subidaAsistencia = await POST_DOCUMENTO(acuerdo.id, {
        tipo: "asistencia",
        nombreArchivo: "lista-asistencia.pdf",
        contenidoBase64: asistencia.toString("base64"),
      })
      expect(subidaAsistencia.status).toBe(201)
      expect(((await subidaAsistencia.json()) as { tipo: string }).tipo).toBe("asistencia")

      const subidaPoderes = await POST_DOCUMENTO(acuerdo.id, {
        tipo: "poderes",
        nombreArchivo: "poderes-sala.pdf",
        contenidoBase64: poderes.toString("base64"),
      })
      expect(subidaPoderes.status).toBe(201)
      expect(((await subidaPoderes.json()) as { tipo: string }).tipo).toBe("poderes")

      // Cada papel, una sola vez.
      const repetida = await POST_DOCUMENTO(acuerdo.id, {
        tipo: "asistencia",
        nombreArchivo: "lista-asistencia.pdf",
        contenidoBase64: pdfMinimo("segunda lista").toString("base64"),
      })
      expect(repetida.status).toBe(409)
      expect(((await repetida.json()) as { error: string }).error).toBe(PAPEL_REPETIDO)

      // El acta sigue siendo la obligatoria: la asistencia y los poderes NO la
      // reemplazan — sin el acta subida, el cierre no pasa.
      const res = await CERRAR(acuerdo.id, {
        resultado: proclamado({ aFavor: 3, enContra: 1, abstenciones: 0, presentes: 4, quorumAlcanzado: true }),
      })
      expect(res.status).toBe(409)
      expect(((await res.json()) as { error: string }).error).toBe(SIN_PAPEL_SUBIDO)
    })
    const fila = await filaDelAcuerdo(acuerdo.id)
    expect(fila?.actaDocumentoId).toBeNull()
    expect(fila?.asistenciaDocumentoId).not.toBeNull()
    expect(fila?.poderesDocumentoId).not.toBeNull()
    expect(fila?.asistenciaDocumentoId).not.toBe(fila?.poderesDocumentoId)
    expect(await contarDocumentos()).toBe(documentosAntes + 2)
  })

  it("si la transacción falla, el binario no queda huérfano en el depósito", async () => {
    const acuerdo = await crearPresencial({ folio: "AD-2026-8018" })
    const documentosAntes = await contarDocumentos()
    state.fallarAuditoria = true
    try {
      await conSesion(EMAIL_ADMIN, async () => {
        const res = await subirActa(acuerdo.id, pdfMinimo("transacción caída"))
        expect(res.status).toBe(500)
        expect(((await res.json()) as { error: string }).error).toBe(
          "Error interno del servidor."
        )
      })
    } finally {
      state.fallarAuditoria = false
    }
    // Sin fila, sin vínculo, y SIN BINARIO HUÉRFANO en el depósito.
    const fila = await filaDelAcuerdo(acuerdo.id)
    expect(fila?.actaDocumentoId).toBeNull()
    expect(await contarDocumentos()).toBe(documentosAntes)
    expect(deposito.objetos.size).toBe(0)
  })

  it("si el depósito rechaza la subida, no se escribe ninguna fila (502)", async () => {
    const acuerdo = await crearPresencial({ folio: "AD-2026-8019" })
    const documentosAntes = await contarDocumentos()
    deposito.fallosPutRestantes = 1
    await conSesion(EMAIL_ADMIN, async () => {
      const res = await subirActa(acuerdo.id, pdfMinimo("depósito caído"))
      expect(res.status).toBe(502)
      expect(((await res.json()) as { error: string }).error).toBe(DEPOSITO_FALLO)
    })
    const fila = await filaDelAcuerdo(acuerdo.id)
    expect(fila?.actaDocumentoId).toBeNull()
    expect(await contarDocumentos()).toBe(documentosAntes)
    expect(deposito.objetos.size).toBe(0)
  })
})
