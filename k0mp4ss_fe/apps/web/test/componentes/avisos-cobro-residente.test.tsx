// @vitest-environment jsdom
/**
 * F27 — la pantalla del residente para ver y descargar su aviso de cobro.
 *
 * El aviso es un documento CONGELADO (Ley 21.442 arts. 31 y 32) y la pantalla no
 * lo interprete: imprime lo que la fila guardada dice. Lo que este test fija:
 *
 *   1. la fila pinta período, folio, unidad, total a pagar, estado y fecha de
 *      emisión, y el total y la unidad salen del `contenido` CONGELADO — la
 *      pantalla no recalcula ninguna cifra desde los cargos;
 *   2. el estado se LEE de la fila: `Pagado` cuando el contenido declara pagado
 *      todo lo exigible y deuda 0, `Vencido`/`Pendiente` según el `vencimiento`
 *      persistido, y `Sin plazo declarado` cuando es `null` (la versión del
 *      reglamento no era computable). Nunca una fecha ni un estado inventados;
 *   3. «Descargar PDF» es un enlace al PDF del aviso (`/api/avisos-cobro/<id>/pdf`,
 *      que responde `attachment` con el folio en el nombre) y cada fila apunta a
 *      SU aviso: el `id` de la fila es el único que entra en la URL;
 *   4. el residente sin avisos ve un estado vacío que dice justo eso, y la
 *      gestión (que ve la comunidad entera) no lee un vacío como si fuera «su
 *      unidad»;
 *   5. sin configuración de la comunidad no se ofrece una descarga que la API va
 *      a rechazar (409: sin CF no hay papel que armar);
 *   6. el portón es el de la matriz (`fi:gasto_comun` ver o `fi:aviso:propio`
 *      ver), el mismo par de claves que decide la API, y el menú del residente
 *      lleva a la pantalla — conserjería y mantención, que no tienen ninguna de
 *      las dos claves, no la ven.
 *
 * Se monta `ConsolaAvisosCobro` (no el `page.tsx`) porque la página es un server
 * component `async` que espera `auth()` y no se puede montar en jsdom; lo único
 * que decide es el redirect y pasar `roles`, así que el caso de permisos se
 * afirma con la matriz real (`tienePermiso`).
 */
import React from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen, within } from "@testing-library/react"

/** Lo que devuelve el hook de lectura; se reescribe en cada caso. */
const fuente = vi.hoisted(() => ({
  estado: {
    avisos: [] as unknown[],
    documento: null as unknown,
    total: 0,
    isLoading: false,
    error: null as Error | null,
  },
}))

vi.mock("@/lib/api/use-avisos-cobro", () => ({
  useAvisosCobro: () => fuente.estado,
}))

// El grupo «Comunidad» del menú se expande solo cuando la ruta activa cae
// dentro del grupo; el caso del sidebar monta la pantalla como ruta activa.
vi.mock("next/navigation", () => ({
  usePathname: () => "/comunidad/avisos-cobro",
}))

vi.mock("@/lib/api/use-configuracion", () => ({
  useComunidadActual: () => ({
    nombre: "Comunidad Los Almendros",
    logoUrl: undefined,
    isLoading: false,
    error: null,
  }),
}))

import { ConsolaAvisosCobro } from "@/app/comunidad/avisos-cobro/consola-avisos-cobro"
import { puedeVerAvisosCobro } from "@/app/comunidad/avisos-cobro/alcance"
import { AppSidebar } from "@/components/app-sidebar"
import { SidebarProvider } from "@workspace/ui/components/sidebar"
import { TooltipProvider } from "@workspace/ui/components/tooltip"

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

const AVISO_PENDIENTE = {
  id: "avi-1",
  unidadId: "u-1",
  periodo: "2026-09",
  folio: "AC-0001",
  codigoVerificacion: "VC-ABCD1234",
  fechaEmision: "2026-09-05",
  vencimiento: "2099-01-15",
  contenido: CONTENIDO,
  totalesComunidad: {},
  hash: "hash-1",
}

