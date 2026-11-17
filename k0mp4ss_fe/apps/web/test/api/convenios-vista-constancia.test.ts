/**
 * @vitest-environment node
 *
 * F29 · T2b — la vista de los convenios expone el papel firmado y su constancia.
 *
 * La pantalla de convenios tiene que poder decir, por fila, si el papel firmado
 * está archivado y en qué quedó su entrega al deudor. Eso lo tiene que decir el
 * SERVIDOR —la constancia vive en `EnvioDocumento` y el cliente no la adivina—,
 * así que este archivo fija lo que `GET /api/convenios` expone:
 *
 *   1. cada fila lleva `documentoId` (el id del papel archivado) y
 *      `constanciaEntrega` con el estado y el motivo EXACTOS que el servidor
 *      tiene persistidos — `pendiente` con el motivo con el que nace la
 *      constancia, `entregado` con la aceptación del servidor, `fallido` con el
 *      error del SMTP verbatim;
 *   2. un convenio SIN papel se distingue de uno con constancia `pendiente`:
 *      sin papel es `documentoId: null` Y `constanciaEntrega: null`; la
 *      constancia pendiente tiene su documento y su fila;
 *   3. el pathname PRIVADO del depósito no viaja en ninguna respuesta: los bytes
 *      del papel sólo se leen por `GET /api/convenios/documento`, con su guard.
 *
 * Las filas se escriben DIRECTO en la base: la unidad bajo prueba es la lectura
 * de la vista, no el archivo del papel —que ya está fijado en
 * `test/api/convenios.test.ts` (V5) y en `test/api/convenios-documento-envio.test.ts`
 * (T2)—. La comunidad es dedicada (`conv-vista-com`) para no mover los contadores
 * que otras suites afirman.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest"
import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"

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

const COM_VISTA = "conv-vista-com"
const USUARIO_ADMIN_VISTA = "conv-vista-usuario-admin"
const EMAIL_ADMIN_VISTA = "conv-vista-admin@test.cl"

const U_VISTA = "conv-vista-u-1"
/** Segunda unidad de la misma persona: la que usa el caso del alta. */
const U_VISTA_2 = "conv-vista-u-2"
const P_VISTA = "conv-vista-p-1"
const ACUERDO_VISTA = "conv-vista-ac-1"
const FONDO_VISTA = "conv-vista-fondo-gc"

/** Los cuatro convenios de la comunidad dedicada: uno por estado de la vista. */
const CON_SIN_PAPEL = "conv-vista-sin-papel"
const CON_PENDIENTE = "conv-vista-pendiente"
const CON_ENTREGADO = "conv-vista-entregado"
const CON_FALLIDO = "conv-vista-fallido"

/** Los papeles archivados (uno por convenio con papel; el sin papel no tiene). */
const DOC_PENDIENTE = "conv-vista-doc-pendiente"
const DOC_ENTREGADO = "conv-vista-doc-entregado"
const DOC_FALLIDO = "conv-vista-doc-fallido"

/**
 * Motivos EXACTOS que el servidor tiene que devolver tal cual. Son los que las
 * rutas escriben: la constancia nace con su motivo (`lib/convenio-documento.ts`),
 * la aceptación dice el id del mensaje y el rebote deja el error del SMTP.
 */
const MOTIVO_NACIMIENTO_LITERAL =
  "El convenio firmado quedó archivado, pero su entrega al deudor todavía no se cursó por ningún canal: la constancia queda pendiente hasta que exista un envío real. El estado `entregado` sólo se registra si el servidor de correo aceptó el mensaje."
const MOTIVO_ENTREGADO_LITERAL =
  "Aceptado por el servidor SMTP (id test-vista-0001)."
const MOTIVO_FALLIDO_LITERAL =
  "Falló el envío por SMTP: 535 5.7.8 Autenticación rechazada del servidor de correo de prueba."

/** Filas tal como las escribe la ruta del archivo (Documento legal + constancia). */
function datosDocumento(id: string, convenioId: string, version: number) {
  return {
    id,
    comunidadId: COM_VISTA,
    naturaleza: "legal",
    tipoDocumental: "otros",
    glosa: `Convenio de pago firmado de la unidad 301 con Deudor de Prueba (Ley 21.442 art. 6)`,
    referenciaAutentica: `Acuerdo del Comité AD-2026-V001 que autoriza el convenio ${convenioId} (Ley 21.442 art. 6)`,
    archivoNombre: "convenio-firmado.pdf",
    archivoTipoMime: "application/pdf",
    archivoTamanoKB: 1.2,
    // El pathname privado del depósito: NUNCA tiene que salir en la respuesta.
    archivoUrl: `convenios/${COM_VISTA}/${convenioId}/${id}.pdf`,
    hash: "a".repeat(64),
    version,
    vigenteDesde: "2026-11-20",
    subidoPorPersonaId: null,
  }
}

