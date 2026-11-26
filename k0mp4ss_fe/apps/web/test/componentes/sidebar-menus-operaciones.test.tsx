// @vitest-environment jsdom
/**
 * Menú lateral — bloque Operaciones.
 *
 * Los registros de acceso (visitas, encomiendas y trabajos) viven en el módulo Accesos
 * (/operaciones/accesos), que ya muestra la lista consolidada del día. El menú deja una
 * sola entrada para esos registros y no lista las páginas /operaciones/bitacora ni
 * /operaciones/paqueteria: quedaron retiradas y redirigen en el servidor a esta ruta.
 *
 * Reservas, Solicitudes y Proveedores se conservan: no son registros de acceso (reservas y
 * solicitudes son otro dominio; proveedores es el maestro de empresas).
 */
import * as React from "react"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
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

import { AppSidebar, data } from "@/components/app-sidebar"
import { SidebarProvider } from "@workspace/ui/components/sidebar"
import { TooltipProvider } from "@workspace/ui/components/tooltip"

function montarSidebar(roles: string[] = ["administrador"]) {
  return render(
    <TooltipProvider>
      <SidebarProvider>
        <AppSidebar roles={roles} />
      </SidebarProvider>
    </TooltipProvider>
  )
}

/** Rutas de todos los items que el menú ofrece a los roles indicados, con el mismo
 * filtro que aplica el componente (grupo por roles del grupo, item por sus propios roles). */
function urlsDelMenu(roles: string[]) {
  return data.navMain
    .filter((group) => group.roles.some((r: string) => roles.includes(r)))
    .flatMap((group) =>
      (group.items as { url: string; roles?: string[] }[])
        .filter((item) => !item.roles || item.roles.some((r) => roles.includes(r)))
        .map((item) => item.url)
    )
}

// Candado de inventario: estas 46 rutas son las que el menú ofrecía a la
// administración antes de partir el grupo «Sistema» en cinco. Reagrupar no puede
// perder ninguna entrada ni duplicarla.
const URLS_MENU_ANTES_DEL_REAGRUPE = [
  "/dashboard",
  "/operaciones/accesos",
  "/operaciones/reservas",
  "/operaciones/solicitudes",
  "/operaciones/proveedores",
  "/finanzas/gastos-comunes",
  "/finanzas/pagos",
  "/finanzas/multas",
  "/finanzas/remuneraciones",
  "/comunidad/directorio",
  "/comunidad/personas",
  "/comunidad/comunicacion",
  "/comunidad/archivo",
  "/comunidad/visor",
  "/comunidad/directiva",
  "/comunidad/directiva/acuerdos",
  "/comunidad/certificados",
  "/comunidad/avisos-cobro",
  "/comunidad/mi-estado-cuenta",
  "/comunidad/mis-liquidaciones",
  "/comunidad/portal",
  "/inventario/estructura",
  "/inventario/tipos",
  "/inventario/recursos",
  "/inventario/proyectos",
  "/personas/residentes",
  "/personas/personal",
  "/admin/reporteria",
  "/admin/metricas",
  "/admin/mantenciones",
  "/admin/elementos",
  "/admin/reservas",
  "/admin/gestion",
  "/admin/gestion/vigencia-registro",
  "/admin/gestion/convenios",
  "/admin/gestion/conciliacion",
  "/admin/gestion/presupuestos",
  "/admin/gestion/repartos-sector",
  "/admin/arranque",
  "/admin/maestros",
  "/admin/configuracion",
  "/admin/configuracion/correo",
  "/admin/permisos",
  "/admin/usuarios",
  "/admin/logs",
  "/admin/carga-inicial",
] as const

// jsdom no implementa matchMedia y el SidebarProvider lo consulta para el modo móvil.
function stubMatchMedia() {
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
}