const AVISO_VENCIDO = {
  ...AVISO_PENDIENTE,
  id: "avi-2",
  periodo: "2026-08",
  folio: "AC-0002",
  fechaEmision: "2026-08-05",
  vencimiento: "2000-01-01",
  contenido: {
    ...CONTENIDO,
    periodo: "2026-08",
    fechaEmision: "2026-08-05",
    montos: { ...CONTENIDO.montos, totalAdeudado: 120_000 },
  },
  hash: "hash-2",
}

const AVISO_SIN_PLAZO = {
  ...AVISO_PENDIENTE,
  id: "avi-3",
  periodo: "2026-07",
  folio: "AC-0003",
  fechaEmision: "2026-07-05",
  vencimiento: null,
  contenido: { ...CONTENIDO, periodo: "2026-07", fechaEmision: "2026-07-05" },
  hash: "hash-3",
}

/**
 * Aviso que nació SIN deuda: el contenido declara pagado todo lo exigible y un
 * total adeudado 0. Trae un vencimiento ya pasado a propósito: la deuda saldada
 * manda sobre el plazo (nadie debe algo que ya pagó).
 */
const AVISO_PAGADO = {
  ...AVISO_PENDIENTE,
  id: "avi-4",
  periodo: "2026-06",
  folio: "AC-0004",
  fechaEmision: "2026-06-05",
  vencimiento: "2000-06-15",
  contenido: {
    ...CONTENIDO,
    periodo: "2026-06",
    fechaEmision: "2026-06-05",
    montos: { ...CONTENIDO.montos, pagado: 47_200, totalAdeudado: 0 },
  },
  hash: "hash-4",
}

const TODOS = [AVISO_PENDIENTE, AVISO_VENCIDO, AVISO_SIN_PLAZO, AVISO_PAGADO]

const texto = (el: HTMLElement | null) =>
  (el?.textContent ?? "").replace(/\s+/g, " ").trim()

/** La fila (`<tr>`) del aviso con ese folio, para afirmar campo por campo. */
function fila(folio: string): HTMLElement {
  const celda = screen.getByText(folio)
  const tr = celda.closest("tr")
  if (!tr) throw new Error(`No hay fila para el aviso ${folio}`)
  return tr as HTMLElement
}

beforeEach(() => {
  fuente.estado = {
    avisos: TODOS,
    documento: DOCUMENTO,
    total: TODOS.length,
    isLoading: false,
    error: null,
  }
})

afterEach(() => {
  cleanup()
})