function datosConstancia(id: string, documentoId: string, estado: string, motivo: string) {
  return {
    id,
    comunidadId: COM_VISTA,
    documentoId,
    personaId: P_VISTA,
    canal: "email",
    estado,
    fecha: "2026-11-20T12:00:00.000Z",
    motivo,
    notificacionId: null,
    claveEnvio: `${documentoId}:${P_VISTA}:email`,
    reenvio: false,
  }
}

describe("GET /api/convenios — el papel firmado y su constancia en la vista (F29 · T2b)", () => {
  beforeAll(async () => {
    process.env.AUTH_SECRET = AUTH_SECRET

    await prisma.comunidad.upsert({
      where: { id: COM_VISTA },
      update: {},
      create: { id: COM_VISTA, nombre: "Comunidad Vista Constancia", slug: "conv-vista-com" },
    })

    await prisma.fondoFI.upsert({
      where: { id: FONDO_VISTA },
      update: {},
      create: {
        id: FONDO_VISTA,
        comunidadId: COM_VISTA,
        nombre: "Fondo de Gasto Común",
        tipo: "gasto_comun",
        activo: true,
      },
    })

    await prisma.persona.upsert({
      where: { id: P_VISTA },
      update: {},
      create: {
        id: P_VISTA,
        comunidadId: COM_VISTA,
        rut: "19111113-3",
        nombreCompleto: "Deudor de Prueba",
        nombres: "Deudor",
        apellidos: "de Prueba",
        email: "conv-vista-deudor@test.cl",
        telefonoMovil: "+56900000000",
        estadoCuenta: "activa",
        condicionesEspecialesIds: [],
        roles: ["propietario"],
      },
    })

    await prisma.unidad.upsert({
      where: { id: U_VISTA },
      update: {},
      create: {
        id: U_VISTA,
        comunidadId: COM_VISTA,
        microSectorId: "conv-vista-ms-301",
        numero: "301",
        etiqueta: "Depto",
        tipoUnidadId: "conv-vista-tu-1",
        metraje: 50,
        prorrateo: 10,
        rolSii: "conv-vista-301",
        estadoId: "habitada",
        servicios: {},
      },
    })

    // Segunda unidad para el caso del alta: el alta no puede caer en la 301,
    // que ya tiene convenios `vigente` (un solo convenio vigente por unidad).
    await prisma.unidad.upsert({
      where: { id: U_VISTA_2 },
      update: {},
      create: {
        id: U_VISTA_2,
        comunidadId: COM_VISTA,
        microSectorId: "conv-vista-ms-302",
        numero: "302",
        etiqueta: "Depto",
        tipoUnidadId: "conv-vista-tu-1",
        metraje: 50,
        prorrateo: 10,
        rolSii: "conv-vista-302",
        estadoId: "habitada",
        servicios: {},
      },
    })

    await prisma.vinculoUnidad.upsert({
      where: { id: "conv-vista-v-p-u1" },
      update: {},
      create: {
        id: "conv-vista-v-p-u1",
        comunidadId: COM_VISTA,
        personaId: P_VISTA,
        unidadId: U_VISTA,
        rol: "propietario",
        fechaInicio: "2024-01-01",
        fechaFin: null,
        permiteVerFinanzas: true,
      },
    })
    await prisma.vinculoUnidad.upsert({
      where: { id: "conv-vista-v-p-u2" },
      update: {},
      create: {
        id: "conv-vista-v-p-u2",
        comunidadId: COM_VISTA,
        personaId: P_VISTA,
        unidadId: U_VISTA_2,
        rol: "propietario",
        fechaInicio: "2024-01-01",
        fechaFin: null,
        permiteVerFinanzas: true,
      },
    })

    await prisma.acuerdo.upsert({
      where: { id: ACUERDO_VISTA },
      update: {},
      create: {
        id: ACUERDO_VISTA,
        comunidadId: COM_VISTA,
        cuerpo: "comite",
        materia: "Convenio de pago de la unidad 301 (Ley 21.442 art. 6)",
        folio: "AD-2026-V001",
        estado: "aprobado",
        quorumRequerido: "un_voto_por_miembro",
        resueltoEn: new Date("2026-02-10T12:00:00.000Z"),
        creadoPor: USUARIO_ADMIN_VISTA,
      },
    })

    // Los tres convenios CON papel, cada uno con su constancia en su estado, y
    // el SIN papel (documentoId null). Escrito directo: la unidad bajo prueba es
    // la lectura de la vista.
    const convenios = [
      { id: CON_SIN_PAPEL, documentoId: null },
      { id: CON_PENDIENTE, documentoId: DOC_PENDIENTE },
      { id: CON_ENTREGADO, documentoId: DOC_ENTREGADO },
      { id: CON_FALLIDO, documentoId: DOC_FALLIDO },
    ]
    for (const c of convenios) {
      await prisma.convenioPago.upsert({
        where: { id: c.id },
        update: { documentoId: c.documentoId },
        create: {
          id: c.id,
          comunidadId: COM_VISTA,
          unidadId: U_VISTA,
          personaId: P_VISTA,
          acuerdoId: ACUERDO_VISTA,
          montoTotal: 300_000,
          numeroCuotas: 2,
          fechaSuscripcion: new Date("2026-11-20T12:00:00.000Z"),
          primeraCuota: 100_000,
          estado: "vigente",
          creadoPor: USUARIO_ADMIN_VISTA,
          documentoId: c.documentoId,
        },
      })
    }

    for (const d of [
      datosDocumento(DOC_PENDIENTE, CON_PENDIENTE, 901),
      datosDocumento(DOC_ENTREGADO, CON_ENTREGADO, 902),
      datosDocumento(DOC_FALLIDO, CON_FALLIDO, 903),
    ]) {
      await prisma.documento.upsert({
        where: { id: d.id },
        update: {},
        create: d,
      })
    }

    for (const e of [
      datosConstancia(
        "conv-vista-env-pendiente",
        DOC_PENDIENTE,
        "pendiente",
        MOTIVO_NACIMIENTO_LITERAL
      ),
      datosConstancia(
        "conv-vista-env-entregado",
        DOC_ENTREGADO,
        "entregado",
        MOTIVO_ENTREGADO_LITERAL
      ),
      datosConstancia("conv-vista-env-fallido", DOC_FALLIDO, "fallido", MOTIVO_FALLIDO_LITERAL),
    ]) {
      await prisma.envioDocumento.upsert({ where: { id: e.id }, update: {}, create: e })
    }

    await prisma.usuario.upsert({
      where: { email: EMAIL_ADMIN_VISTA },
      update: {},
      create: { id: USUARIO_ADMIN_VISTA, email: EMAIL_ADMIN_VISTA, activo: true, personaId: null },
    })
    await prisma.membresia.deleteMany({ where: { usuarioId: USUARIO_ADMIN_VISTA } })
    await prisma.membresia.create({
      data: { usuarioId: USUARIO_ADMIN_VISTA, comunidadId: COM_VISTA, rol: "administrador" },
    })
  }, 30_000)

  afterAll(async () => {
    try {
      state.cookie = ""
      await prisma.envioDocumento.deleteMany({ where: { comunidadId: COM_VISTA } })
      await prisma.documento.deleteMany({ where: { comunidadId: COM_VISTA } })
      await prisma.cuotaConvenio.deleteMany({ where: { comunidadId: COM_VISTA } })
      await prisma.convenioPago.deleteMany({ where: { comunidadId: COM_VISTA } })
      await prisma.acuerdo.deleteMany({ where: { comunidadId: COM_VISTA } })
      await prisma.vinculoUnidad.deleteMany({ where: { comunidadId: COM_VISTA } })
      await prisma.unidad.deleteMany({ where: { comunidadId: COM_VISTA } })
      await prisma.persona.deleteMany({ where: { comunidadId: COM_VISTA } })
      await prisma.fondoFI.deleteMany({ where: { comunidadId: COM_VISTA } })
      await prisma.membresia.deleteMany({ where: { comunidadId: COM_VISTA } })
      await prisma.usuario.deleteMany({ where: { email: EMAIL_ADMIN_VISTA } })
      await prisma.comunidad.delete({ where: { id: COM_VISTA } }).catch(() => {})
    } catch {
      // intencional: limpieza best-effort, la base de la suite es descartable
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

  async function GET_CONVENIOS(): Promise<Response> {
    const { GET } = await import("@/app/api/convenios/route")
    return GET(new NextRequest("http://localhost/api/convenios", { method: "GET" }))
  }

  it("expone documentoId y la constancia con estado y motivo verbatim, y distingue sin papel de pendiente", async () => {
    await conSesion(EMAIL_ADMIN_VISTA, async () => {
      const respuesta = await GET_CONVENIOS()
      expect(respuesta.status).toBe(200)

      const cuerpo = (await respuesta.json()) as { data: Array<Record<string, unknown>> }
      const filas = cuerpo.data

      // TODAS las filas traen los dos campos: la pantalla no tiene que adivinar
      // la forma de ninguna fila.
      for (const fila of filas) {
        expect("documentoId" in fila).toBe(true)
        expect("constanciaEntrega" in fila).toBe(true)
      }

      const porId = (id: string): Record<string, unknown> => {
        const fila = filas.find((f) => f.id === id)
        if (!fila) throw new Error(`la vista no devolvió el convenio ${id}`)
        return fila
      }

      // SIN papel: documentoId null y sin constancia. Es un estado PROPIO de la
      // vista, no un chip vacío ni un «pendiente» ambiguo.
      const sinPapel = porId(CON_SIN_PAPEL)
      expect(sinPapel.documentoId).toBeNull()
      expect(sinPapel.constanciaEntrega).toBeNull()

      // CONSTANCIA PENDIENTE: con papel y con su fila, el motivo es el literal
      // con el que la constancia nace.
      const pendiente = porId(CON_PENDIENTE)
      expect(pendiente.documentoId).toBe(DOC_PENDIENTE)
      expect(pendiente.constanciaEntrega).toEqual({
        estado: "pendiente",
        motivo: MOTIVO_NACIMIENTO_LITERAL,
      })

      // La frontera que la pantalla necesita: lo que separa «sin papel» de
      // «constancia pendiente» es `documentoId`, no el estado de la constancia.
      expect(sinPapel.documentoId).not.toEqual(pendiente.documentoId)
      expect(sinPapel.constanciaEntrega).not.toEqual(pendiente.constanciaEntrega)

      // ENTREGADO: la aceptación del servidor, con el id del mensaje en el motivo.
      const entregado = porId(CON_ENTREGADO)
      expect(entregado.documentoId).toBe(DOC_ENTREGADO)
      expect(entregado.constanciaEntrega).toEqual({
        estado: "entregado",
        motivo: MOTIVO_ENTREGADO_LITERAL,
      })

      // FALLIDO: el error del SMTP verbatim, tal como el servidor lo persistió.
      const fallido = porId(CON_FALLIDO)
      expect(fallido.documentoId).toBe(DOC_FALLIDO)
      expect(fallido.constanciaEntrega).toEqual({
        estado: "fallido",
        motivo: MOTIVO_FALLIDO_LITERAL,
      })

      // El pathname PRIVADO del depósito no viaja: ni el campo ni su valor en
      // ninguna fila. Los bytes se leen por la ruta del documento, con su guard.
      const serializado = JSON.stringify(filas)
      expect(serializado).not.toContain("archivoUrl")
      expect(serializado).not.toContain("convenios/")
    })
  })

  it("el alta responde la misma forma: un convenio recién suscrito no tiene papel ni constancia", async () => {
    await conSesion(EMAIL_ADMIN_VISTA, async () => {
      const { POST } = await import("@/app/api/convenios/route")
      const respuesta = await POST(
        new NextRequest("http://localhost/api/convenios", {
          method: "POST",
          body: JSON.stringify({
            unidadId: U_VISTA_2,
            personaId: P_VISTA,
            acuerdoId: ACUERDO_VISTA,
            montoTotal: 150_000,
            numeroCuotas: 1,
            primeraCuota: 50_000,
          }),
          headers: { "content-type": "application/json" },
        })
      )
      expect(respuesta.status).toBe(201)

      const creado = (await respuesta.json()) as Record<string, unknown>
      expect(creado.id).toEqual(expect.any(String))
      expect(creado.documentoId).toBeNull()
      expect(creado.constanciaEntrega).toBeNull()
    })
  })
})
