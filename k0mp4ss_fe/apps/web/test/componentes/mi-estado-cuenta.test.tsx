// @vitest-environment jsdom
/**
 * «El residente ve su propia deuda» — la pantalla `/comunidad/mi-estado-cuenta`.
 *
 * Decisión del owner (2026-11-08): el residente ve su deuda SIEMPRE y SOLO la
 * suya. La pantalla imprime lo que el servidor devolvió de SU alcance (la ruta
 * `/api/cobros-fi/mi-estado-cuenta` resuelve los vínculos vigentes en la base):
 * no filtra filas por su cuenta ni acepta un id de unidad, porque repetir la
 * regla acá sería una segunda copia capaz de divergir de la que protege los
 * datos.
 *
 * Lo que este test fija:
 *   1. el saldo total y una fila POR PERÍODO con su saldo, sus conceptos y su
 *      estado, con el formato chileno del resto de la app;
 *   2. la fila que tiene aviso enlaza SU papel (`/api/avisos-cobro/<id>/pdf`);
 *      la que no lo tiene no inventa un enlace;
 *   3. sin cobros el residente ve un estado vacío legible, no una tabla vacía;
 *   4. con todos los períodos pagados el saldo total es 0 y la pantalla lo dice
 *      («al día») sin esconder el historial;
 *   5. el menú lleva a la pantalla solo a quien la matriz habilita
 *      (`fi:aviso:propio` ver: residente y el comodín del administrador);
 *      conserjería, mantención y comité no ven la entrada.
 *
 * Se monta el componente cliente (no el `page.tsx`): la página es un server
 * component `async` que espera `auth()` y solo decide el redirect. El portón se
 * afirma con la matriz real (`tienePermiso`), que es la única fuente.
 */
import React from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen, within } from "@testing-library/react"

/** Lo que devuelve el hook de lectura; se reescribe en cada caso. */
const fuente = vi.hoisted(() => ({
  estado: {
    cobros: [] as unknown[],
    saldoTotal: 0,
    isLoading: false,
    error: null as Error | null,
  },
}))

vi.mock("@/lib/api/use-cobros-fi", () => ({
  useMiEstadoCuentaFI: () => fuente.estado,
}))

// El grupo «Comunidad» del menú se expande solo cuando la ruta activa cae
// dentro del grupo; el caso del sidebar monta la pantalla como ruta activa.
vi.mock("next/navigation", () => ({
  usePathname: () => "/comunidad/mi-estado-cuenta",
}))

vi.mock("@/lib/api/use-configuracion", () => ({
  useComunidadActual: () => ({
    nombre: "Comunidad Los Almendros",
    logoUrl: undefined,
    isLoading: false,
    error: null,
  }),
}))

import { EstadoCuentaResidente } from "@/app/comunidad/mi-estado-cuenta/_componentes/estado-cuenta-residente"
import { AppSidebar } from "@/components/app-sidebar"
import { tienePermiso } from "@/lib/authz"
import { SidebarProvider } from "@workspace/ui/components/sidebar"
import { TooltipProvider } from "@workspace/ui/components/tooltip"

/** Fila tal como la sirve `GET /api/cobros-fi/mi-estado-cuenta`. */
const COBRO_SEP = {
  id: "cobro-sep",
  unidadId: "u-1",
  unidadNumero: "101",
  unidadEtiqueta: "Depto",
  periodo: "2026-09",
  concepto: "gasto_comun",
  montoCargo: 100_000,
  pagado: 0,
  moras: 5_000,
  saldoPendiente: 105_000,
  estado: "vencido",
  fechaVencimiento: "2099-09-15",
  avisoId: "avi-1",
}

const COBRO_AGO = {
  id: "cobro-ago",
  unidadId: "u-1",
  unidadNumero: "101",
  unidadEtiqueta: "Depto",
  periodo: "2026-08",
  concepto: "gasto_comun",
  montoCargo: 80_000,
  pagado: 30_000,
  moras: 0,
  saldoPendiente: 50_000,
  estado: "parcial",
  fechaVencimiento: "2099-08-15",
  avisoId: null,
}

const TODOS = [COBRO_SEP, COBRO_AGO]

const texto = (el: HTMLElement | null) =>
  (el?.textContent ?? "").replace(/\s+/g, " ").trim()

/** La fila (`<tr>`) del período, para afirmar campo por campo. */
function fila(periodo: string): HTMLElement {
  const celda = screen.getByText(periodo)
  const tr = celda.closest("tr")
  if (!tr) throw new Error(`No hay fila para el período ${periodo}`)
  return tr as HTMLElement
}

beforeEach(() => {
  fuente.estado = {
    cobros: TODOS,
    saldoTotal: 155_000,
    isLoading: false,
    error: null,
  }
})

afterEach(() => {
  cleanup()
})

