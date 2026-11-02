// @vitest-environment jsdom
/**
 * Menú lateral — bloque Operaciones.
 *
 * Los registros de acceso (visitas, encomiendas y trabajos) viven en el módulo Accesos
 * (/operaciones/accesos), que ya muestra la lista consolidada del día. El menú deja una
 * sola entrada para esos registros y no lista las páginas /operaciones/bitacora ni
 * /operaciones/paqueteria: siguen existiendo, pero solo por URL directa.
 *
 * Reservas, Solicitudes y Proveedores se conservan: no son registros de acceso (reservas y
 * solicitudes son otro dominio; proveedores es el maestro de empresas).
 */
import * as React from "react"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// El grupo Operaciones se expande solo cuando la ruta activa cae dentro del grupo.
vi.mock("next/navigation", () => ({ usePathname: () => "/operaciones/accesos" }))
vi.mock("@/lib/api/use-configuracion", () => ({
  useComunidadActual: () => ({
    nombre: "Comunidad Test",
    logoUrl: undefined,
    isLoading: false,
    error: null,
  }),
}))

import { AppSidebar } from "@/components/app-sidebar"
import { SidebarProvider } from "@workspace/ui/components/sidebar"
import { TooltipProvider } from "@workspace/ui/components/tooltip"

function montarSidebar() {
  return render(
    <TooltipProvider>
      <SidebarProvider>
        <AppSidebar roles={["administrador"]} />
      </SidebarProvider>
    </TooltipProvider>
  )
}

describe("sidebar — registros de acceso en un solo módulo", () => {
  beforeEach(() => {
    // jsdom no implementa matchMedia y el SidebarProvider lo consulta para el modo móvil.
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
  })

  afterEach(() => {
    cleanup()
  })

  it("expone una única entrada Accesos apuntando a /operaciones/accesos", () => {
    montarSidebar()

    const enlace = screen.getByRole("link", { name: "Accesos" })
    expect(enlace.getAttribute("href")).toBe("/operaciones/accesos")
    expect(screen.queryAllByRole("link", { name: "Accesos" })).toHaveLength(1)
  })

  it("no lista Bitácora Diaria ni Encomiendas como entradas del menú", () => {
    montarSidebar()

    expect(screen.queryByText("Bitácora Diaria")).toBeNull()
    expect(screen.queryByText("Encomiendas")).toBeNull()
    expect(screen.queryByRole("link", { name: /bitacora/ })).toBeNull()
    expect(screen.queryByRole("link", { name: /paqueteria/ })).toBeNull()
  })

  it("conserva Reservas y Amenities, Solicitudes y Proveedores y Servicios", () => {
    montarSidebar()

    expect(
      screen.getByRole("link", { name: "Reservas y Amenities" }).getAttribute("href")
    ).toBe("/operaciones/reservas")
    expect(
      screen.getByRole("link", { name: "Solicitudes" }).getAttribute("href")
    ).toBe("/operaciones/solicitudes")
    expect(
      screen.getByRole("link", { name: "Proveedores y Servicios" }).getAttribute("href")
    ).toBe("/operaciones/proveedores")
  })
})
