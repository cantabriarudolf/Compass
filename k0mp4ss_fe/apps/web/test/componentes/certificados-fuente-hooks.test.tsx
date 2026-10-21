// @vitest-environment jsdom
/**
 * Fija la migración de `comunidad/certificados` (ventana V1 de SERIE-DEUDA-6):
 * las liquidaciones PL y los cobros FI ya NO se leen del store legacy
 * (`liquidacionesPL` / `cobrosFI`) sino de `useLiquidaciones()` /
 * `useCobrosFI()`. El test alimenta el store legacy con datos señuelo y los
 * hooks con los datos reales: si la página volviera al store, los señuelos
 * aparecerían en el DOM y estas aserciones fallarían.
 */
import React from "react"
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { resetStore } from "../helpers"
import { useCompassStore } from "@/lib/store"
import type { CobroFI, LiquidacionPL } from "@/lib/schemas"

/**
 * Estado mutable compartido entre el test y las factories de `vi.mock`
 * (`vi.hoisted` es lo único que existe antes de los imports del módulo).
 */
const fuente = vi.hoisted(() => ({
  liquidaciones: [] as unknown[],
  cobros: [] as unknown[],
  cargandoLiquidaciones: false,
  cargandoCobros: false,
  // Firma con parámetro declarado para poder inspeccionar `mock.calls` sin
  // una función sin usar (lint warnings cero).
  crear: vi.fn<(registro: unknown) => Promise<{ ok: false; error: string }>>(
    async () => ({ ok: false as const, error: "Sin POST en el test (paridad)" })
  ),
  remove: vi.fn(async () => ({ ok: true as const })),
}))

const PERSONAS = [
  {
    id: "per-trabajador-hook",
    nombres: "Ana",
    apellidos: "Hook",
    rut: "11.111.111-1",
    nombreCompleto: "Ana Hook",
    datosGobernanza: null,
  },
  {
    id: "per-propietario-hook",
    nombres: "Bruno",
    apellidos: "Propietario",
    rut: "22.222.222-2",
    nombreCompleto: "Bruno Propietario",
    datosGobernanza: null,
  },
]

const UNIDADES = [
  { id: "uni-hook", etiqueta: "Depto", numero: "101" },
  { id: "uni-hook-2", etiqueta: "Depto", numero: "102" },
]

const VINCULOS = [
  { id: "vin-hook", personaId: "per-propietario-hook", unidadId: "uni-hook", rol: "propietario" },
]

vi.mock("@/lib/api/use-certificados-ct", () => ({
  useCertificadosCT: () => ({
    items: [],
    total: 0,
    isLoading: false,
    error: null,
    create: fuente.crear,
    update: vi.fn(),
    remove: fuente.remove,
  }),
}))

vi.mock("@/lib/api/use-personas", () => ({
  usePersonas: () => ({
    personas: PERSONAS,
    isLoading: false,
    error: null,
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  }),
}))

vi.mock("@/lib/api/use-unidades", () => ({
  useUnidades: () => ({
    items: UNIDADES,
    total: UNIDADES.length,
    isLoading: false,
    error: null,
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  }),
}))

vi.mock("@/lib/api/use-vinculos", () => ({
  useVinculos: () => ({
    vinculos: VINCULOS,
    isLoading: false,
    error: null,
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  }),
}))

vi.mock("@/lib/api/use-configuracion", () => ({
  useConfiguracion: () => ({
    config: null,
    isLoading: false,
    error: null,
    updateConfig: vi.fn(),
  }),
}))

vi.mock("@/lib/api/use-periodos-directiva", () => ({
  usePeriodosDirectiva: () => ({
    periodos: [],
    vigente: undefined,
    isLoading: false,
    error: null,
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    cerrar: vi.fn(),
  }),
}))

vi.mock("@/lib/api/use-liquidaciones", () => ({
  useLiquidaciones: () => ({
    items: fuente.liquidaciones,
    liquidaciones: fuente.liquidaciones,
    total: fuente.liquidaciones.length,
    isLoading: fuente.cargandoLiquidaciones,
    error: null,
    remove: fuente.remove,
    generar: vi.fn(),
    confirmar: vi.fn(),
  }),
}))