describe("/comunidad/mi-estado-cuenta — el residente lee su propia deuda", () => {
  it("pinta el saldo total y una fila por período con su saldo", () => {
    render(<EstadoCuentaResidente />)

    expect(
      screen.getByRole("heading", { name: /mi estado de cuenta/i })
    ).toBeInTheDocument()
    // Saldo total: lo dice el servidor, la pantalla no lo recalcula.
    expect(screen.getByText("$155.000")).toBeInTheDocument()

    // Una fila por período (más el encabezado): cada cobro es de un período
    // distinto, así que la tabla tiene dos filas de datos.
    expect(screen.getAllByRole("row")).toHaveLength(3)

    const sep = fila("2026-09")
    expect(within(sep).getByText("Depto 101")).toBeInTheDocument()
    expect(within(sep).getByText("Gasto Común")).toBeInTheDocument()
    expect(within(sep).getByText("$100.000")).toBeInTheDocument()
    expect(within(sep).getByText("$5.000")).toBeInTheDocument()
    expect(within(sep).getByText("$105.000")).toBeInTheDocument()
    expect(within(sep).getByText("Vencido")).toBeInTheDocument()

    const ago = fila("2026-08")
    expect(within(ago).getByText("$80.000")).toBeInTheDocument()
    expect(within(ago).getByText("$30.000")).toBeInTheDocument()
    expect(within(ago).getByText("$50.000")).toBeInTheDocument()
    expect(within(ago).getByText("Parcial")).toBeInTheDocument()
  })

  it("agrupa en una fila los cobros del mismo período y unidad", () => {
    // Un período puede tener más de un cargo (gasto común + multa). La pantalla
    // muestra UNA fila por período: los conceptos se listan y los montos suman.
    fuente.estado = {
      ...fuente.estado,
      cobros: [
        COBRO_SEP,
        {
          ...COBRO_SEP,
          id: "cobro-multa",
          concepto: "multa_in",
          montoCargo: 20_000,
          moras: 0,
          saldoPendiente: 20_000,
        },
      ],
      saldoTotal: 125_000,
    }
    render(<EstadoCuentaResidente />)

    expect(screen.getAllByRole("row")).toHaveLength(2)
    const sep = fila("2026-09")
    // Los conceptos del período se listan en la misma celda: un cargo no tapa
    // al otro y el monto de la fila es la suma de ambos.
    expect(within(sep).getByText("Gasto Común + Multa")).toBeInTheDocument()
    expect(within(sep).getByText("$120.000")).toBeInTheDocument()
    expect(within(sep).getByText("$125.000")).toBeInTheDocument()
  })

  it("la fila con aviso enlaza SU papel; la que no lo tiene no inventa un enlace", () => {
    render(<EstadoCuentaResidente />)

    const enlace = within(fila("2026-09")).getByRole("link", {
      name: /pdf del aviso/i,
    })
    expect(enlace.getAttribute("href")).toBe("/api/avisos-cobro/avi-1/pdf")
    expect(enlace).toHaveAttribute("download")

    expect(within(fila("2026-08")).queryByRole("link")).toBeNull()
  })

  it("sin cobros muestra un estado vacío legible, no una tabla vacía", () => {
    fuente.estado = {
      cobros: [],
      saldoTotal: 0,
      isLoading: false,
      error: null,
    }
    render(<EstadoCuentaResidente />)

    expect(
      screen.getByText(/no tienes cobros registrados en tus unidades/i)
    ).toBeInTheDocument()
    expect(screen.queryByRole("table")).not.toBeInTheDocument()
    expect(screen.getByText("$0")).toBeInTheDocument()
  })

  it("con todo pagado dice «al día» y conserva el historial", () => {
    fuente.estado = {
      cobros: [
        { ...COBRO_SEP, pagado: 105_000, saldoPendiente: 0, estado: "pagado" },
        { ...COBRO_AGO, pagado: 80_000, saldoPendiente: 0, estado: "pagado" },
      ],
      saldoTotal: 0,
      isLoading: false,
      error: null,
    }
    render(<EstadoCuentaResidente />)

    expect(screen.getByText(/estás al día/i)).toBeInTheDocument()
    // El historial no se esconde: cada período sigue con su saldo $0.
    expect(screen.getAllByRole("row")).toHaveLength(3)
    expect(within(fila("2026-09")).getByText("$0")).toBeInTheDocument()
    expect(within(fila("2026-09")).getByText("Pagado")).toBeInTheDocument()
  })

  it("muestra el error de la API cuando la lectura falla", () => {
    fuente.estado = {
      cobros: [],
      saldoTotal: 0,
      isLoading: false,
      error: new Error("Permiso denegado."),
    }
    render(<EstadoCuentaResidente />)

    expect(texto(document.body)).toContain("Permiso denegado.")
  })
})

describe("portón y menú de /comunidad/mi-estado-cuenta", () => {
  it("la matriz deja entrar solo a quien tiene la clave del aviso propio", () => {
    // La compuerta de la ruta y de la pantalla es `fi:aviso:propio` ver, la
    // misma clave de F27 para los datos financieros propios del residente.
    expect(tienePermiso(["residente"], "ver", "fi:aviso:propio")).toBe(true)
    expect(tienePermiso(["administrador"], "ver", "fi:aviso:propio")).toBe(true)
    expect(tienePermiso(["comite"], "ver", "fi:aviso:propio")).toBe(false)
    expect(tienePermiso(["conserjeria"], "ver", "fi:aviso:propio")).toBe(false)
    expect(tienePermiso(["mantencion"], "ver", "fi:aviso:propio")).toBe(false)
    expect(tienePermiso([], "ver", "fi:aviso:propio")).toBe(false)
  })

  it("el menú del residente lleva a la pantalla y los demás roles no la ven", () => {
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
        .getByRole("link", { name: "Mi Estado de Cuenta" })
        .getAttribute("href")
    ).toBe("/comunidad/mi-estado-cuenta")
    cleanup()

    for (const rol of ["conserjeria", "mantencion", "comite"]) {
      montarMenu([rol])
      expect(
        screen.queryByRole("link", { name: "Mi Estado de Cuenta" })
      ).toBeNull()
      cleanup()
    }
  })
})
