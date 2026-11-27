// @vitest-environment jsdom
/**
 * Borrados PE con guarda (T2, S1/S2) — los cuatro paneles de operaciones.
 *
 * La regla es una sola y vale para cada entidad: el primer click en la papelera
 * **no borra**. Abre el diálogo con el nombre concreto de la fila y la
 * consecuencia literal que midió T1 en `odd/tasks/borrados-con-guarda.md`
 * (qué se pierde, nunca un «¿estás seguro?» vacío). La baja recién viaja al
 * confirmar, y el hook es quien la ejecuta: acá se mockea el módulo del hook
 * para afirmar que el primer click no lo llama.
 *
 * Se montan los componentes y no las páginas: `app/operaciones/*` son server
 * components que esperan `auth()` (mismo camino que `pe-panels.test.tsx`).
 * `proveedores` conserva su pre-verificación de mantenciones y visitas técnicas
 * (comportamiento actual): se afirma que sigue rechazando sin borrar y con el
 * mensaje literal; el diálogo además declara esa dependencia.
 */
import React from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { instalarEntornoRadix } from "./entorno-radix"
import type {
  BitacoraVisitaPE,
  EncomiendaPE,
  IngresoContratistaPE,
  ProveedorPE,
} from "@/lib/schemas"

vi.setConfig({ testTimeout: 60_000 })

const DIA = "2026-11-26"

/** Consecuencias literales de la tabla de medición fina (T1) del doc de la feature. */
const CONSECUENCIA_ENCARGO =
  "Se pierde la constancia de quién la recibió y quién la retiró."
const CONSECUENCIA_CONTRATISTA =
  "Se pierde la constancia de que ese contratista entró, con hora y motivo."
const CONSECUENCIA_PROVEEDOR =
  "Se pierde la ficha y sus datos de contacto; las mantenciones y visitas técnicas quedan nombrando un proveedor inexistente."
const CONSECUENCIA_VISITA = "Se pierde la constancia del ingreso en la bitácora."

/* -------------------------------------------------------------------------- */
/* Fixtures: una fila por panel, con los maestros que la fila nombra.          */
/* -------------------------------------------------------------------------- */

const COURIERS = [{ id: "courier-1", nombre: "Starken" }]
const ENCOMENDAS: EncomiendaPE[] = [
  {
    id: "enc-1",
    courierId: "courier-1",
    descripcionPaquete: "Caja chica",
    fechaRecepcion: DIA,
    estado: "recibida",
  },
]

const CONTRATISTAS = [{ id: "contratista-1", nombre: "Ascensores Andinos Ltda" }]
const INGRESOS: IngresoContratistaPE[] = [
  {
    id: "ing-1",
    contratistaId: "contratista-1",
    motivo: "Reparación de ascensor",
    fecha: DIA,
    jornadaId: "j-manana",
    agendadoPor: "administracion",
    estado: "agendado",
  },
]

const PROVEEDORES: ProveedorPE[] = [
  { id: "prv-1", rut: "15.000.000-9", nombre: "Hidropack SpA", rubro: "Hidropack", activo: true },
]
const MANTENCIONES_SIN_HISTORIAL: { id: string; proveedorId: string }[] = []
const VISITAS_SIN_HISTORIAL: { id: string; proveedorId: string }[] = []
const MANTENCIONES_CON_HISTORIAL = [{ id: "mant-1", proveedorId: "prv-1" }]

const JORNADAS = [{ id: "j-manana", nombre: "Mañana" }]
const UNIDADES = [{ id: "u-101", numero: "101", etiqueta: "Depto", rolSii: "123-A11" }]
const PERSONAS = [{ id: "p-1", rut: "12.345.678-9", nombreCompleto: "Ana Pérez" }]
const VISITAS: BitacoraVisitaPE[] = [
  {
    id: "vis-1",
    fecha: DIA,
    nombre: "Pedro Visitante",
    dni: "12.345.678-9",
    unidadId: "u-101",
    destinoPersonaId: "p-1",
    jornadaId: "j-manana",
    origenAgenda: "sin_aviso",
    estado: "agendada",
  },
]

/* -------------------------------------------------------------------------- */
/* Espías de baja: lo que la guarda tiene que NO llamar en el primer click.    */
/* -------------------------------------------------------------------------- */

const removeEncomienda = vi.fn(async () => ({ ok: true }))
const removeIngreso = vi.fn(async () => ({ ok: true }))
const removeProveedor = vi.fn(async () => ({ ok: true }))
const removeVisita = vi.fn(async () => ({ ok: true }))

