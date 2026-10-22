// @vitest-environment jsdom
/**
 * Certificados CT — mensajes honestos y folio del servidor
 * (auditoría "funciones de palo" 2026-10-23).
 *
 * Dos cosas que el usuario ve y que antes mentían:
 *   1. Tras emitir, la página pintaba "Certificado … emitido y firmado" aunque
 *      la descarga del PDF hubiera fallado. Ahora solo el camino con descarga
 *      exitosa confirma el éxito; si la descarga falla se dice que el registro
 *      SÍ se emitió y que hay que reintentar desde el historial.
 *   2. El folio `CT-####` lo asigna el servidor: la página ya no lo inventa con
 *      `max+1`. El test simula el alta y verifica que el PDF usa el folio que
 *      devolvió el servidor (el del mock), no uno calculado en el cliente.
 */
import React from "react"
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

/** Folio que "asigna el servidor": la página no puede haberlo calculado sola. */
const FOLIO_SERVIDOR = "CT-0042"
const CODIGO_SERVIDOR = "VC-ABCD1234"

const fuente = vi.hoisted(() => ({
  crear: vi.fn(),
  descargarPdf: vi.fn(),
  documentoCertificadoPDF: vi.fn(),
}))

vi.mock("@/lib/api/use-certificados-ct", () => ({
  useCertificadosCT: () => ({
    items: [],
    total: 0,
    isLoading: false,
    error: null,
    create: fuente.crear,
    update: vi.fn(),
    remove: vi.fn(),
  }),
}))

vi.mock("@/lib/api/use-personas", () => ({
  usePersonas: () => ({
    personas: [],
    isLoading: false,
    error: null,
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  }),
}))

vi.mock("@/lib/api/use-unidades", () => ({
  useUnidades: () => ({
    items: [{ id: "unidad-1", etiqueta: "Depto", numero: "101" }],
    total: 1,
    isLoading: false,
    error: null,
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  }),
}))

vi.mock("@/lib/api/use-vinculos", () => ({
  useVinculos: () => ({
    vinculos: [],
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
    items: [],
    liquidaciones: [],
    total: 0,
    isLoading: false,
    error: null,
    remove: vi.fn(),
    generar: vi.fn(),
    confirmar: vi.fn(),
  }),
}))

vi.mock("@/lib/api/use-cobros-fi", () => ({
  useCobrosFI: () => ({
    items: [],
    total: 0,
    isLoading: false,
    error: null,
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  }),
}))

// El PDF se mockea entero: acá interesa el MENSAJE, no el binario.
vi.mock("@/lib/pdf-utils", () => ({
  documentoCertificadoPDF: fuente.documentoCertificadoPDF,
  descargarPdf: fuente.descargarPdf,
}))

import CertificadosPage from "@/app/comunidad/certificados/page"

/** Registro que devuelve el POST (folio y código puestos por el servidor). */
const REGISTRO_EMITIDO = {
  id: "ct-emitido-1",
  folio: FOLIO_SERVIDOR,
  codigoVerificacion: CODIGO_SERVIDOR,
  tipo: "estado_cuenta",
  unidadId: "unidad-1",
  solicitanteNombre: "Ana Solicitante",
  resumen: "Estado de cuenta oficial de Depto 101.",
  detalle: [{ clave: "Unidad", valor: "Depto 101" }],
  fechaEmision: "2026-10-23",
}

/** Texto normalizado (el markup de Radix inserta espacios entre nodos). */
const texto = (el: HTMLElement | null) => (el?.textContent ?? "").replace(/\s+/g, " ").trim()

beforeAll(() => {
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
  fuente.crear.mockReset()
  fuente.descargarPdf.mockReset()
  fuente.documentoCertificadoPDF.mockReset()
  // Alta exitosa: el servidor respondió con el registro emitido.
  fuente.crear.mockResolvedValue({ ok: true, registro: REGISTRO_EMITIDO })
  fuente.documentoCertificadoPDF.mockResolvedValue({} as never)
  fuente.descargarPdf.mockResolvedValue(undefined)
})

afterEach(() => {
  cleanup()
})

/** Abre el combobox `indice` y elige la opción cuyo texto matchea. */
async function elegir(
  user: ReturnType<typeof userEvent.setup>,
  indice: number,
  patron: RegExp
): Promise<void> {
  const combos = screen.getAllByRole("combobox")
  await user.click(combos[indice]!)
  const listbox = await screen.findByRole("listbox", {}, { timeout: 5_000 })
  const opcion = within(listbox)
    .getAllByRole("option")
    .find((o) => patron.test(o.textContent ?? ""))
  if (!opcion) {
    throw new Error(`sin opción ${String(patron)} en el combobox ${indice}`)
  }
  await user.click(opcion)
}

/** Completa el formulario mínimo (estado de cuenta: unidad + solicitante). */
async function emitir(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  // 0: tipo de certificado; 1: unidad.
  await elegir(user, 0, /Estado de Cuenta/i)
  await elegir(user, 1, /Depto 101/i)
  await user.type(
    screen.getByPlaceholderText("Nombre de quien solicita"),
    "Ana Solicitante"
  )
  await user.click(
    screen.getByRole("button", { name: /Generar certificado PDF firmado/i })
  )
}

describe("comunidad/certificados — emisión y descarga del PDF", () => {
  it("descarga OK: confirma la emisión y usa el folio que asignó el servidor", async () => {
    const user = userEvent.setup()
    render(<CertificadosPage />)
    await emitir(user)

    expect(await screen.findByText(/emitido y firmado/i)).toBeTruthy()
    expect(texto(screen.getByText(/emitido y firmado/i))).toContain(FOLIO_SERVIDOR)
    expect(texto(screen.getByText(/emitido y firmado/i))).toContain(CODIGO_SERVIDOR)

    // El PDF se armó con el folio del servidor, no con un `max+1` del cliente.
    expect(fuente.documentoCertificadoPDF).toHaveBeenCalledTimes(1)
    const llamada = fuente.documentoCertificadoPDF.mock.calls[0]?.[0] as
      | { folio?: string; codigoVerificacion?: string }
      | undefined
    expect(llamada?.folio).toBe(FOLIO_SERVIDOR)
    expect(llamada?.codigoVerificacion).toBe(CODIGO_SERVIDOR)
    // El alta NO manda folio: lo completa el servidor.
    const alta = fuente.crear.mock.calls[0]?.[0] as Record<string, unknown> | undefined
    expect(alta).toBeTruthy()
    expect(alta?.folio).toBeUndefined()
    expect(alta?.codigoVerificacion).toBeUndefined()
  })

  it("descarga que rechaza: NO confirma el éxito, avisa que el registro sí se emitió", async () => {
    fuente.descargarPdf.mockRejectedValue(new Error("permiso denegado por el navegador"))
    const user = userEvent.setup()
    render(<CertificadosPage />)
    await emitir(user)

    const aviso = await screen.findByText(/la descarga del PDF falló/i)
    expect(texto(aviso)).toContain(FOLIO_SERVIDOR)
    expect(texto(aviso)).toMatch(/reintent/i)
    // Ni el mensaje de éxito ni el genérico de PDF generado.
    expect(screen.queryByText(/emitido y firmado/i)).toBeNull()
    expect(screen.queryByText(/PDF .* generado con firma embebida/i)).toBeNull()
  })
})
