/**
 * @vitest-environment node
 *
 * Guardián de la identidad de los papeles (S3/S5 de `odd/auditorias/identidad-comunidad.md`).
 *
 * Qué garantiza, exactamente:
 *
 *   1. **El firmante se deriva, no se escribe.** El nombre y el RUT que firman un
 *      papel salen de la persona del padrón con membresía `administrador` vigente;
 *      el texto libre que quedó en las columnas deprecadas de CF (`administradorResponsable`,
 *      `rutAdministrador`) no se imprime ni se expone. Si hay varias membresías
 *      `administrador`, se elige —en orden determinista— la primera que tiene
 *      persona de la comunidad: una membresía sin ficha no puede firmar.
 *   2. **Sin firmante no hay papel.** Las cuatro rutas de papeles (aviso,
 *      liquidación, certificado y requerimiento de corte) responden 409 con el
 *      mismo texto y NO devuelven bytes de PDF; el alta del corte no escribe ni
 *      `Documento`, ni `CorteServicio`, ni evento y no compila el escrito.
 *   3. **Sin nombre real no hay documento.** La identidad del papel se resuelve en
 *      UN lugar (`identidadDelPapel`); si la comunidad no existe o no tiene nombre,
 *      falla y el cuerpo del error no contiene el id interno que antes se imprimía.
 *   4. **El máximo del nombre tiene una sola definición** (`NombreComunidadSchema`),
 *      usada por el renombre y por la semilla.
 *
 * El fixture deja a propósito dos administradores en la comunidad principal: uno
 * sin ficha (más antiguo) y la persona del padrón (más nueva). Si el resolver
 * tomara la primera membresía a secas, los papeles saldrían sin firmante y este
 * archivo lo diría.
 */
import { readFileSync } from "node:fs"
import path from "node:path"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import { prisma } from "@/lib/prisma"
import { configuracionDefault } from "@/data/admin/configuracion"
import { NombreComunidadSchema } from "@/lib/schemas"
import {
  MENSAJE_COMUNIDAD_SIN_NOMBRE,
  MENSAJE_SIN_ADMINISTRADOR_DESIGNADO,
  encabezadoInstitucional,
} from "@/lib/pdf-utils"
import { identidadDelPapel } from "@/app/api/configuracion/_lib/identidad-papel"
import { cookieDeUsuario, cuerpoJson, invocarApi } from "./helpers/api-sesion"

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

/** `apps/web` — este archivo vive en `test/`. */
const RAIZ = path.resolve(__dirname, "..")

// ── Comunidades del arnés ───────────────────────────────────────────────────

const COM = "pap-comunidad"
const COM_SIN_FIRMANTE = "pap-comunidad-sin-firmante"
const COM_SIN_ADMIN = "pap-comunidad-sin-admin"
const COM_SIN_NOMBRE = "pap-comunidad-sin-nombre"
const COM_INEXISTENTE = "pap-comunidad-que-no-existe"

const NOMBRE = "Comunidad Papeles Firmados"
/** Señuelo en `Comunidad.nombre` no aplica: el nombre real es NOMBRE. */
const NOMBRE_CF_DEPRECADO = "Nombre Señuelo de CF"
const ADMIN_TEXTO_LIBRE = "Administrador Anterior"
const RUT_ADMIN_TEXTO_LIBRE = "99.999.999-9"
const DIRECCION = "Av. Papeles 123, Providencia"
const RUT_COMUNIDAD = "77.777.777-7"

/** La persona del padrón que debe firmar. */
const PERSONA_FIRMANTE = "pap-persona-firmante"
const NOMBRE_FIRMANTE = "Rosa Firmante del Padrón"
const RUT_FIRMANTE = "12.345.678-9"

// ── Filas del arnés ─────────────────────────────────────────────────────────

const UNIDAD = "pap-unidad-101"
const ACUERDO = "pap-acuerdo-1"
const DOCUMENTO = "pap-doc-1"
const CORTE = "pap-corte-1"
const AVISO = "pap-aviso-1"
const LIQUIDACION = "pap-liq-1"
const CERTIFICADO = "pap-cert-1"
const CERTIFICADO_SIN_ADMIN = "pap-cert-sin-admin"
const CERTIFICADO_SIN_NOMBRE = "pap-cert-sin-nombre"

const UNIDAD_SIN_FIRMANTE = "pap-unidad-sin-firmante"
const ACUERDO_SIN_FIRMANTE = "pap-acuerdo-sin-firmante"
const DOCUMENTO_SIN_FIRMANTE = "pap-doc-sin-firmante"
const CORTE_SIN_FIRMANTE = "pap-corte-sin-firmante"
const AVISO_SIN_FIRMANTE = "pap-aviso-sin-firmante"
const LIQUIDACION_SIN_FIRMANTE = "pap-liq-sin-firmante"
const CERTIFICADO_SIN_FIRMANTE = "pap-cert-sin-firmante"
const PERSONA_TRABAJADORA = "pap-persona-trabajadora"

