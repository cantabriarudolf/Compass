// @vitest-environment jsdom
import React from "react"
import { beforeAll, beforeEach, afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { resetStore, lastEvent } from "../helpers"
import { useCompassStore } from "@/lib/store"
import { EncomiendasPanel } from "@/components/pe/encomiendas-panel"
import { VisitasPanel } from "@/components/pe/visitas-panel"
import { ContratistasPanel } from "@/components/pe/contratistas-panel"

vi.setConfig({ testTimeout: 30_000 })

/**
 * Presupuesto explícito por caso para los paneles PE (Radix Select/Dialog en jsdom).
 *
 * Los casos que abren comboboxes tardan ~5 s en aislamiento, pero la misma máquina bajo carga
 * (suite completa en paralelo, CI compartido) los estira por encima de los 30 s del default:
 * medido 26.8 s con 2 núcleos cargados y "Test timed out in 30000ms" con carga alta (E3 de la
 * serie deuda-3). Es presupuesto insuficiente, no comportamiento: el presupuesto global de
 * `vi.setConfig` no alcanza, así que se fija uno por caso con el objeto de opciones.
 *
 * NO usar `test.use({ timeout })`: no es un fixture válido en Vitest y se ignora en silencio
 * (lección de la corrección de `e2e/crud/proyectos.spec.ts`).
 */
const PRESUPUESTO_CARGA = 120_000

const HOY = new Date().toISOString().slice(0, 10)

beforeAll(() => {
  // Radix (Select/Switch/Dialog) en jsdom necesita estos stubs del prototipo:
  // ResizeObserver para el Popper del Select, scroll/pointer para la interacción.
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
})

afterEach(() => {
  cleanup()
})

/** Abre el N-ésimo combobox del scope y elige la primera opción real (salta "Sin ..."). */
async function elegirOpcion(user: ReturnType<typeof userEvent.setup>, comboIndex: number) {
  const combos = screen.getAllByRole("combobox")
  await user.click(combos[comboIndex]!)
  // Opciones SOLO del listbox abierto (portales cerrados pueden quedar un tick en el DOM)
  const listbox = await screen.findByRole("listbox", {}, { timeout: 5_000 })
  const opciones = within(listbox).getAllByRole("option")
  const real = opciones.find((o) => !/^Sin /.test(o.textContent ?? "")) ?? opciones[0]!
  await user.click(real)
}

describe("EncomiendasPanel (componente, RTL)", () => {
  it("renderiza el form y la tabla vacía del día", { timeout: PRESUPUESTO_CARGA }, () => {
    render(<EncomiendasPanel diaReporte={HOY} onError={vi.fn()} onSuccess={vi.fn()} />)
    expect(screen.getByText(/Encomiendas del día/)).toBeTruthy()
    expect(screen.getByText("Sin encomiendas para esta fecha.")).toBeTruthy()
    expect(screen.getByLabelText("Descripción del paquete")).toBeTruthy()
  })

  it("recibe una encomienda TEST: fila + store + evento auditado", { timeout: PRESUPUESTO_CARGA }, async () => {
    const user = userEvent.setup()
    const onSuccess = vi.fn()
    const onError = vi.fn()
    const antes = useCompassStore.getState().encomiendasPE.length

    render(<EncomiendasPanel diaReporte={HOY} onError={onError} onSuccess={onSuccess} />)

    await elegirOpcion(user, 0) // Courier
    await elegirOpcion(user, 1) // Destinatario
    await elegirOpcion(user, 2) // Unidad
    await user.type(screen.getByLabelText("Descripción del paquete"), "TEST-RTL paquete")
    await user.click(screen.getByRole("button", { name: /Registrar recepción/ }))

    expect(onError.mock.calls.filter((c) => c[0]).map((c) => JSON.stringify(c[0]))).toEqual([])
    const despues = useCompassStore.getState().encomiendasPE
    expect(despues.length).toBe(antes + 1)
    expect(screen.getByText("TEST-RTL paquete")).toBeTruthy()
    expect(screen.getByText("Recibida")).toBeTruthy()
    expect(onSuccess).toHaveBeenCalled()
    expect(lastEvent()?.tipoAccion).toBe("PE_ENCOMIENDA_RECIBIDA")
  })

  it("retiro de encomienda: dialog exige retiradoPor y marca Retirada", { timeout: PRESUPUESTO_CARGA }, async () => {
    const user = userEvent.setup()
    const onSuccess = vi.fn()
    render(<EncomiendasPanel diaReporte={HOY} onError={vi.fn()} onSuccess={onSuccess} />)

    await elegirOpcion(user, 0)
    await elegirOpcion(user, 1)
    await elegirOpcion(user, 2)
    await user.type(screen.getByLabelText("Descripción del paquete"), "TEST-RTL retiro")
    await user.click(screen.getByRole("button", { name: /Registrar recepción/ }))

    await user.click(screen.getByRole("button", { name: "Registrar retiro" }))
    const dialogo = screen.getByRole("dialog")
    const retPor = within(dialogo).getByLabelText("Retirado por *")
    await user.clear(retPor)
    await user.type(retPor, "María TEST")
    await user.click(within(dialogo).getByRole("button", { name: "Confirmar retiro" }))

    expect(onSuccess).toHaveBeenCalledWith("Retiro registrado.")
    expect(await screen.findByText(/Retirada por María TEST/)).toBeTruthy()
    const estado = useCompassStore.getState().encomiendasPE.at(-1)?.estado
    expect(estado).toBe("retirada")
  })
})

describe("VisitasPanel (componente, RTL)", () => {
  it("registrar visita sin aviso: fila + store + evento", { timeout: PRESUPUESTO_CARGA }, async () => {
    const user = userEvent.setup()
    const onError = vi.fn()
    const onSuccess = vi.fn()
    const antes = useCompassStore.getState().bitacoraVisitasPE.length

    render(<VisitasPanel diaReporte={HOY} onError={onError} onSuccess={onSuccess} />)

    await user.type(screen.getByLabelText("Nombre *"), "Visitante TEST-RTL")
    await user.type(screen.getByLabelText("DNI *"), "16.444.555-0")
    await elegirOpcion(user, 0) // Jornada
    await elegirOpcion(user, 1) // Unidad destino
    await user.click(screen.getByRole("button", { name: /Registrar visita/ }))

    expect(onError.mock.calls.filter((c) => c[0]).map((c) => JSON.stringify(c[0]))).toEqual([])
    await waitFor(() => expect(useCompassStore.getState().bitacoraVisitasPE.length).toBe(antes + 1))
    expect(screen.getByText("Visitante TEST-RTL")).toBeTruthy()
    expect(lastEvent()?.tipoAccion).toBe("PE_VISITA_INGRESADA")
  })

  it("pre-agendada: estado Agendada hasta confirmar ingreso", { timeout: PRESUPUESTO_CARGA }, async () => {
    const user = userEvent.setup()
    const antes = useCompassStore.getState().visitasTecnicasPE.length

    render(<VisitasPanel diaReporte={HOY} onError={vi.fn()} onSuccess={vi.fn()} />)

    await user.type(screen.getByLabelText("Nombre *"), "Visita Agendada TEST")
    await user.type(screen.getByLabelText("DNI *"), "16.444.555-0")
    await elegirOpcion(user, 0) // Jornada
    await elegirOpcion(user, 1) // Unidad destino
    await user.click(screen.getByRole("switch"))
    await user.click(screen.getByRole("button", { name: /Registrar visita/ }))

    await waitFor(() => expect(useCompassStore.getState().bitacoraVisitasPE.length).toBe(antes + 1))
    const visita = useCompassStore.getState().bitacoraVisitasPE.at(-1)
    expect(visita?.estado).toBe("agendada")
    expect(lastEvent()?.tipoAccion).not.toBe("PE_VISITA_INGRESADA")
  })
})

describe("ContratistasPanel (componente, RTL)", () => {
  it("valida motivo corto con onError y sin mutar store", { timeout: PRESUPUESTO_CARGA }, async () => {
    const user = userEvent.setup()
    const onError = vi.fn()
    const antes = useCompassStore.getState().ingresosContratistasPE.length

    render(<ContratistasPanel diaReporte={HOY} onError={onError} onSuccess={vi.fn()} />)

    await user.click(screen.getByRole("button", { name: /Agendar ingreso/ }))
    expect(onError).toHaveBeenCalledWith("Seleccione la empresa del maestro de contratistas.")
    expect(useCompassStore.getState().ingresosContratistasPE.length).toBe(antes)
  })

  it("agendar ingreso TEST: fila + store + evento", { timeout: PRESUPUESTO_CARGA }, async () => {
    const user = userEvent.setup()
    const onError = vi.fn()
    const antes = useCompassStore.getState().ingresosContratistasPE.length

    render(<ContratistasPanel diaReporte={HOY} onError={onError} onSuccess={vi.fn()} />)

    await elegirOpcion(user, 0) // Empresa (maestro contratistas)
    await user.type(screen.getByLabelText("Motivo específico del ingreso *"), "TEST-RTL reparación")
    await elegirOpcion(user, 1) // Jornada
    await user.click(screen.getByRole("button", { name: /Agendar ingreso/ }))

    expect(onError.mock.calls.filter((c) => c[0]).map((c) => JSON.stringify(c[0]))).toEqual([])
    expect(useCompassStore.getState().ingresosContratistasPE.length).toBe(antes + 1)
    expect(screen.getByText(/TEST-RTL reparación/)).toBeTruthy()
  })
})
