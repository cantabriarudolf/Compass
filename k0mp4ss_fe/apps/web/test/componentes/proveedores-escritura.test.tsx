// @vitest-environment jsdom
/**
 * Escritura del maestro de proveedores — la pantalla y el motor dicen lo mismo.
 *
 * `f7959cd` le dio a `pe:proveedor` su propia clave: el administrador administra
 * el maestro, el resto de la operación solo LEE quién es la empresa. La pantalla
 * de `/operaciones/proveedores` seguía ofreciendo alta, edición y baja para
 * conserjería y mantención, y esos botones ya respondían 403.
 *
 * El caso se mide sobre `components/pe/proveedores-panel.tsx` y no sobre
 * `app/operaciones/proveedores/page.tsx` porque la página es un server component
 * `async` que espera `auth()` y no se puede montar en jsdom (mismo camino que
 * `dashboard-contadores.test.tsx`). La página solo resuelve `session.user.roles`;
 * lo que se afirma acá es lo que se pinta para esos roles.
 *
 * Lo que se afirma, por rol:
 * - la lectura del catálogo sigue viva (las seis filas del maestro se ven);
 * - los controles de escritura se ven si y solo si la matriz concede la acción
 *   que la ruta exige (`crear` alta, `editar` edición, `eliminar` baja);
 * - las otras dos pestañas (visitas técnicas y directorio de emergencias) no
 *   cambiaron para quien puede alcanzarlas.
 */
import React from "react"
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { instalarEntornoRadix } from "./entorno-radix"
import type { ContactoEmergencia, ProveedorPE } from "@/lib/schemas"

/**
 * Seis proveedores: el mismo tamaño del maestro sembrado en desarrollo, para que
 * la lectura se afirme con el catálogo completo y no con una fila de muestra.
 */
const PROVEEDORES: ProveedorPE[] = [
  { id: "prv-1", rut: "15.000.000-9", nombre: "Hidropack SpA", rubro: "Mantención de hidropack", activo: true },
  { id: "prv-2", rut: "15.000.001-7", nombre: "Ascensores Andinos Ltda", rubro: "Ascensores", activo: true },
  { id: "prv-3", rut: "15.000.002-5", nombre: "Constructora Vértice SpA", rubro: "Mantención de edificio", activo: true },
  { id: "prv-4", rut: "15.000.003-3", nombre: "Aseo Industrial Limpio SpA", rubro: "Aseo y sanitización", activo: true },
  { id: "prv-5", rut: "15.000.004-1", nombre: "Jardines del Valle SpA", rubro: "Áreas verdes", activo: true },
  { id: "prv-6", rut: "15.000.005-K", nombre: "Seguridad Total SpA", rubro: "Seguridad y CCTV", activo: true },
]

const CONTACTOS_EMERGENCIA: ContactoEmergencia[] = [
  { id: "ce-1", categoria: "urgencia", nombre: "Bomberos Ñuñoa", telefono: "+56 2 2345 6789" },
  { id: "tecnico-1", categoria: "tecnico", nombre: "Ascensores Andinos", telefono: "+56 2 2987 6543" },
]

/** Colección con el contrato de `useCrudCollection`, sin red. */
function coleccion<T>(items: T[]) {
  return {
    items,
    total: items.length,
    isLoading: false,
    error: null,
    hasMore: false,
    cargandoMas: false,
    cargarMas: vi.fn(async () => {}),
    create: vi.fn(async () => ({ ok: true })),
    update: vi.fn(async () => ({ ok: true })),
    remove: vi.fn(async () => ({ ok: true })),
  }
}

vi.mock("@/lib/api/use-personas", () => ({
  usePersonas: () => ({ personas: [], total: 0, isLoading: false, error: null }),
}))
vi.mock("@/lib/api/use-unidades", () => ({
  useUnidades: () => ({ items: [], total: 0, isLoading: false, error: null }),
}))
vi.mock("@/lib/api/use-maestros", () => ({
  useMaestros: () => ({ data: CONTACTOS_EMERGENCIA, isLoading: false, error: null }),
}))
vi.mock("@/lib/api/use-pe", () => ({
  useProveedoresPE: () => coleccion(PROVEEDORES),
  useMantencionesPE: () => coleccion([]),
  useVisitasTecnicasPE: () => coleccion([]),
  // El alta de la visita ya no usa el `create` de la colección: el avance del ciclo
  // preventivo viaja en el cuerpo del POST y lo lee esta función (servidor, no el
  // `PUT` de mantenciones que respondía 403). Sin ella el módulo mockeado no cubre
  // lo que el panel importa.
  registrarVisitaTecnicaApi: vi.fn(async () => ({ ok: true })),
}))

