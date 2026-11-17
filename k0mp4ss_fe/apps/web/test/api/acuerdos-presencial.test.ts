/**
 * @vitest-environment node
 *
 * Acuerdo PRESENCIAL (S2/S4/S5 de `odd/tasks/acuerdo-presencial-y-respaldo.md`):
 * el resultado se PROCLAMA en la sala y se registra como se proclamó —no se
 * deduce de votos, que no hay—. Lo observable por la API y por la base:
 *
 *   1. cerrar un presencial con `resultado` que alcanza el quórum lo resuelve
 *      `aprobado` sin un solo voto; `estado`, `resueltoEn` y el acta del
 *      resultado quedan escritos en la misma transacción;
 *   2. uno que no lo alcanza se resuelve `rechazado`, y el resultado queda
 *      registrado igual (la sala votó, aunque no pase);
 *   3. `presencial` sin acta archivada → 409 literal y el estado no cambia (S1);
 *   4. cambiar el `resultado` de un acuerdo resuelto → 409, la fila no se
 *      reescribe (S5);
 *   5. pin del camino electrónico (S4): un acuerdo `electronica` resuelve
 *      exactamente como hoy —y un acuerdo existente sin `modalidad` explícita
 *      nace electrónico por el default de la base—.
 */
import { createServer, type Server, type ServerResponse } from "node:http"
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest"
import { NextRequest } from "next/server"
import { http, passthrough } from "msw"
import { prisma } from "@/lib/prisma"
import { server as servidorMSW } from "../setup"

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

const COM_A = "apr-com-a"
const COM_B = "apr-com-b"
const PERIODO = "apr-per-vig"

const EMAIL_ADMIN = "apr-admin@test.cl"
const EMAIL_M1 = "apr-m1@test.cl"
const EMAIL_M2 = "apr-m2@test.cl"
const EMAIL_M3 = "apr-m3@test.cl"
const EMAIL_OWN = "apr-own@test.cl"

function ficha(cargo: string): Record<string, unknown> {
  return {
    id: `apr-g-${cargo}`,
    cargoDirectiva: cargo,
    fechaAsuncion: "2026-01-15",
    periodoId: PERIODO,
  }
}

