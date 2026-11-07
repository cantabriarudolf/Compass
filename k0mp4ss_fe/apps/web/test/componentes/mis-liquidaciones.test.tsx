// @vitest-environment jsdom
/**
 * T10 de la serie «Permisos por objeto» — la pantalla con la que el trabajador
 * ejerce `pl:propia` (ver).
 *
 * T6 abrió la lectura por API y no había interfaz: el derecho existía y no se
 * podía ejercer con los ojos. Lo que este test fija:
 *
 *   1. cada fila pinta período, folio, días, haberes, descuentos, líquido a
 *      pagar y estado, con los mismos rótulos y el mismo formato chileno que la
 *      pantalla de la administración (`/finanzas/remuneraciones`);
 *   2. el detalle de la fila abre con los haberes y los descuentos que la fila
 *      GUARDA (AFP, salud, SIS, cesantía, APV y anticipos), tal como los imprime
 *      el documento: la pantalla no recalcula ninguna cifra, solo lee;
 *   3. el vacío del trabajador dice «tu persona» y el de la gestión no, porque
 *      «tus liquidaciones» es falso para quien ve la comunidad entera;
 *   4. cada fila ofrece la descarga de su PDF (`/api/liquidaciones/[id]/pdf`,
 *      servida por el servidor con el mismo alcance por fila que la lectura) y
 *      el pie ya no declara una descarga que no existe;
 *   5. el portón es el de la matriz (`pl:propia` ver para el trabajador, `pl`
 *      ver para la gestión — el comodín del administrador), nunca una lista de
 *      roles copiada, y el menú del trabajador lleva a la pantalla;
 *   6. el menú de conserjería sigue mostrando lo suyo (Directorio de
 *      Emergencias): la entrada nueva no reemplaza nada.
 *
 * Se monta `ConsolaMisLiquidaciones` (no el `page.tsx`) porque la página es un
 * server component `async` que espera `auth()` y no se puede montar en jsdom: lo
 * único que decide es el redirect y pasar `roles`, así que el caso de permisos
 * se afirma con la matriz real (`tienePermiso`).
 */
import React from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"

/** Lo que devuelve el hook de lectura; se reescribe en cada caso. */
const fuente = vi.hoisted(() => ({
  estado: {
    liquidaciones: [] as unknown[],
    total: 0,
    isLoading: false,
    error: null as Error | null,
  },
}))

vi.mock("@/lib/api/use-liquidaciones", () => ({
  useLiquidaciones: () => fuente.estado,
}))

// El grupo «Comunidad» del menú se expande solo cuando la ruta activa cae
// dentro del grupo; el caso del sidebar monta la pantalla como ruta activa.
vi.mock("next/navigation", () => ({
  usePathname: () => "/comunidad/mis-liquidaciones",
}))

vi.mock("@/lib/api/use-configuracion", () => ({
  useComunidadActual: () => ({
    nombre: "Comunidad Los Almendros",
    logoUrl: undefined,
    isLoading: false,
    error: null,
  }),
}))

import { ConsolaMisLiquidaciones } from "@/app/comunidad/mis-liquidaciones/consola-mis-liquidaciones"
import { puedeVerMisLiquidaciones } from "@/app/comunidad/mis-liquidaciones/alcance"
import { AppSidebar } from "@/components/app-sidebar"
import { SidebarProvider } from "@workspace/ui/components/sidebar"
import { TooltipProvider } from "@workspace/ui/components/tooltip"

/**
 * Una liquidación con la forma que guarda `LiquidacionPL` (recortada a lo que la
 * pantalla lee). Los números son distintos por fila a propósito: así se ve si la
 * pantalla mezcló los montos de dos documentos.
 */
const LIQUIDACION_CONFIRMADA = {
  id: "liq-1",
  folio: "LIQ-0001",
  periodo: "2026-10",
  fechaGeneracion: "2026-10-30",
  diasTrabajados: 30,
  diasMesComercial: 30,
  sueldoBaseContrato: 650_000,
  sueldoBaseProporcional: 650_000,
  horasExtrasHoras: 0,
  valorHoraOrdinaria: 0,
  montoHorasExtras: 0,
  bonos: [{ glosa: "Bono de turno", monto: 25_000, imponible: true }],
  gratificacionLegal: 0,
  totalImponible: 675_000,
  asignacionMovilizacion: 0,
  asignacionColacion: 0,
  cargas: 0,
  montoAsignacionFamiliar: 0,
  totalHaberes: 675_000,
  nombreAfp: "AFP Habitat",
  tasaAFP: 10.58,
  montoAFP: 71_415,
  nombreSalud: "FONASA",
  saludTipo: "fonasa",
  montoSalud: 47_250,
  tasaSIS: 1.48,
  montoSIS: 9_990,
  montoSeguroCesantia: 4_050,
  montoAPV: 0,
  totalDescuentos: 132_705,
  descuentoAnticipos: 20_000,
  alcanceLiquido: 542_295,
  liquidoAPagar: 522_295,
  estado: "confirmada",
}