import { ProveedoresPanel } from "@/components/pe/proveedores-panel"

function montar(roles: string[]) {
  return render(<ProveedoresPanel roles={roles} />)
}

/** El maestro se sigue leyendo: las seis empresas están en la tabla. */
function afirmarCatalogoCompleto(): void {
  for (const proveedor of PROVEEDORES) {
    expect(screen.getByText(proveedor.nombre)).toBeTruthy()
  }
  expect(screen.getByRole("tab", { name: "Catálogo (6)" })).toBeTruthy()
}

/** Ningún control de escritura quedó montado. */
function afirmarSinEscritura(): void {
  expect(screen.queryByRole("button", { name: "Nuevo" })).toBeNull()
  for (const proveedor of PROVEEDORES) {
    expect(screen.queryByRole("button", { name: `Editar ${proveedor.nombre}` })).toBeNull()
    expect(screen.queryByRole("button", { name: `Eliminar ${proveedor.nombre}` })).toBeNull()
  }
}

beforeAll(() => {
  instalarEntornoRadix()
})

afterEach(() => {
  cleanup()
})

describe("catálogo de proveedores: la escritura sigue al permiso", () => {
  it("el administrador ve alta, edición y baja (las tres escrituras de la matriz)", () => {
    montar(["administrador"])

    afirmarCatalogoCompleto()
    expect(screen.getByRole("button", { name: "Nuevo" })).toBeTruthy()
    for (const proveedor of PROVEEDORES) {
      expect(screen.getByRole("button", { name: `Editar ${proveedor.nombre}` })).toBeTruthy()
      expect(screen.getByRole("button", { name: `Eliminar ${proveedor.nombre}` })).toBeTruthy()
    }
  })

  it("conserjería lee el maestro y no recibe ningún control de escritura", () => {
    montar(["conserjeria"])

    afirmarCatalogoCompleto()
    afirmarSinEscritura()
  })

  it("mantención lee el maestro y no recibe ningún control de escritura", () => {
    montar(["mantencion"])

    afirmarCatalogoCompleto()
    afirmarSinEscritura()
  })

  it("el comité lee el maestro sin administrarlo", () => {
    montar(["comite"])

    afirmarCatalogoCompleto()
    afirmarSinEscritura()
  })

  it("un rol múltiple escribe si alguna de sus membresías escribe", () => {
    montar(["conserjeria", "administrador"])

    expect(screen.getByRole("button", { name: "Nuevo" })).toBeTruthy()
    expect(
      screen.getByRole("button", { name: `Eliminar ${PROVEEDORES[1]!.nombre}` })
    ).toBeTruthy()
  })
})

describe("el formulario no queda abierto para quien no puede guardarlo", () => {
  it("el administrador sigue abriendo el alta desde 'Nuevo'", async () => {
    const usuario = userEvent.setup()
    montar(["administrador"])

    await usuario.click(screen.getByRole("button", { name: "Nuevo" }))

    const dialogo = await screen.findByRole("dialog")
    expect(within(dialogo).getByRole("heading", { name: "Nuevo proveedor" })).toBeTruthy()
  })

  it("conserjería no puede abrir el formulario: sin 'Nuevo', no hay diálogo", async () => {
    const usuario = userEvent.setup()
    montar(["conserjeria"])

    afirmarSinEscritura()
    // Cualquier click disponible en el catálogo deja el diálogo cerrado.
    await usuario.click(screen.getByRole("tab", { name: "Catálogo (6)" }))
    expect(screen.queryByRole("dialog")).toBeNull()
  })
})

describe("las otras pestañas no cambiaron para quien las alcanza", () => {
  it("conserjería sigue registrando visitas técnicas", async () => {
    const usuario = userEvent.setup()
    montar(["conserjeria"])

    await usuario.click(screen.getByRole("tab", { name: /Visitas Técnicas/ }))

    expect(await screen.findByRole("button", { name: /Nueva visita/ })).toBeTruthy()
    expect(screen.getByText("Libro de Visitas Técnicas")).toBeTruthy()
  })

  it("conserjería sigue leyendo el directorio de emergencias", async () => {
    const usuario = userEvent.setup()
    montar(["conserjeria"])

    await usuario.click(screen.getByRole("tab", { name: "Directorio Emergencias" }))

    expect(await screen.findByText("Bomberos Ñuñoa")).toBeTruthy()
    expect(screen.getByText("Ascensores Andinos")).toBeTruthy()
  })
})