const EMAILS = {
  firmante: "pap-admin-firmante@test.cl",
  sinFicha: "pap-admin-sin-ficha@test.cl",
  sinFirmante: "pap-admin-sin-firmante@test.cl",
  comiteSinAdmin: "pap-comite-sin-admin@test.cl",
  adminSinNombre: "pap-admin-sin-nombre@test.cl",
} as const

type ClaveCuenta = keyof typeof EMAILS

const RUTAS_PAPELES: {
  nombre: string
  invocar: (id: string) => Promise<Response>
}[] = [
  {
    nombre: "aviso de cobro",
    invocar: (id) =>
      invocarApi(import("@/app/api/avisos-cobro/[id]/pdf/route"), "GET", "avisos-cobro/[id]/pdf", {
        params: { id },
      }),
  },
  {
    nombre: "liquidación",
    invocar: (id) =>
      invocarApi(
        import("@/app/api/liquidaciones/[id]/pdf/route"),
        "GET",
        "liquidaciones/[id]/pdf",
        { params: { id } }
      ),
  },
  {
    nombre: "certificado",
    invocar: (id) =>
      invocarApi(
        import("@/app/api/certificados-ct/[id]/pdf/route"),
        "GET",
        "certificados-ct/[id]/pdf",
        { params: { id } }
      ),
  },
  {
    nombre: "requerimiento de corte",
    invocar: (id) =>
      invocarApi(
        import("@/app/api/cortes-servicio/requerimiento/route"),
        "GET",
        `cortes-servicio/requerimiento?corteId=${encodeURIComponent(id)}`
      ),
  },
]

/** `Comunidad` + CF con las columnas deprecadas cargadas de texto libre. */
function configuracionDe(id: string, comunidadId: string): Record<string, unknown> {
  return {
    ...configuracionDefault,
    id,
    comunidadId,
    nombreComunidad: NOMBRE_CF_DEPRECADO,
    direccionOficial: DIRECCION,
    rutComunidad: RUT_COMUNIDAD,
    administradorResponsable: ADMIN_TEXTO_LIBRE,
    rutAdministrador: RUT_ADMIN_TEXTO_LIBRE,
    firmaDigitalizadaUrl: null,
  }
}

function personaDe(id: string, comunidadId: string, nombre: string, rut: string) {
  const [nombres = "", ...resto] = nombre.split(" ")
  return {
    id,
    comunidadId,
    rut,
    nombreCompleto: nombre,
    nombres,
    apellidos: resto.join(" "),
    email: `${id}@pap.test.cl`,
    telefonoMovil: "+56911111111",
    estadoCuenta: "activa",
    condicionesEspecialesIds: [],
    roles: ["propietario"],
  }
}

function periodoHaceMeses(meses: number): string {
  const hoy = new Date()
  const fecha = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth() - meses, 1))
  return `${fecha.getUTCFullYear()}-${String(fecha.getUTCMonth() + 1).padStart(2, "0")}`
}

function cobroDeLaUnidad(id: string, comunidadId: string, unidadId: string, periodo: string) {
  return {
    id,
    comunidadId,
    unidadId,
    periodo,
    concepto: "gasto_comun",
    origenModulo: "FI",
    fondoId: "pap-fondo-gc",
    descripcion: `Gasto Común ${periodo}`,
    montoBase: 100_000,
    lineas: [{ concepto: "gasto_comun", monto: 100_000, fondoId: "pap-fondo-gc" }],
    fechaCargo: `${periodo}-01`,
    fechaVencimiento: `${periodo}-10`,
    moras: [],
    pagos: [],
    diferencias: [],
  }
}

function unidadDe(id: string, comunidadId: string, numero: string) {
  return {
    id,
    comunidadId,
    microSectorId: `pap-ms-${numero}`,
    numero,
    etiqueta: `Depto ${numero}`,
    tipoUnidadId: "pap-tu-1",
    metraje: 55,
    prorrateo: 10,
    rolSii: `7000-${numero}`,
    estadoId: "habitada",
    servicios: {},
  }
}