/** Colección con el contrato de `useCrudCollection`, sin red. */
function coleccion<T>(
  items: T[],
  remove: (id: string) => Promise<{ ok: boolean; error?: string }>
) {
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
    remove,
  }
}

vi.mock("@/lib/api/use-personas", () => ({
  usePersonas: () => ({ personas: [], total: 0, isLoading: false, error: null }),
  usePersonasOperacion: () => ({
    personas: PERSONAS,
    total: PERSONAS.length,
    recortada: false,
    isLoading: false,
    error: null,
  }),
  nombresDePersonas: async () => ({}),
  buscarPersonas: async () => [],
  buscarPersonaPorRun: async () => null,
}))
vi.mock("@/lib/api/use-unidades", () => ({
  useUnidades: () => ({ items: [], total: 0, isLoading: false, error: null }),
  useUnidadesOperacion: () => ({
    unidades: UNIDADES,
    total: UNIDADES.length,
    recortada: false,
    isLoading: false,
    error: null,
  }),
  etiquetasDeUnidades: async () => ({}),
  buscarUnidades: async () => [],
}))
vi.mock("@/lib/api/use-vinculos", () => ({
  useVinculos: () => ({ vinculos: [], isLoading: false, error: null }),
}))
vi.mock("@/lib/api/use-pe", () => ({
  useEncomiendasPE: () => coleccion(ENCOMENDAS, removeEncomienda),
  useIngresosContratistasPE: () => coleccion(INGRESOS, removeIngreso),
  useBitacoraVisitasPE: () => coleccion(VISITAS, removeVisita),
  useProveedoresPE: () => coleccion(PROVEEDORES, removeProveedor),
  useMantencionesPE: () => coleccion(MANTENCIONES_GLOBALES(), vi.fn(async () => ({ ok: true }))),
  useVisitasTecnicasPE: () => coleccion(VISITAS_TECNICAS_GLOBALES(), vi.fn(async () => ({ ok: true }))),
  useMaestrosPE: (tipo: string) => ({
    data:
      tipo === "couriers" ? COURIERS : tipo === "contratistas" ? CONTRATISTAS : JORNADAS,
    total: 1,
    isLoading: false,
    error: null,
  }),
  registrarVisitaTecnicaApi: vi.fn(async () => ({ ok: true })),
}))

/**
 * Historial del proveedor: cada caso decide antes de montar si `prv-1` tiene
 * mantenciones (el caso de la pre-verificación que se conserva).
 */
function MANTENCIONES_GLOBALES() {
  return mantencionesDelProveedor
}
function VISITAS_TECNICAS_GLOBALES() {
  return visitasTecnicasDelProveedor
}
let mantencionesDelProveedor = MANTENCIONES_SIN_HISTORIAL
let visitasTecnicasDelProveedor = VISITAS_SIN_HISTORIAL

import { EncomiendasPanel } from "@/components/pe/encomiendas-panel"
import { ContratistasPanel } from "@/components/pe/contratistas-panel"
import { ProveedoresPanel } from "@/components/pe/proveedores-panel"
import { VisitasPanel } from "@/components/pe/visitas-panel"

function montarEncomiendas() {
  return render(<EncomiendasPanel diaReporte={DIA} onError={vi.fn()} onSuccess={vi.fn()} />)
}

function montarContratistas() {
  return render(<ContratistasPanel diaReporte={DIA} onError={vi.fn()} onSuccess={vi.fn()} />)
}

function montarProveedores() {
  return render(<ProveedoresPanel roles={["administrador"]} />)
}

function montarVisitas() {
  return render(<VisitasPanel diaReporte={DIA} onError={vi.fn()} onSuccess={vi.fn()} />)
}

/** Abre el diálogo desde la papelera y devuelve el diálogo para leerlo. */
async function abrirDesdePapelera(
  usuario: ReturnType<typeof userEvent.setup>,
  ariaLabel: string
): Promise<HTMLElement> {
  await usuario.click(await screen.findByRole("button", { name: ariaLabel }))
  return screen.findByRole("alertdialog")
}

beforeEach(() => {
  instalarEntornoRadix()
  vi.clearAllMocks()
  mantencionesDelProveedor = MANTENCIONES_SIN_HISTORIAL
  visitasTecnicasDelProveedor = VISITAS_SIN_HISTORIAL
})

afterEach(() => {
  cleanup()
})