vi.mock("@/lib/api/use-cobros-fi", () => ({
  useCobrosFI: () => ({
    items: fuente.cobros,
    total: fuente.cobros.length,
    isLoading: fuente.cargandoCobros,
    error: null,
    create: vi.fn(),
    update: vi.fn(),
    remove: fuente.remove,
  }),
}))

import CertificadosPage from "@/app/comunidad/certificados/page"

const PRESUPUESTO_CARGA = 120_000

beforeAll(() => {
  // Radix (Select) en jsdom necesita los stubs del popper.
  window.HTMLElement.prototype.scrollIntoView = vi.fn()
  window.HTMLElement.prototype.scrollTo = vi.fn()
  Object.defineProperty(window.HTMLElement.prototype, "hasPointerCapture", {
    value: () => false,
    configurable: true,
  })
  Object.defineProperty(window.HTMLElement.prototype, "releasePointerCapture", {
    value: () => {},
    configurable: true,
  })
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  Object.defineProperty(window, "ResizeObserver", {
    value: ResizeObserverStub,
    configurable: true,
    writable: true,
  })
})

beforeEach(() => {
  resetStore()
  fuente.liquidaciones = []
  fuente.cobros = []
  fuente.cargandoLiquidaciones = false
  fuente.cargandoCobros = false
  fuente.crear.mockClear()
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

/** Abre el N-ésimo combobox de la página y elige la opción cuyo texto matchea. */
async function elegir(user: ReturnType<typeof userEvent.setup>, comboIndex: number, texto: RegExp) {
  const combos = screen.getAllByRole("combobox")
  await user.click(combos[comboIndex]!)
  const listbox = await screen.findByRole("listbox", {}, { timeout: 5_000 })
  const opcion = within(listbox)
    .getAllByRole("option")
    .find((o) => texto.test(o.textContent ?? ""))
  if (!opcion) {
    throw new Error(
      `No hay opción que matchee ${String(texto)} en el combobox ${comboIndex}: ${within(listbox)
        .getAllByRole("option")
        .map((o) => o.textContent)
        .join(" | ")}`
    )
  }
  await user.click(opcion)
}

function liquidacion(parcial: Partial<LiquidacionPL> & Pick<LiquidacionPL, "id" | "folio" | "estado">): LiquidacionPL {
  return {
    trabajadorPersonaId: "per-trabajador-hook",
    periodo: "2026-07",
    fechaGeneracion: "2026-07-31",
    diasTrabajados: 30,
    sueldoBaseContrato: 900_000,
    diasMesComercial: 30,
    jornadaSemanal: 44,
    sueldoBaseProporcional: 900_000,
    horasExtrasHoras: 0,
    valorHoraOrdinaria: 5_000,
    montoHorasExtras: 0,
    bonos: [],
    gratificacionLegal: 0,
    totalImponible: 1_000_000,
    asignacionMovilizacion: 0,
    asignacionColacion: 0,
    cargas: 0,
    montoAsignacionFamiliar: 0,
    totalHaberes: 1_200_000,
    nombreAfp: "AFP Modelo",
    tasaAFP: 10,
    montoAFP: 100_000,
    nombreSalud: "Fonasa",
    saludTipo: "fonasa",
    montoSalud: 70_000,
    tasaSIS: 1.5,
    montoSIS: 15_000,
    montoSeguroCesantia: 6_000,
    montoAPV: 0,
    totalDescuentos: 191_000,
    descuentoAnticipos: 0,
    adelantosIds: [],
    alcanceLiquido: 1_009_000,
    liquidoAPagar: 1_009_000,
    ...parcial,
  }
}

function cobro(parcial: Partial<CobroFI> & Pick<CobroFI, "id" | "unidadId" | "montoBase">): CobroFI {
  return {
    periodo: "2026-07",
    concepto: "gasto_comun",
    origenModulo: "FI",
    fondoId: "fondo-hook",
    descripcion: "Gasto común julio",
    fechaCargo: "2026-07-01",
    moras: [],
    pagos: [],
    diferencias: [],
    ...parcial,
  }
}

describe("comunidad/certificados — fuente de datos vía hooks SWR", () => {
  it("muestra el estado de carga mientras un hook de la colección sigue cargando", () => {
    fuente.cargandoCobros = true
    const { container } = render(<CertificadosPage />)

    // El skeleton reemplaza el contenido (mismo gate de carga de siempre, ahora
    // alimentado por los flags `isLoading` de los hooks).
    expect(screen.queryByRole("heading", { name: /Certificados/ })).toBeNull()
    expect(container.querySelector(".animate-pulse")).not.toBeNull()
  })

  it("las liquidaciones del select salen de useLiquidaciones (solo confirmadas) y no del store", async () => {
    // Señuelos en el store legacy: si la página volviera a leer el store, aparecerían.
    useCompassStore.setState({
      liquidacionesPL: [
        liquidacion({ id: "liq-legacy", folio: "PL-LEGACY-0001", estado: "confirmada" }),
      ],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)

    fuente.liquidaciones = [
      liquidacion({ id: "liq-hook-conf", folio: "PL-2026-07-0007", estado: "confirmada" }),
      liquidacion({ id: "liq-hook-borr", folio: "PL-2026-08-0008", estado: "borrador" }),
    ]

    const user = userEvent.setup()
    render(<CertificadosPage />)

    await elegir(user, 0, /Liquidación de Sueldo/i)

    const combos = screen.getAllByRole("combobox")
    await user.click(combos[1]!)
    const listbox = await screen.findByRole("listbox", {}, { timeout: 5_000 })
    const textos = within(listbox)
      .getAllByRole("option")
      .map((o) => o.textContent ?? "")

    expect(textos.some((t) => t.includes("PL-2026-07-0007"))).toBe(true)
    expect(textos.some((t) => t.includes("PL-2026-08-0008"))).toBe(false) // borrador
    expect(textos.some((t) => t.includes("PL-LEGACY-0001"))).toBe(false) // store legacy
  }, PRESUPUESTO_CARGA)

  it("el gate Al Día se calcula con los cobros de useCobrosFI y no con el store", async () => {
    useCompassStore.setState({
      cobrosFI: [cobro({ id: "cob-legacy", unidadId: "uni-hook", montoBase: 999_000 })],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)

    fuente.cobros = [
      cobro({ id: "cob-hook-1", unidadId: "uni-hook", montoBase: 3_000 }),
      cobro({ id: "cob-hook-2", unidadId: "uni-hook", montoBase: 2_000 }),
      // otro unidad no debe sumar
      cobro({ id: "cob-hook-3", unidadId: "uni-hook-2", montoBase: 50_000 }),
    ]

    const user = userEvent.setup()
    render(<CertificadosPage />)

    await elegir(user, 0, /Al Día/i)
    await elegir(user, 1, /101/)

    // 3.000 + 2.000 del hook (el señuelo del store diría $999.000).
    expect(await screen.findByText(/Saldo pendiente actual: \$5\.000/)).toBeTruthy()
  }, PRESUPUESTO_CARGA)

  it("el registro emitido se construye con la liquidación que entrega el hook", async () => {
    fuente.liquidaciones = [
      liquidacion({ id: "liq-hook-conf", folio: "PL-2026-07-0007", estado: "confirmada" }),
    ]

    const user = userEvent.setup()
    render(<CertificadosPage />)

    await elegir(user, 0, /Liquidación de Sueldo/i)
    await elegir(user, 1, /PL-2026-07-0007/)
    await user.type(screen.getByPlaceholderText("Nombre de quien solicita"), "QA Hook")
    await user.click(screen.getByRole("button", { name: /Generar certificado PDF firmado/ }))

    expect(fuente.crear).toHaveBeenCalledTimes(1)
    const registro = fuente.crear.mock.calls[0]?.[0] as {
      tipo: string
      resumen: string
      origenRef?: string
      personaId?: string
      detalle: { clave: string; valor: string }[]
    }
    expect(registro.tipo).toBe("liquidacion_sueldo")
    expect(registro.origenRef).toBe("liq-hook-conf")
    expect(registro.personaId).toBe("per-trabajador-hook")
    expect(registro.resumen).toContain("PL-2026-07-0007")
    expect(registro.resumen).toContain("Ana Hook")
    expect(registro.detalle).toEqual(
      expect.arrayContaining([
        { clave: "Folio liquidación", valor: "PL-2026-07-0007" },
        { clave: "Periodo", valor: "2026-07" },
      ])
    )
  }, PRESUPUESTO_CARGA)
})