function liquidacionDe(id: string, comunidadId: string, trabajadorPersonaId: string) {
  return {
    id,
    comunidadId,
    folio: "LIQ-0001",
    trabajadorPersonaId,
    periodo: "2026-10",
    fechaGeneracion: "2026-10-30",
    diasTrabajados: 30,
    sueldoBaseContrato: 650_000,
    diasMesComercial: 30,
    jornadaSemanal: 44,
    sueldoBaseProporcional: 650_000,
    horasExtrasHoras: 0,
    valorHoraOrdinaria: 0,
    montoHorasExtras: 0,
    bonos: [],
    gratificacionLegal: 0,
    totalImponible: 650_000,
    asignacionMovilizacion: 0,
    asignacionColacion: 0,
    cargas: 0,
    montoAsignacionFamiliar: 0,
    totalHaberes: 650_000,
    nombreAfp: "AFP Habitat",
    tasaAFP: 10.58,
    montoAFP: 0,
    nombreSalud: "FONASA",
    saludTipo: "fonasa",
    montoSalud: 0,
    tasaSIS: 1.48,
    montoSIS: 0,
    montoSeguroCesantia: 0,
    montoAPV: 0,
    totalDescuentos: 0,
    descuentoAnticipos: 0,
    adelantosIds: [],
    alcanceLiquido: 650_000,
    liquidoAPagar: 650_000,
    estado: "borrador",
    egresoFIReferencia: "pendiente",
  }
}

