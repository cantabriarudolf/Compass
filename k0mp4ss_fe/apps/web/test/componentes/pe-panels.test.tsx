// @vitest-environment jsdom
import React from "react"
import { beforeAll, beforeEach, afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { resetStore, lastEvent } from "../helpers"
import { instalarEntornoRadix } from "./entorno-radix"
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

/** URL del QR del anverso de la cédula de Juan Pérez González (p-1, 15.123.456-9). */
const URL_CEDULA_P1 =
  "https://www.registrocivil.cl/servicios-en-linea/valida-documento?RUN=15.123.456-9&type=CEDULA"
/** RUN válido que NO está en el padrón de los mocks: fuerza la visita externa. */
const URL_CEDULA_EXTERNA =
  "https://www.registrocivil.cl/servicios-en-linea/valida-documento?RUN=19.876.543-0&type=CEDULA"

const PERSONA_P1 = {
  id: "p-1",
  rut: "15.123.456-9",
  nombreCompleto: "Juan Pérez González",
  nombres: "Juan",
  apellidos: "Pérez González",
}

function json(cuerpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(cuerpo), {
    status,
    headers: { "content-type": "application/json" },
  })
}

/**
 * Cámara falsa para jsdom: `getUserMedia` devuelve un stream con `stop()` espiable.
 * La limpieza (afterEach) borra `mediaDevices` para no contaminar otros paneles.
 */
function instalarCamara(): void {
  const stream = { getTracks: () => [{ stop: vi.fn() }] } as unknown as MediaStream
  Object.defineProperty(navigator, "mediaDevices", {
    value: { getUserMedia: vi.fn(async () => stream) },
    configurable: true,
  })
}

/** `BarcodeDetector` falso: devuelve el valor indicado y luego vacío. */
function instalarDetector(valor: string): void {
  let entregado = false
  class DetectorFalso {
    detect = async () => {
      if (entregado) return []
      entregado = true
      return [{ rawValue: valor }]
    }
  }
  Object.defineProperty(globalThis, "BarcodeDetector", {
    value: DetectorFalso,
    configurable: true,
    writable: true,
  })
}

beforeAll(() => {
  // Radix (Select/Switch/Dialog) en jsdom: el bloque de stubs vive en `entorno-radix.ts`.
  instalarEntornoRadix()
  // jsdom no implementa la reproducción de media: el preview del escáner la usa.
  vi.spyOn(window.HTMLMediaElement.prototype, "play").mockResolvedValue(undefined)
})

