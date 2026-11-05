/**
 * @vitest-environment node
 *
 * T4 aviso-de-cobro (S1, S4, S7) — /api/avisos-cobro.
 *
 * El aviso es el papel con el que se cobra: existe por unidad y período, guarda
 * copia CONGELADA de su contenido (incluidos los parámetros con los que se
 * calculó), lleva folio correlativo y código de verificación, y no se edita ni
 * se borra. Estos tests fijan el contrato observable:
 *
 *   1. el aviso congela su contenido: cambiar el cargo después no lo cambia;
 *   2. el folio `AC-####` es correlativo POR COMUNIDAD y lo asigna el servidor;
 *   3. dos avisos para la misma unidad y período se rechazan (409);
 *   4. una unidad sin cobro en el período se rechaza con `unidadId` explícito y
 *      se OMITE cuando se emite para todas (no hay nada que cobrar); un período
 *      sin emisión y una comunidad sin fondos tampoco emiten;
 *   5. el contenido lleva los totales de comunidad del período y son idénticos
 *      a `cargarResumenMensual` (art. 31: ingresos, egresos y saldo de caja);
 *   6. DELETE responde 409: el aviso es el documento con el que se cobra;
 *   7. el aviso de otra comunidad es invisible (listado y detalle) e intocable;
 *   8. lo que la ley exige y no se puede computar se DECLARA, no se imprime
 *      como cero (sin reglamento vigente, unidad sin prorrateo).
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest"
import { NextRequest } from "next/server"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { hoyISO } from "@/lib/date-utils"
import { cargarResumenMensual } from "@/lib/resumen-mensual"

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

const COM_A = "avc-com-a"
const COM_B = "avc-com-b"
/** Comunidad sin fondos de caja: sus totales de comunidad NO son computables. */
const COM_C = "avc-com-c"

const PERIODO = "2026-09"
/** Período anterior, para el camino "emitir para todas las unidades". */
const PERIODO_ANT = "2026-08"
/** Período que nunca se emitió: no se puede foliar un aviso sobre él. */
const PERIODO_SIN_EMISION = "2026-07"

const FONDO_GC_A = "avc-fondo-gc"
const FONDO_RESERVA_A = "avc-fondo-res"

const COBRO_U1 = "avc-cob-1"
const COBRO_U2 = "avc-cob-2"
const COBRO_B1 = "avc-b-cob-1"

const EMAIL_ADMIN = "avc-admin@test.cl"
const EMAIL_COMITE = "avc-comite@test.cl"
const EMAIL_RESIDENTE = "avc-residente@test.cl"
const EMAIL_ADMIN_B = "avc-admin-b@test.cl"
const EMAIL_ADMIN_C = "avc-admin-c@test.cl"

type FilaAviso = {
  id: string
  comunidadId: string
  unidadId: string
  periodo: string
  folio: string
  codigoVerificacion: string
  fechaEmision: string
  vencimiento: string | null
  contenido: Record<string, unknown>
  totalesComunidad: Record<string, unknown>
}

/** Línea del cobro tal como la guarda FI (S5). */
function linea(concepto: string, monto: number, fondoId: string) {
  return { concepto, monto, fondoId }
}

/** Suma días corridos a una fecha ISO, con el mismo reloj UTC que el aviso. */
function sumarDias(fecha: string, dias: number): string {
  const base = new Date(`${fecha}T00:00:00Z`)
  base.setUTCDate(base.getUTCDate() + dias)
  return base.toISOString().slice(0, 10)
}

