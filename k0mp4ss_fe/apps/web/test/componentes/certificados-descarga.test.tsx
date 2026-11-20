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
 *
 * Adaptación T13 (S10): el Select de unidad de `estado_cuenta`/`al_dia` pasó a
 * búsqueda server-side (`BuscadorEntidad` contra `/api/unidades?q=`); la
 * mecánica del test cambió —el listbox Radix del padrón truncado se reemplaza
 * por un stub que responde la búsqueda con la misma fila («Depto 101», id
 * `unidad-1`)— y el assert de negocio es el MISMO: el PDF usa el folio que
 * asignó el servidor y los mensajes siguen siendo los honestos.
 */
import React from "react"
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

/**
 * Presupuesto por caso: estos casos abren comboboxes Radix en jsdom y superan el default de
 * 5 s cuando la suite completa corre en paralelo en una máquina cargada (medido: 5050 ms, que
 * es un timeout y no un fallo de comportamiento). Es el mismo criterio de `pe-panels`.
 */
const PRESUPUESTO_CARGA = 60_000

/** Folio que "asigna el servidor": la página no puede haberlo calculado sola. */
const FOLIO_SERVIDOR = "CT-0042"
const CODIGO_SERVIDOR = "VC-ABCD1234"

const fuente = vi.hoisted(() => ({
  crear: vi.fn(),
  descargarPdf: vi.fn(),
  documentoCertificadoPDF: vi.fn(),
}))

/**
 * La CF que devuelve `GET /api/configuracion` (app/api/configuracion/route.ts, ~89):
 * el firmante derivado de la membresía administrador viaja en su propio campo
 * (`firmante: null` cuando no hay administrador con ficha en el padrón).
 * Es el mismo fixture de nombre y valores que el resto de los arneses de
 * certificados: un solo firmante de prueba, no dos formas distintas.
 */
const CF_CON_FIRMANTE = vi.hoisted(() => ({
  firmante: { nombre: "Rosa Firmante del Padrón", rut: "12.345.678-9" },
  firmaDigitalizadaUrl: null,
}))

/**
 * CF que ve la pantalla. Se reemplaza por caso: el `{ firmante: null }`
 * es el que prueba el fallo cerrado del firmante.
 */
