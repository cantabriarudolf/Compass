/**
 * @vitest-environment node
 *
 * F29 · T1c — los LECTORES de deuda respetan la marca `anuladoEn`.
 *
 * T1 (`af3fa2a`) hizo que el trámite anule y T1b (`c71951e`) hizo que la deuda
 * DE LA UNIDAD respete la marca. Faltan los lectores: superficies que arman
 * cobros sin la marca siguen diciéndole al deudor que debe. Lo que este test
 * fija, todo observable por la API, por la base o por el builder puro:
 *
 *   1. el estado de cuenta DEL RESIDENTE (`/api/cobros-fi/mi-estado-cuenta`)
 *      deja de mostrar los cargos anulados como vencidos y deja de sumarlos al
 *      saldo, y sigue mostrando sus otros cargos;
 *   2. el trámite de corte (`POST /api/cortes-servicio`) deja de proponer como
 *      morosa a la unidad que sólo debía el convenio —y la unidad con cargos
 *      PROPIOS sigue siendo candidata (3 cuotas vencidas, 201;
 *   3. el informe de morosidad (`POST /api/reportes-re/generar`, bloque
 *      `morosidad`) deja de sumar el cargo anulad al total vencido;
 *   4. el aviso NUEVO (`contenidoAviso`) deja de cobrar los cargos anulados,
 *      tanto del período del papel como de la deuda anterior —los avisos ya
 *      emitidos no se tocan: son documentos congelados en su `contenido`—;
 *   5. la emisión REAL del aviso (`POST /api/avisos-cobro`) también lo excluye:
 *      el contenido congelado sale de la ruta, no sólo del builder;
 *   6. un cargo anulado no vuelve a ser deuda por un botón: `pagar` → 409,
 *      `mora` → 409, y la cobranza no le dice «debes» al deudor por él (sale
 *      del cálculo de `vencidos`/`montoTotal` de la gestión). Cada 409 con su
 *      mensaje literal y su pin de que la base no escribió nada.
 *
 * Pin de no sobre-exclusión (S1): un cargo SIN `anuladoEn` sigue contando en
 * los CUATRO lados —así se prueba que la exclusión no encoge la deuda de
 * nadie más—. El arnés es el de `convenios-anulacion-deuda.test.ts` (alta y
 * anulación por la API), con un residente con sesión Propia para el estado de
 * cuenta y una comunidad aparte para el informe (el bloque `morosidad` cuenta
 * la comunidad completa, así que ahí las cifras comparten aislamiento).
 *
 * Las pantallas `/finanzas/pagos` y `/finanzas/gastos-comunes` no son
 * testables con este arnés (páginas de cliente, sin contrato de API que
 * morder): su corrección se verifica por revisión y por el diferencial de sus
 * tests de componente (`pagos-cifras-parciales.test.tsx`).
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

/** Comunidad del estado de cuenta y del trámite de corte. */
const COM_D = "anlec-com-deuda"
/** Comunidad del informe RE: aislada porque el bloque cuenta TODA la comunidad. */
const COM_R = "anlec-com-reportes"

const FONDO_D = "anlec-fondo-gc-d"
const FONDO_R = "anlec-fondo-gc-r"

/** La persona dueña de las unidades de la comunidad de trámites. */
const P_DUEÑA = "anlec-p-1"
/** La persona dueña de las unidades de la comunidad del informe RE. */
const P_REPORTES = "anlec-p-r"

const U_MC = "anlec-u-mc"
const U_CO = "anlec-u-co"
/** Unidad testigo del corte: sus cargos no vienen de ningún convenio. */
const U_PB = "anlec-u-pb"
const U_RE = "anlec-u-re"
/** Unidad testigo del informe: idem sin convenio. */
const U_PR = "anlec-u-pr"

const AC_D = "anlec-ac-deuda"
const AC_R = "anlec-ac-reportes"

const EMAIL_ADMIN = "anlec-admin@test.cl"
const EMAIL_ADMIN_R = "anlec-admin-r@test.cl"
const EMAIL_RESIDENTE = "anlec-residente@test.cl"

const centavos = (monto: number): number => Math.round(monto * 100)

function datosPersona(
  id: string,
  comunidadId: string,
  rut: string,
  nombre: string,
  email: string,
  roles: string[] = ["propietario"]
) {
  return {
    id,
    comunidadId,
    rut,
    nombreCompleto: nombre,
    nombres: nombre.split(" ")[0]!,
    apellidos: nombre.split(" ").slice(1).join(" "),
    email,
    telefonoMovil: "+56900000000",
    estadoCuenta: "activa",
    condicionesEspecialesIds: [],
    roles,
  }
}

function datosUnidad(id: string, comunidadId: string, numero: string) {
  return {
    id,
    comunidadId,
    microSectorId: `anlec-ms-${numero}`,
    numero,
    etiqueta: "Depto",
    tipoUnidadId: "anlec-tu-1",
    metraje: 50,
    prorrateo: 10,
    rolSii: `anlec-${numero}`,
    estadoId: "habitada",
    servicios: {},
  }
}

