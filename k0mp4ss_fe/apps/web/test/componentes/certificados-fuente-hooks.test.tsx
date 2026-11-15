// @vitest-environment jsdom
/**
 * Fija la migración de `comunidad/certificados` (ventana V1 de SERIE-DEUDA-6):
 * las liquidaciones PL y los cobros FI ya NO se leen del store legacy
 * (`liquidacionesPL` / `cobrosFI`) sino de `useLiquidaciones()` /
 * `useCobrosFI()`. El test alimenta los hooks con los datos reales y comprueba
 * además, sobre el fuente, que la página no nombra el store: desde F22a el store
 * no existe en el navegador, así que no hay señuelos que inyectar y el candado
 * es el mismo evaluador de `npm run audit:store`.
 *
 * Adaptación T13 (S10): el Select de unidad de `estado_cuenta`/`al_dia` pasó a
 * búsqueda server-side (`BuscadorEntidad` contra `/api/unidades?q=`); el test
 * del gate Al Día ahora elige la unidad por el buscador con un stub de fetch.
 * Adaptación T20 (S10): las cifras del papel y la decisión Al Día ya NO se
 * derivan en el cliente del pad de `useCobrosFI` —el servidor las calcula
 * sobre el conjunto completo y el componente imprime lo que él devuelve—, así
 * que el arnés ya no alimenta ninguna cifra de negocio con sus cobros.
 */
import React from "react"
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { archivosQueUsanElStore } from "./sin-store"
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

import CertificadosEmision from "@/app/comunidad/certificados/_componentes/certificados-emision"
import { TIPOS_CERTIFICADO_CT } from "@/lib/schemas"

/** Las cuatro tipologías: el caso de administración, que es el que estos tests cubren. */
const TIPOS_DEL_ARNES = TIPOS_CERTIFICADO_CT

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
  fuente.liquidaciones = []
  fuente.cobros = []
  fuente.cargandoLiquidaciones = false
  fuente.cargandoCobros = false
  fuente.crear.mockClear()
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
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

/**
 * Stub de la búsqueda server-side de unidades (T13/S10): el buscador de la
 * unidad consulta `GET /api/unidades?q=…&page=…` y acá el servidor simulado
 * devuelve UNA fila concreta —la misma unidad que el assert de negocio usa—.
 * Cualquier otra fetch rompe el test: el flujo de este arnés es todo hooks
 * mockeados, la única fetch real posible es la del buscador.
 */
