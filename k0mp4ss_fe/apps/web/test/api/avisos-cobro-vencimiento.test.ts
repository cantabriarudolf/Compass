/**
 * @vitest-environment node
 *
 * T7 aviso-de-cobro (S6) — la fecha de emisión arranca el plazo de pago. BD real.
 *
 * S6 (Ley 21.442 art. 7): el plazo de pago corre "dentro de los diez primeros
 * días siguientes a la fecha de emisión del correspondiente aviso de cobro", así
 * que el vencimiento se DERIVA de la fecha de emisión del aviso y de los
 * `diasPagoGc` que declara la versión del reglamento vigente en ese período:
 *
 *     vencimiento = fechaEmision + diasPagoGc
 *
 * La entrega NO entra en la cuenta (art. 7 arranca el reloj en la emisión, no en
 * la notificación): un aviso puede estar vencido con el correo todavía en cola.
 *
 * Lo que estos tests fijan, todo observable por la API:
 *
 *   1. el vencimiento NO es el que traía el cargo: es emisión + los días que
 *      declara la versión (10 en el reglamento de referencia, 20 en otra
 *      comunidad que declara otro plazo);
 *   2. se calcula con la versión que rige el PERÍODO, no con la última
 *      declarada: una versión futura no adelanta el plazo de un aviso de hoy;
 *   3. si el cargo traía otra fecha, el papel manda: el cargo queda alineado a
 *      la fecha del aviso y la copia congelada del cargo dice lo mismo. La mora
 *      corre desde `fechaVencimiento` (`app/api/cobros-fi/[id]/mora`), así que
 *      una fecha que el residente nunca vio no puede cobrar intereses;
 *   4. sin versión vigente no hay plazo declarado: el aviso no inventa el
 *      vencimiento (queda `null`), lo declara y no toca el cargo.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest"
import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import { hoyISO } from "@/lib/date-utils"
import { vencimientoAviso } from "@/lib/aviso-cobro"

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

/** Reglamento de referencia: 10 días de pago. */
const COM_10 = "avv-com-diez"
/** Comunidad que declara 20 días: el plazo es configuración, no código. */
const COM_20 = "avv-com-veinte"
/** Dos versiones: la que rige el período dice 10, la futura dice 30. */
const COM_DOS = "avv-com-dos"
/** Sin ninguna versión declarada: no hay plazo que derivar. */
const COM_SIN = "avv-com-sin-version"

const COMUNIDADES = [COM_10, COM_20, COM_DOS, COM_SIN]

const PERIODO = "2026-09"
/** Fecha que trae el cargo del período: la del cobro, no la del papel. */
const VENCIMIENTO_DEL_CARGO = `${PERIODO}-10`

const PARAMETROS_BASE = {
  porcentajeReserva: 10,
  diasPagoGc: 10,
  tasaMoraMensualPct: 1,
  topeMoraPct: 50,
  cuotasCorte: 3,
  diasPreavisoCorte: 5,
  ipcActivo: false,
}

/** Suma días corridos a una fecha ISO, con el mismo reloj UTC que el aviso. */
function sumarDias(fecha: string, dias: number): string {
  const base = new Date(`${fecha}T00:00:00Z`)
  base.setUTCDate(base.getUTCDate() + dias)
  return base.toISOString().slice(0, 10)
}

type Aviso = {
  id: string
  comunidadId: string
  unidadId: string
  periodo: string
  folio: string
  fechaEmision: string
  vencimiento: string | null
  contenido: Record<string, unknown>
}

type Sesion = { id: string; email: string; comunidadId: string }

const SESIONES: Sesion[] = [
  { id: "avv-user-diez", email: "avv-diez@test.cl", comunidadId: COM_10 },
  { id: "avv-user-veinte", email: "avv-veinte@test.cl", comunidadId: COM_20 },
  { id: "avv-user-dos", email: "avv-dos@test.cl", comunidadId: COM_DOS },
  { id: "avv-user-sin", email: "avv-sin@test.cl", comunidadId: COM_SIN },
]