describe("sidebar — registros de acceso en un solo módulo", () => {
  beforeEach(stubMatchMedia)

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

/**
 * El grupo «Sistema» juntaba las 19 opciones del administrador en un solo bloque y el
 * owner lo señaló como un listado interminable. Se parte en cinco grupos de foco, sin
 * tocar rutas ni roles de ningún item: el candado de inventario es la garantía de que
 * reagrupar no pierde ni duplica entradas.
 */
const GRUPOS_NUEVOS: { title: string; url: string; roles: string[]; items: string[] }[] = [
  {
    title: "Arranque",
    url: "/admin/arranque",
    roles: ["administrador", "comite"],
    items: ["/admin/arranque", "/admin/carga-inicial"],
  },
  {
    title: "Gestión",
    url: "/admin/gestion",
    roles: ["administrador", "comite"],
    items: [
      "/admin/gestion",
      "/admin/gestion/presupuestos",
      "/admin/gestion/repartos-sector",
      "/admin/gestion/convenios",
      "/admin/gestion/conciliacion",
      "/admin/gestion/vigencia-registro",
    ],
  },
  {
    title: "Control",
    url: "/admin/reporteria",
    roles: ["administrador", "comite"],
    items: ["/admin/reporteria", "/admin/metricas", "/admin/logs"],
  },
  {
    title: "Configuración",
    url: "/admin/configuracion",
    // El grupo incluye al comité porque «Credencial de correo» lo declara; el resto de
    // los items es admin-only y su propio `roles` los gatea.
    roles: ["administrador", "comite"],
    items: [
      "/admin/configuracion",
      "/admin/configuracion/correo",
      "/admin/maestros",
      "/admin/permisos",
      "/admin/usuarios",
    ],
  },
  {
    title: "Mantención y reservas",
    url: "/admin/mantenciones",
    roles: ["administrador"],
    items: ["/admin/mantenciones", "/admin/elementos", "/admin/reservas"],
  },
]

describe("sidebar — «Configuración» partido en grupos cortos", () => {
  beforeEach(stubMatchMedia)

  afterEach(() => {
    cleanup()
  })

  it("conserva exactamente las mismas rutas para la administración", () => {
    expect([...urlsDelMenu(["administrador"])].sort()).toEqual(
      [...URLS_MENU_ANTES_DEL_REAGRUPE].sort()
    )
    expect(urlsDelMenu(["administrador"])).toHaveLength(
      URLS_MENU_ANTES_DEL_REAGRUPE.length
    )
  })

  it.each(GRUPOS_NUEVOS)(
    "el grupo $title existe con su url, sus items y sus roles",
    (esperado) => {
      const grupos = data.navMain.filter((group) => group.title === esperado.title)
      expect(grupos).toHaveLength(1)

      const grupo = grupos[0]!
      expect(grupo.url).toBe(esperado.url)
      expect(grupo.roles).toEqual(esperado.roles)
      const items = grupo.items as { url: string; roles?: string[] }[]
      expect(items.map((item) => item.url)).toEqual(esperado.items)

      // El grupo no puede ser más angosto que ninguno de sus items, o el item
      // desaparecería para un rol que sí tiene derecho a verlo.
      const rolesDelGrupo = new Set(grupo.roles)
      for (const item of items) {
        for (const rol of item.roles ?? []) {
          expect(rolesDelGrupo, `${item.url} declara el rol ${rol}`).toContain(rol)
        }
      }

      expect(items.length, "el motivo del cambio: ningún grupo interminable").toBeLessThanOrEqual(6)
    }
  )

  it("un usuario de comité ve Arranque, Gestión, Control y Configuración, pero no Mantención y reservas", async () => {
    montarSidebar(["comite"])

    expect(screen.getByRole("button", { name: "Arranque" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Gestión" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Control" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Configuración" })).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Mantención y reservas" })).toBeNull()

    // El grupo Configuración llega al comité por «Credencial de correo»; el resto de sus
    // items es del administrador y no debe aparecer al expandirlo.
    fireEvent.click(screen.getByRole("button", { name: "Configuración" }))
    expect(await screen.findByRole("link", { name: "Credencial de correo" })).toBeTruthy()
    expect(screen.queryByRole("link", { name: "Configuración" })).toBeNull()
    expect(screen.queryByRole("link", { name: "Permisos" })).toBeNull()
    expect(screen.queryByRole("link", { name: "Cuentas y acceso" })).toBeNull()
  })
})
