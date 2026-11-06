/**
 * @vitest-environment node
 *
 * POST /api/avisos-cobro — la respuesta dice POR QUÉ una unidad quedó sin aviso.
 *
 * Antes la ruta devolvía solo `{ avisos }` y la pantalla derivaba el "sin aviso"
 * restando las líneas de la emisión: sabía cuántas unidades quedaron afuera y no
 * podía decir por qué. Ahora la respuesta agrega `sinAviso`, la lista de esas
 * unidades con el motivo que el servidor PUEDE afirmar:
 *
 *   - `sin_cobro`:      la emisión la repartió y el período no tiene cargo.
 *   - `ya_tiene_aviso`: ya tiene papel de ese período (llega en el 409, porque
 *                       un aviso emitido no se reemplaza).
 *   - `otro`:           hay un cargo del período y la unidad no se pudo
 *                       resolver; no se inventa una causa.
 *
 * El cambio es ADITIVO: `avisos` sigue trayendo las mismas filas foliadas y el
 * 409 sigue trayendo su `error` imprimible. Lo que se agrega se prueba acá;
 * lo que ya existía también (que no se rompió al agregar).
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

const COMUNIDAD = "sia-com-a"
const USUARIO_ADMIN = "sia-user-admin"
const EMAIL_ADMIN = "sia-admin@test.cl"
const FONDO_GC = "sia-fondo-gc"

/** Períodos independientes: cada caso emite su propio papel. */
const PERIODO = "2026-09"
const PERIODO_UNIDAD = "2026-10"
const PERIODO_CON_UNIDAD_SOLICITADA = "2026-11"

const UNIDAD_1 = "sia-u-1"
const UNIDAD_2 = "sia-u-2"
/** La emisión la reparte y el período NO tiene cargo para ella. */
const UNIDAD_SIN_COBRO = "sia-u-3"
/** Cargo del período cuya unidad ya no existe en la comunidad. */
const UNIDAD_FANTASMA = "sia-u-fantasma"

type Respuesta = { status: number; json: Record<string, unknown> }

interface UnidadSinAvisoJson {
  unidadId: string
  numero: string | null
  etiqueta: string | null
  motivo: string
}

interface AvisoJson {
  id: string
  unidadId: string
  periodo: string
  folio: string
  contenido: Record<string, unknown>
}