const configuracionFuente = vi.hoisted(() => ({
  actual: null as Record<string, unknown> | null,
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
    config: configuracionFuente.actual,
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

// El PDF se mockea entero: acá interesa el MENSAJE, no el binario. El resto del
// módulo se conserva para que la pantalla importe el texto único del guard.
vi.mock("@/lib/pdf-utils", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return {
    ...actual,
    documentoCertificadoPDF: fuente.documentoCertificadoPDF,
    descargarPdf: fuente.descargarPdf,
  }
})

import CertificadosEmision from "@/app/comunidad/certificados/_componentes/certificados-emision"
import { TIPOS_CERTIFICADO_CT } from "@/lib/schemas"
import { MENSAJE_SIN_ADMINISTRADOR_DESIGNADO } from "@/lib/pdf-utils"

/** Las cuatro tipologías: el caso de administración, que es el que estos tests cubren. */
const TIPOS_DEL_ARNES = TIPOS_CERTIFICADO_CT

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
  // CF completa: el papel tiene firmante derivado y la pantalla puede emitir.
  configuracionFuente.actual = CF_CON_FIRMANTE
  // Alta exitosa: el servidor respondió con el registro emitido.
  fuente.crear.mockResolvedValue({ ok: true, registro: REGISTRO_EMITIDO })
  fuente.documentoCertificadoPDF.mockResolvedValue({} as never)
  fuente.descargarPdf.mockResolvedValue(undefined)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
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

/**
 * Stub de la búsqueda server-side de unidades (T13/S10): el buscador consulta
 * `GET /api/unidades?q=…&page=…` y acá el servidor simulado devuelve la MISMA
 * fila que el antiguo `Select` ofrecía del padrón («Depto 101», id `unidad-1`),
 * así que el folio y los mensajes que el test afirma no cambian. Cualquier otra
 * fetch rompe el test: este arnés es todo hooks mockeados.
 */
function stubBuscarUnidad(): void {
  vi.stubGlobal(
    "fetch",
    vi.fn((recurso: string | URL | Request) => {
      const url = typeof recurso === "string" ? recurso : String(recurso)
      if (!url.startsWith("/api/unidades?q=")) {
        throw new Error(`Fetch inesperada en este flujo: ${url}`)
      }
      return Promise.resolve(
        new Response(
          JSON.stringify({
            data: [{ id: "unidad-1", etiqueta: "Depto", numero: "101" }],
            page: 1,
            pageSize: 50,
            total: 1,
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      )
    })
  )
}

/** Completa el formulario mínimo (estado de cuenta: unidad + solicitante). */
async function emitir(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  // 0: tipo de certificado; la unidad se elige por el buscador server-side (T13).
  await elegir(user, 0, /Estado de Cuenta/i)
  stubBuscarUnidad()
  const input = screen.getByPlaceholderText("Buscar por etiqueta, número o rol SII…")
  await user.type(input, "101")
  await screen.findByText("Depto 101")
  await user.click(screen.getByText("Depto 101"))
  await user.type(
    screen.getByPlaceholderText("Nombre de quien solicita"),
    "Ana Solicitante"
  )
  await user.click(
    screen.getByRole("button", { name: /Generar certificado PDF firmado/i })
  )
}

describe("comunidad/certificados — emisión y descarga del PDF", () => {
  it("descarga OK: confirma la emisión y usa el folio que asignó el servidor", { timeout: PRESUPUESTO_CARGA }, async () => {
    const user = userEvent.setup()
    render(<CertificadosEmision tiposEmisibles={[...TIPOS_DEL_ARNES]} />)
    await emitir(user)

    expect(await screen.findByText(/emitido y firmado/i)).toBeTruthy()
    expect(texto(screen.getByText(/emitido y firmado/i))).toContain(FOLIO_SERVIDOR)
    expect(texto(screen.getByText(/emitido y firmado/i))).toContain(CODIGO_SERVIDOR)

    // El PDF se armó con el folio del servidor, no con un `max+1` del cliente.
    expect(fuente.documentoCertificadoPDF).toHaveBeenCalledTimes(1)
    const llamada = fuente.documentoCertificadoPDF.mock.calls[0]?.[0] as
      | {
          folio?: string
          codigoVerificacion?: string
          config?: { administradorResponsable?: string; rutAdministrador?: string }
        }
      | undefined
    expect(llamada?.folio).toBe(FOLIO_SERVIDOR)
    expect(llamada?.codigoVerificacion).toBe(CODIGO_SERVIDOR)
    // El bloque que imprime el papel se arma desde `firmante`: la firma llega con
    // nombre y RUT, no como `undefined`.
    expect(llamada?.config?.administradorResponsable).toBe(
      CF_CON_FIRMANTE.firmante.nombre
    )
    expect(llamada?.config?.rutAdministrador).toBe(CF_CON_FIRMANTE.firmante.rut)
    // El alta NO manda folio: lo completa el servidor.
    const alta = fuente.crear.mock.calls[0]?.[0] as Record<string, unknown> | undefined
    expect(alta).toBeTruthy()
    expect(alta?.folio).toBeUndefined()
    expect(alta?.codigoVerificacion).toBeUndefined()
  })

  it("descarga que rechaza: NO confirma el éxito, avisa que el registro sí se emitió", { timeout: PRESUPUESTO_CARGA }, async () => {
    fuente.descargarPdf.mockRejectedValue(new Error("permiso denegado por el navegador"))
    const user = userEvent.setup()
    render(<CertificadosEmision tiposEmisibles={[...TIPOS_DEL_ARNES]} />)
    await emitir(user)

    const aviso = await screen.findByText(/la descarga del PDF falló/i)
    expect(texto(aviso)).toContain(FOLIO_SERVIDOR)
    expect(texto(aviso)).toMatch(/reintent/i)
    // Ni el mensaje de éxito ni el genérico de PDF generado.
    expect(screen.queryByText(/emitido y firmado/i)).toBeNull()
    expect(screen.queryByText(/PDF .* generado con firma embebida/i)).toBeNull()
  })

  it("sin administrador designado no emite ni arma el PDF: muestra el mismo mensaje del servidor", { timeout: PRESUPUESTO_CARGA }, async () => {
    configuracionFuente.actual = {
      firmante: null,
      firmaDigitalizadaUrl: null,
    }
    const user = userEvent.setup()
    render(<CertificadosEmision tiposEmisibles={[...TIPOS_DEL_ARNES]} />)
    await emitir(user)

    const aviso = await screen.findByText(MENSAJE_SIN_ADMINISTRADOR_DESIGNADO)
    expect(texto(aviso)).toBe(MENSAJE_SIN_ADMINISTRADOR_DESIGNADO)
    // Ni el alta ni el documento: sin firmante no hay papel que firmar.
    expect(fuente.crear).not.toHaveBeenCalled()
    expect(fuente.documentoCertificadoPDF).not.toHaveBeenCalled()
    expect(fuente.descargarPdf).not.toHaveBeenCalled()
  })
})