beforeEach(() => {
  resetStore()
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  delete (globalThis as { BarcodeDetector?: unknown }).BarcodeDetector
  Object.defineProperty(navigator, "mediaDevices", { value: undefined, configurable: true })
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

/**
 * Busca y elige una unidad destino del servidor (F6: «Unidad destino» es un combobox buscable).
 *
 * El stub responde `GET /api/unidades?q=` con una unidad del seed y deja el resto de la
 * colección vacío, para que la búsqueda de personas del QR siga viéndose igual.
 */
async function elegirUnidadDestino(user: ReturnType<typeof userEvent.setup>) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) =>
      String(url).startsWith("/api/unidades")
        ? json({
            data: [{ id: "u-A-101", numero: "101", etiqueta: "Depto", rolSii: "123-A11" }],
            page: 1,
            pageSize: 25,
            total: 1,
          })
        : json({ data: [], page: 1, pageSize: 10, total: 0 })
    )
  )
  await user.type(screen.getByLabelText("Unidad destino"), "101")
  const lista = await screen.findByRole(
    "listbox",
    { name: /Resultados de Unidad destino/ },
    { timeout: 10_000 }
  )
  await user.click(await within(lista).findByRole("option", { name: /Depto 101/ }))
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
    await elegirUnidadDestino(user)
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
    await elegirUnidadDestino(user)
    await user.click(screen.getByRole("switch"))
    await user.click(screen.getByRole("button", { name: /Registrar visita/ }))

    await waitFor(() => expect(useCompassStore.getState().bitacoraVisitasPE.length).toBe(antes + 1))
    const visita = useCompassStore.getState().bitacoraVisitasPE.at(-1)
    expect(visita?.estado).toBe("agendada")
    expect(lastEvent()?.tipoAccion).not.toBe("PE_VISITA_INGRESADA")
  })

  it("Escanear QR de la cédula identifica al residente y NO registra la visita", { timeout: PRESUPUESTO_CARGA }, async () => {
    const user = userEvent.setup()
    const antes = useCompassStore.getState().bitacoraVisitasPE.length
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json({ data: [PERSONA_P1], page: 1, pageSize: 10, total: 1 }))
    )
    instalarCamara()
    instalarDetector(URL_CEDULA_P1)

    render(<VisitasPanel diaReporte={HOY} onError={vi.fn()} onSuccess={vi.fn()} />)

    await user.click(screen.getByRole("button", { name: /Escanear QR de la cédula/ }))
    expect(screen.getByRole("region", { name: "Escáner de QR de la cédula" })).toBeTruthy()

    const resultado = await screen.findByRole(
      "region",
      { name: "Resultado del escaneo" },
      { timeout: 10_000 }
    )
    // Nombre, RUT enmascarado, unidad y vínculo antes de confirmar.
    expect(within(resultado).getByText("Juan Pérez González")).toBeTruthy()
    expect(within(resultado).getByText("15.***.***-9")).toBeTruthy()
    expect(within(resultado).getByText("Depto 101 · 123-A11")).toBeTruthy()
    expect(within(resultado).getByText("Propietario")).toBeTruthy()
    // El escaneo por sí solo NO registra nada.
    expect(useCompassStore.getState().bitacoraVisitasPE.length).toBe(antes)

    await user.click(within(resultado).getByRole("button", { name: /Confirmar identidad/ }))
    // La confirmación completa el formulario, tampoco guarda la visita.
    expect(useCompassStore.getState().bitacoraVisitasPE.length).toBe(antes)
    expect((screen.getByLabelText("Nombre *") as HTMLInputElement).value).toBe("Juan Pérez González")
    expect((screen.getByLabelText("DNI *") as HTMLInputElement).value).toBe("15123456-9")
    // La unidad del vínculo queda preseleccionada y visible en el control buscable.
    expect(screen.getByText("Depto 101 · 123-A11")).toBeTruthy()

    await user.click(screen.getByRole("button", { name: /Registrar visita/ }))
    await waitFor(() => expect(useCompassStore.getState().bitacoraVisitasPE.length).toBe(antes + 1))
    expect(lastEvent()?.tipoAccion).toBe("PE_VISITA_INGRESADA")
  })

  it("sin coincidencia en el padrón ofrece la visita externa con el RUT leído", { timeout: PRESUPUESTO_CARGA }, async () => {
    const user = userEvent.setup()
    const antes = useCompassStore.getState().bitacoraVisitasPE.length
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json({ data: [], page: 1, pageSize: 10, total: 0 }))
    )
    instalarCamara()
    instalarDetector(URL_CEDULA_EXTERNA)

    render(<VisitasPanel diaReporte={HOY} onError={vi.fn()} onSuccess={vi.fn()} />)

    await user.click(screen.getByRole("button", { name: /Escanear QR de la cédula/ }))
    const resultado = await screen.findByRole(
      "region",
      { name: "Resultado del escaneo" },
      { timeout: 10_000 }
    )
    expect(within(resultado).getByText(/Sin coincidencia en el padrón/)).toBeTruthy()
    expect(within(resultado).getByText(/19\.\*\*\*\.\*\*\*-0/)).toBeTruthy()

    await user.click(within(resultado).getByRole("button", { name: /Usar el RUT leído/ }))
    expect((screen.getByLabelText("DNI *") as HTMLInputElement).value).toBe("19876543-0")
    // La visita externa tampoco se registra sola: falta el nombre y el botón.
    expect(useCompassStore.getState().bitacoraVisitasPE.length).toBe(antes)
  })

  it("si el padrón del servidor no responde, busca en el padrón local sin bloquear", { timeout: PRESUPUESTO_CARGA }, async () => {
    const user = userEvent.setup()
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("sin red")
      })
    )
    instalarCamara()
    instalarDetector(URL_CEDULA_P1)

    render(<VisitasPanel diaReporte={HOY} onError={vi.fn()} onSuccess={vi.fn()} />)

    await user.click(screen.getByRole("button", { name: /Escanear QR de la cédula/ }))
    const resultado = await screen.findByRole(
      "region",
      { name: "Resultado del escaneo" },
      { timeout: 10_000 }
    )
    expect(within(resultado).getByText("Juan Pérez González")).toBeTruthy()
    expect(screen.getByText(/se buscó en el padrón local/)).toBeTruthy()
  })

  it("búsqueda manual por RUT: completa el formulario solo al confirmar", { timeout: PRESUPUESTO_CARGA }, async () => {
    const user = userEvent.setup()
    const antes = useCompassStore.getState().bitacoraVisitasPE.length
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json({ data: [], page: 1, pageSize: 10, total: 0 }))
    )

    render(<VisitasPanel diaReporte={HOY} onError={vi.fn()} onSuccess={vi.fn()} />)

    // Fallback obligatorio de la cédula vieja / sin cámara: se escribe el RUT.
    await user.type(screen.getByLabelText("DNI *"), "15.123.456-9")
    await user.click(screen.getByRole("button", { name: /Buscar en el padrón/ }))

    const resultado = await screen.findByRole(
      "region",
      { name: "Resultado del escaneo" },
      { timeout: 10_000 }
    )
    expect(within(resultado).getByText("Juan Pérez González")).toBeTruthy()
    expect(useCompassStore.getState().bitacoraVisitasPE.length).toBe(antes)

    await user.click(within(resultado).getByRole("button", { name: /Confirmar identidad/ }))
    expect((screen.getByLabelText("Nombre *") as HTMLInputElement).value).toBe("Juan Pérez González")
    expect(useCompassStore.getState().bitacoraVisitasPE.length).toBe(antes)
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