const LIQUIDACION_BORRADOR = {
  ...LIQUIDACION_CONFIRMADA,
  id: "liq-2",
  folio: "LIQ-0002",
  periodo: "2026-11",
  fechaGeneracion: "2026-11-28",
  diasTrabajados: 15,
  sueldoBaseProporcional: 325_000,
  bonos: [],
  totalImponible: 325_000,
  totalHaberes: 325_000,
  montoAFP: 34_385,
  montoSalud: 22_750,
  montoSIS: 4_810,
  montoSeguroCesantia: 1_950,
  totalDescuentos: 63_895,
  descuentoAnticipos: 0,
  alcanceLiquido: 261_105,
  liquidoAPagar: 261_105,
  estado: "borrador",
}

const TODAS = [LIQUIDACION_CONFIRMADA, LIQUIDACION_BORRADOR]

const texto = (el: HTMLElement | null) =>
  (el?.textContent ?? "").replace(/\s+/g, " ").trim()

/** La fila (`<tr>`) de la liquidación con ese folio, para afirmar campo por campo. */
function fila(folio: string): HTMLElement {
  const celda = screen.getByText(folio)
  const tr = celda.closest("tr")
  if (!tr) throw new Error(`No hay fila para la liquidación ${folio}`)
  return tr as HTMLElement
}

beforeEach(() => {
  fuente.estado = {
    liquidaciones: TODAS,
    total: TODAS.length,
    isLoading: false,
    error: null,
  }
})

afterEach(() => {
  cleanup()
})

