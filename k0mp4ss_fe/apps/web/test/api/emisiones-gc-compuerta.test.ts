/**
 * @vitest-environment node
 *
 * T3 cobro-gastos-comunes-parametrico (S1/S2/S3/S4/S7) — compuerta de emisión GC.
 *
 * Una comunidad que no declaró con qué instrumento se reparte el gasto común no
 * puede emitir. Si declaró una versión, la emisión usa sus parámetros: el
 * vencimiento sale de `diasPagoGc` y el aporte al fondo de reserva de
 * `porcentajeReserva` (el porcentaje del fondo solo aplica si la versión no lo
 * declara). Los períodos futuros no cambian lo que rige hoy (S4).
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

const comunidadDeclarada = "egc4-com-declarada"
const comunidadSinVersion = "egc4-com-sin-version"
const comunidadMigrada = "egc4-com-migrada"

const emailAdminDeclarada = "egc4-admin-declarada@test.cl"
const emailAdminSinVersion = "egc4-admin-sin-version@test.cl"
const emailAdminMigrada = "egc4-admin-migrada@test.cl"

const PARAMETROS_BASE = {
  porcentajeReserva: 7,
  diasPagoGc: 10,
  tasaMoraMensualPct: 1,
  topeMoraPct: 50,
  cuotasCorte: 3,
  diasPreavisoCorte: 5,
  ipcActivo: false,
}

/** Suma días corridos a una fecha ISO (mismo reloj UTC que la emisión). */
function sumarDias(fecha: string, dias: number): string {
  const base = new Date(`${fecha}T00:00:00Z`)
  base.setUTCDate(base.getUTCDate() + dias)
  return base.toISOString().slice(0, 10)
}

function versionValida(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    fuenteInstrumento: "reglamento_copropiedad",
    actaRef: "Reglamento de copropiedad, art. 11",
    formaContribucion: "coeficiente",
    parametros: PARAMETROS_BASE,
    ...overrides,
  }
}