describe("identidad de los papeles — firmante derivado y fallo cerrado", () => {
  const cookies = {} as Record<ClaveCuenta, string>

  beforeAll(async () => {
    process.env.AUTH_SECRET = AUTH_SECRET

    for (const [id, nombre] of [
      [COM, NOMBRE],
      [COM_SIN_FIRMANTE, "Comunidad Sin Firma"],
      [COM_SIN_ADMIN, "Comunidad Sin Administrador"],
      // El nombre en blanco es el caso que antes se imprimía como el id interno.
      [COM_SIN_NOMBRE, "   "],
    ] as const) {
      await prisma.comunidad.upsert({
        where: { id },
        update: { nombre },
        create: { id, nombre, slug: id },
      })
    }

    await prisma.configuracionGlobal.deleteMany({
      where: {
        comunidadId: {
          in: [COM, COM_SIN_FIRMANTE, COM_SIN_ADMIN, COM_SIN_NOMBRE],
        },
      },
    })
    for (const [id, comunidadId] of [
      ["pap-cf-principal", COM],
      ["pap-cf-sin-firmante", COM_SIN_FIRMANTE],
      ["pap-cf-sin-admin", COM_SIN_ADMIN],
      ["pap-cf-sin-nombre", COM_SIN_NOMBRE],
    ] as const) {
      await prisma.configuracionGlobal.create({
        data: configuracionDe(id, comunidadId) as never,
      })
    }

    // Personas del padrón: la firmante de la comunidad principal y la del caso
    // «comunidad sin nombre» (para que el 409 sea por el nombre, no por el firmante).
    await prisma.persona.deleteMany({
      where: {
        id: { in: [PERSONA_FIRMANTE, "pap-persona-sin-nombre", PERSONA_TRABAJADORA] },
      },
    })
    await prisma.persona.create({
      data: personaDe(PERSONA_FIRMANTE, COM, NOMBRE_FIRMANTE, RUT_FIRMANTE),
    })
    await prisma.persona.create({
      data: personaDe(PERSONA_TRABAJADORA, COM_SIN_FIRMANTE, "Tina Trabajadora", "15.555.555-5"),
    })
    await prisma.persona.create({
      data: personaDe("pap-persona-sin-nombre", COM_SIN_NOMBRE, "Perla Sin Nombre", "14.444.444-4"),
    })

    for (const [email, id] of [
      [EMAILS.firmante, "pap-usuario-firmante"],
      [EMAILS.sinFicha, "pap-usuario-sin-ficha"],
      [EMAILS.sinFirmante, "pap-usuario-sin-firmante"],
      [EMAILS.comiteSinAdmin, "pap-usuario-comite-sin-admin"],
      [EMAILS.adminSinNombre, "pap-usuario-sin-nombre"],
    ] as const) {
      await prisma.usuario.upsert({
        where: { email },
        update: {},
        create: { id, email, activo: true },
      })
      await prisma.membresia.deleteMany({ where: { usuarioId: id } })
    }
    await prisma.usuario.update({
      where: { email: EMAILS.firmante },
      data: { personaId: PERSONA_FIRMANTE },
    })
    await prisma.usuario.update({
      where: { email: EMAILS.sinFicha },
      data: { personaId: null },
    })
    await prisma.usuario.update({
      where: { email: EMAILS.adminSinNombre },
      data: { personaId: "pap-persona-sin-nombre" },
    })

    const membresias = [
      // MÁS ANTIGUA y sin ficha: el resolver tiene que saltearla.
      {
        usuarioId: "pap-usuario-sin-ficha",
        comunidadId: COM,
        rol: "administrador",
        createdAt: new Date("2020-01-01T00:00:00.000Z"),
      },
      {
        usuarioId: "pap-usuario-firmante",
        comunidadId: COM,
        rol: "administrador",
        createdAt: new Date("2021-01-01T00:00:00.000Z"),
      },
      // Administrador del arnés sin persona: es el caso real del primer arranque.
      { usuarioId: "pap-usuario-sin-firmante", comunidadId: COM_SIN_FIRMANTE, rol: "administrador" },
      // Comunidad SIN membresía administrador: sólo el comité, que puede leer papeles.
      { usuarioId: "pap-usuario-comite-sin-admin", comunidadId: COM_SIN_ADMIN, rol: "comite" },
      { usuarioId: "pap-usuario-sin-nombre", comunidadId: COM_SIN_NOMBRE, rol: "administrador" },
    ]
    for (const m of membresias) {
      await prisma.membresia.create({ data: m as never })
    }

    for (const clave of Object.keys(EMAILS) as ClaveCuenta[]) {
      cookies[clave] = await cookieDeUsuario(EMAILS[clave])
    }

    // ── Filas de los papeles ────────────────────────────────────────────────
    await prisma.unidad.deleteMany({ where: { id: { in: [UNIDAD, UNIDAD_SIN_FIRMANTE] } } })
    await prisma.unidad.create({ data: unidadDe(UNIDAD, COM, "101") })
    await prisma.unidad.create({ data: unidadDe(UNIDAD_SIN_FIRMANTE, COM_SIN_FIRMANTE, "102") })

    await prisma.acuerdo.deleteMany({ where: { id: { in: [ACUERDO, ACUERDO_SIN_FIRMANTE] } } })
    for (const [id, comunidadId] of [
      [ACUERDO, COM],
      [ACUERDO_SIN_FIRMANTE, COM_SIN_FIRMANTE],
    ] as const) {
      await prisma.acuerdo.create({
        data: {
          id,
          comunidadId,
          cuerpo: "comite",
          materia: "Corte de servicios de la unidad (Ley 21.442 art. 20 N°9)",
          folio: `AD-2026-${id.slice(-1)}`,
          estado: "aprobado",
          quorumRequerido: "un_voto_por_miembro",
          resueltoEn: new Date("2026-02-10T12:00:00.000Z"),
          creadoPor: "pap-usuario-firmante",
        },
      })
    }

    const documentos = [
      { id: DOCUMENTO, comunidadId: COM, corteId: CORTE },
      { id: DOCUMENTO_SIN_FIRMANTE, comunidadId: COM_SIN_FIRMANTE, corteId: CORTE_SIN_FIRMANTE },
    ]
    await prisma.documento.deleteMany({ where: { id: { in: documentos.map((d) => d.id) } } })
    for (const documento of documentos) {
      await prisma.documento.create({
        data: {
          id: documento.id,
          comunidadId: documento.comunidadId,
          naturaleza: "legal",
          tipoDocumental: "otros",
          glosa: "Requerimiento de corte del arnés",
          referenciaAutentica: `Trámite de corte ${documento.corteId}`,
          archivoNombre: `requerimiento-corte-${documento.corteId}.pdf`,
          archivoTipoMime: "application/pdf",
          archivoTamanoKB: 1,
          archivoUrl: `/api/cortes-servicio/requerimiento?corteId=${documento.corteId}`,
          hash: "hash-de-prueba",
          version: 1,
          vigenteDesde: "2026-03-01",
        },
      })
    }

    await prisma.corteServicio.deleteMany({ where: { id: { in: [CORTE, CORTE_SIN_FIRMANTE] } } })
    for (const corte of [
      {
        id: CORTE,
        comunidadId: COM,
        unidadId: UNIDAD,
        acuerdoId: ACUERDO,
        documentoId: DOCUMENTO,
        creadoPor: "pap-usuario-firmante",
      },
      {
        id: CORTE_SIN_FIRMANTE,
        comunidadId: COM_SIN_FIRMANTE,
        unidadId: UNIDAD_SIN_FIRMANTE,
        acuerdoId: ACUERDO_SIN_FIRMANTE,
        documentoId: DOCUMENTO_SIN_FIRMANTE,
        creadoPor: "pap-usuario-sin-firmante",
      },
    ]) {
      await prisma.corteServicio.create({
        data: {
          ...corte,
          servicio: "electricidad",
          cuotasImpagas: 3,
          montoAdeudado: 300_000,
          fechaPreaviso: new Date("2026-03-01T12:00:00.000Z"),
          fechaHabilitada: new Date("2026-03-06T00:00:00.000Z"),
          estado: "preaviso",
        },
      })
    }

    await prisma.avisoCobro.deleteMany({ where: { id: { in: [AVISO, AVISO_SIN_FIRMANTE] } } })
    for (const aviso of [
      { id: AVISO, comunidadId: COM, unidadId: UNIDAD, folio: "AC-0001", codigo: "VC-PAP001" },
      {
        id: AVISO_SIN_FIRMANTE,
        comunidadId: COM_SIN_FIRMANTE,
        unidadId: UNIDAD_SIN_FIRMANTE,
        folio: "AC-0002",
        codigo: "VC-PAP002",
      },
    ]) {
      await prisma.avisoCobro.create({
        data: {
          id: aviso.id,
          comunidadId: aviso.comunidadId,
          unidadId: aviso.unidadId,
          periodo: "2026-10",
          folio: aviso.folio,
          codigoVerificacion: aviso.codigo,
          fechaEmision: "2026-10-05",
          vencimiento: "2026-10-15",
          contenido: {},
          totalesComunidad: {},
        },
      })
    }

    await prisma.liquidacionPL.deleteMany({
      where: { id: { in: [LIQUIDACION, LIQUIDACION_SIN_FIRMANTE] } },
    })
    await prisma.liquidacionPL.create({
      data: liquidacionDe(LIQUIDACION, COM, PERSONA_FIRMANTE) as never,
    })
    await prisma.liquidacionPL.create({
      data: {
        ...liquidacionDe(LIQUIDACION_SIN_FIRMANTE, COM_SIN_FIRMANTE, PERSONA_TRABAJADORA),
        folio: "LIQ-0002",
      } as never,
    })

    for (const certificado of [
      {
        id: CERTIFICADO,
        comunidadId: COM,
        unidadId: UNIDAD,
        personaId: PERSONA_FIRMANTE,
      },
      {
        id: CERTIFICADO_SIN_FIRMANTE,
        comunidadId: COM_SIN_FIRMANTE,
        unidadId: UNIDAD_SIN_FIRMANTE,
        personaId: null,
      },
      { id: CERTIFICADO_SIN_ADMIN, comunidadId: COM_SIN_ADMIN, unidadId: null, personaId: null },
      { id: CERTIFICADO_SIN_NOMBRE, comunidadId: COM_SIN_NOMBRE, unidadId: null, personaId: null },
    ]) {
      await prisma.certificadoCT.deleteMany({ where: { id: certificado.id } })
      await prisma.certificadoCT.create({
        data: {
          id: certificado.id,
          comunidadId: certificado.comunidadId,
          folio: `CT-${certificado.id.slice(-4)}`,
          codigoVerificacion: `VC-${certificado.id.slice(-4)}`,
          tipo: "residencia",
          unidadId: certificado.unidadId,
          personaId: certificado.personaId,
          solicitanteNombre: NOMBRE_FIRMANTE,
          resumen: "Certificado de residencia del arnés.",
          detalle: [{ clave: "Unidad", valor: "101" }],
          fechaEmision: "2026-11-07",
        },
      })
    }

    // Morosidad del corte que el POST intenta preavisar en la comunidad sin firmante.
    await prisma.cobroFI.deleteMany({ where: { comunidadId: COM_SIN_FIRMANTE } })
    for (const [indice, meses] of [3, 2, 1].entries()) {
      await prisma.cobroFI.create({
        data: cobroDeLaUnidad(
          `pap-cfi-${indice + 1}`,
          COM_SIN_FIRMANTE,
          UNIDAD_SIN_FIRMANTE,
          periodoHaceMeses(meses)
        ),
      })
    }
  }, 60_000)

  afterAll(async () => {
    state.cookie = ""
    const comunidades = [COM, COM_SIN_FIRMANTE, COM_SIN_ADMIN, COM_SIN_NOMBRE]
    try {
      await prisma.envioDocumento.deleteMany({ where: { comunidadId: { in: comunidades } } })
      await prisma.documento.deleteMany({ where: { comunidadId: { in: comunidades } } })
      await prisma.corteServicio.deleteMany({ where: { comunidadId: { in: comunidades } } })
      await prisma.acuerdo.deleteMany({ where: { comunidadId: { in: comunidades } } })
      await prisma.avisoCobro.deleteMany({ where: { comunidadId: { in: comunidades } } })
      await prisma.certificadoCT.deleteMany({ where: { comunidadId: { in: comunidades } } })
      await prisma.liquidacionPL.deleteMany({ where: { comunidadId: { in: comunidades } } })
      await prisma.cobroFI.deleteMany({ where: { comunidadId: { in: comunidades } } })
      await prisma.eventoAuditoria.deleteMany({ where: { comunidadId: { in: comunidades } } })
      await prisma.unidad.deleteMany({ where: { comunidadId: { in: comunidades } } })
      await prisma.persona.deleteMany({ where: { comunidadId: { in: comunidades } } })
      const emails = Object.values(EMAILS)
      const usuarios = await prisma.usuario.findMany({
        where: { email: { in: emails } },
        select: { id: true },
      })
      await prisma.membresia.deleteMany({
        where: { usuarioId: { in: usuarios.map((u) => u.id) } },
      })
      await prisma.usuario.deleteMany({ where: { email: { in: emails } } })
      await prisma.configuracionGlobal.deleteMany({
        where: { comunidadId: { in: comunidades } },
      })
      await prisma.comunidad.deleteMany({ where: { id: { in: comunidades } } })
    } catch {
      // intencional: limpieza best-effort (la base es descartable)
    }
  })

  async function como<T>(clave: ClaveCuenta, fn: () => Promise<T>): Promise<T> {
    state.cookie = cookies[clave]
    try {
      return await fn()
    } finally {
      state.cookie = ""
    }
  }

  // ── 1. El firmante se deriva ───────────────────────────────────────────────

  it("el firmante sale de la persona con membresía administrador, no del texto libre de CF", async () => {
    const resultado = await identidadDelPapel(COM)
    expect(resultado.ok).toBe(true)
    if (!resultado.ok) return

    expect(resultado.identidad.nombreComunidad).toBe(NOMBRE)
    expect(resultado.identidad.institucional).not.toBeNull()
    const institucional = resultado.identidad.institucional!
    expect(institucional.administradorResponsable).toBe(NOMBRE_FIRMANTE)
    expect(institucional.rutAdministrador).toBe(RUT_FIRMANTE)
    expect(institucional.direccionOficial).toBe(DIRECCION)
    expect(institucional.rutComunidad).toBe(RUT_COMUNIDAD)

    // El encabezado que imprimen los cuatro papeles: la persona del padrón y
    // ninguna de las dos columnas deprecadas.
    const encabezado = encabezadoInstitucional(institucional)
    expect(encabezado).toEqual([
      { text: NOMBRE, style: "titulo" },
      `${DIRECCION} · RUT ${RUT_COMUNIDAD}`,
      `Administrador responsable: ${NOMBRE_FIRMANTE} (${RUT_FIRMANTE})`,
    ])
    const plano = JSON.stringify(encabezado)
    expect(plano).not.toContain(ADMIN_TEXTO_LIBRE)
    expect(plano).not.toContain(RUT_ADMIN_TEXTO_LIBRE)
    expect(plano).not.toContain(NOMBRE_CF_DEPRECADO)
  })

  it("una membresía administrador sin ficha no firma: se usa la primera que tiene persona", async () => {
    // El fixture tiene la membresía sin ficha con `createdAt` MÁS ANTIGUA: si el
    // resolver no exige persona del padrón, devolvería null o el texto libre.
    const membresias = await prisma.membresia.findMany({
      where: { comunidadId: COM, rol: "administrador" },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { usuario: { select: { personaId: true } } },
    })
    expect(membresias[0]?.usuario.personaId).toBeNull()

    const resultado = await identidadDelPapel(COM)
    expect(resultado.ok).toBe(true)
    if (!resultado.ok) return
    expect(resultado.identidad.institucional?.administradorResponsable).toBe(NOMBRE_FIRMANTE)
  })

  it("GET /api/configuracion proyecta al firmante derivado y no lee las columnas deprecadas", async () => {
    await como("firmante", async () => {
      const res = await invocarApi(
        import("@/app/api/configuracion/route"),
        "GET",
        "configuracion"
      )
      expect(res.status).toBe(200)
      const config = await cuerpoJson<Record<string, unknown>>(res)
      expect(config.nombreComunidad).toBe(NOMBRE)
      // El firmante va en su propio campo, con la persona del padrón.
      expect(config.firmante).toEqual({ nombre: NOMBRE_FIRMANTE, rut: RUT_FIRMANTE })
      // Y las dos columnas deprecadas ya no viajan en la respuesta.
      expect(config).not.toHaveProperty("administradorResponsable")
      expect(config).not.toHaveProperty("rutAdministrador")
      const plano = JSON.stringify(config)
      expect(plano).not.toContain(ADMIN_TEXTO_LIBRE)
      expect(plano).not.toContain(RUT_ADMIN_TEXTO_LIBRE)
      expect(plano).not.toContain(NOMBRE_CF_DEPRECADO)
    })
  })

  it("un PUT del formulario no escribe el firmante ni las columnas deprecadas del administrador", async () => {
    await como("firmante", async () => {
      const res = await invocarApi(
        import("@/app/api/configuracion/route"),
        "PUT",
        "configuracion",
        {
          body: {
            // Los tres nombres viejos del firmante: las dos columnas deprecadas y el
            // campo derivado. Ninguno se escribe.
            administradorResponsable: "Intento de Sobrescritura",
            rutAdministrador: "11.111.111-1",
            firmante: { nombre: "Intento de Sobrescritura", rut: "11.111.111-1" },
            diaCortePago: 17,
          },
        }
      )
      expect(res.status).toBe(200)
      const fila = await prisma.configuracionGlobal.findUnique({
        where: { comunidadId: COM },
      })
      expect(fila?.administradorResponsable).toBe(ADMIN_TEXTO_LIBRE)
      expect(fila?.rutAdministrador).toBe(RUT_ADMIN_TEXTO_LIBRE)
      expect(fila?.diaCortePago).toBe(17)
      // La proyección sigue siendo la persona del padrón: `firmante` no se escribe.
      const get = await invocarApi(
        import("@/app/api/configuracion/route"),
        "GET",
        "configuracion"
      )
      expect((await cuerpoJson<Record<string, unknown>>(get)).firmante).toEqual({
        nombre: NOMBRE_FIRMANTE,
        rut: RUT_FIRMANTE,
      })
    })
  })

  // ── 2. Sin firmante no hay papel ───────────────────────────────────────────

  it("con administrador con ficha los cuatro papeles salen: PDF real, no JSON", async () => {
    await como("firmante", async () => {
      const casos: [string, string][] = [
        ["aviso de cobro", AVISO],
        ["liquidación", LIQUIDACION],
        ["certificado", CERTIFICADO],
        ["requerimiento de corte", CORTE],
      ]
      for (const [nombre, id] of casos) {
        const ruta = RUTAS_PAPELES.find((r) => r.nombre === nombre)!
        const res = await ruta.invocar(id)
        expect(res.status, nombre).toBe(200)
        expect(res.headers.get("content-type"), nombre).toBe("application/pdf")
        const bytes = Buffer.from(await res.arrayBuffer())
        expect(bytes.subarray(0, 5).toString(), nombre).toBe("%PDF-")
        expect(bytes.length, nombre).toBeGreaterThan(1000)
      }
    })
  })

  it("sin administrador con ficha los cuatro papeles responden 409 y no devuelven PDF", async () => {
    await como("sinFirmante", async () => {
      const casos: [string, string][] = [
        ["aviso de cobro", AVISO_SIN_FIRMANTE],
        ["liquidación", LIQUIDACION_SIN_FIRMANTE],
        ["certificado", CERTIFICADO_SIN_FIRMANTE],
        ["requerimiento de corte", CORTE_SIN_FIRMANTE],
      ]
      for (const [nombre, id] of casos) {
        const ruta = RUTAS_PAPELES.find((r) => r.nombre === nombre)!
        const res = await ruta.invocar(id)
        expect(res.status, nombre).toBe(409)
        expect(res.headers.get("content-type"), nombre).not.toBe("application/pdf")
        const cuerpo = await cuerpoJson<{ error: string }>(res)
        expect(cuerpo.error, nombre).toBe(MENSAJE_SIN_ADMINISTRADOR_DESIGNADO)
      }
    })
  })

  it("una comunidad sin ninguna membresía administrador falla cerrada (certificado)", async () => {
    await como("comiteSinAdmin", async () => {
      const res = await invocarApi(
        import("@/app/api/certificados-ct/[id]/pdf/route"),
        "GET",
        "certificados-ct/[id]/pdf",
        { params: { id: CERTIFICADO_SIN_ADMIN } }
      )
      expect(res.status).toBe(409)
      expect(res.headers.get("content-type")).not.toBe("application/pdf")
      expect((await cuerpoJson<{ error: string }>(res)).error).toBe(
        MENSAJE_SIN_ADMINISTRADOR_DESIGNADO
      )
    })
  })

  it("el alta del corte sin firmante no escribe nada y no compila el escrito", async () => {
    await como("sinFirmante", async () => {
      const antes = {
        documentos: await prisma.documento.count({ where: { comunidadId: COM_SIN_FIRMANTE } }),
        cortes: await prisma.corteServicio.count({ where: { comunidadId: COM_SIN_FIRMANTE } }),
        eventos: await prisma.eventoAuditoria.count({ where: { comunidadId: COM_SIN_FIRMANTE } }),
      }

      const res = await invocarApi(
        import("@/app/api/cortes-servicio/route"),
        "POST",
        "cortes-servicio",
        {
          body: {
            unidadId: UNIDAD_SIN_FIRMANTE,
            // Otro servicio que el corte del fixture: el 409 que se prueba es el
            // del firmante, no el de «ya hay un corte vigente».
            servicio: "telecomunicaciones",
            acuerdoId: ACUERDO_SIN_FIRMANTE,
          },
        }
      )

      expect(res.status).toBe(409)
      expect(res.headers.get("content-type")).not.toBe("application/pdf")
      expect((await cuerpoJson<{ error: string }>(res)).error).toBe(
        MENSAJE_SIN_ADMINISTRADOR_DESIGNADO
      )
      expect(await prisma.documento.count({ where: { comunidadId: COM_SIN_FIRMANTE } })).toBe(
        antes.documentos
      )
      expect(await prisma.corteServicio.count({ where: { comunidadId: COM_SIN_FIRMANTE } })).toBe(
        antes.cortes
      )
      expect(await prisma.eventoAuditoria.count({ where: { comunidadId: COM_SIN_FIRMANTE } })).toBe(
        antes.eventos
      )
    })
  })

  it("GET /api/configuracion de una comunidad sin firmante devuelve `firmante: null`, no el texto viejo", async () => {
    await como("sinFirmante", async () => {
      const res = await invocarApi(
        import("@/app/api/configuracion/route"),
        "GET",
        "configuracion"
      )
      expect(res.status).toBe(200)
      const config = await cuerpoJson<Record<string, unknown>>(res)
      // Falla cerrado: `null`, no cadenas vacías ni el texto que quedó en la columna.
      expect(config.firmante).toBeNull()
      expect(config).not.toHaveProperty("administradorResponsable")
      expect(config).not.toHaveProperty("rutAdministrador")
      const plano = JSON.stringify(config)
      expect(plano).not.toContain(ADMIN_TEXTO_LIBRE)
      expect(plano).not.toContain(RUT_ADMIN_TEXTO_LIBRE)
    })
  })

  // ── 3. Sin nombre real no hay documento ────────────────────────────────────

  it("una comunidad ausente no imprime su id: el resolver falla con el texto de falta de nombre", async () => {
    const resultado = await identidadDelPapel(COM_INEXISTENTE)
    expect(resultado.ok).toBe(false)
    if (resultado.ok) return
    expect(resultado.response.status).toBe(409)
    const cuerpo = await cuerpoJson<{ error: string }>(resultado.response)
    expect(cuerpo.error).toBe(MENSAJE_COMUNIDAD_SIN_NOMBRE)
    // El fallback viejo (`?? scope.comunidadId`) imprimía este id; ya no aparece.
    expect(JSON.stringify(cuerpo)).not.toContain(COM_INEXISTENTE)
  })

  it("una comunidad con el nombre en blanco falla igual y el papel no sale", async () => {
    const resultado = await identidadDelPapel(COM_SIN_NOMBRE)
    expect(resultado.ok).toBe(false)
    if (resultado.ok) return
    expect((await cuerpoJson<{ error: string }>(resultado.response)).error).toBe(
      MENSAJE_COMUNIDAD_SIN_NOMBRE
    )

    await como("adminSinNombre", async () => {
      const res = await invocarApi(
        import("@/app/api/certificados-ct/[id]/pdf/route"),
        "GET",
        "certificados-ct/[id]/pdf",
        { params: { id: CERTIFICADO_SIN_NOMBRE } }
      )
      expect(res.status).toBe(409)
      expect(res.headers.get("content-type")).not.toBe("application/pdf")
      const cuerpo = await cuerpoJson<{ error: string }>(res)
      expect(cuerpo.error).toBe(MENSAJE_COMUNIDAD_SIN_NOMBRE)
      expect(JSON.stringify(cuerpo)).not.toContain(COM_SIN_NOMBRE)
    })
  })

  // ── 4. El máximo del nombre: una sola definición ───────────────────────────

  it("la regla del nombre tiene máximo y es la misma que usa la semilla", () => {
    expect(NombreComunidadSchema.maxLength).toBe(120)
    expect(NombreComunidadSchema.safeParse("A".repeat(120)).success).toBe(true)
    expect(NombreComunidadSchema.safeParse("A".repeat(121)).success).toBe(false)
    // La semilla no inventa su propia regla: valida con el schema del contrato.
    const semilla = readFileSync(path.join(RAIZ, "scripts", "seed-db-from-data.ts"), "utf8")
    expect(semilla).toContain("NombreComunidadSchema.parse(")
  })
})