describe("el primer click en la papelera no borra: abre la guarda", () => {
  it("encomiendas: nombra la encomienda del courier y avisa que se pierde la constancia del retiro", async () => {
    const usuario = userEvent.setup()
    montarEncomiendas()

    const dialogo = await abrirDesdePapelera(usuario, "Eliminar la encomienda de Starken")

    expect(within(dialogo).getByText("Eliminar la encomienda de Starken · Caja chica")).toBeTruthy()
    expect(dialogo).toHaveTextContent(CONSECUENCIA_ENCARGO)
    expect(removeEncomienda).not.toHaveBeenCalled()
  })

  it("contratistas: nombra el ingreso de la empresa y su motivo", async () => {
    const usuario = userEvent.setup()
    montarContratistas()

    const dialogo = await abrirDesdePapelera(
      usuario,
      "Eliminar el ingreso de Ascensores Andinos Ltda"
    )

    expect(
      within(dialogo).getByText(
        "Eliminar el ingreso de Ascensores Andinos Ltda · Reparación de ascensor"
      )
    ).toBeTruthy()
    expect(dialogo).toHaveTextContent(CONSECUENCIA_CONTRATISTA)
    expect(removeIngreso).not.toHaveBeenCalled()
  })

  it("proveedores: nombra el proveedor y declara la dependencia de mantenciones y visitas", async () => {
    const usuario = userEvent.setup()
    montarProveedores()

    const dialogo = await abrirDesdePapelera(usuario, "Eliminar Hidropack SpA")

    expect(within(dialogo).getByText("Eliminar el proveedor Hidropack SpA")).toBeTruthy()
    expect(dialogo).toHaveTextContent(CONSECUENCIA_PROVEEDOR)
    expect(removeProveedor).not.toHaveBeenCalled()
  })

  it("visitas: nombra la visita con su DNI y la unidad, y avisa que se pierde la constancia", async () => {
    const usuario = userEvent.setup()
    montarVisitas()

    const dialogo = await abrirDesdePapelera(usuario, "Eliminar la visita de Pedro Visitante")

    expect(
      within(dialogo).getByText(
        "Eliminar la visita de Pedro Visitante · 12.345.678-9 · Depto 101 · 123-A11"
      )
    ).toBeTruthy()
    expect(dialogo).toHaveTextContent(CONSECUENCIA_VISITA)
    expect(removeVisita).not.toHaveBeenCalled()
  })
})

describe("confirmar ejecuta la baja una sola vez y cierra", () => {
  it("encomiendas: la papelera + confirmar llama al hook con el id de la fila", async () => {
    const usuario = userEvent.setup()
    montarEncomiendas()

    const dialogo = await abrirDesdePapelera(usuario, "Eliminar la encomienda de Starken")
    await usuario.click(within(dialogo).getByRole("button", { name: "Eliminar" }))

    await waitFor(() => expect(removeEncomienda).toHaveBeenCalledTimes(1))
    expect(removeEncomienda).toHaveBeenCalledWith("enc-1")
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull())
  })
})

describe("proveedores: la pre-verificación actual se conserva", () => {
  it("un proveedor con mantenciones no se borra y el panel muestra el motivo literal", async () => {
    mantencionesDelProveedor = MANTENCIONES_CON_HISTORIAL
    const usuario = userEvent.setup()
    montarProveedores()

    const dialogo = await abrirDesdePapelera(usuario, "Eliminar Hidropack SpA")
    await usuario.click(within(dialogo).getByRole("button", { name: "Eliminar" }))

    const MOTIVO =
      "No se puede eliminar el proveedor: 1 mantención(es) y 0 visita(s) técnica(s) asociadas."
    // Se lee DENTRO del diálogo (el overlay tapa el banner) y además queda
    // escrito en el banner del panel, que es el comportamiento que ya existía.
    expect(await screen.findByRole("alert")).toHaveTextContent(MOTIVO)
    expect(screen.getAllByText(MOTIVO).length).toBe(2)
    expect(removeProveedor).not.toHaveBeenCalled()
    // El diálogo sigue abierto: el motivo es lo que el usuario tiene que leer.
    expect(screen.getByRole("alertdialog")).toBeTruthy()
  })

  it("sin historial, confirmar borra una vez y conserva su mensaje de éxito", async () => {
    const usuario = userEvent.setup()
    montarProveedores()

    const dialogo = await abrirDesdePapelera(usuario, "Eliminar Hidropack SpA")
    await usuario.click(within(dialogo).getByRole("button", { name: "Eliminar" }))

    await waitFor(() => expect(removeProveedor).toHaveBeenCalledTimes(1))
    expect(removeProveedor).toHaveBeenCalledWith("prv-1")
    expect(await screen.findByText("Proveedor eliminado.")).toBeTruthy()
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull())
  })
})