function stubBuscarUnidad(unidad: { id: string; etiqueta: string; numero: string }): void {
  vi.stubGlobal(
    "fetch",
    vi.fn((recurso: string | URL | Request) => {
      const url = typeof recurso === "string" ? recurso : String(recurso)
      if (!url.startsWith("/api/unidades?q=")) {
        throw new Error(`Fetch inesperada en este flujo: ${url}`)
      }
      return Promise.resolve(
        new Response(
          JSON.stringify({ data: [unidad], page: 1, pageSize: 50, total: 1 }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      )
    })
  )
}

/**
 * Elige la unidad por el BUSCADOR server-side (T13): tipea el término, espera la
 * fila del servidor y la elige. Es la misma elección concreta que hacía el
 * listbox Radix del padrón truncado, por la misma unidad.
 */
async function elegirUnidadBuscada(
  user: ReturnType<typeof userEvent.setup>,
  unidad: { etiqueta: string; numero: string },
  termino: string
): Promise<void> {
  const input = screen.getByPlaceholderText("Buscar por etiqueta, número o rol SII…")
  await user.type(input, termino)
  await screen.findByText(`${unidad.etiqueta} ${unidad.numero}`)
  await user.click(screen.getByText(`${unidad.etiqueta} ${unidad.numero}`))
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
    fuente.cargandoLiquidaciones = true
    const { container } = render(<CertificadosEmision tiposEmisibles={[...TIPOS_DEL_ARNES]} />)

    // El skeleton reemplaza el contenido (mismo gate de carga de siempre, ahora
    // alimentado por los flags `isLoading` de los hooks). Desde T20 la pantalla
    // ya no consume el pad de cobros, así que el flag de la colección que queda
    // es el de liquidaciones.
    expect(screen.queryByRole("heading", { name: /Certificados/ })).toBeNull()
    expect(container.querySelector(".animate-pulse")).not.toBeNull()
  })

  it("las liquidaciones del select salen de useLiquidaciones (solo confirmadas) y no del store", async () => {
    // Sin store no hay señuelo posible: la propiedad se afirma sobre el fuente.
    expect(archivosQueUsanElStore("app/comunidad/certificados/page.tsx")).toEqual([])

    fuente.liquidaciones = [
      liquidacion({ id: "liq-hook-conf", folio: "PL-2026-07-0007", estado: "confirmada" }),
      liquidacion({ id: "liq-hook-borr", folio: "PL-2026-08-0008", estado: "borrador" }),
    ]

    const user = userEvent.setup()
    render(<CertificadosEmision tiposEmisibles={[...TIPOS_DEL_ARNES]} />)

    await elegir(user, 0, /Liquidación de Sueldo/i)

    const combos = screen.getAllByRole("combobox")
    await user.click(combos[1]!)
    const listbox = await screen.findByRole("listbox", {}, { timeout: 5_000 })
    const textos = within(listbox)
      .getAllByRole("option")
      .map((o) => o.textContent ?? "")

    expect(textos.some((t) => t.includes("PL-2026-07-0007"))).toBe(true)
    expect(textos.some((t) => t.includes("PL-2026-08-0008"))).toBe(false) // borrador
  }, PRESUPUESTO_CARGA)

  it("T20: el componente no deriva el estado Al Día — sin línea de saldo y con el 409 del servidor verbatim", async () => {
    expect(archivosQueUsanElStore("app/comunidad/certificados/page.tsx")).toEqual([])

    // Cobros en el pad del cliente: si el componente siguiera derivando el
    // saldo, mostraría «$5.000» y pre-gatearía con esa cifra. Ya no calcula
    // nada acá: el servidor decide sobre el libro completo de la unidad.
    fuente.cobros = [
      cobro({ id: "cob-hook-1", unidadId: "uni-hook", montoBase: 3_000 }),
      cobro({ id: "cob-hook-2", unidadId: "uni-hook", montoBase: 2_000 }),
      // otra unidad no debe sumar (y ya no suma en ninguna parte del cliente)
      cobro({ id: "cob-hook-3", unidadId: "uni-hook-2", montoBase: 50_000 }),
    ]
    // El servidor responde su 409 con el monto COMPLETO: es lo que se muestra.
    fuente.crear.mockResolvedValueOnce({
      ok: false as const,
      error:
        "No se puede emitir: la unidad mantiene $120.000 pendiente(s). El certificado Al Día exige saldo <= 0.",
    })

    // T13: la unidad sale de la búsqueda server-side; la fila devuelta es LA
    // MISMA unidad de los cobros del pad (uni-hook), así que cualquier cifra
    // derivada en el cliente sería visible si el defecto regresara.
    stubBuscarUnidad({ id: "uni-hook", etiqueta: "Depto", numero: "101" })
    const user = userEvent.setup()
    render(<CertificadosEmision tiposEmisibles={[...TIPOS_DEL_ARNES]} />)

    await elegir(user, 0, /Al Día/i)
    await elegirUnidadBuscada(user, { etiqueta: "Depto", numero: "101" }, "101")

    // Sin la línea derivada del pad: el saldo visible ya no se calcula acá.
    expect(screen.queryByText(/Saldo pendiente actual/)).toBeNull()

    await user.type(screen.getByPlaceholderText("Nombre de quien solicita"), "QA T20")
    await user.click(screen.getByRole("button", { name: /Generar certificado PDF firmado/ }))

    // La emisión LLEGA al servidor (el gate ya no es del cliente) sin ninguna
    // fila de cifras derivada: las calcula él sobre el conjunto completo.
    expect(fuente.crear).toHaveBeenCalledTimes(1)
    const registro = fuente.crear.mock.calls[0]?.[0] as {
      detalle: { clave: string; valor: string }[]
    }
    expect(registro.detalle.some((d) => d.clave === "Cobros registrados")).toBe(false)
    expect(registro.detalle.some((d) => d.clave === "Total cargado")).toBe(false)
    expect(registro.detalle.some((d) => d.clave === "Saldo pendiente")).toBe(false)

    // Y el 409 del servidor se muestra verbatim.
    expect(
      await screen.findByText(/No se puede emitir: la unidad mantiene \$120\.000/)
    ).toBeTruthy()
  }, PRESUPUESTO_CARGA)

  it("el registro emitido se construye con la liquidación que entrega el hook", async () => {
    fuente.liquidaciones = [
      liquidacion({ id: "liq-hook-conf", folio: "PL-2026-07-0007", estado: "confirmada" }),
    ]

    const user = userEvent.setup()
    render(<CertificadosEmision tiposEmisibles={[...TIPOS_DEL_ARNES]} />)

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