describe("/api/emisiones-gc — compuerta de la versión del reglamento", () => {
  beforeAll(async () => {
    process.env.AUTH_SECRET = AUTH_SECRET
    process.env.NEXT_PUBLIC_APP_ENV = "development"
    for (const c of [
      { id: comunidadDeclarada, nombre: "Comunidad Declarada", slug: "egc4-declarada" },
      { id: comunidadSinVersion, nombre: "Comunidad Sin Versión", slug: "egc4-sin-version" },
      { id: comunidadMigrada, nombre: "Comunidad Migrada", slug: "egc4-migrada" },
    ]) {
      await prisma.comunidad.upsert({ where: { id: c.id }, update: {}, create: c })
    }
    for (const u of [
      { id: "egc4-user-declarada", email: emailAdminDeclarada },
      { id: "egc4-user-sin-version", email: emailAdminSinVersion },
      { id: "egc4-user-migrada", email: emailAdminMigrada },
    ]) {
      await prisma.usuario.upsert({
        where: { email: u.email },
        update: { activo: true },
        create: { ...u, activo: true },
      })
    }
    await prisma.membresia.deleteMany({
      where: {
        usuarioId: {
          in: ["egc4-user-declarada", "egc4-user-sin-version", "egc4-user-migrada"],
        },
      },
    })
    for (const m of [
      { usuarioId: "egc4-user-declarada", comunidadId: comunidadDeclarada, rol: "administrador" },
      { usuarioId: "egc4-user-sin-version", comunidadId: comunidadSinVersion, rol: "administrador" },
      { usuarioId: "egc4-user-migrada", comunidadId: comunidadMigrada, rol: "administrador" },
    ]) {
      await prisma.membresia.create({ data: m })
    }

    await limpiarEntidades()

    // Comunidad declarada: v1 rige desde 2026-01, v3 desde 2026-09 (futura
    // para los períodos de este test) y v2 desde 2027-01 con parámetros
    // incompletos para cubrir el bloqueo por números ausentes.
    for (const v of [
      { version: 1, vigenteDesde: "2026-01", ...versionValida() },
      { version: 2, vigenteDesde: "2027-01", ...versionValida({ parametros: {} }) },
      {
        version: 3,
        vigenteDesde: "2026-09",
        ...versionValida({ parametros: { ...PARAMETROS_BASE, porcentajeReserva: 5, diasPagoGc: 20 } }),
      },
    ]) {
      await prisma.versionReglamento.create({
        data: { id: `egc4-vreg-${v.version}`, comunidadId: comunidadDeclarada, ...v } as never,
      })
    }
    // Comunidad migrada: la única versión es la migración automática, que no
    // funda la forma de contribución (S1).
    await prisma.versionReglamento.create({
      data: {
        id: "egc4-vreg-migrada",
        comunidadId: comunidadMigrada,
        version: 1,
        vigenteDesde: "2026-01",
        ...versionValida({ fuenteInstrumento: "migracion_automatica", actaRef: null }),
      } as never,
    })

    // T5 corte 2 (S5): dos versiones más para declarar DÓNDE vive el recargo de
    // reserva. `reservaIncluidaEnPresupuesto` es un dato de la comunidad, no una
    // constante del código; las versiones anteriores no lo traen y parsean con
    // la lectura normativa (encima del presupuesto).
    for (const v of [
      {
        version: 4,
        vigenteDesde: "2026-11",
        ...versionValida({
          parametros: {
            ...PARAMETROS_BASE,
            porcentajeReserva: 10,
            reservaIncluidaEnPresupuesto: true,
          },
        }),
      },
      {
        version: 5,
        vigenteDesde: "2026-12",
        ...versionValida({
          parametros: { ...PARAMETROS_BASE, porcentajeReserva: 0 },
        }),
      },
    ]) {
      await prisma.versionReglamento.create({
        data: { id: `egc4-vreg-${v.version}`, comunidadId: comunidadDeclarada, ...v } as never,
      })
    }

    // Base emisible de la comunidad declarada: tipo, unidad, propietario, fondo
    // GC y fondo de reserva con un 10% que NO debe usarse (la versión declara 7).
    await prisma.tipoUnidad.create({
      data: {
        id: "egc4-tu-1",
        comunidadId: comunidadDeclarada,
        nombre: "Departamento 60m2",
        categoria: "departamento",
        metraje: 60,
        montoBaseGc: 100000,
        activo: true,
        historialTarifas: [],
      },
    })
    await prisma.unidad.create({
      data: {
        id: "egc4-u-1",
        comunidadId: comunidadDeclarada,
        microSectorId: "egc4-ms-1",
        numero: "101",
        etiqueta: "Depto 101",
        tipoUnidadId: "egc4-tu-1",
        metraje: 60,
        prorrateo: 0.6,
        rolSii: "9999-101",
        estadoId: "egc4-est-1",
        servicios: {},
      },
    })
    await prisma.persona.create({
      data: {
        id: "egc4-p-1",
        comunidadId: comunidadDeclarada,
        rut: "11111111-1",
        nombreCompleto: "Persona EGC4",
        nombres: "Persona",
        apellidos: "EGC4",
        email: "egc4-p-1@test.cl",
        telefonoMovil: "+56900000000",
        estadoCuenta: "activa",
        condicionesEspecialesIds: [],
        roles: [],
      },
    })
    await prisma.vinculoUnidad.create({
      data: {
        id: "egc4-v-1",
        comunidadId: comunidadDeclarada,
        personaId: "egc4-p-1",
        unidadId: "egc4-u-1",
        rol: "propietario",
        fechaInicio: "2025-01-01",
        permiteVerFinanzas: true,
      },
    })
    await prisma.fondoFI.create({
      data: {
        id: "egc4-fondo-gc",
        comunidadId: comunidadDeclarada,
        nombre: "Fondo Gasto Común EGC4",
        tipo: "gasto_comun",
        activo: true,
      },
    })
    await prisma.fondoFI.create({
      data: {
        id: "egc4-fondo-res",
        comunidadId: comunidadDeclarada,
        nombre: "Fondo Reserva EGC4",
        tipo: "reserva",
        activo: true,
        porcentajeAporte: 10,
      },
    })
  }, 30_000)

  afterAll(async () => {
    state.cookie = ""
    delete process.env.NEXT_PUBLIC_APP_ENV
    await limpiarEntidades()
    await prisma.membresia.deleteMany({
      where: {
        usuarioId: {
          in: ["egc4-user-declarada", "egc4-user-sin-version", "egc4-user-migrada"],
        },
      },
    })
    await prisma.usuario.deleteMany({ where: { email: { startsWith: "egc4-" } } })
    await prisma.comunidad.deleteMany({
      where: { id: { in: [comunidadDeclarada, comunidadSinVersion, comunidadMigrada] } },
    })
  })

  async function limpiarEntidades(): Promise<void> {
    const enComunidades = { in: [comunidadDeclarada, comunidadSinVersion, comunidadMigrada] }
    await prisma.cobroFI.deleteMany({ where: { comunidadId: enComunidades } })
    await prisma.emisionGC.deleteMany({ where: { comunidadId: enComunidades } })
    await prisma.versionReglamento.deleteMany({ where: { comunidadId: enComunidades } })
    await prisma.vinculoUnidad.deleteMany({ where: { comunidadId: enComunidades } })
    await prisma.persona.deleteMany({ where: { comunidadId: enComunidades } })
    await prisma.unidad.deleteMany({ where: { comunidadId: enComunidades } })
    await prisma.tipoUnidad.deleteMany({ where: { comunidadId: enComunidades } })
    await prisma.fondoFI.deleteMany({ where: { comunidadId: enComunidades } })
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

  async function emitir(body: unknown): Promise<Response> {
    const ruta = await import("@/app/api/emisiones-gc/route")
    const req = new NextRequest("http://localhost/api/emisiones-gc", {
      method: "POST",
      body: typeof body === "string" ? body : JSON.stringify(body),
      headers: { "content-type": "application/json" },
    })
    return ruta.POST(req)
  }

  it("(a) sin ninguna versión declarada → 400 y no crea emisión ni cobros", async () => {
    await conSesion(emailAdminSinVersion, async () => {
      const res = await emitir({ periodo: "2026-07", modo: "fijo" })
      expect(res.status).toBe(400)
      expect(((await res.json()) as { error: string }).error).toBe(
        "Emisión bloqueada: la comunidad Comunidad Sin Versión no declaró una versión del reglamento vigente para el período 2026-07."
      )
    })
    expect(await prisma.emisionGC.count({ where: { comunidadId: comunidadSinVersion } })).toBe(0)
    expect(await prisma.cobroFI.count({ where: { comunidadId: comunidadSinVersion } })).toBe(0)
  })

  it("(b) la única versión es migracion_automatica → 400 y no crea nada", async () => {
    await conSesion(emailAdminMigrada, async () => {
      const res = await emitir({ periodo: "2026-07", modo: "fijo" })
      expect(res.status).toBe(400)
      expect(((await res.json()) as { error: string }).error).toBe(
        "Emisión bloqueada: la versión vigente de la comunidad Comunidad Migrada es una migración automática; la forma de contribución debe declararse por reglamento de copropiedad o acta de asamblea."
      )
    })
    expect(await prisma.emisionGC.count({ where: { comunidadId: comunidadMigrada } })).toBe(0)
    expect(await prisma.cobroFI.count({ where: { comunidadId: comunidadMigrada } })).toBe(0)
  })

  it("la versión vigente sin parámetros completos → 400 y no crea nada", async () => {
    await conSesion(emailAdminDeclarada, async () => {
      const res = await emitir({ periodo: "2027-02", modo: "fijo" })
      expect(res.status).toBe(400)
      expect(((await res.json()) as { error: string }).error).toBe(
        "Emisión bloqueada: los parámetros de la versión vigente de la comunidad Comunidad Declarada no son válidos."
      )
    })
    expect(
      await prisma.emisionGC.count({ where: { comunidadId: comunidadDeclarada, periodo: "2027-02" } })
    ).toBe(0)
  })

  it("(c) con fuente real, el vencimiento usa diasPagoGc y la reserva porcentajeReserva", async () => {
    await conSesion(emailAdminDeclarada, async () => {
      const res = await emitir({
        periodo: "2026-07",
        modo: "fijo",
        unidadIds: ["egc4-u-1"],
      })
      expect(res.status).toBe(201)
      const j = (await res.json()) as {
        emision: { id: string; fechaEmision: string; gastoTotal: number; fondoReservaAporte?: { monto: number } }
        cobros: { montoBase: number; fechaVencimiento: string }[]
      }
      // La versión declara 10 días de pago: el "+30" fijo ya no manda (S7).
      expect(j.cobros[0]?.fechaVencimiento).toBe(sumarDias(j.emision.fechaEmision, 10))
      // La versión declara 7% de reserva; el fondo declara 10% y NO se usa (S2).
      expect(j.emision.fondoReservaAporte?.monto).toBe(7000)
      expect(j.emision.gastoTotal).toBe(100000)
    })
  })

  it("(e) reserva declarada sin fondo de reserva activo → 400 y no escribe nada", async () => {
    // La versión que rige 2026-06 declara 7% de aporte al fondo de reserva (S2).
    // Sin fondo activo donde imputarlo, el aporte se perdería en silencio: la
    // emisión no puede correr (S5).
    await prisma.fondoFI.update({
      where: { id: "egc4-fondo-res" },
      data: { activo: false },
    })
    try {
      await conSesion(emailAdminDeclarada, async () => {
        const res = await emitir({
          periodo: "2026-06",
          modo: "fijo",
          unidadIds: ["egc4-u-1"],
        })
        expect(res.status).toBe(400)
        expect(((await res.json()) as { error: string }).error).toBe(
          "Emisión bloqueada: la versión vigente de la comunidad Comunidad Declarada declara un 7% de aporte al fondo de reserva y no existe un fondo de reserva activo donde imputarlo."
        )
      })
      expect(
        await prisma.emisionGC.count({
          where: { comunidadId: comunidadDeclarada, periodo: "2026-06" },
        })
      ).toBe(0)
      expect(
        await prisma.cobroFI.count({
          where: { comunidadId: comunidadDeclarada, periodo: "2026-06" },
        })
      ).toBe(0)
    } finally {
      await prisma.fondoFI.update({
        where: { id: "egc4-fondo-res" },
        data: { activo: true },
      })
    }
  })

  it("(d) la versión futura no rige un período anterior", async () => {
    await conSesion(emailAdminDeclarada, async () => {
      const res = await emitir({
        periodo: "2026-08",
        modo: "fijo",
        unidadIds: ["egc4-u-1"],
      })
      expect(res.status).toBe(201)
      const j = (await res.json()) as {
        emision: { fechaEmision: string; fondoReservaAporte?: { monto: number } }
        cobros: { fechaVencimiento: string }[]
      }
      expect(j.cobros[0]?.fechaVencimiento).toBe(sumarDias(j.emision.fechaEmision, 10))
      expect(j.emision.fondoReservaAporte?.monto).toBe(7000)
    })
  })

  it("(d) la versión que empieza a regir manda en el período siguiente", async () => {
    await conSesion(emailAdminDeclarada, async () => {
      const res = await emitir({
        periodo: "2026-10",
        modo: "fijo",
        unidadIds: ["egc4-u-1"],
      })
      expect(res.status).toBe(201)
      const j = (await res.json()) as {
        emision: { fechaEmision: string; fondoReservaAporte?: { monto: number } }
        cobros: { fechaVencimiento: string }[]
      }
      expect(j.cobros[0]?.fechaVencimiento).toBe(sumarDias(j.emision.fechaEmision, 20))
      expect(j.emision.fondoReservaAporte?.monto).toBe(5000)
    })
  })

  it("(f) reserva incluida en el presupuesto: la unidad paga lo mismo y el recargo se desagrega", async () => {
    await conSesion(emailAdminDeclarada, async () => {
      const res = await emitir({
        periodo: "2026-11",
        modo: "fijo",
        unidadIds: ["egc4-u-1"],
      })
      expect(res.status).toBe(201)
      const j = (await res.json()) as {
        emision: { gastoTotal: number; fondoReservaAporte?: { monto: number } | null }
        cobros: {
          montoBase: number
          lineas: { concepto: string; monto: number; fondoId?: string }[] | null
        }[]
      }
      // El residente paga exactamente lo de hoy (100.000): la reserva no se
      // suma, se desagrega del presupuesto que la asamblea ya aprobó.
      expect(j.cobros[0]?.montoBase).toBe(100000)
      // round(100.000 · 10 / 110) = 9.091; el gasto común queda en 90.909.
      expect(j.cobros[0]?.lineas).toEqual([
        { concepto: "gasto_comun", monto: 90909, fondoId: "egc4-fondo-gc" },
        { concepto: "gasto_comun", monto: 9091, fondoId: "egc4-fondo-res" },
      ])
      expect(j.cobros[0]?.lineas?.reduce((total, l) => total + l.monto, 0)).toBe(100000)
      expect(j.emision.fondoReservaAporte?.monto).toBe(9091)
      // El presupuesto emitido sigue siendo el de la asamblea.
      expect(j.emision.gastoTotal).toBe(100000)
    })
  })

  it("(g) reserva 0%: una sola línea y ningún aporte al fondo", async () => {
    await conSesion(emailAdminDeclarada, async () => {
      const res = await emitir({
        periodo: "2026-12",
        modo: "fijo",
        unidadIds: ["egc4-u-1"],
      })
      expect(res.status).toBe(201)
      const j = (await res.json()) as {
        emision: { gastoTotal: number; fondoReservaAporte?: { monto: number } | null }
        cobros: {
          montoBase: number
          lineas: { concepto: string; monto: number; fondoId?: string }[] | null
        }[]
      }
      expect(j.cobros[0]?.montoBase).toBe(100000)
      expect(j.cobros[0]?.lineas).toEqual([
        { concepto: "gasto_comun", monto: 100000, fondoId: "egc4-fondo-gc" },
      ])
      // Sin reserva declarada no hay línea de reserva ni aporte al fondo.
      expect(j.emision.fondoReservaAporte ?? null).toBeNull()
      expect(j.emision.gastoTotal).toBe(100000)
    })
  })
})