describe("/comunidad/avisos-cobro — el residente ve y descarga su aviso (F27)", () => {
  it("pinta período, folio, unidad, total a pagar, estado y fecha de cada aviso", () => {
    render(<ConsolaAvisosCobro roles={["residente"]} />)

    expect(
      screen.getByRole("heading", { name: /avisos de cobro/i })
    ).toBeInTheDocument()

    // Período, folio, unidad, fecha de emisión y total: todo sale de la fila
    // guardada, con el formato chileno de la cifra congelada.
    const pendiente = fila("AC-0001")
    expect(within(pendiente).getByText("2026-09")).toBeInTheDocument()
    expect(within(pendiente).getByText("Depto 101")).toBeInTheDocument()
    expect(within(pendiente).getByText("2026-09-05")).toBeInTheDocument()
    expect(within(pendiente).getByText("$47.200")).toBeInTheDocument()
    expect(within(pendiente).getByText("Pendiente")).toBeInTheDocument()

    // El total del aviso vencido es el suyo, no el de otra fila.
    expect(within(fila("AC-0002")).getByText("$120.000")).toBeInTheDocument()
    expect(within(fila("AC-0002")).getByText("Vencido")).toBeInTheDocument()
    expect(
      within(fila("AC-0003")).getByText("Sin plazo declarado")
    ).toBeInTheDocument()
    expect(within(fila("AC-0004")).getByText("Pagado")).toBeInTheDocument()

    expect(screen.getAllByRole("row")).toHaveLength(TODOS.length + 1)
  })

  it("cada Descargar PDF apunta al PDF de SU aviso", () => {
    render(<ConsolaAvisosCobro roles={["residente"]} />)

    const enlaces = screen.getAllByRole("link", { name: /descargar/i })
    expect(enlaces).toHaveLength(TODOS.length)

    for (const aviso of TODOS) {
      const enlace = screen.getByRole("link", {
        name: new RegExp(aviso.folio, "i"),
      })
      expect(enlace.getAttribute("href")).toBe(
        `/api/avisos-cobro/${aviso.id}/pdf`
      )
      // La ruta ya responde `attachment`; el atributo evita que el navegador
      // lo abra en la pestaña cuando el header no se respeta.
      expect(enlace).toHaveAttribute("download")
      expect(enlace.closest("tr")).toBe(fila(aviso.folio))
    }
  })

  it("sin avisos el residente ve el vacío de su unidad, no una tabla en blanco", () => {
    fuente.estado = { ...fuente.estado, avisos: [], total: 0 }
    render(<ConsolaAvisosCobro roles={["residente"]} />)

    expect(
      screen.getByText(/todavía no hay avisos para tu unidad/i)
    ).toBeInTheDocument()
    expect(screen.queryByRole("table")).not.toBeInTheDocument()
    expect(screen.queryByRole("link", { name: /descargar/i })).toBeNull()
  })

  it("la gestión no lee el vacío como si fuera «su unidad»", () => {
    fuente.estado = { ...fuente.estado, avisos: [], total: 0 }
    render(<ConsolaAvisosCobro roles={["comite"]} />)

    expect(
      screen.getByText(/la comunidad todavía no tiene avisos de cobro emitidos/i)
    ).toBeInTheDocument()
    expect(screen.queryByText(/tu unidad/i)).toBeNull()
  })

  it("sin configuración de la comunidad no ofrece una descarga que la API va a rechazar", () => {
    fuente.estado = { ...fuente.estado, documento: null }
    render(<ConsolaAvisosCobro roles={["residente"]} />)

    expect(
      screen.getByText(/no tiene configuración registrada/i)
    ).toBeInTheDocument()
    // Sin CF la ruta responde 409: se dice, no se ofrece un enlace muerto.
    expect(screen.queryByRole("link", { name: /descargar/i })).toBeNull()
    expect(
      within(fila("AC-0001")).getByRole("button", { name: /descargar/i })
    ).toBeDisabled()
  })

  it("muestra el error de la API cuando la lectura falla", () => {
    fuente.estado = {
      ...fuente.estado,
      avisos: [],
      error: new Error("Permiso denegado."),
    }
    render(<ConsolaAvisosCobro roles={["residente"]} />)

    expect(texto(document.body)).toContain("Permiso denegado.")
  })
})

describe("portón y menú de /comunidad/avisos-cobro", () => {
  it("admite a quien la matriz deja leer el aviso y a nadie más", () => {
    // Las dos claves de lectura de F27: `fi:gasto_comun` ver (administración y
    // comité) y `fi:aviso:propio` ver (residente). Es el mismo par que decide
    // `puedeLeerAvisosCobro` en la API.
    expect(puedeVerAvisosCobro(["administrador"])).toBe(true)
    expect(puedeVerAvisosCobro(["comite"])).toBe(true)
    expect(puedeVerAvisosCobro(["residente"])).toBe(true)
    expect(puedeVerAvisosCobro(["conserjeria"])).toBe(false)
    expect(puedeVerAvisosCobro(["mantencion"])).toBe(false)
    expect(puedeVerAvisosCobro([])).toBe(false)
  })

  it("el menú del residente lleva a la pantalla; conserjería no la ve", () => {
    // jsdom no implementa matchMedia y el SidebarProvider lo consulta.
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      writable: true,
      value: (consulta: string) => ({
        matches: false,
        media: consulta,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }),
    })

    const montarMenu = (roles: string[]) =>
      render(
        <TooltipProvider>
          <SidebarProvider>
            <AppSidebar roles={roles} />
          </SidebarProvider>
        </TooltipProvider>
      )

    montarMenu(["residente"])
    expect(
      screen
        .getByRole("link", { name: "Avisos de Cobro" })
        .getAttribute("href")
    ).toBe("/comunidad/avisos-cobro")
    cleanup()

    montarMenu(["conserjeria"])
    expect(screen.queryByRole("link", { name: "Avisos de Cobro" })).toBeNull()
  })
})