describe("F29 · T1c — los lectores de deuda no le siguen cobrando al cargo anulado", () => {
  beforeAll(async () => {
    process.env.AUTH_SECRET = AUTH_SECRET
    process.env.NEXT_PUBLIC_APP_ENV = "development"
    vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 })

    for (const c of [
      { id: COM_D, nombre: "Comunidad Lectores Deuda", slug: "anlec-com-deuda" },
      { id: COM_R, nombre: "Comunidad Lectores Reporte", slug: "anlec-com-reportes" },
    ]) {
      await prisma.comunidad.upsert({ where: { id: c.id }, update: {}, create: c })
    }
    for (const f of [
      { id: FONDO_D, comunidadId: COM_D, nombre: "Fondo Gasto Común Deuda" },
      { id: FONDO_R, comunidadId: COM_R, nombre: "Fondo Gasto Común Reporte" },
    ]) {
      await prisma.fondoFI.upsert({
        where: { id: f.id },
        update: {},
        create: { ...f, tipo: "gasto_comun", activo: true },
      })
    }
    await prisma.persona.upsert({
      where: { id: P_DUEÑA },
      update: {},
      create: datosPersona(P_DUEÑA, COM_D, "19333333-3", "Dueña Lectores", "anlec-dueña@test.cl"),
    })
    await prisma.persona.upsert({
      where: { id: P_REPORTES },
      update: {},
      create: datosPersona(P_REPORTES, COM_R, "19344444-4", "Dueña Reportes", "anlec-reportes@test.cl"),
    })

    for (const u of [
      datosUnidad(U_MC, COM_D, "101"),
      datosUnidad(U_CO, COM_D, "102"),
      datosUnidad(U_PB, COM_D, "103"),
      datosUnidad(U_RE, COM_R, "201"),
      datosUnidad(U_PR, COM_R, "202"),
    ]) {
      await prisma.unidad.upsert({ where: { id: u.id }, update: {}, create: u })
    }

    for (const v of [
      { id: "anlec-v-mc", unidadId: U_MC },
      { id: "anlec-v-co", unidadId: U_CO },
      { id: "anlec-v-pb", unidadId: U_PB },
    ]) {
      await prisma.vinculoUnidad.upsert({
        where: { id: v.id },
        update: {},
        create: {
          id: v.id,
          comunidadId: COM_D,
          personaId: P_DUEÑA,
          unidadId: v.unidadId,
          rol: "propietario",
          fechaInicio: "2024-01-01",
          fechaFin: null,
          permiteVerFinanzas: true,
        },
      })
    }
    for (const v of [
      { id: "anlec-v-re", unidadId: U_RE },
      { id: "anlec-v-pr", unidadId: U_PR },
    ]) {
      await prisma.vinculoUnidad.upsert({
        where: { id: v.id },
        update: {},
        create: {
          id: v.id,
          comunidadId: COM_R,
          personaId: P_REPORTES,
          unidadId: v.unidadId,
          rol: "propietario",
          fechaInicio: "2024-01-01",
          fechaFin: null,
          permiteVerFinanzas: true,
        },
      })
    }

    for (const a of [
      {
        id: AC_D,
        comunidadId: COM_D,
        cuerpo: "comite",
        materia: "Convenios, corte y anulación para los lectores de deuda",
        folio: "AD-2026-9600",
        estado: "aprobado",
        quorumRequerido: "un_voto_por_miembro",
        resueltoEn: new Date("2026-02-10T12:00:00.000Z"),
        creadoPor: "anlec-usuario-admin",
      },
      {
        id: AC_R,
        comunidadId: COM_R,
        cuerpo: "comite",
        materia: "Convenio de pago para el informe RE de morosidad",
        folio: "AD-2026-9601",
        estado: "aprobado",
        quorumRequerido: "un_voto_por_miembro",
        resueltoEn: new Date("2026-02-11T12:00:00.000Z"),
        creadoPor: "anlec-usuario-admin-r",
      },
    ]) {
      await prisma.acuerdo.upsert({ where: { id: a.id }, update: {}, create: a })
    }

    await prisma.usuario.upsert({
      where: { email: EMAIL_ADMIN },
      update: {},
      create: { id: "anlec-usuario-admin", email: EMAIL_ADMIN, activo: true, personaId: null },
    })
    await prisma.usuario.upsert({
      where: { email: EMAIL_ADMIN_R },
      update: {},
      create: { id: "anlec-usuario-admin-r", email: EMAIL_ADMIN_R, activo: true, personaId: null },
    })
    await prisma.usuario.upsert({
      where: { email: EMAIL_RESIDENTE },
      update: {},
      create: {
        id: "anlec-usuario-residente",
        email: EMAIL_RESIDENTE,
        activo: true,
        personaId: P_DUEÑA,
      },
    })
    await prisma.membresia.deleteMany({
      where: {
        usuarioId: {
          in: ["anlec-usuario-admin", "anlec-usuario-admin-r", "anlec-usuario-residente"],
        },
      },
    })
    await prisma.membresia.createMany({
      data: [
        { usuarioId: "anlec-usuario-admin", comunidadId: COM_D, rol: "administrador" },
        { usuarioId: "anlec-usuario-admin-r", comunidadId: COM_R, rol: "administrador" },
        { usuarioId: "anlec-usuario-residente", comunidadId: COM_D, rol: "residente" },
      ],
    })

    // La base de la suite es compartida: se parte sin filas propias viejas,
    // también las que una corrida anterior (o un RED interrumpido) dejó.
    await prisma.notificacion.deleteMany({ where: { comunidadId: { in: [COM_D, COM_R] } } })
    await prisma.envioCobranzaFI.deleteMany({ where: { comunidadId: { in: [COM_D, COM_R] } } })
    await prisma.configuracionCobranzaFI.deleteMany({ where: { comunidadId: { in: [COM_D, COM_R] } } })
    await prisma.emisionGC.deleteMany({ where: { comunidadId: { in: [COM_D, COM_R] } } })
    await prisma.reporteRE.deleteMany({ where: { comunidadId: { in: [COM_D, COM_R] } } })
    await prisma.envioDocumento.deleteMany({ where: { comunidadId: { in: [COM_D, COM_R] } } })
    await prisma.documento.deleteMany({ where: { comunidadId: { in: [COM_D, COM_R] } } })
    await prisma.corteServicio.deleteMany({ where: { comunidadId: { in: [COM_D, COM_R] } } })
    await prisma.avisoCobro.deleteMany({ where: { comunidadId: { in: [COM_D, COM_R] } } })
    await prisma.cobroFI.deleteMany({ where: { comunidadId: { in: [COM_D, COM_R] } } })
    await prisma.cuotaConvenio.deleteMany({ where: { comunidadId: { in: [COM_D, COM_R] } } })
    await prisma.convenioPago.deleteMany({ where: { comunidadId: { in: [COM_D, COM_R] } } })
    await prisma.eventoAuditoria.deleteMany({ where: { comunidadId: { in: [COM_D, COM_R] } } })
  }, 30_000)

  afterAll(async () => {
    try {
      state.cookie = ""
      await prisma.notificacion.deleteMany({ where: { comunidadId: { in: [COM_D, COM_R] } } })
      await prisma.envioCobranzaFI.deleteMany({ where: { comunidadId: { in: [COM_D, COM_R] } } })
      await prisma.configuracionCobranzaFI.deleteMany({ where: { comunidadId: { in: [COM_D, COM_R] } } })
      await prisma.emisionGC.deleteMany({ where: { comunidadId: { in: [COM_D, COM_R] } } })
      await prisma.reporteRE.deleteMany({ where: { comunidadId: { in: [COM_D, COM_R] } } })
      await prisma.envioDocumento.deleteMany({ where: { comunidadId: { in: [COM_D, COM_R] } } })
      await prisma.documento.deleteMany({ where: { comunidadId: { in: [COM_D, COM_R] } } })
      await prisma.corteServicio.deleteMany({ where: { comunidadId: { in: [COM_D, COM_R] } } })
      await prisma.avisoCobro.deleteMany({ where: { comunidadId: { in: [COM_D, COM_R] } } })
      await prisma.cobroFI.deleteMany({ where: { comunidadId: { in: [COM_D, COM_R] } } })
      await prisma.cuotaConvenio.deleteMany({ where: { comunidadId: { in: [COM_D, COM_R] } } })
      await prisma.convenioPago.deleteMany({ where: { comunidadId: { in: [COM_D, COM_R] } } })
      await prisma.eventoAuditoria.deleteMany({ where: { comunidadId: { in: [COM_D, COM_R] } } })
      await prisma.acuerdo.deleteMany({ where: { comunidadId: { in: [COM_D, COM_R] } } })
      await prisma.vinculoUnidad.deleteMany({ where: { comunidadId: { in: [COM_D, COM_R] } } })
      await prisma.unidad.deleteMany({ where: { comunidadId: { in: [COM_D, COM_R] } } })
      await prisma.persona.deleteMany({ where: { comunidadId: { in: [COM_D, COM_R] } } })
      await prisma.fondoFI.deleteMany({ where: { comunidadId: { in: [COM_D, COM_R] } } })
      await prisma.membresia.deleteMany({
        where: {
          usuarioId: {
            in: ["anlec-usuario-admin", "anlec-usuario-admin-r", "anlec-usuario-residente"],
          },
        },
      })
      await prisma.usuario.deleteMany({
        where: { email: { in: [EMAIL_ADMIN, EMAIL_ADMIN_R, EMAIL_RESIDENTE] } },
      })
      for (const id of [COM_D, COM_R]) {
        await prisma.comunidad.delete({ where: { id } }).catch(() => {})
      }
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

  async function POST_CONVENIO(body: unknown): Promise<Response> {
    const { POST } = await import("@/app/api/convenios/route")
    return POST(
      new NextRequest("http://localhost/api/convenios", {
        method: "POST",
        body: JSON.stringify(body),
        headers: { "content-type": "application/json" },
      })
    )
  }

  async function POST_ANULAR(body: unknown): Promise<Response> {
    const { POST } = await import("@/app/api/convenios/anular/route")
    return POST(
      new NextRequest("http://localhost/api/convenios/anular", {
        method: "POST",
        body: JSON.stringify(body),
        headers: { "content-type": "application/json" },
      })
    )
  }

  async function POST_CORTE(body: unknown): Promise<Response> {
    const { POST } = await import("@/app/api/cortes-servicio/route")
    return POST(
      new NextRequest("http://localhost/api/cortes-servicio", {
        method: "POST",
        body: JSON.stringify(body),
        headers: { "content-type": "application/json" },
      })
    )
  }

  async function POST_REVOCAR(body: unknown): Promise<Response> {
    const { POST } = await import("@/app/api/cortes-servicio/revocar/route")
    return POST(
      new NextRequest("http://localhost/api/cortes-servicio/revocar", {
        method: "POST",
        body: JSON.stringify(body),
        headers: { "content-type": "application/json" },
      })
    )
  }

  async function POST_REPORTE(titulo: string): Promise<Response> {
    const { POST } = await import("@/app/api/reportes-re/generar/route")
    return POST(
      new NextRequest("http://localhost/api/reportes-re/generar", {
        method: "POST",
        body: JSON.stringify({ titulo, bloques: ["morosidad"] }),
        headers: { "content-type": "application/json" },
      })
    )
  }

  /** Alta del convenio por la API: la primera cuota se paga al suscribir.
   *
   * La sesión se elige por comunidad: el admin de COM_D firma los convenios de
   * su comunidad y el admin de COM_R los de la suya —el convenio de OTRA
   * comunidad no existe (404)—.
   */
  async function crearConvenio(
    unidadId: string,
    acuerdoId: string,
    opciones: { montoTotal: number; numeroCuotas: number; primeraCuota: number },
    email = EMAIL_ADMIN,
    personaId = P_DUEÑA
  ): Promise<string> {
    let id: string | null = null
    await conSesion(email, async () => {
      const res = await POST_CONVENIO({ unidadId, personaId, acuerdoId, ...opciones })
      expect(res.status).toBe(201)
      id = ((await res.json()) as { id: string }).id
    })
    if (!id) throw new Error(`no se pudo crear el convenio de prueba de ${unidadId}`)
    return id
  }

  /** Anulación del convenio por la API, con la sesión de la misma comunidad. */
  async function anularConvenio(convenioId: string, motivo: string, email = EMAIL_ADMIN): Promise<void> {
    await conSesion(email, async () => {
      const res = await POST_ANULAR({ convenioId, motivo })
      expect(res.status).toBe(200)
    })
  }

  /**
   * Fixture de morosidad: las cuotas 1..N vencen a futuro y un cargo no vencido
   * no es deuda vencida. Se atrasan en la base (mismo criterio del arnés de
   * `convenios-anulacion-deuda.test.ts`): el `periodo` del cargo es el mes en
   * que vence la cuota, la clave con que la anulación encuentra sus cargos.
   */
  async function atrasarConvenio(convenioId: string, meses: readonly string[]): Promise<void> {
    const cuotas = await prisma.cuotaConvenio.findMany({
      where: { convenioId, numero: { gt: 0 } },
      orderBy: { numero: "asc" },
    })
    const cargos = await prisma.cobroFI.findMany({
      where: { comunidadId: COM_D, origenRef: convenioId },
      orderBy: { periodo: "asc" },
    })
    expect(cargos.length).toBe(cuotas.length)
    for (let i = 0; i < cuotas.length; i++) {
      const vencimiento = meses[i]!
      await prisma.cuotaConvenio.update({
        where: { id: cuotas[i]!.id },
        data: { venceEn: new Date(`${vencimiento}T12:00:00.000Z`) },
      })
      await prisma.cobroFI.update({
        where: { id: cargos[i]!.id },
        data: { periodo: vencimiento.slice(0, 7), fechaVencimiento: vencimiento },
      })
    }
  }

  async function atrasarConvenioReporte(convenioId: string, meses: readonly string[]): Promise<void> {
    const cuotas = await prisma.cuotaConvenio.findMany({
      where: { convenioId, numero: { gt: 0 } },
      orderBy: { numero: "asc" },
    })
    const cargos = await prisma.cobroFI.findMany({
      where: { comunidadId: COM_R, origenRef: convenioId },
      orderBy: { periodo: "asc" },
    })
    expect(cargos.length).toBe(cuotas.length)
    for (let i = 0; i < cuotas.length; i++) {
      const vencimiento = meses[i]!
      await prisma.cuotaConvenio.update({
        where: { id: cuotas[i]!.id },
        data: { venceEn: new Date(`${vencimiento}T12:00:00.000Z`) },
      })
      await prisma.cobroFI.update({
        where: { id: cargos[i]!.id },
        data: { periodo: vencimiento.slice(0, 7), fechaVencimiento: vencimiento },
      })
    }
  }

  /** Un cargo FI propio (no viene de ningún convenio): sin `origenRef` ni marca. */
  async function crearCargoPropio(
    comunidadId: string,
    fondoId: string,
    unidadId: string,
    id: string,
    montoBase: number,
    periodo: string
  ): Promise<void> {
    const vencimiento = `${periodo}-10`
    await prisma.cobroFI.create({
      data: {
        id,
        comunidadId,
        unidadId,
        periodo,
        concepto: "gasto_comun",
        origenModulo: "manual",
        fondoId,
        descripcion: `Cargo FI propio de prueba de ${unidadId}`,
        montoBase,
        fechaCargo: vencimiento,
        fechaVencimiento: vencimiento,
        moras: [],
        pagos: [],
        diferencias: [],
      },
    })
  }

  /** Marca un cargo como anulado: la MISMA escritura que hace
   * `POST /api/convenios/anular` (`anuladoEn = ahora`). La regla de la deuda
   * lee la marca en la fila, no quién la escribió.
   */
  async function anularCargo(id: string): Promise<void> {
    await prisma.cobroFI.update({
      where: { id },
      data: { anuladoEn: new Date("2026-11-01T12:00:00.000Z") },
    })
  }

  /** Los ids de los cargos que el convenio emitió (los que la anulación marca). */
  async function cargosDelConvenio(
    comunidadId: string,
    convenioId: string
  ): Promise<string[]> {
    const cargos = await prisma.cobroFI.findMany({
      where: { comunidadId, origenRef: convenioId },
      select: { id: true },
      orderBy: { id: "asc" },
    })
    return cargos.map((c) => c.id)
  }

  /** POST /api/cobros-fi/[id]/pagar — registrar pago de un cobro FI. */
  async function POST_PAGAR(id: string, body: unknown): Promise<Response> {
    const { POST } = await import("@/app/api/cobros-fi/[id]/pagar/route")
    return POST(
      new NextRequest("http://localhost/api/cobros-fi/x/pagar", {
        method: "POST",
        body: JSON.stringify(body),
        headers: { "content-type": "application/json" },
      }),
      { params: Promise.resolve({ id }) }
    )
  }

  /** POST /api/cobros-fi/[id]/mora — aplicar mora a un cobro vencido FI. */
  async function POST_MORA(id: string, body: unknown = {}): Promise<Response> {
    const { POST } = await import("@/app/api/cobros-fi/[id]/mora/route")
    return POST(
      new NextRequest("http://localhost/api/cobros-fi/x/mora", {
        method: "POST",
        body: JSON.stringify(body),
        headers: { "content-type": "application/json" },
      }),
      { params: Promise.resolve({ id }) }
    )
  }

  /** POST /api/cobros-fi/[id]/cobranza — la gestión multicanal por unidad. */
  async function POST_COBRANZA(id: string, body: unknown = {}): Promise<Response> {
    const { POST } = await import("@/app/api/cobros-fi/[id]/cobranza/route")
    return POST(
      new NextRequest("http://localhost/api/cobros-fi/x/cobranza", {
        method: "POST",
        body: JSON.stringify(body),
        headers: { "content-type": "application/json" },
      }),
      { params: Promise.resolve({ id }) }
    )
  }

  /** POST /api/avisos-cobro — la emisión real del papel del período. */
  async function POST_AVISO(body: unknown): Promise<Response> {
    const { POST } = await import("@/app/api/avisos-cobro/route")
    return POST(
      new NextRequest("http://localhost/api/avisos-cobro", {
        method: "POST",
        body: JSON.stringify(body),
        headers: { "content-type": "application/json" },
      })
    )
  }

  interface FilaEstadoCuenta {
    id: string
    estado: string
    saldoPendiente: number
    montoCargo: number
  }

  async function leerEstadoCuentaResidente(): Promise<{
    status: number
    json: { data: FilaEstadoCuenta[]; saldoTotal: number; error?: string }
  }> {
    let respuesta: { status: number; json: { data: FilaEstadoCuenta[]; saldoTotal: number; error?: string } } | null =
      null
    await conSesion(EMAIL_RESIDENTE, async () => {
      const { GET } = await import("@/app/api/cobros-fi/mi-estado-cuenta/route")
      const res = await GET(new NextRequest("http://localhost/api/cobros-fi/mi-estado-cuenta"))
      respuesta = {
        status: res.status,
        json: (await res.json().catch(() => ({}))) as {
          data: FilaEstadoCuenta[]
          saldoTotal: number
          error?: string
        },
      }
    })
    if (!respuesta) throw new Error("el estado de cuenta del residente no respondió")
    return respuesta
  }

  it("el estado de cuenta del residente deja de cobrar el cargo anulado y sigue mostrando sus otros cargos", async () => {
    // La unidad 101 debe SU convenio (200.000 impagos, dos cuotas) y UN cargo
    // propio de 40.000 que no viene de ningún convenio (el pin del lado 1).
    const convenio = await crearConvenio(U_MC, AC_D, {
      montoTotal: 300_000,
      numeroCuotas: 2,
      primeraCuota: 100_000,
    })
    await atrasarConvenio(convenio, ["2024-01-05", "2024-02-05"])
    await crearCargoPropio(COM_D, FONDO_D, U_MC, "anlec-cob-mc-1", 40_000, "2024-03")
    const idsAnulables = await cargosDelConvenio(COM_D, convenio)
    expect(idsAnulables).toHaveLength(2)

    // PRECONDICIÓN: mientras el convenio rige, los cargos del convenio figuran
    // y suman al saldo de la unidad (240.000 = 200.000 del convenio + 40.000).
    const antes = await leerEstadoCuentaResidente()
    expect(antes.status).toBe(200)
    const idsAntes = antes.json.data.map((f) => f.id)
    for (const id of idsAnulables) expect(idsAntes).toContain(id)
    expect(centavos(antes.json.saldoTotal)).toBe(centavos(240_000))

    await anularConvenio(convenio, "incumplimiento del plan de la 101")

    // DESPUÉS: el cargo anulado ya no es deuda —no figura como vencido y sale
    // del saldo— y el cargo PROPIO de la unidad (sin marca) sigue contando: el
    // estado de cuenta no se encoge más que la anulación.
    const despues = await leerEstadoCuentaResidente()
    expect(despues.status).toBe(200)
    const ids = despues.json.data.map((f) => f.id)
    for (const id of idsAnulables) expect(ids).not.toContain(id)
    const propia = despues.json.data.find((f) => f.id === "anlec-cob-mc-1")
    expect(propia).toBeDefined()
    expect(propia!.estado).toBe("vencido")
    expect(centavos(propia!.saldoPendiente)).toBe(centavos(40_000))
    expect(centavos(despues.json.saldoTotal)).toBe(centavos(40_000))

    // En el libro: los cargos del convenio quedaron con la marca; el propio NO.
    const marcados = await prisma.cobroFI.findMany({
      where: { comunidadId: COM_D, origenRef: convenio, anuladoEn: { not: null } },
      select: { id: true },
    })
    expect(marcados.map((c) => c.id).sort()).toEqual([...idsAnulables].sort())
    const propiaEnBd = await prisma.cobroFI.findUnique({
      where: { id: "anlec-cob-mc-1" },
      select: { anuladoEn: true },
    })
    expect(propiaEnBd?.anuladoEn).toBeNull()
  })

  it("el trámite de corte deja de proponer como morosa a la unidad que sólo debía el convenio, y la del cargo propio sigue siéndolo", async () => {
    // La unidad 102: TRES cuotas de convenio impagas (el mínimo legal) y nada
    // más. La unidad testigo 103: tres cargos PROPIOS vencidos, sin convenio.
    const convenio = await crearConvenio(U_CO, AC_D, {
      montoTotal: 400_000,
      numeroCuotas: 3,
      primeraCuota: 100_000,
    })
    await atrasarConvenio(convenio, ["2024-01-05", "2024-02-05", "2024-03-05"])
    await crearCargoPropio(COM_D, FONDO_D, U_PB, "anlec-cob-pb-1", 25_000, "2024-01")
    await crearCargoPropio(COM_D, FONDO_D, U_PB, "anlec-cob-pb-2", 25_000, "2024-02")
    await crearCargoPropio(COM_D, FONDO_D, U_PB, "anlec-cob-pb-3", 25_000, "2024-03")

    // PRECONDICIÓN: mientras el convenio rige, la unidad 102 SÍ es candidata:
    // el preaviso procede y queda registrado. Se revoca en el acto para que el
    // trámite quede limpio y el corte no esté vigente en lo que sigue.
    let corteAntes = ""
    await conSesion(EMAIL_ADMIN, async () => {
      const res = await POST_CORTE({ unidadId: U_CO, servicio: "electricidad", acuerdoId: AC_D })
      expect(res.status).toBe(201)
      corteAntes = ((await res.json()) as { id: string }).id
    })
    await conSesion(EMAIL_ADMIN, async () => {
      const res = await POST_REVOCAR({
        corteId: corteAntes,
        motivo: "preaviso de prueba del arnés, se revoca para reintentar el trámite",
      })
      expect(res.status).toBe(200)
    })

    await anularConvenio(convenio, "incumplimiento del plan de la 102")

    // DESPUÉS: la unidad que sólo debía el convenio ya no llega a las tres
    // cuotas vencidas: el trámite la rechaza con el motivo de la regla pura y
    // no deja ninguna fila.
    await conSesion(EMAIL_ADMIN, async () => {
      const res = await POST_CORTE({ unidadId: U_CO, servicio: "electricidad", acuerdoId: AC_D })
      expect(res.status).toBe(400)
      expect(((await res.json()) as { error: string }).error).toBe(
        "No procede el corte: la ley exige tres o más cuotas impagas, continuas o discontinuas (Ley 21.442 art. 20 N°9)."
      )
    })
    expect(
      await prisma.corteServicio.count({ where: { unidadId: U_CO, estado: { not: "revocado" } } })
    ).toBe(0)

    // PIN: la unidad del cargo PROPIO (sin `anuladoEn`) sigue siendo morosa y
    // su preaviso sigue procediendo igual que siempre.
    await conSesion(EMAIL_ADMIN, async () => {
      const res = await POST_CORTE({ unidadId: U_PB, servicio: "electricidad", acuerdoId: AC_D })
      expect(res.status).toBe(201)
    })
    expect(
      await prisma.corteServicio.count({ where: { unidadId: U_PB, estado: "preaviso" } })
    ).toBe(1)
  }, 45_000)

  it("el informe RE de morosidad deja de sumar el cargo anulado a la deuda vencida", async () => {
    // Comunidad aparte: el bloque `morosidad` del informe cuenta la comunidad
    // COMPLETA, así que sus cifras necesitan aislamiento de los trámites de
    // arriba. La unidad 201 debe su convenio (200.000); la testigo 202 debe
    // DOS cargos propios de 30.000 (sin convenio, sin marca).
    const convenio = await crearConvenio(
      U_RE,
      AC_R,
      { montoTotal: 300_000, numeroCuotas: 2, primeraCuota: 100_000 },
      EMAIL_ADMIN_R,
      P_REPORTES
    )
    await atrasarConvenioReporte(convenio, ["2024-01-05", "2024-02-05"])
    await crearCargoPropio(COM_R, FONDO_R, U_PR, "anlec-cob-pr-1", 30_000, "2024-04")
    await crearCargoPropio(COM_R, FONDO_R, U_PR, "anlec-cob-pr-2", 30_000, "2024-05")

    await anularConvenio(convenio, "incumplimiento del plan de la 201", EMAIL_ADMIN_R)

    // El informe se EMITE de nuevo: congela el snapshot DESDE LA BD al momento.
    let id = ""
    await conSesion(EMAIL_ADMIN_R, async () => {
      const res = await POST_REPORTE("Morosidad tras la anulación del convenio")
      expect(res.status).toBe(201)
      id = ((await res.json()) as { id: string }).id
    })
    const fila = await prisma.reporteRE.findUnique({ where: { id } })
    if (!fila) throw new Error("el informe RE de prueba no quedó en la base")
    const bloque = (fila.payloadSnapshot as unknown as {
      bloque: string
      lineas: { etiqueta: string; valor: string }[]
    }[]).find((b) => b.bloque === "morosidad")
    if (!bloque) throw new Error("el informe no trae el bloque de morosidad")

    // Sólo los DOS cargos propios de la testiga siguen siendo deuda vencida
    // (60.000 en total): el convenio anulado de la 201 ya no suma ni cuenta.
    const linea = (etiqueta: string) => bloque.lineas.find((l) => l.etiqueta === etiqueta)
    expect(linea("Cobros vencidos con deuda")?.valor).toBe("2")
    expect(linea("Deuda vencida total")?.valor).toBe("$60.000")
  })

  it("el aviso nuevo deja de cobrar los cargos anulados del período y de la deuda anterior, y el cargo sin marca sigue cobrándose", async () => {
    // Builder PURO: la marca viaja en el cobro que el emisor le pasa, como la
    // v2 del contenido ya congela lo demás. Los avisos YA EMITIDOS no se tocan:
    // su `contenido` quedó persistido y este filtro sólo alcanza al papel que
    // se emite desde ahora.
    const { contenidoAviso } = await import("@/lib/aviso-cobro")
    type CobroDePrueba = Parameters<typeof contenidoAviso>[0]["cobros"][number] & {
      anuladoEn?: string | Date | null
    }
    const cobroDePrueba = (base: {
      id: string
      periodo: string
      montoBase: number
      anuladoEn?: string | Date | null
    }): CobroDePrueba => ({
      concepto: "gasto_comun",
      descripcion: `Gasto Común ${base.periodo}`,
      lineas: [
        { concepto: "gasto_comun", monto: base.montoBase, fondoId: "anlec-fondo-avi" },
      ],
      fondoId: "anlec-fondo-avi",
      fechaCargo: `${base.periodo}-01`,
      fechaVencimiento: `${base.periodo}-10`,
      moras: [],
      pagos: [],
      ...base,
    })

    // Convenio anulado: la cuota del propio período del papel y una cuota de
    // un período anterior. Y SIN marca: el cargo propio del período y la deuda
    // anterior propia (el pin del lado 4).
    const anuladoDelPeriodo = cobroDePrueba({
      id: "anlec-avi-anul-per",
      periodo: "2026-10",
      montoBase: 100_000,
      anuladoEn: "2026-10-14",
    })
    const vigenteDelPeriodo = cobroDePrueba({
      id: "anlec-avi-vig-per",
      periodo: "2026-10",
      montoBase: 40_000,
    })
    const anuladoAnterior = cobroDePrueba({
      id: "anlec-avi-anul-ant",
      periodo: "2026-08",
      montoBase: 90_000,
      anuladoEn: "2026-10-14",
    })
    const vigenteAnterior = cobroDePrueba({
      id: "anlec-avi-vig-ant",
      periodo: "2026-09",
      montoBase: 80_000,
    })

    const aviso = contenidoAviso({
      periodo: "2026-10",
      fechaEmision: "2026-10-15",
      unidad: { id: U_MC, numero: "101", etiqueta: "Depto", prorrateo: 10 },
      reglamento: null,
      fondos: [{ id: "anlec-fondo-avi", nombre: "Fondo Gasto Común", tipo: "gasto_comun" }],
      cobros: [anuladoDelPeriodo, vigenteDelPeriodo] as Parameters<
        typeof contenidoAviso
      >[0]["cobros"],
      cobrosAnteriores: [anuladoAnterior, vigenteAnterior] as Parameters<
        typeof contenidoAviso
      >[0]["cobrosAnteriores"],
      resumen: {
        periodo: "2026-10",
        desde: "2026-10-01",
        hasta: "2026-10-31",
        ingresos: { total: 0, deCobros: 0, manuales: 0, cantidad: 0, detalle: [] },
        egresos: { total: 0, cantidad: 0, detalle: [] },
        saldoCaja: { inicial: 0, ingresosAcumulados: 0, egresosAcumulados: 0, alCierre: 0 },
      },
    })

    // El papel nuevo cobra SOLO lo que sigue siendo deuda: el cargo anulado del
    // período no está en `cargos`, no aparecen sus líneas y el exigible es el
    // del cargo vigente (40.000).
    expect(aviso.cargos.map((c) => c.id)).toEqual(["anlec-avi-vig-per"])
    expect(aviso.detalle.map((l) => l.cobroId)).toEqual(["anlec-avi-vig-per"])
    expect(aviso.montos.exigible).toBe(40_000)
    expect(aviso.montos.totalAdeudado).toBe(40_000)

    // La deuda anterior: la cuota anulada de 2026-08 sale; el cargo sin marca
    // de 2026-09 sigue (80.000) y el total consolidado es 40.000 + 80.000.
    expect(aviso.deudaAnterior.periodos.map((p) => p.periodo)).toEqual(["2026-09"])
    expect(aviso.deudaAnterior.periodos[0]!.cargos.map((c) => c.cobroId)).toEqual([
      "anlec-avi-vig-ant",
    ])
    expect(aviso.deudaAnterior.total).toBe(80_000)
    expect(aviso.montos.totalDeudaAnterior).toBe(80_000)
    expect(aviso.montos.totalAdeudadoConsolidado).toBe(120_000)
  })

  it("la emisión real del aviso excluye el cargo anulado del período y de la deuda anterior, y sigue cobrando el cargo sin marca", async () => {
    // La emisión real corre sobre la MISMA tabla que dejó el test del estado de
    // cuenta: en períodos anteriores de la unidad quedan los DOS cargos del
    // convenio anulados (2024-01 y 2024-02) y el cargo propio sin marca
    // (2024-03). Acá se agregan los cargos del período del papel: uno anulado
    // y uno sin marca.
    const convenioAnulado = await prisma.convenioPago.findFirst({
      where: { unidadId: U_MC },
      select: { id: true },
    })
    if (!convenioAnulado) throw new Error("el convenio anulado de la unidad no está")
    await prisma.emisionGC.create({
      data: {
        id: "anlec-em-2026-10",
        comunidadId: COM_D,
        periodo: "2026-10",
        modo: "prorrateo",
        gastoTotal: 40_000,
        lineas: [],
        fechaEmision: "2026-10-15",
      },
    })
    await crearCargoPropio(COM_D, FONDO_D, U_MC, "anlec-cob-mc-anul", 100_000, "2026-10")
    await anularCargo("anlec-cob-mc-anul")
    await crearCargoPropio(COM_D, FONDO_D, U_MC, "anlec-cob-mc-vig", 40_000, "2026-10")

    interface ContenidoDelAvisoEmitido {
      cargos: { id: string }[]
      detalle: { cobroId: string }[]
      deudaAnterior: {
        periodos: { periodo: string; cargos: { cobroId: string }[] }[]
        total: number
      }
      montos: {
        exigible: number
        totalAdeudado: number
        totalDeudaAnterior: number
        totalAdeudadoConsolidado: number
      }
    }
    // El cuerpo se captura en un contenedor: la asignación dentro de la sesión
    // es asíncrona y sobre un `let` suelto el typechecker no ve la escritura y
    // lee `never` (mismo criterio del arnés de `convenios-anulacion-deuda.test.ts`).
    const entregado: { avisos: { contenido: ContenidoDelAvisoEmitido }[] | null } = {
      avisos: null,
    }
    await conSesion(EMAIL_ADMIN, async () => {
      const res = await POST_AVISO({ periodo: "2026-10", unidadId: U_MC })
      expect(res.status).toBe(201)
      const cuerpo = (await res.json()) as {
        avisos: { contenido: ContenidoDelAvisoEmitido }[]
        sinAviso: unknown[]
      }
      expect(cuerpo.avisos).toHaveLength(1)
      expect(cuerpo.sinAviso).toEqual([])
      entregado.avisos = cuerpo.avisos
    })
    const aviso: ContenidoDelAvisoEmitido | undefined = entregado.avisos?.[0]?.contenido
    if (!aviso) throw new Error("la emisión no devolvió el aviso")

    // El papel NUEVO cobra sólo lo que sigue siendo deuda: el cargo anulado del
    // período no está en `cargos` ni en la línea del detalle, y el exigible es
    // el del cargo sin marca. Los sin marca del período y de la deuda anterior
    // siguen cobrándose (pin de no sobre-exclusión).
    expect(aviso.cargos.map((c) => c.id)).toEqual(["anlec-cob-mc-vig"])
    expect(aviso.detalle.map((l) => l.cobroId)).toEqual(["anlec-cob-mc-vig"])
    expect(aviso.montos.exigible).toBe(40_000)
    expect(aviso.montos.totalAdeudado).toBe(40_000)
    expect(aviso.deudaAnterior.periodos.map((p) => p.periodo)).toEqual(["2024-03"])
    expect(aviso.deudaAnterior.periodos[0]!.cargos.map((c) => c.cobroId)).toEqual([
      "anlec-cob-mc-1",
    ])
    expect(aviso.deudaAnterior.total).toBe(40_000)
    expect(aviso.montos.totalDeudaAnterior).toBe(40_000)
    expect(aviso.montos.totalAdeudadoConsolidado).toBe(80_000)

    // La marca se EXCLUYE, no se oculta: los cargos anulados siguen en el libro
    // con su fecha de anulación (la traza del convenio no se borra).
    const anuladosEnLibro = await prisma.cobroFI.findMany({
      where: { comunidadId: COM_D, origenRef: convenioAnulado.id, anuladoEn: { not: null } },
      select: { id: true },
    })
    expect(anuladosEnLibro).toHaveLength(2)
  }, 30_000)

  it("pagar un cargo anulado responde 409 y no escribe nada; un cargo sin marca se paga igual que siempre", async () => {
    await crearCargoPropio(COM_D, FONDO_D, U_MC, "anlec-cob-mr-anu", 50_000, "2024-06")
    await anularCargo("anlec-cob-mr-anu")
    await crearCargoPropio(COM_D, FONDO_D, U_MC, "anlec-cob-mr-vig", 50_000, "2024-06")

    await conSesion(EMAIL_ADMIN, async () => {
      const res = await POST_PAGAR("anlec-cob-mr-anu", { monto: 50_000, medio: "transferencia" })
      expect(res.status).toBe(409)
      expect(((await res.json()) as { error: string }).error).toBe(
        "El cargo fue anulado con su convenio y no admite pagos."
      )
    })
    // La base no escribió nada: sin pago registrado, el saldo quedó igual.
    const anulado = await prisma.cobroFI.findUnique({
      where: { id: "anlec-cob-mr-anu" },
      select: { pagos: true, diferencias: true },
    })
    expect((anulado?.pagos as unknown[])).toHaveLength(0)
    expect((anulado?.diferencias as unknown[])).toHaveLength(0)

    // PIN: el cargo sin `anuladoEn` se paga exactamente igual que hoy. La ruta
    // tiene UN solo camino (el POST completo: validate, lecturas, escritura);
    // no hay vía alternativa de pago parcial que se salte la compuerta.
    await conSesion(EMAIL_ADMIN, async () => {
      const res = await POST_PAGAR("anlec-cob-mr-vig", { monto: 50_000, medio: "transferencia" })
      expect(res.status).toBe(200)
      expect(((await res.json()) as { ok: boolean }).ok).toBe(true)
    })
    const vigente = await prisma.cobroFI.findUnique({
      where: { id: "anlec-cob-mr-vig" },
      select: { pagos: true },
    })
    expect((vigente?.pagos as { monto: number }[]).map((p) => p.monto)).toEqual([50_000])
  })

  it("aplicar mora a un cargo anulado responde 409 y no escribe nada; un cargo sin marca acumula igual que siempre", async () => {
    await crearCargoPropio(COM_D, FONDO_D, U_MC, "anlec-cob-mo-anu", 60_000, "2024-07")
    await anularCargo("anlec-cob-mo-anu")
    await crearCargoPropio(COM_D, FONDO_D, U_MC, "anlec-cob-mo-vig", 60_000, "2024-07")

    await conSesion(EMAIL_ADMIN, async () => {
      const res = await POST_MORA("anlec-cob-mo-anu", { tasaMensualPct: 1 })
      expect(res.status).toBe(409)
      expect(((await res.json()) as { error: string }).error).toBe(
        "El cargo fue anulado con su convenio y no acumula mora."
      )
    })
    // La base no escribió nada: sin mora devengada, el cargo seguía limpio.
    const anulado = await prisma.cobroFI.findUnique({
      where: { id: "anlec-cob-mo-anu" },
      select: { moras: true },
    })
    expect((anulado?.moras as unknown[])).toHaveLength(0)

    // PIN: el cargo sin `anuladoEn` acumula la mora igual que hoy.
    await conSesion(EMAIL_ADMIN, async () => {
      const res = await POST_MORA("anlec-cob-mo-vig", { tasaMensualPct: 1 })
      expect(res.status).toBe(200)
      expect(((await res.json()) as { ok: boolean }).ok).toBe(true)
    })
    const vigente = await prisma.cobroFI.findUnique({
      where: { id: "anlec-cob-mo-vig" },
      select: { moras: true },
    })
    expect((vigente?.moras as { monto: number }[])).toHaveLength(1)
  })

  it("la cobranza no le dice «debes» al deudor por el cargo anulado, y el cargo sin marca sigue contando", async () => {
    // Unidad LIMPIA para la gestión: la cobranza mide TODA la deuda vencida de
    // la unidad del ancla, así que reaprovechar una unidad con cargos de los
    // tests anteriores ensuciaría la cifra. Usted carga dos cargos: uno
    // anulado y uno sin marca.
    await prisma.unidad.upsert({
      where: { id: "anlec-u-cz" },
      update: {},
      create: datosUnidad("anlec-u-cz", COM_D, "105"),
    })
    await prisma.vinculoUnidad.upsert({
      where: { id: "anlec-v-cz" },
      update: {},
      create: {
        id: "anlec-v-cz",
        comunidadId: COM_D,
        personaId: P_DUEÑA,
        unidadId: "anlec-u-cz",
        rol: "propietario",
        fechaInicio: "2024-01-01",
        fechaFin: null,
        permiteVerFinanzas: true,
      },
    })
    await crearCargoPropio(COM_D, FONDO_D, "anlec-u-cz", "anlec-cob-cz-anu", 100_000, "2024-08")
    await anularCargo("anlec-cob-cz-anu")
    await crearCargoPropio(COM_D, FONDO_D, "anlec-u-cz", "anlec-cob-cz-vig", 25_000, "2024-08")
    // Sólo el visor: sin emisor SMTP en el arnés, el correo queda en pendiente
    // y lo que esta prueba mide es el MENSAJE, no la entrega.
    await prisma.configuracionCobranzaFI.upsert({
      where: { comunidadId: COM_D },
      update: { canalVisor: true, canalEmail: false },
      create: {
        id: "anlec-conf-cobranza-d",
        comunidadId: COM_D,
        canalVisor: true,
        canalEmail: false,
      },
    })

    // El cuerpo se captura en un contenedor por el mismo porqué de arriba: el
    // `let` suelto no deja que el typechecker vea la escritura del closure.
    const gestionado: { respuesta: Response | null } = { respuesta: null }
    await conSesion(EMAIL_ADMIN, async () => {
      gestionado.respuesta = await POST_COBRANZA("anlec-cob-cz-vig")
    })
    const resPost = gestionado.respuesta
    if (!resPost) throw new Error("la cobranza de prueba no respondió")
    expect(resPost.status).toBe(200)
    const cuerpo = (await resPost.json()) as {
      montoTotal: number
      cobrosVencidos: string[]
      canales: { visor?: { estado: string }; email?: { estado: string } }
    }
    // El cargo anulado no suma al «debes» del mensaje ni figura como cobrado:
    // la gestión declara SOLO los 25.000 del cargo sin marca. La marca se
    // EXCLUYE del cálculo, no se oculta del libro (el cargo sigue en la base
    // con su anulación).
    expect(centavos(cuerpo.montoTotal)).toBe(centavos(25_000))
    expect(cuerpo.cobrosVencidos).toEqual(["anlec-cob-cz-vig"])
    expect(cuerpo.canales.visor?.estado).toBe("enviado")
    expect(cuerpo.canales.email?.estado).toBe("omitido")
  })
})