describe("/comunidad/mis-liquidaciones — el trabajador ve su liquidación (T10)", () => {
  it("pinta período, folio, días, haberes, descuentos, líquido y estado de cada fila", () => {
    render(<ConsolaMisLiquidaciones roles={["conserjeria"]} />)

    expect(
      screen.getByRole("heading", { name: /liquidaciones de sueldo/i })
    ).toBeInTheDocument()
    // Sin `pl` ver, el título de la tarjeta habla de lo propio.
    expect(
      screen.getByText(/^Mis liquidaciones$/i)
    ).toBeInTheDocument()

    // Confirmada: haberes, descuentos (legales + anticipos) y líquido.
    const confirmada = fila("LIQ-0001")
    expect(within(confirmada).getByText("2026-10")).toBeInTheDocument()
    expect(within(confirmada).getByText("$675.000")).toBeInTheDocument()
    expect(within(confirmada).getByText("$152.705")).toBeInTheDocument()
    expect(within(confirmada).getByText("$522.295")).toBeInTheDocument()
    expect(within(confirmada).getByText("Confirmada")).toBeInTheDocument()

    // Borrador: los montos son los suyos, no los de la fila de arriba.
    const borrador = fila("LIQ-0002")
    expect(within(borrador).getByText("2026-11")).toBeInTheDocument()
    expect(within(borrador).getByText("$325.000")).toBeInTheDocument()
    expect(within(borrador).getByText("$63.895")).toBeInTheDocument()
    expect(within(borrador).getByText("$261.105")).toBeInTheDocument()
    expect(within(borrador).getByText("Borrador")).toBeInTheDocument()

    // Cabecera + una fila por liquidación (el detalle está cerrado).
    expect(screen.getAllByRole("row")).toHaveLength(TODAS.length + 1)
  })

  it("el detalle abre con los haberes y descuentos que la fila guarda", () => {
    render(<ConsolaMisLiquidaciones roles={["conserjeria"]} />)

    const boton = within(fila("LIQ-0001")).getByRole("button", {
      name: /ver detalle/i,
    })
    expect(boton).toHaveAttribute("aria-expanded", "false")
    expect(texto(document.body)).not.toContain("AFP Habitat")

    fireEvent.click(boton)

    // El detalle se lee dentro de SU fila de detalle, no de la tabla entera.
    const detalle = document.getElementById(
      boton.getAttribute("aria-controls") ?? ""
    )
    expect(detalle).not.toBeNull()
    const cuerpo = texto(detalle as HTMLElement)

    expect(cuerpo).toContain("Sueldo base")
    expect(cuerpo).toContain("Bono de turno")
    expect(cuerpo).toContain("$25.000")
    expect(cuerpo).toContain("AFP Habitat (10.58%)")
    expect(cuerpo).toContain("FONASA")
    expect(cuerpo).toContain("SIS (1.48%)")
    expect(cuerpo).toContain("Seguro de cesantía")
    expect(cuerpo).toContain("Descuento de anticipos")
    expect(cuerpo).toContain("Total haberes")
    expect(cuerpo).toContain("Total imponible")
    expect(cuerpo).toContain("Total descuentos")
    // El líquido del detalle es el mismo de la fila: una sola cifra, no dos.
    expect(cuerpo).toContain("$522.295")

    // Se cierra y el detalle deja de existir.
    fireEvent.click(
      within(fila("LIQ-0001")).getByRole("button", { name: /ocultar detalle/i })
    )
    expect(
      document.getElementById(boton.getAttribute("aria-controls") ?? "")
    ).toBeNull()
  })

  it("sin liquidaciones el trabajador ve el vacío de su persona, no una tabla en blanco", () => {
    fuente.estado = { ...fuente.estado, liquidaciones: [], total: 0 }
    render(<ConsolaMisLiquidaciones roles={["conserjeria"]} />)

    expect(
      screen.getByText(/todavía no hay liquidaciones para tu persona/i)
    ).toBeInTheDocument()
    expect(screen.queryByRole("table")).not.toBeInTheDocument()
  })

  it("la gestión no lee el vacío como si fuera «tus liquidaciones»", () => {
    fuente.estado = { ...fuente.estado, liquidaciones: [], total: 0 }
    render(<ConsolaMisLiquidaciones roles={["administrador"]} />)

    expect(
      screen.getByText(/la comunidad todavía no tiene liquidaciones/i)
    ).toBeInTheDocument()
    expect(screen.queryByText(/tu persona/i)).toBeNull()
    expect(
      screen.getByText(/^Liquidaciones de la comunidad$/i)
    ).toBeInTheDocument()
  })

  it("cada fila ofrece la descarga del PDF que la ruta sirve, y el pie ya no dice que falta", () => {
    render(<ConsolaMisLiquidaciones roles={["conserjeria"]} />)

    // Antes de T10 el pie decía que el PDF no estaba disponible y no había
    // enlace: el papel existía sólo en el navegador de la administración. Ahora
    // cada fila enlaza la ruta que sirve SU documento (con el alcance del
    // servidor, no un filtro del cliente).
    const descarga = within(fila("LIQ-0001")).getByRole("link", {
      name: "Descargar el PDF de la liquidación LIQ-0001 (período 2026-10)",
    })
    expect(descarga).toHaveAttribute("href", "/api/liquidaciones/liq-1/pdf")
    // `download` fuerza la descarga en vez de navegar al PDF.
    expect(descarga).toHaveAttribute("download")

    // Cada fila enlaza la suya: dos documentos, dos URLs.
    expect(
      within(fila("LIQ-0002")).getByRole("link", {
        name: "Descargar el PDF de la liquidación LIQ-0002 (período 2026-11)",
      })
    ).toHaveAttribute("href", "/api/liquidaciones/liq-2/pdf")

    // El pie ya no declara una falta que dejó de existir.
    expect(
      screen.queryByText(/la descarga en pdf todavía no está disponible/i)
    ).toBeNull()
  })

  it("muestra el error de la API cuando la lectura falla", () => {
    fuente.estado = {
      ...fuente.estado,
      liquidaciones: [],
      error: new Error("Permiso denegado."),
    }
    render(<ConsolaMisLiquidaciones roles={["conserjeria"]} />)

    expect(texto(document.body)).toContain("Permiso denegado.")
  })
})

describe("portón y menú de /comunidad/mis-liquidaciones", () => {
  it("admite a quien la matriz deja leer y a nadie más", () => {
    // Las dos claves de lectura: `pl:propia` ver (trabajador) y `pl` ver
    // (gestión). Es el mismo par que decide `alcanceDeLectura` en la API.
    expect(puedeVerMisLiquidaciones(["conserjeria"])).toBe(true)
    expect(puedeVerMisLiquidaciones(["administrador"])).toBe(true)
    expect(puedeVerMisLiquidaciones(["residente"])).toBe(false)
    expect(puedeVerMisLiquidaciones(["comite"])).toBe(false)
    expect(puedeVerMisLiquidaciones(["mantencion"])).toBe(false)
    expect(puedeVerMisLiquidaciones([])).toBe(false)
    // Cualquiera de los roles de la sesión alcanza (unión de membresías).
    expect(puedeVerMisLiquidaciones(["residente", "conserjeria"])).toBe(true)
  })

  it("el menú del trabajador lleva a la pantalla; el residente no la ve", () => {
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

    montarMenu(["conserjeria"])
    expect(
      screen
        .getByRole("link", { name: "Mis Liquidaciones" })
        .getAttribute("href")
    ).toBe("/comunidad/mis-liquidaciones")
    // Lo que conserjería ya veía sigue estando: la entrada nueva no reemplaza nada.
    expect(
      screen.getByRole("link", { name: "Directorio de Emergencias" })
    ).toBeInTheDocument()
    cleanup()

    montarMenu(["residente"])
    expect(screen.queryByRole("link", { name: "Mis Liquidaciones" })).toBeNull()
  })
})