function datosPersona(
  id: string,
  rut: string,
  nombre: string,
  email: string,
  gobernanza: Record<string, unknown> | null,
  roles: string[]
) {
  return {
    id,
    comunidadId: COM_A,
    rut,
    nombreCompleto: nombre,
    nombres: nombre.split(" ")[0]!,
    apellidos: nombre.split(" ").slice(1).join(" "),
    email,
    telefonoMovil: "+56900000000",
    estadoCuenta: "activa",
    condicionesEspecialesIds: [],
    roles,
    datosGobernanza: (gobernanza ?? undefined) as never,
  }
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

// ── Depósito privado falso (T2) ─────────────────────────────────────────────
//
// El cierre de un presencial exige el acta firmada SUBIDA al archivo legal
// (`POST /api/acuerdos/[id]/documento`), así que este archivo necesita el
// depósito y el papel. El arnés es la copia del de `test/api/acuerdos-documento
// .test.ts` (misma API REST que usa `lib/almacen-documentos`): se duplica en
// línea porque importar un archivo de test desde otro registraría sus suites,
// y la misma convención sigue `convenios-documento-envio.test.ts`. Ninguna
// conexión sale a 127.0.0.1 y ninguna credencial es real.

const TOKEN_DEL_DEPOSITO = "apr-token-de-deposito"
const VERSION_API_DEL_DEPOSITO = "12"

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
  let origen = ""
  const deposito: ServidorDepositoFalso = {
    get baseUrl() {
      return origen
    },
    objetos,
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

describe("/api/acuerdos/[id] — cierre del acuerdo presencial (S2/S4/S5)", () => {
  const cargaModulos = async () => ({
    coleccion: await import("@/app/api/acuerdos/route"),
    voto: await import("@/app/api/acuerdos/[id]/voto/route"),
    cierre: await import("@/app/api/acuerdos/[id]/route"),
  })

  let deposito: ServidorDepositoFalso
  let envBlobPrevio: { token?: string; base?: string }

  beforeAll(async () => {
    process.env.AUTH_SECRET = AUTH_SECRET
    deposito = await iniciarServidorDepositoFalso()
    envBlobPrevio = {
      token: process.env.BLOB_READ_WRITE_TOKEN,
      base: process.env.BLOB_API_BASE_URL,
    }
    process.env.BLOB_READ_WRITE_TOKEN = TOKEN_DEL_DEPOSITO
    process.env.BLOB_API_BASE_URL = deposito.baseUrl

    for (const c of [
      { id: COM_A, nombre: "Comunidad Acuerdo Presencial A", slug: "apr-com-a" },
      { id: COM_B, nombre: "Comunidad Acuerdo Presencial B", slug: "apr-com-b" },
    ]) {
      await prisma.comunidad.upsert({ where: { id: c.id }, update: {}, create: c })
    }

    const personas = [
      datosPersona("apr-m1", "21111111-1", "Miembro Uno", "apr-m1@test.cl", ficha("presidente"), ["propietario", "directiva"]),
      datosPersona("apr-m2", "22222222-2", "Miembro Dos", "apr-m2@test.cl", ficha("tesorero"), ["propietario", "directiva"]),
      datosPersona("apr-m3", "23333333-3", "Miembro Tres", "apr-m3@test.cl", ficha("secretario"), ["propietario", "directiva"]),
      datosPersona("apr-own", "24444444-4", "Propietario Simple", "apr-own@test.cl", null, ["propietario"]),
    ]
    for (const p of personas) {
      await prisma.persona.upsert({ where: { id: p.id }, update: {}, create: p })
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

    // El acta firmada archivada (publicada en el libro) y un acta en borrador:
    // la compuerta S1 distingue las dos.
    for (const a of [
      {
        id: "apr-acta-publicada",
        estado: "publicada",
        fecha: "2026-11-10",
        minuta: "Reunión del comité con la votación proclamada en la sala.",
      },
      {
        id: "apr-acta-borrador",
        estado: "borrador",
        fecha: "2026-11-11",
        minuta: "Borrador sin aprobar: todavía no respalda nada.",
      },
    ]) {
      await prisma.actaGD.upsert({
        where: { id: a.id },
        update: { estado: a.estado },
        create: {
          id: a.id,
          comunidadId: COM_A,
          fecha: a.fecha,
          hora: "19:00",
          lugar: "Sala de reuniones",
          tablaTemas: ["Votación del acuerdo"],
          presentes: ["apr-m1", "apr-m2", "apr-m3"],
          ausentes: [],
          invitados: [],
          minuta: a.minuta,
          adjuntos: [],
          estado: a.estado,
          aprobaciones: [],
          folio: `AD-2026-8${a.id === "apr-acta-publicada" ? "1" : "2"}01`,
          periodoId: PERIODO,
        } as never,
      })
    }

    const usuarios = [
      { id: "apr-usuario-admin", email: EMAIL_ADMIN, personaId: null, rol: "administrador" },
      { id: "apr-usuario-m1", email: EMAIL_M1, personaId: "apr-m1", rol: "comite" },
      { id: "apr-usuario-m2", email: EMAIL_M2, personaId: "apr-m2", rol: "comite" },
      { id: "apr-usuario-m3", email: EMAIL_M3, personaId: "apr-m3", rol: "comite" },
      { id: "apr-usuario-own", email: EMAIL_OWN, personaId: "apr-own", rol: "residente" },
    ]
    for (const u of usuarios) {
      await prisma.usuario.upsert({
        where: { email: u.email },
        update: {},
        create: { id: u.id, email: u.email, activo: true, personaId: u.personaId },
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
  }, 30_000)

  beforeEach(() => {
    // El depósito sale de verdad, pero sólo a 127.0.0.1 (lo deja pasar MSW), y
    // cada test arranca con el depósito vacío: los objetos que ve son los suyos.
    servidorMSW.use(http.all(/^http:\/\/127\.0\.0\.1:\d+\//, () => passthrough()))
    deposito.objetos.clear()
  })

  afterAll(async () => {
    try {
      state.cookie = ""
      await deposito?.cerrar()
      // Las filas que la subida del acta firmada creó (T2): el papel archivado
      // y su evento, ANTES de borrar los acuerdos que los referencian.
      await prisma.eventoAuditoria.deleteMany({
        where: { comunidadId: { in: [COM_A, COM_B] }, tipoAccion: { startsWith: "AD_ACUERDO" } },
      })
      await prisma.documento.deleteMany({ where: { comunidadId: { in: [COM_A, COM_B] } } })
      await prisma.votoAcuerdo.deleteMany({
        where: { comunidadId: { in: [COM_A, COM_B] } },
      })
      await prisma.acuerdo.deleteMany({
        where: { comunidadId: { in: [COM_A, COM_B] } },
      })
      await prisma.actaGD.deleteMany({ where: { comunidadId: COM_A } })
      await prisma.periodoDirectiva.deleteMany({ where: { comunidadId: COM_A } })
      await prisma.persona.deleteMany({ where: { comunidadId: COM_A } })
      await prisma.membresia.deleteMany({
        where: { comunidadId: { in: [COM_A, COM_B] } },
      })
      await prisma.usuario.deleteMany({
        where: {
          email: { in: [EMAIL_ADMIN, EMAIL_M1, EMAIL_M2, EMAIL_M3, EMAIL_OWN] },
        },
      })
      for (const id of [COM_A, COM_B]) {
        await prisma.comunidad.delete({ where: { id } }).catch(() => {})
      }
    } catch {
      // intencional: limpieza best-effort
    }
    if (envBlobPrevio) {
      if (envBlobPrevio.token === undefined) delete process.env.BLOB_READ_WRITE_TOKEN
      else process.env.BLOB_READ_WRITE_TOKEN = envBlobPrevio.token
      if (envBlobPrevio.base === undefined) delete process.env.BLOB_API_BASE_URL
      else process.env.BLOB_API_BASE_URL = envBlobPrevio.base
    }
  })

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

  /** POST del cierre: /api/acuerdos/[id] con el resultado proclamado en el body. */
  async function CERRAR(id: string, body: unknown): Promise<Response> {
    const { cierre } = await cargaModulos()
    return cierre.POST(
      new NextRequest(`http://localhost/api/acuerdos/${id}`, {
        method: "POST",
        body: JSON.stringify(body),
        headers: { "content-type": "application/json" },
      }),
      { params: Promise.resolve({ id }) }
    )
  }

  /** El camino real de S1 (T2): el acta firmada se SUBE al archivo legal antes del cierre. */
  async function SUBIR_ACTA(id: string, bytes: Buffer): Promise<Response> {
    const { POST } = await import("@/app/api/acuerdos/[id]/documento/route")
    return POST(
      new NextRequest(`http://localhost/api/acuerdos/${id}/documento`, {
        method: "POST",
        body: JSON.stringify({
          tipo: "acta",
          nombreArchivo: "acta-firmada-comite.pdf",
          contenidoBase64: bytes.toString("base64"),
        }),
        headers: { "content-type": "application/json" },
      }),
      { params: Promise.resolve({ id }) }
    )
  }

  async function POST_VOTO(id: string, body: unknown): Promise<Response> {
    const { voto } = await cargaModulos()
    return voto.POST(
      new NextRequest(`http://localhost/api/acuerdos/${id}/voto`, {
        method: "POST",
        body: JSON.stringify(body),
        headers: { "content-type": "application/json" },
      }),
      { params: Promise.resolve({ id }) }
    )
  }

  async function POST_ACUERDO(body: unknown): Promise<Response> {
    const { coleccion } = await cargaModulos()
    return coleccion.POST(
      new NextRequest("http://localhost/api/acuerdos", {
        method: "POST",
        body: JSON.stringify(body),
        headers: { "content-type": "application/json" },
      })
    )
  }

  async function GET_ACUERDOS(): Promise<Response> {
    const { coleccion } = await cargaModulos()
    return coleccion.GET(new NextRequest("http://localhost/api/acuerdos", { method: "GET" }))
  }

  /**
   * Alta de una fila presencial directa en la base (T1 fija el modelo y la
   * resolución; el alta presencial por API llega con la pantalla, T3).
   */
  async function crearPresencial(
    sobre: {
      folio: string
      actaId?: string
      cuerpo?: string
      quorumRequerido?: string
      materia?: string
    } = { folio: "AD-2026-7001" }
  ): Promise<{ id: string }> {
    const creado = await prisma.acuerdo.create({
      data: {
        id: `apr-acu-${sobre.folio.slice(-4)}`,
        comunidadId: COM_A,
        cuerpo: sobre.cuerpo ?? "comite",
        materia:
          sobre.materia ??
          "Corte de servicios de la unidad por tres cuotas impagas (Ley 21.442 art. 20 N°9)",
        folio: sobre.folio,
        quorumRequerido: sobre.quorumRequerido ?? "un_voto_por_miembro",
        modalidad: "presencial",
        actaId: sobre.actaId ?? null,
        creadoPor: "apr-usuario-admin",
      } as never,
    })
    return { id: creado.id }
  }

  it("401 sin sesión en el cierre y en el voto; 403 para un rol sin gd:crear", async () => {
    state.cookie = ""
    const presencial = await crearPresencial({ folio: "AD-2026-7001" })
    expect(
      (await CERRAR(presencial.id, { resultado: proclamado({ aFavor: 3, enContra: 1, abstenciones: 0, presentes: 4, quorumAlcanzado: true }) })).status
    ).toBe(401)
    expect((await POST_VOTO(presencial.id, { decision: "a_favor" })).status).toBe(401)

    // El residente no cierra acuerdos: la fila queda abierta y sin resultado.
    await conSesion(EMAIL_OWN, async () => {
      const res = await CERRAR(presencial.id, {
        resultado: proclamado({ aFavor: 3, enContra: 1, abstenciones: 0, presentes: 4, quorumAlcanzado: true }),
      })
      expect(res.status).toBe(403)
      const j = (await res.json()) as { error: string }
      expect(j.error).toBe("Permiso denegado.")
    })
    const fila = await prisma.acuerdo.findUnique({ where: { id: presencial.id } })
    expect(fila?.estado).toBe("abierto")
    expect(fila?.resultado).toBeNull()
  })

  it("404 para el acuerdo de otra comunidad y para uno inexistente", async () => {
    await prisma.acuerdo.create({
      data: {
        id: "apr-acu-com-b",
        comunidadId: COM_B,
        cuerpo: "comite",
        materia: "Acuerdo presencial de la comunidad B",
        folio: "AD-2026-9001",
        quorumRequerido: "un_voto_por_miembro",
        modalidad: "presencial",
        creadoPor: "apr-usuario-admin",
      } as never,
    })
    await conSesion(EMAIL_ADMIN, async () => {
      const ajeno = await CERRAR("apr-acu-com-b", {
        resultado: proclamado({ aFavor: 3, enContra: 1, abstenciones: 0, presentes: 4, quorumAlcanzado: true }),
      })
      expect(ajeno.status).toBe(404)
      const j = (await ajeno.json()) as { error: string }
      expect(j.error).toBe("Acuerdo no encontrado.")
      expect(
        (await CERRAR("apr-no-existe", {
          resultado: proclamado({ aFavor: 3, enContra: 1, abstenciones: 0, presentes: 4, quorumAlcanzado: true }),
        })).status
      ).toBe(404)
    })
    const fila = await prisma.acuerdo.findUnique({ where: { id: "apr-acu-com-b" } })
    expect(fila?.estado).toBe("abierto")
  })

  it("el acuerdo presencial se cierra aprobado con el resultado proclamado, sin un solo voto", async () => {
    const acuerdo = await crearPresencial({
      folio: "AD-2026-7002",
      actaId: "apr-acta-publicada",
    })
    await conSesion(EMAIL_ADMIN, async () => {
      // La otra cara de S1: sin el acta firmada subida el cierre NO pasa (409
      // con SU mensaje, distinguible del de acta no publicada).
      const sinPapel = await CERRAR(acuerdo.id, {
        resultado: proclamado({ aFavor: 3, enContra: 1, abstenciones: 0, presentes: 4, quorumAlcanzado: true }),
        actaId: "apr-acta-publicada",
      })
      expect(sinPapel.status).toBe(409)
      expect(((await sinPapel.json()) as { error: string }).error).toBe(
        "No se puede cerrar un acuerdo presencial sin el acta firmada subida al archivo legal: la documentación se sube, no se referencia por URL."
      )

      // El camino real: el papel firmado se SUBE y entonces el cierre pasa.
      expect(
        (await SUBIR_ACTA(acuerdo.id, pdfMinimo("acta firmada del comité, AD-2026-7002"))).status
      ).toBe(201)

      const res = await CERRAR(acuerdo.id, {
        resultado: proclamado({ aFavor: 3, enContra: 1, abstenciones: 0, presentes: 4, quorumAlcanzado: true }),
        actaId: "apr-acta-publicada",
      })
      expect(res.status).toBe(200)
      const j = (await res.json()) as {
        ok: boolean
        resultado: { resultado: string; aFavor: number; motivo: string }
      }
      expect(j.ok).toBe(true)
      expect(j.resultado.resultado).toBe("aprobado")
      // Los números del acta se registran, no se recalculan.
      expect(j.resultado.aFavor).toBe(3)
      expect(j.resultado.motivo).toContain("proclamado")
    })

    const fila = await prisma.acuerdo.findUnique({ where: { id: acuerdo.id } })
    expect(fila?.estado).toBe("aprobado")
    expect(fila?.resueltoEn).not.toBeNull()
    expect(fila?.modalidad).toBe("presencial")
    expect(fila?.actaId).toBe("apr-acta-publicada")
    // El acta del resultado queda registrado verbatim: es lo que la sala proclamó.
    expect(fila?.resultado).toEqual({
      aFavor: 3,
      enContra: 1,
      abstenciones: 0,
      presentes: 4,
      quorumAlcanzado: true,
    })
    // Sin un solo voto: el presencial no acumula VotoAcuerdo, a propósito.
    expect(await prisma.votoAcuerdo.count({ where: { acuerdoId: acuerdo.id } })).toBe(0)
    // El cierre queda auditado.
    const evento = await prisma.eventoAuditoria.findFirst({
      where: { comunidadId: COM_A, tipoAccion: "AD_ACUERDO_CERRADO", referenciaId: acuerdo.id },
    })
    expect(evento).not.toBeNull()
    expect(evento?.descripcion).toContain("AD-2026-7002")
    expect(evento?.descripcion).toContain("proclamado")
  })

  it("la sala votó y no pasó: rechazado, y el resultado queda registrado igual", async () => {
    const acuerdo = await crearPresencial({
      folio: "AD-2026-7003",
      actaId: "apr-acta-publicada",
    })
    await conSesion(EMAIL_ADMIN, async () => {
      // Las dos caras de S1: sin papel no cierra; con el acta firmada subida,
      // la sala que no alcanzó el quórum queda rechazada y registrada igual.
      const sinPapel = await CERRAR(acuerdo.id, {
        resultado: proclamado({ aFavor: 1, enContra: 2, abstenciones: 1, presentes: 4, quorumAlcanzado: false }),
        actaId: "apr-acta-publicada",
      })
      expect(sinPapel.status).toBe(409)
      expect(((await sinPapel.json()) as { error: string }).error).toBe(
        "No se puede cerrar un acuerdo presencial sin el acta firmada subida al archivo legal: la documentación se sube, no se referencia por URL."
      )
      expect(
        (await SUBIR_ACTA(acuerdo.id, pdfMinimo("acta firmada de la asamblea, AD-2026-7003"))).status
      ).toBe(201)

      const res = await CERRAR(acuerdo.id, {
        resultado: proclamado({ aFavor: 1, enContra: 2, abstenciones: 1, presentes: 4, quorumAlcanzado: false }),
        actaId: "apr-acta-publicada",
      })
      expect(res.status).toBe(200)
      const j = (await res.json()) as { resultado: { resultado: string } }
      expect(j.resultado.resultado).toBe("rechazado")
    })
    const fila = await prisma.acuerdo.findUnique({ where: { id: acuerdo.id } })
    // El estado es rechazado aunque la sala haya sesionado: no pasa, pero queda.
    expect(fila?.estado).toBe("rechazado")
    expect(fila?.resueltoEn).not.toBeNull()
    expect(fila?.resultado).toEqual({
      aFavor: 1,
      enContra: 2,
      abstenciones: 1,
      presentes: 4,
      quorumAlcanzado: false,
    })
    expect(await prisma.votoAcuerdo.count({ where: { acuerdoId: acuerdo.id } })).toBe(0)
  })

  it("sin acta archivada no se cierra: 409 literal y el estado no cambia (S1)", async () => {
    // (a) La fila no declara acta y el cierre tampoco.
    const sinActa = await crearPresencial({ folio: "AD-2026-7004" })
    await conSesion(EMAIL_ADMIN, async () => {
      const res = await CERRAR(sinActa.id, {
        resultado: proclamado({ aFavor: 3, enContra: 1, abstenciones: 0, presentes: 4, quorumAlcanzado: true }),
      })
      expect(res.status).toBe(409)
      const j = (await res.json()) as { error: string }
      expect(j.error).toBe(
        "No se puede cerrar un acuerdo presencial sin su acta firmada archivada en esta comunidad."
      )
    })

    // (b) El acta declarada existe pero está en borrador: no respalda nada.
    const conBorrador = await crearPresencial({
      folio: "AD-2026-7005",
      actaId: "apr-acta-borrador",
    })
    await conSesion(EMAIL_ADMIN, async () => {
      const res = await CERRAR(conBorrador.id, {
        resultado: proclamado({ aFavor: 3, enContra: 1, abstenciones: 0, presentes: 4, quorumAlcanzado: true }),
      })
      expect(res.status).toBe(409)
      const j = (await res.json()) as { error: string }
      expect(j.error).toBe(
        "No se puede cerrar un acuerdo presencial sin su acta firmada archivada en esta comunidad."
      )
    })

    // Ninguna de las dos filas cambió: sin acta no hay resultado ni cierre.
    for (const id of [sinActa.id, conBorrador.id]) {
      const fila = await prisma.acuerdo.findUnique({ where: { id } })
      expect(fila?.estado).toBe("abierto")
      expect(fila?.resultado).toBeNull()
      expect(fila?.resueltoEn).toBeNull()
    }
    expect(
      await prisma.eventoAuditoria.count({
        where: {
          comunidadId: COM_A,
          tipoAccion: "AD_ACUERDO_CERRADO",
          referenciaId: { in: [sinActa.id, conBorrador.id] },
        },
      })
    ).toBe(0)
  })

  it("el acuerdo resuelto no se reescribe: cambiar el resultado es 409 (S5)", async () => {
    const acuerdo = await crearPresencial({
      folio: "AD-2026-7006",
      actaId: "apr-acta-publicada",
    })
    await conSesion(EMAIL_ADMIN, async () => {
      // Las dos caras de S1 en la puerta del S5: sin papel no hay primer cierre
      // que congelar; con el acta firmada subida, el cierre congela y el
      // segundo intento no reescribe nada.
      const sinPapel = await CERRAR(acuerdo.id, {
        resultado: proclamado({ aFavor: 3, enContra: 1, abstenciones: 0, presentes: 4, quorumAlcanzado: true }),
        actaId: "apr-acta-publicada",
      })
      expect(sinPapel.status).toBe(409)
      expect(((await sinPapel.json()) as { error: string }).error).toBe(
        "No se puede cerrar un acuerdo presencial sin el acta firmada subida al archivo legal: la documentación se sube, no se referencia por URL."
      )
      expect(
        (await SUBIR_ACTA(acuerdo.id, pdfMinimo("acta firmada del comité, AD-2026-7006"))).status
      ).toBe(201)

      const primera = await CERRAR(acuerdo.id, {
        resultado: proclamado({ aFavor: 3, enContra: 1, abstenciones: 0, presentes: 4, quorumAlcanzado: true }),
        actaId: "apr-acta-publicada",
      })
      expect(primera.status).toBe(200)
      const resueltoEn = (
        await prisma.acuerdo.findUnique({ where: { id: acuerdo.id } })
      )?.resueltoEn

      // Segundo cierre con OTRO resultado: el acta archivada ya congeló lo declarado.
      const segunda = await CERRAR(acuerdo.id, {
        resultado: proclamado({ aFavor: 0, enContra: 4, abstenciones: 0, presentes: 4, quorumAlcanzado: false }),
        actaId: "apr-acta-publicada",
      })
      expect(segunda.status).toBe(409)
      const j = (await segunda.json()) as { error: string }
      expect(j.error).toBe(
        "El acuerdo ya fue resuelto: su resultado y sus papeles no se editan ni se borran (el acta archivada con folio congela lo declarado)."
      )

      const fila = await prisma.acuerdo.findUnique({ where: { id: acuerdo.id } })
      expect(fila?.estado).toBe("aprobado")
      expect(fila?.resultado).toEqual({
        aFavor: 3,
        enContra: 1,
        abstenciones: 0,
        presentes: 4,
        quorumAlcanzado: true,
      })
      expect(fila?.resueltoEn).toEqual(resueltoEn)
    })
  })

  /**
   * Alta de un acuerdo electrónico por la API (default de la base: sin
   * `modalidad` explícita, la fila nace `electronica`).
   */
  async function crearElectronica(): Promise<{ id: string }> {
    let creado: { id: string } | null = null
    await conSesion(EMAIL_ADMIN, async () => {
      const res = await POST_ACUERDO({
        cuerpo: "comite",
        materia: "Convenio de pago de la unidad 102 (Ley 21.442 art. 6)",
        quorumRequerido: "un_voto_por_miembro",
      })
      expect(res.status).toBe(201)
      creado = (await res.json()) as { id: string }
    })
    if (!creado) throw new Error("no se pudo crear el acuerdo electrónico de prueba")
    return creado
  }

  it("el acuerdo electrónico no se proclama: el cierre responde 409", async () => {
    const { id: idElectronico } = await crearElectronica()
    const fila = await prisma.acuerdo.findUnique({ where: { id: idElectronico } })
    // El default de la base: todo lo existente nace electrónico (S4).
    expect(fila?.modalidad).toBe("electronica")

    await conSesion(EMAIL_ADMIN, async () => {
      const res = await CERRAR(idElectronico, {
        resultado: proclamado({ aFavor: 3, enContra: 1, abstenciones: 0, presentes: 4, quorumAlcanzado: true }),
      })
      expect(res.status).toBe(409)
      const j = (await res.json()) as { error: string }
      expect(j.error).toBe(
        "El acuerdo no es presencial: se resuelve con los votos de la base, no se proclama en sala."
      )
    })
    expect(
      (await prisma.acuerdo.findUnique({ where: { id: idElectronico } }))?.estado
    ).toBe("abierto")
  })

  it("pin del camino electrónico: el acuerdo sin modalidad explícita nace electrónico y resuelve exactamente como hoy (S4)", async () => {
    // Fila creada SIN `modalidad`: el default de la base la hace electrónica.
    // (Folio lejos del correlativo que el POST asigna sobre las filas de arriba,
    // para no chocar con el índice único de la comunidad.)
    const legacy = await prisma.acuerdo.create({
      data: {
        id: "apr-acu-legacy",
        comunidadId: COM_A,
        cuerpo: "comite",
        materia: "Presupuesto anual por partidas del año siguiente",
        folio: "AD-2026-7071",
        quorumRequerido: "un_voto_por_miembro",
        creadoPor: "apr-usuario-admin",
      },
    })
    expect(legacy.modalidad).toBe("electronica")

    // Y resuelve con votos, exactamente como hoy: dos de tres miembros son
    // mayoría del comité.
    await conSesion(EMAIL_M1, async () => {
      const primero = await POST_VOTO(legacy.id, { decision: "a_favor" })
      expect(primero.status).toBe(200)
      const j1 = (await primero.json()) as { resultado: { resultado: string; aFavor: number } }
      expect(j1.resultado.resultado).toBe("pendiente")
      expect(j1.resultado.aFavor).toBe(1)
    })
    await conSesion(EMAIL_M2, async () => {
      const segundo = await POST_VOTO(legacy.id, { decision: "a_favor" })
      expect(segundo.status).toBe(200)
      const j2 = (await segundo.json()) as { resultado: { resultado: string; aFavor: number } }
      expect(j2.resultado.resultado).toBe("aprobado")
      expect(j2.resultado.aFavor).toBe(2)
    })
    const fila = await prisma.acuerdo.findUnique({ where: { id: legacy.id } })
    expect(fila?.estado).toBe("aprobado")
    expect(fila?.resueltoEn).not.toBeNull()
    expect(fila?.resultado).toBeNull()
    // El m3 llega tarde: el acuerdo resuelto no admite más votos (409 de hoy).
    await conSesion(EMAIL_M3, async () => {
      expect((await POST_VOTO(legacy.id, { decision: "a_favor" })).status).toBe(409)
    })
  })

  it("un acuerdo presencial no admite votos: el resultado se proclama en la sala (409 literal)", async () => {
    const acuerdo = await crearPresencial({
      folio: "AD-2026-7008",
      actaId: "apr-acta-publicada",
    })
    await conSesion(EMAIL_M1, async () => {
      const res = await POST_VOTO(acuerdo.id, { decision: "a_favor" })
      expect(res.status).toBe(409)
      const j = (await res.json()) as { error: string }
      expect(j.error).toBe(
        "El acuerdo presencial no admite votos: el resultado se proclama en la sala y se registra con su acta."
      )
    })
    expect(await prisma.votoAcuerdo.count({ where: { acuerdoId: acuerdo.id } })).toBe(0)
    expect((await prisma.acuerdo.findUnique({ where: { id: acuerdo.id } }))?.estado).toBe("abierto")
  })

  it("GET: modalidad, proclamado y resultado derivado respetan la modalidad", async () => {
    // Presencial cerrado, presencial sin proclamar y el electrónico votado de
    // arriba: los tres conviven en la lectura del registro.
    const cerrado = await crearPresencial({
      folio: "AD-2026-7009",
      actaId: "apr-acta-publicada",
      materia: "Gasto extraordinario de fachada resuelto en la sala",
      cuerpo: "asamblea",
      quorumRequerido: "mayoria_absoluta_presentes",
    })
    await conSesion(EMAIL_ADMIN, async () => {
      // Las dos caras de S1 en el setup del GET: sin papel no cierra; con el
      // acta firmada subida, el presencial cerrado queda en el registro.
      const sinPapel = await CERRAR(cerrado.id, {
        resultado: proclamado({ aFavor: 45, enContra: 10, abstenciones: 25, presentes: 80, quorumAlcanzado: true }),
        actaId: "apr-acta-publicada",
      })
      expect(sinPapel.status).toBe(409)
      expect(((await sinPapel.json()) as { error: string }).error).toBe(
        "No se puede cerrar un acuerdo presencial sin el acta firmada subida al archivo legal: la documentación se sube, no se referencia por URL."
      )
      expect(
        (
          await SUBIR_ACTA(cerrado.id, pdfMinimo("acta firmada de la asamblea, AD-2026-7009"))
        ).status
      ).toBe(201)
      expect(
        (
          await CERRAR(cerrado.id, {
            resultado: proclamado({ aFavor: 45, enContra: 10, abstenciones: 25, presentes: 80, quorumAlcanzado: true }),
            actaId: "apr-acta-publicada",
          })
        ).status
      ).toBe(200)
    })
    const sinProclamar = await crearPresencial({ folio: "AD-2026-7010", actaId: "apr-acta-publicada" })

    await conSesion(EMAIL_ADMIN, async () => {
      const res = await GET_ACUERDOS()
      expect(res.status).toBe(200)
      const j = (await res.json()) as {
        data: Array<{
          id: string
          modalidad: string
          proclamado: Record<string, unknown> | null
          resultado: { resultado: string; aFavor: number; motivo: string }
          estado: string
        }>
      }

      const presencialCerrado = j.data.find((a) => a.id === cerrado.id)
      expect(presencialCerrado?.modalidad).toBe("presencial")
      expect(presencialCerrado?.estado).toBe("aprobado")
      expect(presencialCerrado?.proclamado).toEqual({
        aFavor: 45,
        enContra: 10,
        abstenciones: 25,
        presentes: 80,
        quorumAlcanzado: true,
      })
      expect(presencialCerrado?.resultado.resultado).toBe("aprobado")
      expect(presencialCerrado?.resultado.aFavor).toBe(45)
      expect(presencialCerrado?.resultado.motivo).toContain("proclamado")

      const pendiente = j.data.find((a) => a.id === sinProclamar.id)
      expect(pendiente?.modalidad).toBe("presencial")
      expect(pendiente?.proclamado).toBeNull()
      expect(pendiente?.resultado.resultado).toBe("pendiente")
      expect(pendiente?.resultado.motivo).toBe(
        "El acuerdo presencial todavía no tiene el resultado proclamado en la sala."
      )

      const electronico = j.data.find((a) => a.id === "apr-acu-legacy")
      expect(electronico?.modalidad).toBe("electronica")
      expect(electronico?.proclamado).toBeNull()
      // El electrónico sigue derivándose de los votos, exactamente como hoy.
      expect(electronico?.resultado.resultado).toBe("aprobado")
      expect(electronico?.resultado.aFavor).toBe(2)
    })
  })
})