describe("/api/avisos-cobro — unidades sin aviso con su motivo", () => {
  async function conSesion(fn: () => Promise<void>): Promise<void> {
    const { cookieSesionAuthjs } = await import("../helpers/sesion-authjs")
    state.cookie = await cookieSesionAuthjs({ sub: USUARIO_ADMIN, email: EMAIL_ADMIN })
    try {
      await fn()
    } finally {
      state.cookie = ""
    }
  }

  async function postAviso(body: unknown): Promise<Respuesta> {
    const { POST } = await import("@/app/api/avisos-cobro/route")
    const res = await POST(
      new NextRequest("http://localhost/api/avisos-cobro", {
        method: "POST",
        body: JSON.stringify(body),
        headers: { "content-type": "application/json" },
      })
    )
    return {
      status: res.status,
      json: (await res.json().catch(() => ({}))) as Record<string, unknown>,
    }
  }

  /** Cargo del período, con el desglose mínimo que el aviso lee. */
  async function crearCargo(opciones: {
    id: string
    unidadId: string
    periodo: string
    montoBase?: number
  }): Promise<void> {
    const montoBase = opciones.montoBase ?? 50_000
    await prisma.cobroFI.create({
      data: {
        id: opciones.id,
        comunidadId: COMUNIDAD,
        unidadId: opciones.unidadId,
        periodo: opciones.periodo,
        concepto: "gasto_comun",
        origenModulo: "FI",
        fondoId: FONDO_GC,
        descripcion: `Gasto Común ${opciones.periodo}`,
        montoBase,
        lineas: [{ concepto: "gasto_comun", monto: montoBase, fondoId: FONDO_GC }],
        fechaCargo: `${opciones.periodo}-01`,
        fechaVencimiento: `${opciones.periodo}-10`,
        moras: [],
        pagos: [],
        diferencias: [],
      },
    })
  }

  async function crearEmision(periodo: string, unidades: string[]): Promise<void> {
    await prisma.emisionGC.create({
      data: {
        id: `sia-egc-${periodo}`,
        comunidadId: COMUNIDAD,
        periodo,
        modo: "fijo",
        gastoTotal: 150_000,
        // Una línea por unidad repartida: es lo que la emisión declara.
        lineas: unidades.map((unidadId, idx) => ({
          unidadId,
          responsablePersonaId: "sia-p-1",
          monto: 50_000,
          cobroId: `sia-cob-linea-${periodo}-${idx}`,
        })),
        fechaEmision: `${periodo}-01`,
      },
    })
  }

  async function limpiarEntidades(): Promise<void> {
    const enComunidad = { comunidadId: COMUNIDAD }
    await prisma.avisoCobro.deleteMany({ where: enComunidad })
    await prisma.cobroFI.deleteMany({ where: enComunidad })
    await prisma.ingresoFI.deleteMany({ where: enComunidad })
    await prisma.egresoFI.deleteMany({ where: enComunidad })
    await prisma.emisionGC.deleteMany({ where: enComunidad })
    await prisma.versionReglamento.deleteMany({ where: enComunidad })
    await prisma.vinculoUnidad.deleteMany({ where: enComunidad })
    await prisma.persona.deleteMany({ where: enComunidad })
    await prisma.unidad.deleteMany({ where: enComunidad })
    await prisma.tipoUnidad.deleteMany({ where: enComunidad })
    await prisma.fondoFI.deleteMany({ where: enComunidad })
  }

  beforeAll(async () => {
    process.env.AUTH_SECRET = AUTH_SECRET
    process.env.NEXT_PUBLIC_APP_ENV = "development"
    vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 })

    await prisma.membresia.deleteMany({ where: { usuarioId: USUARIO_ADMIN } })
    await prisma.usuario.deleteMany({ where: { id: USUARIO_ADMIN } })
    await prisma.comunidad.deleteMany({ where: { id: COMUNIDAD } })
    await limpiarEntidades()

    await prisma.comunidad.create({
      data: { id: COMUNIDAD, nombre: "Comunidad Sin Aviso", slug: "sia-a" },
    })
    await prisma.usuario.create({ data: { id: USUARIO_ADMIN, email: EMAIL_ADMIN, activo: true } })
    await prisma.membresia.create({
      data: { usuarioId: USUARIO_ADMIN, comunidadId: COMUNIDAD, rol: "administrador" },
    })
    await prisma.fondoFI.create({
      data: {
        id: FONDO_GC,
        comunidadId: COMUNIDAD,
        nombre: "Fondo Gasto Común",
        tipo: "gasto_comun",
        activo: true,
        saldoInicial: 100_000,
      },
    })
    await prisma.versionReglamento.create({
      data: {
        id: "sia-vreg-1",
        comunidadId: COMUNIDAD,
        version: 1,
        vigenteDesde: "2026-01",
        fuenteInstrumento: "reglamento_copropiedad",
        actaRef: null,
        formaContribucion: "monto_por_tipo",
        parametros: {
          porcentajeReserva: 0,
          diasPagoGc: 10,
          tasaMoraMensualPct: 1,
          topeMoraPct: 50,
          cuotasCorte: 3,
          diasPreavisoCorte: 5,
          ipcActivo: false,
        },
      } as never,
    })
    for (const u of [
      { id: UNIDAD_1, numero: "101" },
      { id: UNIDAD_2, numero: "102" },
      { id: UNIDAD_SIN_COBRO, numero: "103" },
    ]) {
      await prisma.unidad.create({
        data: {
          id: u.id,
          comunidadId: COMUNIDAD,
          microSectorId: "sia-ms-1",
          numero: u.numero,
          etiqueta: `Depto ${u.numero}`,
          tipoUnidadId: "sia-tu-1",
          metraje: 60,
          prorrateo: 0.33,
          rolSii: `9999-${u.numero}`,
          estadoId: "sia-est-1",
          servicios: {},
        },
      })
    }

    // 2026-09: la emisión reparte tres unidades y solo dos tienen cargo.
    await crearEmision(PERIODO, [UNIDAD_1, UNIDAD_2, UNIDAD_SIN_COBRO])
    await crearCargo({ id: "sia-cob-1", unidadId: UNIDAD_1, periodo: PERIODO })
    await crearCargo({ id: "sia-cob-2", unidadId: UNIDAD_2, periodo: PERIODO })

    // 2026-10: un cargo apunta a una unidad que ya no existe ("otro").
    await crearEmision(PERIODO_UNIDAD, [UNIDAD_1])
    await crearCargo({ id: "sia-cob-3", unidadId: UNIDAD_1, periodo: PERIODO_UNIDAD })
    await crearCargo({
      id: "sia-cob-fantasma",
      unidadId: UNIDAD_FANTASMA,
      periodo: PERIODO_UNIDAD,
    })

    // 2026-11: tres unidades repartidas, dos con cargo (para el pedido de una).
    await crearEmision(PERIODO_CON_UNIDAD_SOLICITADA, [
      UNIDAD_1,
      UNIDAD_2,
      UNIDAD_SIN_COBRO,
    ])
    await crearCargo({
      id: "sia-cob-4",
      unidadId: UNIDAD_1,
      periodo: PERIODO_CON_UNIDAD_SOLICITADA,
    })
    await crearCargo({
      id: "sia-cob-5",
      unidadId: UNIDAD_2,
      periodo: PERIODO_CON_UNIDAD_SOLICITADA,
    })
  })

  afterAll(async () => {
    state.cookie = ""
    delete process.env.NEXT_PUBLIC_APP_ENV
    await limpiarEntidades()
    await prisma.membresia.deleteMany({ where: { usuarioId: USUARIO_ADMIN } })
    await prisma.usuario.deleteMany({ where: { id: USUARIO_ADMIN } })
    await prisma.comunidad.deleteMany({ where: { id: COMUNIDAD } })
  })

  it("la corrida completa declara las unidades sin cargo con su motivo `sin_cobro`", async () => {
    await conSesion(async () => {
      const res = await postAviso({ periodo: PERIODO })
      expect(res.status).toBe(201)

      // Lo que ya existía sigue igual: las filas foliadas del período.
      const avisos = res.json.avisos as AvisoJson[]
      expect(avisos.map((a) => a.unidadId).sort()).toEqual([UNIDAD_1, UNIDAD_2])
      expect(avisos.every((a) => a.folio.startsWith("AC-"))).toBe(true)
      expect(avisos.every((a) => a.contenido !== undefined)).toBe(true)

      // Lo nuevo: la unidad que la emisión repartió y no tiene cargo, nombrada
      // con el motivo que el servidor puede afirmar. La pantalla ya no resta.
      const sinAviso = res.json.sinAviso as UnidadSinAvisoJson[]
      expect(sinAviso).toEqual([
        {
          unidadId: UNIDAD_SIN_COBRO,
          numero: "103",
          etiqueta: "Depto 103",
          motivo: "sin_cobro",
        },
      ])
    })
  })

  it("el rechazo por aviso ya emitido también dice el motivo `ya_tiene_aviso`", async () => {
    await conSesion(async () => {
      const res = await postAviso({ periodo: PERIODO })
      expect(res.status).toBe(409)
      // El motivo imprimible no cambió.
      expect(String(res.json.error)).toContain("un aviso emitido no se reemplaza")
      const sinAviso = res.json.sinAviso as UnidadSinAvisoJson[]
      expect(sinAviso.map((s) => s.motivo)).toEqual(["ya_tiene_aviso", "ya_tiene_aviso"])
      expect(sinAviso.map((s) => s.unidadId).sort()).toEqual([UNIDAD_1, UNIDAD_2])
      expect(sinAviso.map((s) => s.numero)).toEqual(["101", "102"])
    })
  })

  it("un cargo cuya unidad ya no existe se declara como `otro`, no se calla", async () => {
    await conSesion(async () => {
      const res = await postAviso({ periodo: PERIODO_UNIDAD })
      expect(res.status).toBe(201)
      const avisos = res.json.avisos as AvisoJson[]
      expect(avisos.map((a) => a.unidadId)).toEqual([UNIDAD_1])
      const sinAviso = res.json.sinAviso as UnidadSinAvisoJson[]
      expect(sinAviso).toEqual([
        { unidadId: UNIDAD_FANTASMA, numero: null, etiqueta: null, motivo: "otro" },
      ])
    })
  })

  it("pedir una sola unidad no inventa omisiones de las demás", async () => {
    await conSesion(async () => {
      const res = await postAviso({
        periodo: PERIODO_CON_UNIDAD_SOLICITADA,
        unidadId: UNIDAD_1,
      })
      expect(res.status).toBe(201)
      const avisos = res.json.avisos as AvisoJson[]
      expect(avisos.map((a) => a.unidadId)).toEqual([UNIDAD_1])
      // La corrida apuntaba a una unidad: no dejó ninguna sin aviso.
      expect(res.json.sinAviso).toEqual([])
    })
  })
})
