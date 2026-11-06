/**
 * @vitest-environment node
 *
 * Una sola aritmética para el vencimiento (higiene, S6).
 *
 * `app/api/emisiones-gc` sembraba el `fechaVencimiento` del cargo con su propia
 * cuenta — `setDate` sobre un `Date` LOCAL — y `app/api/avisos-cobro` derivaba
 * la del papel con otra (`vencimientoAviso`, días corridos sobre UTC). Dos
 * cuentas de la misma fecha son una deuda: la emisión podía sembrar una fecha
 * que el aviso después tuviera que corregir, y la corrección parecía la regla.
 *
 * Este archivo fija la invariante observable que el refactor debe conservar:
 *
 *     fechaVencimiento del cargo emitido
 *       == vencimiento del aviso
 *       == vencimientoAviso(fechaEmision, diasPagoGc de la versión vigente)
 *
 * y que la emisión del aviso NO tenga que tocar el cargo: la fecha que el papel
 * deriva ya está en el cargo desde que nació. Es el mismo comportamiento de
 * antes (en este servidor, offset oeste de UTC, las dos cuentas coincidían); por
 * eso el archivo se corrió también contra el código anterior y quedó verde:
 * documenta lo que no debía cambiar.
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

const COMUNIDAD = "vun-com-a"
const EMAIL_ADMIN = "vun-admin@test.cl"
const USUARIO_ADMIN = "vun-user-admin"
const UNIDAD = "vun-u-1"
const FONDO_GC = "vun-fondo-gc"
const TIPO_UNIDAD = "vun-tu-1"

/** Plazo que declara la versión vigente de esta comunidad. */
const DIAS_PAGO = 10

/** Período corriente: la emisión y el aviso usan `hoyISO()`, así coinciden. */
const PERIODO = hoyISO().slice(0, 7)

const PARAMETROS = {
  // Sin aporte al fondo de reserva: este archivo mide una fecha, no un reparto.
  porcentajeReserva: 0,
  diasPagoGc: DIAS_PAGO,
  tasaMoraMensualPct: 1,
  topeMoraPct: 50,
  cuotasCorte: 3,
  diasPreavisoCorte: 5,
  ipcActivo: false,
}

type Respuesta = { status: number; json: Record<string, unknown> }

interface CargoJson {
  id: string
  unidadId: string
  fechaVencimiento: string | null
}

interface AvisoJson {
  id: string
  unidadId: string
  folio: string
  fechaEmision: string
  vencimiento: string | null
  contenido: { cargos: Array<{ id: string; fechaVencimiento: string | null }> }
}

