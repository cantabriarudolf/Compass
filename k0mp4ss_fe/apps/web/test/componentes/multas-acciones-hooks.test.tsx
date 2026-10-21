// @vitest-environment jsdom
/**
 * Fija la migración de `finanzas/multas` (ventana V3 de SERIE-DEUDA-6): las tres
 * acciones del expediente (aplicar / desestimar / apelar) salen del hook
 * `useInfraccionesIN()` de `lib/api/use-in.ts` — es decir, de las rutas REST — y
 * el buzón CO se lee de `useMensajesBuzonCO()`. Los textos de los prompts, los
 * mensajes de error por defecto y el cierre del diálogo se mantienen idénticos
 * al comportamiento legacy.
 */
import React from "react"
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { resetStore } from "../helpers"
import { useCompassStore } from "@/lib/store"
import type { InfraccionIN } from "@/lib/schemas"

interface ResultadoAccion {
  ok: boolean
  error?: string
}

const fuente = vi.hoisted(() => ({
  infracciones: [] as unknown[],
  mensajes: [] as unknown[],
  mostrarSkeletonInfracciones: false,
  aplicar: vi.fn<(id: string) => Promise<ResultadoAccion>>(
    async () => ({ ok: true })
  ),
  desestimar: vi.fn<(id: string, justificacion: string) => Promise<ResultadoAccion>>(
    async () => ({ ok: true })
  ),
  apelar: vi.fn<(id: string, descargos: string) => Promise<ResultadoAccion>>(
    async () => ({ ok: true })
  ),
  crear: vi.fn(async () => ({ ok: true as const })),
}))

const TIPOS = [
  {
    id: "tin-1",
    nombre: "Ruidos Molestos",
    categoria: "leve",
    tipoSancion: "monto_fijo",
    valor: 30_000,
  },
]

const PERSONAS = [
  {
    id: "per-1",
    nombres: "Ana",
    apellidos: "Hook",
    rut: "11.111.111-1",
    nombreCompleto: "Ana Hook",
    estadoCuenta: "activa",
  },
]

const UNIDADES = [{ id: "uni-1", etiqueta: "Depto", numero: "101" }]

vi.mock("@/lib/api/use-in", () => ({
  useTiposInfraccionIN: () => ({
    items: TIPOS,
    total: TIPOS.length,
    isLoading: false,
    error: null,
    create: fuente.crear,
    update: vi.fn(),
    remove: vi.fn(),
  }),
  useInfraccionesIN: () => ({
    items: fuente.infracciones,
    total: fuente.infracciones.length,
    isLoading: fuente.mostrarSkeletonInfracciones,
    error: null,
    create: fuente.crear,
    update: vi.fn(),
    remove: vi.fn(),
    aplicar: fuente.aplicar,
    desestimar: fuente.desestimar,
    apelar: fuente.apelar,
  }),
}))