describe("/api/avisos-cobro — documento congelado, foliado e inmutable (S1/S4/S7)", () => {
  const cookies = new Map<string, string>()
  /** Aviso de la unidad 101 de la comunidad A, emitido en el primer caso. */
  let avisoU1: FilaAviso
  /** Contenido congelado capturado al emitir, para comparar tras mutar el cargo. */
  let contenidoCongelado: Record<string, unknown>
  let totalesCongelados: Record<string, unknown>

  /** Cookies de sesión ya minadas por usuario (el JWE tarda ~2 s). */
  async function como(
    email: string,
    fn: () => Promise<{ status: number; json: Record<string, unknown> }>
  ): Promise<{ status: number; json: Record<string, unknown> }> {
    const cookie = cookies.get(email)
    if (!cookie) throw new Error(`sin cookie de sesión para ${email}`)
    state.cookie = cookie
    try {
      return await fn()
    } finally {
      state.cookie = ""
    }
  }

  async function postAviso(
    body: unknown
  ): Promise<{ status: number; json: Record<string, unknown> }> {
    const { POST } = await import("@/app/api/avisos-cobro/route")
    const res = await POST(
      new NextRequest("http://localhost/api/avisos-cobro", {
        method: "POST",
        body: JSON.stringify(body),
        headers: { "content-type": "application/json" },
      })
    )
    return { status: res.status, json: (await res.json().catch(() => ({}))) as Record<string, unknown> }
  }

  async function getAvisos(
    query = ""
  ): Promise<{ status: number; json: Record<string, unknown> }> {
    const { GET } = await import("@/app/api/avisos-cobro/route")
    const res = await GET(new NextRequest(`http://localhost/api/avisos-cobro${query}`))
    return { status: res.status, json: (await res.json().catch(() => ({}))) as Record<string, unknown> }
  }

  async function getAviso(
    id: string
  ): Promise<{ status: number; json: Record<string, unknown> }> {
    const { GET } = await import("@/app/api/avisos-cobro/[id]/route")
    const res = await GET(new NextRequest(`http://localhost/api/avisos-cobro/${id}`), {
      params: Promise.resolve({ id }),
    })
    return { status: res.status, json: (await res.json().catch(() => ({}))) as Record<string, unknown> }
  }

  async function deleteAviso(
    id: string
  ): Promise<{ status: number; json: Record<string, unknown> }> {
    const { DELETE } = await import("@/app/api/avisos-cobro/[id]/route")
    const res = await DELETE(
      new NextRequest(`http://localhost/api/avisos-cobro/${id}`, { method: "DELETE" }),
      { params: Promise.resolve({ id }) }
    )
    return { status: res.status, json: (await res.json().catch(() => ({}))) as Record<string, unknown> }
  }

  async function limpiar(): Promise<void> {
    const comunidades = [COM_A, COM_B, COM_C]
    await prisma.avisoCobro.deleteMany({ where: { comunidadId: { in: comunidades } } })
    await prisma.cobroFI.deleteMany({ where: { comunidadId: { in: comunidades } } })
    await prisma.ingresoFI.deleteMany({ where: { comunidadId: { in: comunidades } } })
    await prisma.egresoFI.deleteMany({ where: { comunidadId: { in: comunidades } } })
    await prisma.emisionGC.deleteMany({ where: { comunidadId: { in: comunidades } } })
    await prisma.versionReglamento.deleteMany({ where: { comunidadId: { in: comunidades } } })
    await prisma.fondoFI.deleteMany({ where: { comunidadId: { in: comunidades } } })
    await prisma.unidad.deleteMany({ where: { comunidadId: { in: comunidades } } })
  }

  beforeAll(async () => {
    process.env.AUTH_SECRET = AUTH_SECRET
    process.env.NEXT_PUBLIC_APP_ENV = "development"
    vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 })

    for (const c of [
      { id: COM_A, nombre: "Comunidad Aviso A", slug: "avc-com-a" },
      { id: COM_B, nombre: "Comunidad Aviso B", slug: "avc-com-b" },
      { id: COM_C, nombre: "Comunidad Aviso C", slug: "avc-com-c" },
    ]) {
      await prisma.comunidad.upsert({ where: { id: c.id }, update: {}, create: c })
    }
    for (const u of [
      { id: "avc-user-admin", email: EMAIL_ADMIN },
      { id: "avc-user-comite", email: EMAIL_COMITE },
      { id: "avc-user-residente", email: EMAIL_RESIDENTE },
      { id: "avc-user-admin-b", email: EMAIL_ADMIN_B },
      { id: "avc-user-admin-c", email: EMAIL_ADMIN_C },
    ]) {
      await prisma.usuario.upsert({
        where: { email: u.email },
        update: { activo: true },
        create: { ...u, activo: true },
      })
    }
    const membresias = [
      { usuarioId: "avc-user-admin", comunidadId: COM_A, rol: "administrador" },
      { usuarioId: "avc-user-comite", comunidadId: COM_A, rol: "comite" },
      { usuarioId: "avc-user-residente", comunidadId: COM_A, rol: "residente" },
      { usuarioId: "avc-user-admin-b", comunidadId: COM_B, rol: "administrador" },
      { usuarioId: "avc-user-admin-c", comunidadId: COM_C, rol: "administrador" },
    ]
    await prisma.membresia.deleteMany({
      where: { usuarioId: { in: membresias.map((m) => m.usuarioId) } },
    })
    for (const m of membresias) await prisma.membresia.create({ data: m })

    await limpiar()

    // Fondos de caja: sin ellos el saldo al cierre no es computable (COM_C).
    await prisma.fondoFI.create({
      data: {
        id: FONDO_GC_A,
        comunidadId: COM_A,
        nombre: "Fondo Gasto Común Aviso",
        tipo: "gasto_comun",
        activo: true,
        saldoInicial: 500_000,
      },
    })
    await prisma.fondoFI.create({
      data: {
        id: FONDO_RESERVA_A,
        comunidadId: COM_A,
        nombre: "Fondo Reserva Aviso",
        tipo: "reserva",
        activo: true,
        saldoInicial: 0,
      },
    })
    await prisma.fondoFI.create({
      data: {
        id: "avc-fondo-gc-b",
        comunidadId: COM_B,
        nombre: "Fondo Gasto Común B",
        tipo: "gasto_comun",
        activo: true,
        saldoInicial: 0,
      },
    })

    // Reglamento vigente de A (el de B no existe a propósito: aviso que declara).
    await prisma.versionReglamento.create({
      data: {
        id: "avc-vreg-a",
        comunidadId: COM_A,
        version: 1,
        vigenteDesde: "2026-01",
        fuenteInstrumento: "reglamento_copropiedad",
        actaRef: null,
        formaContribucion: "coeficiente",
        parametros: {
          porcentajeReserva: 10,
          diasPagoGc: 10,
          tasaMoraMensualPct: 1,
          topeMoraPct: 50,
          cuotasCorte: 3,
          diasPreavisoCorte: 5,
          ipcActivo: false,
        },
      },
    })

    for (const u of [
      { id: "avc-u-1", numero: "101", prorrateo: 0.6 },
      { id: "avc-u-2", numero: "102", prorrateo: 0.4 },
      { id: "avc-u-3", numero: "103", prorrateo: 0.2 },
      { id: "avc-u-sin-cobro", numero: "104", prorrateo: 0.1 },
    ]) {
      await prisma.unidad.create({
        data: {
          id: u.id,
          comunidadId: COM_A,
          microSectorId: "avc-ms-1",
          numero: u.numero,
          etiqueta: `Depto ${u.numero}`,
          tipoUnidadId: "avc-tu-1",
          metraje: 60,
          prorrateo: u.prorrateo,
          rolSii: `9999-${u.numero}`,
          estadoId: "avc-est-1",
          servicios: {},
        },
      })
    }
    // B: la unidad no declara prorrateo (0) → el aviso lo declara, no lo inventa.
    await prisma.unidad.create({
      data: {
        id: "avc-b-u-1",
        comunidadId: COM_B,
        microSectorId: "avc-ms-b",
        numero: "201",
        etiqueta: "Depto 201",
        tipoUnidadId: "avc-tu-b",
        metraje: 50,
        prorrateo: 0,
        rolSii: "8888-201",
        estadoId: "avc-est-b",
        servicios: {},
      },
    })
    await prisma.unidad.create({
      data: {
        id: "avc-c-u-1",
        comunidadId: COM_C,
        microSectorId: "avc-ms-c",
        numero: "301",
        etiqueta: "Depto 301",
        tipoUnidadId: "avc-tu-c",
        metraje: 40,
        prorrateo: 0.5,
        rolSii: "7777-301",
        estadoId: "avc-est-c",
        servicios: {},
      },
    })

    // Emisiones: el aviso solo existe sobre un período emitido.
    for (const e of [
      { id: "avc-egc-2026-09", comunidadId: COM_A, periodo: PERIODO },
      { id: "avc-egc-2026-08", comunidadId: COM_A, periodo: PERIODO_ANT },
      { id: "avc-egc-b", comunidadId: COM_B, periodo: PERIODO },
      { id: "avc-egc-c", comunidadId: COM_C, periodo: PERIODO },
    ]) {
      await prisma.emisionGC.create({
        data: {
          ...e,
          modo: "fijo",
          gastoTotal: 100_000,
          lineas: [],
          fechaEmision: `${e.periodo}-01`,
        },
      })
    }

    const cobroBase = {
      concepto: "gasto_comun" as const,
      origenModulo: "FI",
      fondoId: FONDO_GC_A,
      descripcion: `Gasto Común ${PERIODO}`,
      diferencias: [],
    }
    // 101: gasto común + recargo de reserva, con mora devengada y pago parcial.
    await prisma.cobroFI.create({
      data: {
        ...cobroBase,
        id: COBRO_U1,
        comunidadId: COM_A,
        unidadId: "avc-u-1",
        periodo: PERIODO,
        montoBase: 66_000,
        lineas: [
          linea("gasto_comun", 60_000, FONDO_GC_A),
          linea("gasto_comun", 6_000, FONDO_RESERVA_A),
        ],
        fechaCargo: `${PERIODO}-01`,
        fechaVencimiento: `${PERIODO}-10`,
        moras: [
          {
            id: "avc-mora-1",
            monto: 1_200,
            diasAtraso: 10,
            tasaMensualPct: 1,
            fecha: `${PERIODO}-20`,
          },
        ],
        pagos: [
          { id: "avc-pago-1", monto: 20_000, fecha: `${PERIODO}-15`, medio: "transferencia" },
        ],
      },
    })
    // 102: gasto común + reserva + una multa aplicada, sin pagos ni moras.
    await prisma.cobroFI.create({
      data: {
        ...cobroBase,
        id: COBRO_U2,
        comunidadId: COM_A,
        unidadId: "avc-u-2",
        periodo: PERIODO,
        montoBase: 49_000,
        lineas: [
          linea("gasto_comun", 40_000, FONDO_GC_A),
          linea("gasto_comun", 4_000, FONDO_RESERVA_A),
          linea("multa_in", 5_000, FONDO_GC_A),
        ],
        fechaCargo: `${PERIODO}-01`,
        fechaVencimiento: `${PERIODO}-10`,
        moras: [],
        pagos: [],
      },
    })
    // Período anterior: cobros LEGACY (sin `lineas`), la forma que ya existe.
    for (const c of [
      { id: "avc-cob-1a", unidadId: "avc-u-1", montoBase: 66_000 },
      { id: "avc-cob-2a", unidadId: "avc-u-2", montoBase: 49_000 },
    ]) {
      await prisma.cobroFI.create({
        data: {
          ...cobroBase,
          id: c.id,
          comunidadId: COM_A,
          unidadId: c.unidadId,
          periodo: PERIODO_ANT,
          descripcion: `Gasto Común ${PERIODO_ANT}`,
          montoBase: c.montoBase,
          lineas: Prisma.DbNull,
          fechaCargo: `${PERIODO_ANT}-01`,
          moras: [],
          pagos: [],
        },
      })
    }
    // B: cobro legacy; la comunidad no declara reglamento.
    await prisma.cobroFI.create({
      data: {
        id: COBRO_B1,
        comunidadId: COM_B,
        unidadId: "avc-b-u-1",
        periodo: PERIODO,
        concepto: "gasto_comun",
        origenModulo: "FI",
        fondoId: "avc-fondo-gc-b",
        descripcion: `Gasto Común ${PERIODO}`,
        montoBase: 50_000,
        lineas: Prisma.DbNull,
        fechaCargo: `${PERIODO}-01`,
        moras: [],
        pagos: [],
        diferencias: [],
      },
    })
    // C: tiene cobro y emisión, pero ningún fondo → totales no computables. El
    // cobro nunca se clasifica (la emisión corta antes).
    await prisma.cobroFI.create({
      data: {
        id: "avc-c-cob-1",
        comunidadId: COM_C,
        unidadId: "avc-c-u-1",
        periodo: PERIODO,
        concepto: "gasto_comun",
        origenModulo: "FI",
        fondoId: "avc-c-fondo-inexistente",
        descripcion: `Gasto Común ${PERIODO}`,
        montoBase: 30_000,
        lineas: Prisma.DbNull,
        fechaCargo: `${PERIODO}-01`,
        moras: [],
        pagos: [],
        diferencias: [],
      },
    })
    // Movimientos de caja del mes de A: el aviso declara ingresos y egresos.
    await prisma.ingresoFI.create({
      data: {
        id: "avc-ing-1",
        comunidadId: COM_A,
        fondoId: FONDO_GC_A,
        fecha: `${PERIODO}-05`,
        monto: 15_000,
        concepto: "Aporte extraordinario",
      },
    })
    await prisma.egresoFI.create({
      data: {
        id: "avc-egr-1",
        comunidadId: COM_A,
        fondoId: FONDO_GC_A,
        fecha: `${PERIODO}-12`,
        monto: 30_000,
        categoria: "servicios",
        descripcion: "Mantención ascensor",
        esRecurrente: false,
      },
    })

    const { cookieSesionAuthjs } = await import("../helpers/sesion-authjs")
    for (const u of [
      { id: "avc-user-admin", email: EMAIL_ADMIN },
      { id: "avc-user-comite", email: EMAIL_COMITE },
      { id: "avc-user-residente", email: EMAIL_RESIDENTE },
      { id: "avc-user-admin-b", email: EMAIL_ADMIN_B },
      { id: "avc-user-admin-c", email: EMAIL_ADMIN_C },
    ]) {
      cookies.set(u.email, await cookieSesionAuthjs({ sub: u.id, email: u.email }))
    }
  }, 60_000)

  afterAll(async () => {
    try {
      state.cookie = ""
      await limpiar()
      await prisma.membresia.deleteMany({
        where: {
          usuarioId: {
            in: [
              "avc-user-admin",
              "avc-user-comite",
              "avc-user-residente",
              "avc-user-admin-b",
              "avc-user-admin-c",
            ],
          },
        },
      })
      await prisma.usuario.deleteMany({
        where: {
          id: {
            in: [
              "avc-user-admin",
              "avc-user-comite",
              "avc-user-residente",
              "avc-user-admin-b",
              "avc-user-admin-c",
            ],
          },
        },
      })
      await prisma.comunidad.deleteMany({ where: { id: { in: [COM_A, COM_B, COM_C] } } })
    } catch {
      // intencional: best-effort
    }
  }, 60_000)

  it("emite el aviso de una unidad con el contenido que exige la ley (S1/S4)", async () => {
    const { status, json } = await como(EMAIL_ADMIN, () =>
      postAviso({ periodo: PERIODO, unidadId: "avc-u-1" })
    )
    expect(status).toBe(201)
    const avisos = json.avisos as FilaAviso[]
    expect(avisos).toHaveLength(1)
    avisoU1 = avisos[0]!
    contenidoCongelado = avisoU1.contenido
    totalesCongelados = avisoU1.totalesComunidad

    // Folio y código los asigna el servidor.
    expect(avisoU1.folio).toBe("AC-0001")
    expect(avisoU1.codigoVerificacion).toMatch(/^VC-[A-Z0-9]{8}$/)
    expect(avisoU1.periodo).toBe(PERIODO)
    expect(avisoU1.fechaEmision).toBe(hoyISO())
    // S6 (T7): el vencimiento se deriva de la EMISIÓN + los `diasPagoGc` de la
    // versión (10), no del `fechaVencimiento` que traía el cargo (`2026-09-10`).
    expect(avisoU1.vencimiento).toBe(sumarDias(avisoU1.fechaEmision, 10))
    expect(avisoU1.vencimiento).not.toBe(`${PERIODO}-10`)

    const participacion = contenidoCongelado.participacion as Record<string, unknown>
    expect(participacion).toEqual({
      prorrateo: 0.6,
      formaContribucion: "coeficiente",
      porcentajeReserva: 10,
      reservaIncluidaEnPresupuesto: false,
    })
    // Parámetros congelados con los que se calculó (S7).
    const reglamento = contenidoCongelado.reglamento as Record<string, unknown>
    expect(reglamento.version).toBe(1)
    expect((reglamento.parametros as Record<string, unknown>).diasPagoGc).toBe(10)

    // Cada concepto con su monto, nunca un total pelado (S4).
    expect(contenidoCongelado.montos).toEqual({
      gastoComun: 60_000,
      recargoFondoReserva: 6_000,
      multas: 0,
      intereses: 1_200,
      otros: [],
      exigible: 67_200,
      pagado: 20_000,
      totalAdeudado: 47_200,
    })
    const detalle = contenidoCongelado.detalle as Array<Record<string, unknown>>
    expect(detalle).toHaveLength(2)
    expect(detalle[1]).toMatchObject({
      monto: 6_000,
      fondoId: FONDO_RESERVA_A,
      fondoNombre: "Fondo Reserva Aviso",
      origen: "linea",
    })
    const cargos = contenidoCongelado.cargos as Array<Record<string, unknown>>
    expect(cargos.map((c) => c.id)).toEqual([COBRO_U1])
    expect(contenidoCongelado.noComputables).toEqual([])
  })

  it("el folio es correlativo por comunidad y lo asigna el servidor", async () => {
    const segundo = await como(EMAIL_ADMIN, () =>
      postAviso({ periodo: PERIODO, unidadId: "avc-u-2" })
    )
    expect(segundo.status).toBe(201)
    const avisoU2 = (segundo.json.avisos as FilaAviso[])[0]!
    expect(avisoU2.folio).toBe("AC-0002")
    // La 102 trae la multa aplicada como concepto propio.
    expect((avisoU2.contenido.montos as Record<string, unknown>).multas).toBe(5_000)
    expect((avisoU2.contenido.montos as Record<string, unknown>).totalAdeudado).toBe(49_000)

    // Otra comunidad arranca su propio correlativo en AC-0001.
    const enB = await como(EMAIL_ADMIN_B, () => postAviso({ periodo: PERIODO }))
    expect(enB.status).toBe(201)
    const avisoB = (enB.json.avisos as FilaAviso[])[0]!
    expect(avisoB.folio).toBe("AC-0001")
    // B no declara reglamento ni prorrateo: el aviso lo DICE en vez de imprimir 0.
    expect(avisoB.contenido.reglamento).toBeNull()
    expect(avisoB.contenido.participacion).toEqual({
      prorrateo: null,
      formaContribucion: null,
      porcentajeReserva: null,
      reservaIncluidaEnPresupuesto: null,
    })
    const noComputables = avisoB.contenido.noComputables as Array<Record<string, unknown>>
    expect(noComputables.map((n) => `${String(n.campo)}:${String(n.motivo)}`)).toEqual([
      "participacion:sin_reglamento_vigente",
      "participacion.prorrateo:prorrateo_no_declarado",
    ])
    // El monto del cobro legacy sí se declara: no se pierde plata por no saber
    // la proporción.
    expect((avisoB.contenido.montos as Record<string, unknown>).gastoComun).toBe(50_000)
  })

  it("dos avisos para la misma unidad y período se rechazan (409)", async () => {
    const antes = await prisma.avisoCobro.count({ where: { comunidadId: COM_A } })
    const repetido = await como(EMAIL_ADMIN, () =>
      postAviso({ periodo: PERIODO, unidadId: "avc-u-1" })
    )
    expect(repetido.status).toBe(409)
    expect(String(repetido.json.error)).toContain("ya tiene aviso")
    expect(await prisma.avisoCobro.count({ where: { comunidadId: COM_A } })).toBe(antes)
  })

  it("una unidad sin cobro en el período no recibe aviso", async () => {
    const sinCobro = await como(EMAIL_ADMIN, () =>
      postAviso({ periodo: PERIODO, unidadId: "avc-u-sin-cobro" })
    )
    expect(sinCobro.status).toBe(400)
    expect(String(sinCobro.json.error)).toContain("no tiene cobro en el período")
    expect(
      await prisma.avisoCobro.count({ where: { comunidadId: COM_A, unidadId: "avc-u-sin-cobro" } })
    ).toBe(0)
  })

  it("emitir para todas las unidades omite las que no tienen cobro", async () => {
    const lote = await como(EMAIL_ADMIN, () => postAviso({ periodo: PERIODO_ANT }))
    expect(lote.status).toBe(201)
    const avisos = lote.json.avisos as FilaAviso[]
    // Solo 101 y 102 tienen cobro en el período: 103 y 104 no reciben aviso.
    expect(avisos.map((a) => a.unidadId).sort()).toEqual(["avc-u-1", "avc-u-2"])
    expect(avisos.map((a) => a.folio)).toEqual(["AC-0003", "AC-0004"])
    // Cobro legacy: la línea sintética conserva el monto del cobro.
    const deU1 = avisos.find((a) => a.unidadId === "avc-u-1")!
    expect((deU1.contenido.montos as Record<string, unknown>).gastoComun).toBe(66_000)
    const detalle = deU1.contenido.detalle as Array<Record<string, unknown>>
    expect(detalle[0]).toMatchObject({ origen: "legacy", monto: 66_000 })
  })

  it("el período sin emisión no se puede avisar (409)", async () => {
    const sinEmision = await como(EMAIL_ADMIN, () => postAviso({ periodo: PERIODO_SIN_EMISION }))
    expect(sinEmision.status).toBe(409)
    expect(String(sinEmision.json.error)).toContain("no tiene emisión")
  })

  it("sin fondos de caja los totales de comunidad no son computables (400)", async () => {
    const enC = await como(EMAIL_ADMIN_C, () => postAviso({ periodo: PERIODO }))
    expect(enC.status).toBe(400)
    expect(String(enC.json.error)).toContain("saldo de caja al cierre")
    expect(await prisma.avisoCobro.count({ where: { comunidadId: COM_C } })).toBe(0)
  })

  it("el contenido lleva los totales de comunidad del período (art. 31)", async () => {
    const esperado = await cargarResumenMensual(COM_A, PERIODO)
    expect(esperado.ingresos.total).toBe(35_000) // 20.000 pagados + 15.000 manuales
    expect(esperado.egresos.total).toBe(30_000)

    const guardado = (await prisma.avisoCobro.findUnique({ where: { id: avisoU1.id } }))!
    expect(guardado.totalesComunidad as unknown as Record<string, unknown>).toEqual(
      esperado as unknown as Record<string, unknown>
    )
    expect(
      (guardado.contenido as unknown as Record<string, unknown>).resumenComunidad
    ).toEqual(esperado as unknown as Record<string, unknown>)
  })

  it("el aviso congela su contenido: cambiar el cargo después no lo cambia (S7)", async () => {
    // Se reescriben el cargo, sus moras y sus pagos, y se suma un egreso nuevo.
    await prisma.cobroFI.update({
      where: { id: COBRO_U1 },
      data: {
        montoBase: 999_999,
        lineas: [linea("gasto_comun", 999_999, FONDO_GC_A)],
        moras: [],
        pagos: [],
      },
    })
    await prisma.egresoFI.create({
      data: {
        id: "avc-egr-2",
        comunidadId: COM_A,
        fondoId: FONDO_GC_A,
        fecha: `${PERIODO}-28`,
        monto: 700_000,
        categoria: "otro",
        descripcion: "Egreso posterior a la emisión",
        esRecurrente: false,
      },
    })

    const listado = await como(EMAIL_ADMIN, () => getAvisos(`?page=1&pageSize=100`))
    expect(listado.status).toBe(200)
    const filas = listado.json.data as FilaAviso[]
    const releido = filas.find((f) => f.id === avisoU1.id)!
    expect(releido.contenido).toEqual(contenidoCongelado)
    expect(releido.totalesComunidad).toEqual(totalesCongelados)

    const uno = await como(EMAIL_ADMIN, () => getAviso(avisoU1.id))
    expect(uno.status).toBe(200)
    expect((uno.json as unknown as FilaAviso).contenido).toEqual(contenidoCongelado)
  })

  it("DELETE responde 409: el aviso es el documento con el que se cobra", async () => {
    const borrado = await como(EMAIL_ADMIN, () => deleteAviso(avisoU1.id))
    expect(borrado.status).toBe(409)
    expect(String(borrado.json.error)).toContain("documento con el que se cobra")
    expect(await prisma.avisoCobro.findUnique({ where: { id: avisoU1.id } })).not.toBeNull()
  })

  it("el aviso de otra comunidad es invisible e intocable", async () => {
    const listadoB = await como(EMAIL_ADMIN_B, () => getAvisos(`?page=1&pageSize=100`))
    expect(listadoB.status).toBe(200)
    const filas = listadoB.json.data as FilaAviso[]
    expect(filas.length).toBeGreaterThan(0)
    expect(filas.every((f) => f.comunidadId === COM_B)).toBe(true)

    const detalle = await como(EMAIL_ADMIN_B, () => getAviso(avisoU1.id))
    expect(detalle.status).toBe(404)

    const borrado = await como(EMAIL_ADMIN_B, () => deleteAviso(avisoU1.id))
    expect(borrado.status).toBe(404)
    expect(await prisma.avisoCobro.findUnique({ where: { id: avisoU1.id } })).not.toBeNull()
  })

  it("el comité lee los avisos y no los emite; el residente no los ve", async () => {
    const lectura = await como(EMAIL_COMITE, () => getAvisos())
    expect(lectura.status).toBe(200)
    const emisionComite = await como(EMAIL_COMITE, () =>
      postAviso({ periodo: PERIODO, unidadId: "avc-u-1" })
    )
    expect(emisionComite.status).toBe(403)

    const lecturaResidente = await como(EMAIL_RESIDENTE, () => getAvisos())
    expect(lecturaResidente.status).toBe(403)
    const emisionResidente = await como(EMAIL_RESIDENTE, () => postAviso({ periodo: PERIODO }))
    expect(emisionResidente.status).toBe(403)
  })

  it("el listado pagina y el aviso emitido queda con su emisión persistida", async () => {
    const paginado = await como(EMAIL_ADMIN, () => getAvisos(`?page=1&pageSize=2`))
    expect(paginado.status).toBe(200)
    expect(paginado.json.page).toBe(1)
    expect(paginado.json.pageSize).toBe(2)
    expect((paginado.json.data as FilaAviso[]).length).toBe(2)
    const totalA = await prisma.avisoCobro.count({
      where: { comunidadId: COM_A, periodo: { in: [PERIODO, PERIODO_ANT] } },
    })
    expect(paginado.json.total).toBe(totalA)
    // El JSON persistido sigue siendo legible como JSON de Prisma.
    const fila = await prisma.avisoCobro.findUnique({ where: { id: avisoU1.id } })
    expect(fila!.contenido as Prisma.JsonValue).toBeTruthy()
  })
})
