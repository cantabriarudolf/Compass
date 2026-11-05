// @vitest-environment jsdom
/**
 * F27 — la pantalla del residente para ver y descargar su aviso de cobro.
 *
 * Lo que este test fija (y que hoy no existía): el residente ve los avisos que
 * la API le sirve y descarga el PAPEL desde la fila guardada. Dos invariantes
 * del documento firmado que no pueden quedar al criterio de la pantalla:
 *
 *   1. el PDF se arma con el `contenido` CONGELADO que trajo la fila, sin
 *      recalcular ninguna cifra;
 *   2. la huella que recibe el builder es la del contenido
 *      (`hashContenido(contenido)`), no una inventada ni la de otro aviso.
 *
 * El hash se calcula acá con `hashContenido` —la misma función del servidor— y
 * se compara con lo que la pantalla le pasó a `documentoAvisoCobroPDF`.
 */
import React from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { hashContenido } from "@/lib/aviso-cobro"

/** Dobles de prueba: el PDF se mockea entero (acá interesa QUÉ recibe). */
const fuente = vi.hoisted(() => ({
  documentoAvisoCobroPDF: vi.fn(),
  descargarPdf: vi.fn(),
  urlADataUrl: vi.fn(),
  /** Lo que devuelve el hook de lectura; se reescribe en cada caso. */
  estado: {
    avisos: [] as unknown[],
    documento: null as unknown,
    total: 0,
    isLoading: false,
    error: null as Error | null,
  },
}))

/** CF proyectada al papel: lo único que el documento imprime de la configuración. */
const DOCUMENTO = {
  nombreComunidad: "Comunidad Los Almendros",
  direccionOficial: "Av. Los Almendros 123",
  rutComunidad: "76.543.210-8",
  administradorResponsable: "Ana Administradora",
  rutAdministrador: "12.345.678-9",
  firmaDigitalizadaUrl: "https://cdn.test/firma-admin.png",
}

/**
 * El `contenido` congelado de un aviso, con la forma que guarda
 * `lib/aviso-cobro.ts` (recortada a lo que la pantalla lee y el PDF imprime).
 */
const CONTENIDO = {
  version: 1 as const,
  periodo: "2026-09",
  fechaEmision: "2026-09-05",
  unidad: { id: "u-1", numero: "101", etiqueta: "Depto" },
  reglamento: {
    id: "vreg-1",
    version: 1,
    vigenteDesde: "2026-01",
    fuenteInstrumento: "reglamento_copropiedad",
    formaContribucion: "coeficiente",
    parametros: { diasPagoGc: 10, porcentajeReserva: 10 },
  },
  participacion: {
    prorrateo: 0.6,
    formaContribucion: "coeficiente",
    porcentajeReserva: 10,
    reservaIncluidaEnPresupuesto: false,
  },
  cargos: [],
  detalle: [],
  montos: {
    gastoComun: 40_000,
    recargoFondoReserva: 4_000,
    multas: 0,
    intereses: 3_200,
    otros: [],
    exigible: 47_200,
    pagado: 0,
    totalAdeudado: 47_200,
  },
  resumenComunidad: {
    periodo: "2026-09",
    desde: "2026-09-01",
    hasta: "2026-09-30",
    ingresos: { total: 0, detalle: [] },
    egresos: { total: 0, detalle: [] },
    saldoCaja: { apertura: 0, alCierre: 0 },
  },
  noComputables: [],
}

/** La huella canónica del contenido: la que el servidor sirve y el PDF imprime. */
const HASH = hashContenido(CONTENIDO)

const AVISO_VIGENTE = {
  id: "avi-1",
  unidadId: "u-1",
  periodo: "2026-09",
  folio: "AC-0001",
  codigoVerificacion: "VC-ABCD1234",
  fechaEmision: "2026-09-05",
  vencimiento: "2099-01-15",
  contenido: CONTENIDO,
  totalesComunidad: {},
  hash: HASH,
}

const AVISO_VENCIDO = {
  ...AVISO_VIGENTE,
  id: "avi-2",
  periodo: "2026-08",
  folio: "AC-0002",
  vencimiento: "2000-01-01",
  hash: hashContenido({ ...CONTENIDO, periodo: "2026-08" }),
}

const AVISO_SIN_PLAZO = {
  ...AVISO_VIGENTE,
  id: "avi-3",
  periodo: "2026-07",
  folio: "AC-0003",
  vencimiento: null,
  hash: hashContenido({ ...CONTENIDO, periodo: "2026-07" }),
}

vi.mock("@/lib/api/use-avisos-cobro", () => ({
  useAvisosCobro: () => fuente.estado,
}))

vi.mock("@/lib/pdf-utils", () => ({
  documentoAvisoCobroPDF: fuente.documentoAvisoCobroPDF,
  descargarPdf: fuente.descargarPdf,
  urlADataUrl: fuente.urlADataUrl,
}))

import AvisosCobroPage from "@/app/comunidad/avisos-cobro/page"