vi.mock("@/lib/api/use-co", () => ({
  useMensajesBuzonCO: () => ({
    items: fuente.mensajes,
    total: fuente.mensajes.length,
    isLoading: false,
    error: null,
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
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

import MultasPage from "@/app/finanzas/multas/page"

beforeAll(() => {
  // Radix (Select/Dialog) en jsdom necesita los stubs del popper.
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
  fuente.infracciones = [infraccion()]
  fuente.mensajes = [
    {
      id: "msg-1",
      folio: "CO-0007",
      clasificacion: "reclamo",
      reportanteNombre: "Bruno Vecino",
      asunto: "Filtración en estacionamiento",
      cuerpo: "La filtración del estacionamiento sigue activa desde el lunes.",
      visibilidadComite: true,
      fechaIngreso: "2026-10-19",
      estado: "abierto",
      respuestas: [],
    },
  ]
  fuente.mostrarSkeletonInfracciones = false
  fuente.aplicar.mockClear()
  fuente.desestimar.mockClear()
  fuente.apelar.mockClear()
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function infraccion(
  parcial: Partial<InfraccionIN> & Pick<InfraccionIN, "id"> = { id: "in-1" }
): InfraccionIN {
  return {
    folio: "IN-0001",
    tipoInfraccionId: "tin-1",
    unidadId: "uni-1",
    fechaSuceso: "2026-10-20",
    horaSuceso: "22:35",
    antecedentes: "Ruidos molestos reiterados después de las 22:00 según conserjería.",
    evidencias: [],
    estado: "en_revision",
    fechaRegistro: "2026-10-21",
    comentariosDirectiva: [],
    respaldosDirectiva: [],
    ...parcial,
  }
}

/** Abre el expediente de la infracción desde la tabla de Registro. */
async function abrirExpediente(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: /Ver/ }))
  const dialog = await screen.findByRole("dialog")
  return dialog
}

describe("finanzas/multas — acciones del expediente por el hook (no por el store)", () => {
  it("aplica la multa por el hook y muestra tal cual el error del servidor", async () => {
    const mensaje =
      "Las multas Grave/Gravísima requieren el respaldo de la directiva antes de cargarse al Gasto Común."
    fuente.aplicar.mockResolvedValue({ ok: false, error: mensaje })
    const user = userEvent.setup()
    render(<MultasPage />)

    const dialog = await abrirExpediente(user)
    await user.click(within(dialog).getByRole("button", { name: "Aplicar multa" }))

    await waitFor(() => expect(fuente.aplicar).toHaveBeenCalledWith("in-1"))
    expect(await screen.findByText(mensaje)).toBeTruthy()
  })

  it("desestima con la justificación del prompt y cierra el expediente", async () => {
    vi.spyOn(window, "prompt").mockReturnValue(
      "Descargos verificados: mudanza autorizada por administración."
    )
    fuente.desestimar.mockResolvedValue({ ok: true })
    const user = userEvent.setup()
    render(<MultasPage />)

    const dialog = await abrirExpediente(user)
    await user.click(within(dialog).getByRole("button", { name: "Desestimar" }))

    await waitFor(() =>
      expect(fuente.desestimar).toHaveBeenCalledWith(
        "in-1",
        "Descargos verificados: mudanza autorizada por administración."
      )
    )
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
  })

  it("registra la apelación con los descargos del prompt", async () => {
    vi.spyOn(window, "prompt").mockReturnValue(
      "Mi mascota siempre usa correa; las cámaras del hall lo demuestran."
    )
    fuente.apelar.mockResolvedValue({ ok: true })
    const user = userEvent.setup()
    render(<MultasPage />)

    const dialog = await abrirExpediente(user)
    await user.click(
      within(dialog).getByRole("button", { name: "Registrar apelación" })
    )

    await waitFor(() =>
      expect(fuente.apelar).toHaveBeenCalledWith(
        "in-1",
        "Mi mascota siempre usa correa; las cámaras del hall lo demuestran."
      )
    )
  })

  it("no invoca ninguna acción legacy del store al aplicar", async () => {
    const estado = useCompassStore.getState()
    const aplicarLegacy = vi.spyOn(estado, "aplicarInfraccionIN")
    const desestimarLegacy = vi.spyOn(estado, "desestimarInfraccionIN")
    const apelarLegacy = vi.spyOn(estado, "apelarInfraccionIN")
    fuente.aplicar.mockResolvedValue({ ok: true })
    const user = userEvent.setup()
    render(<MultasPage />)

    const dialog = await abrirExpediente(user)
    await user.click(within(dialog).getByRole("button", { name: "Aplicar multa" }))

    await waitFor(() => expect(fuente.aplicar).toHaveBeenCalledWith("in-1"))
    expect(aplicarLegacy).not.toHaveBeenCalled()
    expect(desestimarLegacy).not.toHaveBeenCalled()
    expect(apelarLegacy).not.toHaveBeenCalled()
  })

  it("el buzón CO del formulario sale del hook y no del store", async () => {
    const user = userEvent.setup()
    render(<MultasPage />)

    await user.click(screen.getByRole("button", { name: /Registrar infracción/ }))
    const dialog = await screen.findByRole("dialog")
    const combos = await within(dialog).findAllByRole("combobox")
    // 0 Origen · 1 Tipo de infracción · 2 Convertir desde reclamo CO
    await user.click(combos[2]!)
    const listbox = await screen.findByRole("listbox")

    expect(
      within(listbox).getByText(/CO-0007 · Filtración en estacionamiento/)
    ).toBeTruthy()
  })
})