describe("vencimiento del cargo y del aviso — una sola función (S6)", () => {
  async function conSesion(fn: () => Promise<void>): Promise<void> {
    const { cookieSesionAuthjs } = await import("../helpers/sesion-authjs")
    state.cookie = await cookieSesionAuthjs({ sub: USUARIO_ADMIN, email: EMAIL_ADMIN })
    try {
      await fn()
    } finally {
      state.cookie = ""
    }
  }

  async function llamar(
    modulo: Promise<unknown>,
    metodo: "POST",
    ruta: string,
    body: unknown
  ): Promise<Respuesta> {
    const m = (await modulo) as Record<
      string,
      ((req: NextRequest) => Promise<Response>) | undefined
    >
    const handler = m[metodo]
    if (!handler) throw new Error(`handler no encontrado: ${metodo} ${ruta}`)
    const res = await handler(
      new NextRequest(`http://localhost/api/${ruta}`, {
        method: metodo,
        body: JSON.stringify(body),
        headers: { "content-type": "application/json" },
      })
    )
    return {
      status: res.status,
      json: (await res.json().catch(() => ({}))) as Record<string, unknown>,
    }
  }

  async function emitirGc(body: Record<string, unknown>): Promise<Respuesta> {
    return llamar(
      import("@/app/api/emisiones-gc/route"),
      "POST",
      "emisiones-gc",
      body
    )
  }

  async function emitirAvisos(body: Record<string, unknown>): Promise<Respuesta> {
    return llamar(
      import("@/app/api/avisos-cobro/route"),
      "POST",
      "avisos-cobro",
      body
    )
  }

  /** `fechaVencimiento` del cargo del período, tal como está en la base. */
  async function vencimientoDelCargo(): Promise<string | null> {
    const cargo = await prisma.cobroFI.findFirst({
      where: { comunidadId: COMUNIDAD, periodo: PERIODO },
      select: { fechaVencimiento: true },
    })
    return cargo?.fechaVencimiento ?? null
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
      data: { id: COMUNIDAD, nombre: "Comunidad Vencimiento Unico", slug: "vun-a" },
    })
    await prisma.usuario.create({
      data: { id: USUARIO_ADMIN, email: EMAIL_ADMIN, activo: true },
    })
    await prisma.membresia.create({
      data: { usuarioId: USUARIO_ADMIN, comunidadId: COMUNIDAD, rol: "administrador" },
    })
    await prisma.tipoUnidad.create({
      data: {
        id: TIPO_UNIDAD,
        comunidadId: COMUNIDAD,
        nombre: "Departamento 60m2",
        categoria: "departamento",
        metraje: 60,
        montoBaseGc: 60_000,
        activo: true,
        historialTarifas: [],
      },
    })
    await prisma.unidad.create({
      data: {
        id: UNIDAD,
        comunidadId: COMUNIDAD,
        microSectorId: "vun-ms-1",
        numero: "101",
        etiqueta: "Depto 101",
        tipoUnidadId: TIPO_UNIDAD,
        metraje: 60,
        prorrateo: 1,
        rolSii: "9999-101",
        estadoId: "vun-est-1",
        servicios: {},
      },
    })
    // El residente que paga: la emisión exige responsable de cobro vigente.
    await prisma.persona.create({
      data: {
        id: "vun-p-1",
        comunidadId: COMUNIDAD,
        rut: "11111111-1",
        nombreCompleto: "Persona Propietaria",
        nombres: "Persona",
        apellidos: "Propietaria",
        email: "vun-p-1@test.cl",
        telefonoMovil: "+56900000000",
        estadoCuenta: "activa",
        condicionesEspecialesIds: [],
        roles: [],
      },
    })
    await prisma.vinculoUnidad.create({
      data: {
        id: "vun-v-1",
        comunidadId: COMUNIDAD,
        personaId: "vun-p-1",
        unidadId: UNIDAD,
        rol: "propietario",
        fechaInicio: "2025-01-01",
        permiteVerFinanzas: true,
      },
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
        id: "vun-vreg-1",
        comunidadId: COMUNIDAD,
        version: 1,
        vigenteDesde: "2026-01",
        fuenteInstrumento: "reglamento_copropiedad",
        actaRef: null,
        formaContribucion: "monto_por_tipo",
        parametros: PARAMETROS,
      } as never,
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

  it("la emisión siembra la fecha que el aviso va a derivar, y el aviso no la corrige", async () => {
    const esperado = vencimientoAviso(hoyISO(), DIAS_PAGO)
    expect(esperado).not.toBeNull()

    await conSesion(async () => {
      const emision = await emitirGc({ periodo: PERIODO, modo: "fijo" })
      expect(emision.status).toBe(201)
      const cobros = emision.json.cobros as CargoJson[]
      expect(cobros).toHaveLength(1)
      // La emisión usa la MISMA aritmética que el aviso (UTC, días corridos).
      expect(cobros[0]!.unidadId).toBe(UNIDAD)
      expect(cobros[0]!.fechaVencimiento).toBe(esperado)
      expect(await vencimientoDelCargo()).toBe(esperado)

      const aviso = await emitirAvisos({ periodo: PERIODO })
      expect(aviso.status).toBe(201)
      const avisos = aviso.json.avisos as AvisoJson[]
      expect(avisos).toHaveLength(1)
      // El papel deriva exactamente la fecha que el cargo ya traía.
      expect(avisos[0]!.vencimiento).toBe(esperado)
      expect(avisos[0]!.fechaEmision).toBe(hoyISO())
      // La copia congelada del cargo dice lo mismo que la columna del aviso.
      expect(avisos[0]!.contenido.cargos[0]!.fechaVencimiento).toBe(esperado)
    })

    // La alineación del aviso no tuvo nada que corregir: el cargo sigue igual.
    expect(await vencimientoDelCargo()).toBe(esperado)
  })

  it("una fecha explícita en la emisión se respeta (no la pisa la cuenta compartida)", async () => {
    await prisma.avisoCobro.deleteMany({ where: { comunidadId: COMUNIDAD } })
    await prisma.cobroFI.deleteMany({ where: { comunidadId: COMUNIDAD } })
    await prisma.emisionGC.deleteMany({ where: { comunidadId: COMUNIDAD } })

    const fechaDelAdministrador = `${PERIODO}-28`
    await conSesion(async () => {
      const emision = await emitirGc({
        periodo: PERIODO,
        modo: "fijo",
        fechaVencimiento: fechaDelAdministrador,
      })
      expect(emision.status).toBe(201)
      const cobros = emision.json.cobros as CargoJson[]
      expect(cobros).toHaveLength(1)
      expect(cobros[0]!.fechaVencimiento).toBe(fechaDelAdministrador)
    })
    expect(await vencimientoDelCargo()).toBe(fechaDelAdministrador)
  })
})