const texto = (el: HTMLElement | null) =>
  (el?.textContent ?? "").replace(/\s+/g, " ").trim()

beforeEach(() => {
  fuente.documentoAvisoCobroPDF.mockReset()
  fuente.descargarPdf.mockReset()
  fuente.urlADataUrl.mockReset()
  fuente.documentoAvisoCobroPDF.mockReturnValue({ content: "aviso" })
  fuente.descargarPdf.mockResolvedValue(undefined)
  fuente.urlADataUrl.mockResolvedValue(null)
  fuente.estado = {
    avisos: [AVISO_VIGENTE, AVISO_VENCIDO, AVISO_SIN_PLAZO],
    documento: DOCUMENTO,
    total: 3,
    isLoading: false,
    error: null,
  }
})

afterEach(() => {
  cleanup()
})

describe("/comunidad/avisos-cobro — el residente ve y descarga su aviso (F27)", () => {
  it("lista período, folio, total adeudado y estado de cada aviso", () => {
    render(<AvisosCobroPage />)

    expect(screen.getByRole("heading", { name: /avisos de cobro/i })).toBeInTheDocument()
    expect(screen.getByText("AC-0001")).toBeInTheDocument()
    expect(screen.getByText("AC-0002")).toBeInTheDocument()
    // Total adeudado: la cifra CONGELADA del contenido, con formato chileno.
    expect(texto(document.body)).toContain("47.200")
    // Estado derivado de la fila, no de un cálculo de la pantalla.
    expect(screen.getByText("Vigente")).toBeInTheDocument()
    expect(screen.getByText("Vencido")).toBeInTheDocument()
    expect(screen.getByText("Sin plazo declarado")).toBeInTheDocument()
    // Los períodos vienen del contenido congelado.
    expect(texto(document.body)).toContain("2026-09")
  })

  it("descarga el PDF con el contenido guardado y la huella del contenido", async () => {
    const user = userEvent.setup()
    render(<AvisosCobroPage />)

    const botones = screen.getAllByRole("button", { name: /descargar/i })
    expect(botones).toHaveLength(3)
    await user.click(botones[0]!)

    expect(fuente.documentoAvisoCobroPDF).toHaveBeenCalledTimes(1)
    const entrada = fuente.documentoAvisoCobroPDF.mock.calls[0]![0] as {
      aviso: { folio: string; codigoVerificacion: string; contenido: unknown }
      hash: string
      config: unknown
      firmaDataUrl: string | null
    }
    // El documento se arma SOLO desde la fila guardada.
    expect(entrada.aviso.folio).toBe("AC-0001")
    expect(entrada.aviso.codigoVerificacion).toBe("VC-ABCD1234")
    expect(entrada.aviso.contenido).toEqual(CONTENIDO)
    // La huella es la del contenido congelado, no otra.
    expect(entrada.hash).toBe(HASH)
    expect(entrada.hash).toBe(hashContenido(entrada.aviso.contenido))
    // Y la configuración que imprime el papel es la que sirvió la API.
    expect(entrada.config).toEqual(DOCUMENTO)
    // Sin firma resoluble el bloque queda en blanco: nunca una firma inventada.
    expect(entrada.firmaDataUrl).toBeNull()
    expect(fuente.descargarPdf).toHaveBeenCalledWith(
      { content: "aviso" },
      "aviso-cobro-AC-0001.pdf"
    )
  })

  it("resuelve la firma configurada para embeberla en el papel", async () => {
    fuente.urlADataUrl.mockResolvedValue("data:image/png;base64,ZmlybWE=")
    const user = userEvent.setup()
    render(<AvisosCobroPage />)

    await user.click(screen.getAllByRole("button", { name: /descargar/i })[0]!)

    expect(fuente.urlADataUrl).toHaveBeenCalledWith(DOCUMENTO.firmaDigitalizadaUrl)
    const entrada = fuente.documentoAvisoCobroPDF.mock.calls[0]![0] as {
      firmaDataUrl: string | null
    }
    expect(entrada.firmaDataUrl).toBe("data:image/png;base64,ZmlybWE=")
  })

  it("sin avisos emite el estado vacío en vez de una tabla en blanco", () => {
    fuente.estado = {
      avisos: [],
      documento: DOCUMENTO,
      total: 0,
      isLoading: false,
      error: null,
    }
    render(<AvisosCobroPage />)

    expect(texto(document.body)).toMatch(/todavía no tenés avisos de cobro/i)
    expect(screen.queryByRole("button", { name: /descargar/i })).not.toBeInTheDocument()
  })

  it("si la descarga falla lo dice: no confirma un PDF que no se descargó", async () => {
    fuente.descargarPdf.mockRejectedValue(new Error("permiso denegado por el navegador"))
    const user = userEvent.setup()
    render(<AvisosCobroPage />)

    await user.click(screen.getAllByRole("button", { name: /descargar/i })[0]!)

    expect(await screen.findByText(/no se pudo generar el pdf/i)).toBeInTheDocument()
  })
})