describe("vencimientoAviso — aritmética del plazo de pago (S6)", () => {
  it("suma días de calendario sobre UTC, también al cruzar mes y año", () => {
    expect(vencimientoAviso("2026-09-01", 10)).toBe("2026-09-11")
    expect(vencimientoAviso("2026-09-25", 10)).toBe("2026-10-05")
    expect(vencimientoAviso("2026-12-28", 10)).toBe("2027-01-07")
    expect(vencimientoAviso("2026-09-05", 20)).toBe("2026-09-25")
  })

  it("sin días de pago declarados no inventa una fecha", () => {
    expect(vencimientoAviso("2026-09-01", null)).toBeNull()
  })
})

describe("/api/avisos-cobro — el vencimiento se deriva de la emisión (S6)", () => {
  const cookies = new Map<string, string>()

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
    return {
      status: res.status,
      json: (await res.json().catch(() => ({}))) as Record<string, unknown>,
    }
  }

  async function limpiar(): Promise<void> {
    await prisma.avisoCobro.deleteMany({ where: { comunidadId: { in: COMUNIDADES } } })
    await prisma.cobroFI.deleteMany({ where: { comunidadId: { in: COMUNIDADES } } })
    await prisma.ingresoFI.deleteMany({ where: { comunidadId: { in: COMUNIDADES } } })
    await prisma.egresoFI.deleteMany({ where: { comunidadId: { in: COMUNIDADES } } })
    await prisma.emisionGC.deleteMany({ where: { comunidadId: { in: COMUNIDADES } } })
    await prisma.versionReglamento.deleteMany({
      where: { comunidadId: { in: COMUNIDADES } },
    })
    await prisma.fondoFI.deleteMany({ where: { comunidadId: { in: COMUNIDADES } } })
    await prisma.unidad.deleteMany({ where: { comunidadId: { in: COMUNIDADES } } })
  }

  /** Cargo del período de una unidad, con el vencimiento que se le pida. */
  async function crearCargo(opciones: {
    id: string
    comunidadId: string
    unidadId: string
    fondoId: string
    fechaVencimiento: string | null
    montoBase: number
  }): Promise<void> {
    await prisma.cobroFI.create({
      data: {
        id: opciones.id,
        comunidadId: opciones.comunidadId,
        unidadId: opciones.unidadId,
        periodo: PERIODO,
        concepto: "gasto_comun",
        origenModulo: "FI",
        fondoId: opciones.fondoId,
        descripcion: `Gasto Común ${PERIODO}`,
        montoBase: opciones.montoBase,
        lineas: [
          {
            concepto: "gasto_comun",
            monto: opciones.montoBase,
            fondoId: opciones.fondoId,
          },
        ],
        fechaCargo: `${PERIODO}-01`,
        fechaVencimiento: opciones.fechaVencimiento,
        moras: [],
        pagos: [],
        diferencias: [],
      },
    })
  }

  beforeAll(async () => {
    process.env.AUTH_SECRET = AUTH_SECRET
    process.env.NEXT_PUBLIC_APP_ENV = "development"
    vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 })

    await limpiar()
    await prisma.membresia.deleteMany({
      where: { usuarioId: { in: SESIONES.map((s) => s.id) } },
    })
    await prisma.usuario.deleteMany({ where: { id: { in: SESIONES.map((s) => s.id) } } })
    await prisma.comunidad.deleteMany({ where: { id: { in: COMUNIDADES } } })

    for (const c of [
      { id: COM_10, nombre: "Comunidad Diez Dias", slug: "avv-diez" },
      { id: COM_20, nombre: "Comunidad Veinte Dias", slug: "avv-veinte" },
      { id: COM_DOS, nombre: "Comunidad Dos Versiones", slug: "avv-dos" },
      { id: COM_SIN, nombre: "Comunidad Sin Version", slug: "avv-sin" },
    ]) {
      await prisma.comunidad.create({ data: c })
    }
    for (const s of SESIONES) {
      await prisma.usuario.create({
        data: { id: s.id, email: s.email, activo: true },
      })
      await prisma.membresia.create({
        data: { usuarioId: s.id, comunidadId: s.comunidadId, rol: "administrador" },
      })
    }

    // Unidad, fondo y emisión por comunidad: lo mínimo para que el aviso exista.
    for (const s of SESIONES) {
      await prisma.unidad.create({
        data: {
          id: `${s.id}-u1`,
          comunidadId: s.comunidadId,
          microSectorId: `${s.id}-ms`,
          numero: "101",
          etiqueta: "Depto 101",
          tipoUnidadId: `${s.id}-tu`,
          metraje: 60,
          prorrateo: 0.5,
          rolSii: `999-${s.id}`,
          estadoId: `${s.id}-est`,
          servicios: {},
        },
      })
      await prisma.fondoFI.create({
        data: {
          id: `${s.id}-fondo`,
          comunidadId: s.comunidadId,
          nombre: "Fondo Gasto Común",
          tipo: "gasto_comun",
          activo: true,
          saldoInicial: 100_000,
        },
      })
      await prisma.emisionGC.create({
        data: {
          id: `${s.id}-egc`,
          comunidadId: s.comunidadId,
          periodo: PERIODO,
          modo: "fijo",
          gastoTotal: 100_000,
          lineas: [],
          fechaEmision: `${PERIODO}-01`,
        },
      })
    }

    // Reglamentos: 10 días, 20 días, y el par "vigente / futura".
    await prisma.versionReglamento.create({
      data: {
        id: "avv-vreg-diez",
        comunidadId: COM_10,
        version: 1,
        vigenteDesde: "2026-01",
        fuenteInstrumento: "reglamento_copropiedad",
        actaRef: null,
        formaContribucion: "coeficiente",
        parametros: PARAMETROS_BASE,
      },
    })
    await prisma.versionReglamento.create({
      data: {
        id: "avv-vreg-veinte",
        comunidadId: COM_20,
        version: 1,
        vigenteDesde: "2026-01",
        fuenteInstrumento: "reglamento_copropiedad",
        actaRef: null,
        formaContribucion: "coeficiente",
        parametros: { ...PARAMETROS_BASE, diasPagoGc: 20 },
      },
    })
    await prisma.versionReglamento.create({
      data: {
        id: "avv-vreg-dos-1",
        comunidadId: COM_DOS,
        version: 1,
        vigenteDesde: "2026-01",
        fuenteInstrumento: "reglamento_copropiedad",
        actaRef: null,
        formaContribucion: "coeficiente",
        parametros: PARAMETROS_BASE,
      },
    })
    // Versión FUTURA (rige desde 2026-11): no gobierna un aviso de 2026-09.
    await prisma.versionReglamento.create({
      data: {
        id: "avv-vreg-dos-2",
        comunidadId: COM_DOS,
        version: 2,
        vigenteDesde: "2026-11",
        fuenteInstrumento: "acta_asamblea",
        actaRef: "Acta 2026-10-30",
        formaContribucion: "coeficiente",
        parametros: { ...PARAMETROS_BASE, diasPagoGc: 30 },
      },
    })

    // El cargo del período trae SU fecha (la del cobro), no la del aviso.
    await crearCargo({
      id: "avv-cob-diez",
      comunidadId: COM_10,
      unidadId: "avv-user-diez-u1",
      fondoId: "avv-user-diez-fondo",
      fechaVencimiento: VENCIMIENTO_DEL_CARGO,
      montoBase: 60_000,
    })
    // Este cargo no declara vencimiento: el aviso igual tiene plazo.
    await crearCargo({
      id: "avv-cob-veinte",
      comunidadId: COM_20,
      unidadId: "avv-user-veinte-u1",
      fondoId: "avv-user-veinte-fondo",
      fechaVencimiento: null,
      montoBase: 50_000,
    })
    await crearCargo({
      id: "avv-cob-dos",
      comunidadId: COM_DOS,
      unidadId: "avv-user-dos-u1",
      fondoId: "avv-user-dos-fondo",
      fechaVencimiento: VENCIMIENTO_DEL_CARGO,
      montoBase: 40_000,
    })
    await crearCargo({
      id: "avv-cob-sin",
      comunidadId: COM_SIN,
      unidadId: "avv-user-sin-u1",
      fondoId: "avv-user-sin-fondo",
      fechaVencimiento: VENCIMIENTO_DEL_CARGO,
      montoBase: 30_000,
    })

    const { cookieSesionAuthjs } = await import("../helpers/sesion-authjs")
    for (const s of SESIONES) {
      cookies.set(
        s.email,
        await cookieSesionAuthjs({ sub: s.id, email: s.email })
      )
    }
  }, 60_000)

  afterAll(async () => {
    try {
      state.cookie = ""
      await limpiar()
      await prisma.membresia.deleteMany({
        where: { usuarioId: { in: SESIONES.map((s) => s.id) } },
      })
      await prisma.usuario.deleteMany({
        where: { id: { in: SESIONES.map((s) => s.id) } },
      })
      await prisma.comunidad.deleteMany({ where: { id: { in: COMUNIDADES } } })
    } catch {
      // intencional: best-effort
    }
  }, 60_000)

  it("el vencimiento es la fecha de emisión + los 10 días que declara la versión", async () => {
    const res = await como("avv-diez@test.cl", () => postAviso({ periodo: PERIODO }))
    expect(res.status).toBe(201)
    const aviso = (res.json.avisos as Aviso[])[0]!

    // El reloj arranca en la EMISIÓN del aviso, no en la fecha del cargo.
    expect(aviso.fechaEmision).toBe(hoyISO())
    expect(aviso.vencimiento).toBe(sumarDias(aviso.fechaEmision, 10))
    // Y no es la fecha que traía el cargo.
    expect(aviso.vencimiento).not.toBe(VENCIMIENTO_DEL_CARGO)

    // El papel manda: el cargo queda con la fecha del aviso, que es desde donde
    // corre la mora.
    const cargo = await prisma.cobroFI.findUnique({ where: { id: "avv-cob-diez" } })
    expect(cargo!.fechaVencimiento).toBe(aviso.vencimiento)
    // La copia congelada del cargo en el aviso dice lo mismo: el documento no se
    // contradice a sí mismo.
    const cargos = aviso.contenido.cargos as Array<Record<string, unknown>>
    expect(cargos.map((c) => c.fechaVencimiento)).toEqual([aviso.vencimiento])
  })

  it("otra comunidad declara 20 días y su plazo es 20, no 10", async () => {
    const res = await como("avv-veinte@test.cl", () => postAviso({ periodo: PERIODO }))
    expect(res.status).toBe(201)
    const aviso = (res.json.avisos as Aviso[])[0]!
    expect(aviso.vencimiento).toBe(sumarDias(aviso.fechaEmision, 20))
    // El cargo no declaraba vencimiento (lo que antes daba `null`): ahora la
    // fecha sale del papel y el cargo se alinea.
    const cargo = await prisma.cobroFI.findUnique({ where: { id: "avv-cob-veinte" } })
    expect(cargo!.fechaVencimiento).toBe(aviso.vencimiento)
  })

  it("usa la versión que rige el período, no la última declarada", async () => {
    const res = await como("avv-dos@test.cl", () => postAviso({ periodo: PERIODO }))
    expect(res.status).toBe(201)
    const aviso = (res.json.avisos as Aviso[])[0]!
    // La versión 2 (30 días) rige desde 2026-11: no gobierna este período.
    expect(aviso.vencimiento).toBe(sumarDias(aviso.fechaEmision, 10))
    expect(aviso.vencimiento).not.toBe(sumarDias(aviso.fechaEmision, 30))
    const reglamento = aviso.contenido.reglamento as Record<string, unknown>
    expect(reglamento.version).toBe(1)
    expect((reglamento.parametros as Record<string, unknown>).diasPagoGc).toBe(10)
  })

  it("sin versión vigente no inventa vencimiento y no toca el cargo", async () => {
    const res = await como("avv-sin@test.cl", () => postAviso({ periodo: PERIODO }))
    expect(res.status).toBe(201)
    const aviso = (res.json.avisos as Aviso[])[0]!
    expect(aviso.vencimiento).toBeNull()
    // Se declara lo que no se puede computar, igual que antes de T7.
    const noComputables = aviso.contenido.noComputables as Array<Record<string, unknown>>
    expect(noComputables.map((n) => `${String(n.campo)}:${String(n.motivo)}`)).toContain(
      "participacion:sin_reglamento_vigente"
    )
    // Sin plazo derivado no hay fecha nueva que escribir en el cargo.
    const cargo = await prisma.cobroFI.findUnique({ where: { id: "avv-cob-sin" } })
    expect(cargo!.fechaVencimiento).toBe(VENCIMIENTO_DEL_CARGO)
  })
})
