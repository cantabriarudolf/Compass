// @vitest-environment jsdom
/**
 * Borrados de Admin, Operaciones e Inventario con guarda (T5, S1/S2) — las
 * cuatro pantallas del lote.
 *
 * La regla es la misma que fijaron T2, T3 y T4: el primer click en la papelera
 * **no borra**; abre el diálogo con el nombre concreto de la entidad y la
 * consecuencia literal que midió T1 en `odd/tasks/borrados-con-guarda.md` (qué
 * se pierde, nunca un «¿estás seguro?» vacío). La baja recién viaja al
 * confirmar, una sola vez, y el hook es quien la ejecuta: acá se mockea el
 * módulo del hook para afirmar que el primer click no lo llama.
 *
 * `mantenciones` conserva su pre-verificación de visitas técnicas
 * (comportamiento actual): se afirma que sigue rechazando sin borrar, que el
 * motivo se lee **dentro del diálogo** y que el banner de la pantalla no se
 * pierde. Las otras tres pantallas conservan su manejo previo: el aviso de
 * error del hook sigue llegando al banner y el éxito del feriado conserva su
 * mensaje literal.
 */
import React from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { instalarEntornoRadix } from "./entorno-radix"
import type {
  ElementoRA,
  Feriado,
  MantencionPreventivaPE,
  ProveedorPE,
  ProyectoMT,
  VisitaTecnicaPE,
} from "@/lib/schemas"

vi.setConfig({ testTimeout: 60_000 })

const DIA = "2026-11-26"

/* -------------------------------------------------------------------------- */
/* Consecuencias, títulos y nombres accesibles (tabla de medición fina, T1).  */
/* -------------------------------------------------------------------------- */

const ARIA_MANTENCION = "Eliminar Mantención de ascensores"
const TITULO_MANTENCION = "Eliminar la mantención «Mantención de ascensores»"
const CONSECUENCIA_MANTENCION =
  "Se pierde su programación; las visitas técnicas que la ejecutaron apuntan a una mantención inexistente."

const ARIA_ELEMENTO = "Eliminar el elemento Quincho"
const TITULO_ELEMENTO = "Eliminar el elemento «Quincho» · Espacio Físico · Piso 1"
const CONSECUENCIA_ELEMENTO =
  "Se pierden sus reservas históricas, que quedan apuntando a un elemento inexistente."

const ARIA_PROYECTO = "Eliminar el proyecto Techos 2030"
const TITULO_PROYECTO =
  "Eliminar el proyecto «Techos 2030» · Planificado · $12.000.000"
const CONSECUENCIA_PROYECTO =
  "Se pierde el proyecto con su presupuesto y plazo; el fondo que lo financiaba pierde la imputación."

const ARIA_FERIADO = "Eliminar el feriado Independencia Nacional"
const TITULO_FERIADO =
  "Eliminar el feriado «Independencia Nacional» del 2026-09-18"
const CONSECUENCIA_FERIADO =
  "El cálculo de remuneraciones de ese día deja de considerar el feriado legal."

/* -------------------------------------------------------------------------- */
/* Fixtures: una fila por pantalla, con los maestros que la fila nombra.      */
/* -------------------------------------------------------------------------- */

const PROVEEDOR: ProveedorPE = {
  id: "prv-1",
  rut: "15.000.000-9",
  nombre: "Ascensores Andinos Ltda",
  rubro: "Ascensores",
  activo: true,
}

const MANTENCION: MantencionPreventivaPE = {
  id: "mant-1",
  proveedorId: PROVEEDOR.id,
  descripcion: "Mantención de ascensores",
  periodicidadMeses: 6,
  proximaFecha: DIA,
  alertaDiasAntes: 5,
  activo: true,
}

const VISITA: VisitaTecnicaPE = {
  id: "vis-1",
  proveedorId: PROVEEDOR.id,
  mantencionId: MANTENCION.id,
  tecnicoNombre: "Pedro Técnico",
  fecha: DIA,
  trabajoRealizado: "Cambio de cables del ascensor",
}

const MICRO_SECTORES = [{ id: "ms-1", nombre: "Piso 1" }]

const ELEMENTO: ElementoRA = {
  id: "ra-1",
  nombre: "Quincho",
  tipo: "espacio_fisico",
  microSectorId: "ms-1",
  franja: "bloques_horas",
  duracionBloqueHoras: 3,
  tarifaUso: 0,
  garantiaRequerida: 0,
  activo: true,
}

const PROYECTO: ProyectoMT = {
  id: "mt-proy-1",
  nombre: "Techos 2030",
  presupuestoEstimado: 12_000_000,
  plazoMeses: 24,
  estado: "planificado",
}

const FERIADO: Feriado = {
  id: "f-1",
  fecha: "2026-09-18",
  nombre: "Independencia Nacional",
  irrenunciable: true,
}

/* -------------------------------------------------------------------------- */
/* Espías de baja: lo que la guarda tiene que NO llamar en el primer click.    */
/* -------------------------------------------------------------------------- */

const removeMantencion = vi.fn(async () => ({ ok: true }))
const removeElemento = vi.fn(async () => ({ ok: true }))
const removeProyecto = vi.fn(async () => ({ ok: true }))
const removeFeriado = vi.fn(async () => ({ ok: true }))

/** Visitas del mes: la pre-verificación de mantenciones lee esta lista. */
let visitasTecnicas: VisitaTecnicaPE[] = []

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

const sinBaja = vi.fn(async () => ({ ok: true }))

vi.mock("@/lib/api/use-pe", () => ({
  useMantencionesPE: () => coleccion([MANTENCION], removeMantencion),
  useProveedoresPE: () => coleccion([PROVEEDOR], sinBaja),
  useVisitasTecnicasPE: () => coleccion(visitasTecnicas, sinBaja),
  // Lecturas de la página de personal (misma persona, otras colecciones).
  useCierresTurnoPE: () => coleccion([], sinBaja),
  useProyeccionesPE: () => coleccion([], sinBaja),
  useTurnosIniciadosPE: () => coleccion([], sinBaja),
  useAccionesPE: () => ({
    iniciarTurno: vi.fn(async () => ({ ok: true })),
    registrarHoraExtra: vi.fn(async () => ({ ok: true })),
    registrarEvaluacion: vi.fn(async () => ({ ok: true })),
    completarTareaMonitoreo: vi.fn(async () => ({ ok: true })),
    enviarProyeccionCosto: vi.fn(async () => ({ ok: true })),
  }),
}))
vi.mock("@/lib/api/use-ra", () => ({
  useElementosRA: () => coleccion([ELEMENTO], removeElemento),
  useReservasRA: () => coleccion([], sinBaja),
}))
vi.mock("@/lib/api/use-mt", () => ({
  useTrabajosMT: () => coleccion([], sinBaja),
  useProyectosMT: () => coleccion([PROYECTO], removeProyecto),
  verificarGarantiasMT: vi.fn(async () => ({ ok: true })),
}))
vi.mock("@/lib/api/use-maestros", () => ({
  useMaestros: (tipo?: string) => ({
    data: tipo === "feriados" ? [FERIADO] : [],
    total: tipo === "feriados" ? 1 : 0,
    isLoading: false,
    error: null,
    create: vi.fn(async () => ({ ok: true })),
    update: vi.fn(async () => ({ ok: true })),
    remove: removeFeriado,
  }),
}))
vi.mock("@/lib/api/use-personas", () => ({
  usePersonas: () => ({
    personas: [],
    items: [],
    total: 0,
    isLoading: false,
    error: null,
    create: vi.fn(async () => ({ ok: true })),
  }),
}))
vi.mock("@/lib/api/use-unidades", () => ({
  useUnidades: () => coleccion([], sinBaja),
}))
vi.mock("@/lib/api/use-micro-sectores", () => ({
  useMicroSectores: () => coleccion(MICRO_SECTORES, sinBaja),
}))
vi.mock("@/lib/api/use-ir", () => ({
  useRecursosIR: () => coleccion([], sinBaja),
}))
vi.mock("@/lib/api/use-configuracion", () => ({
  useConfiguracion: () => ({
    config: null,
    isLoading: false,
    error: null,
    updateConfig: vi.fn(async () => ({ ok: true })),
  }),
}))

import { PanelMantenciones } from "@/app/admin/mantenciones/panel-mantenciones"
import ReservasPage from "@/app/operaciones/reservas/page"
import ProyectosPage from "@/app/inventario/proyectos/page"
import PersonalPage from "@/app/personas/personal/page"

function json(cuerpo: unknown): Promise<Response> {
  return Promise.resolve(
    new Response(JSON.stringify(cuerpo), {
      status: 200,
      headers: { "content-type": "application/json" },
    })
  )
}

/** Baja diferida: deja el DELETE en vuelo hasta que el test lo resuelve. */
function bajaDiferida() {
  let resolver: (resultado: { ok: boolean; error?: string }) => void = () => {}
  const promesa = new Promise<{ ok: boolean; error?: string }>((resolve) => {
    resolver = resolve
  })
  return { promesa, resolver: (resultado: { ok: boolean; error?: string }) => resolver(resultado) }
}

beforeEach(() => {
  instalarEntornoRadix()
  vi.clearAllMocks()
  visitasTecnicas = []
  removeMantencion.mockImplementation(async () => ({ ok: true }))
  removeElemento.mockImplementation(async () => ({ ok: true }))
  removeProyecto.mockImplementation(async () => ({ ok: true }))
  removeFeriado.mockImplementation(async () => ({ ok: true }))
  // Ninguna pantalla debe golpear la red con los hooks mockeados; el stub deja
  // el run determinista si alguna lectura residual pide una URL.
  vi.stubGlobal(
    "fetch",
    vi.fn(() => json({ data: [], total: 0 }))
  )
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

/** Abre el diálogo desde el disparador y devuelve el diálogo para leerlo. */
async function abrirDesdePapelera(
  usuario: ReturnType<typeof userEvent.setup>,
  ariaLabel: string
): Promise<HTMLElement> {
  await usuario.click(await screen.findByRole("button", { name: ariaLabel }))
  return screen.findByRole("alertdialog")
}

describe("el primer click en la papelera no borra: abre la guarda", () => {
  it("mantenciones: nombra la mantención con su descripción", async () => {
    const usuario = userEvent.setup()
    render(<PanelMantenciones />)

    const dialogo = await abrirDesdePapelera(usuario, ARIA_MANTENCION)

    expect(within(dialogo).getByText(TITULO_MANTENCION)).toBeTruthy()
    expect(dialogo).toHaveTextContent(CONSECUENCIA_MANTENCION)
    expect(removeMantencion).not.toHaveBeenCalled()
  })

  it("reservas: nombra el elemento con su tipo y su ubicación", async () => {
    const usuario = userEvent.setup()
    render(<ReservasPage />)

    await usuario.click(screen.getByRole("tab", { name: "Elementos" }))
    const dialogo = await abrirDesdePapelera(usuario, ARIA_ELEMENTO)

    expect(within(dialogo).getByText(TITULO_ELEMENTO)).toBeTruthy()
    expect(dialogo).toHaveTextContent(CONSECUENCIA_ELEMENTO)
    expect(removeElemento).not.toHaveBeenCalled()
  })

  it("proyectos: nombra el proyecto con su estado y su presupuesto", async () => {
    const usuario = userEvent.setup()
    render(<ProyectosPage />)

    await usuario.click(screen.getByRole("tab", { name: "Proyectos" }))
    const dialogo = await abrirDesdePapelera(usuario, ARIA_PROYECTO)

    expect(within(dialogo).getByText(TITULO_PROYECTO)).toBeTruthy()
    expect(dialogo).toHaveTextContent(CONSECUENCIA_PROYECTO)
    expect(removeProyecto).not.toHaveBeenCalled()
  })

  it("feriados: nombra el feriado con su fecha", async () => {
    const usuario = userEvent.setup()
    render(<PersonalPage />)

    await usuario.click(screen.getByRole("tab", { name: "Feriados y Proyección" }))
    const dialogo = await abrirDesdePapelera(usuario, ARIA_FERIADO)

    expect(within(dialogo).getByText(TITULO_FERIADO)).toBeTruthy()
    expect(dialogo).toHaveTextContent(CONSECUENCIA_FERIADO)
    expect(removeFeriado).not.toHaveBeenCalled()
  })
})

describe("confirmar ejecuta la baja una sola vez y cierra", () => {
  it("mantenciones: la papelera + confirmar llama al hook con el id y deja su mensaje", async () => {
    const usuario = userEvent.setup()
    render(<PanelMantenciones />)

    const dialogo = await abrirDesdePapelera(usuario, ARIA_MANTENCION)
    await usuario.click(within(dialogo).getByRole("button", { name: "Eliminar" }))

    await waitFor(() => expect(removeMantencion).toHaveBeenCalledTimes(1))
    expect(removeMantencion).toHaveBeenCalledWith("mant-1")
    expect(
      await screen.findByText("Mantención «Mantención de ascensores» eliminada.")
    ).toBeTruthy()
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull())
  })

  it("reservas: la papelera + confirmar llama al hook con el id del elemento", async () => {
    const usuario = userEvent.setup()
    render(<ReservasPage />)

    await usuario.click(screen.getByRole("tab", { name: "Elementos" }))
    const dialogo = await abrirDesdePapelera(usuario, ARIA_ELEMENTO)
    await usuario.click(within(dialogo).getByRole("button", { name: "Eliminar" }))

    await waitFor(() => expect(removeElemento).toHaveBeenCalledTimes(1))
    expect(removeElemento).toHaveBeenCalledWith("ra-1")
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull())
  })

  it("proyectos: la papelera + confirmar llama al hook con el id del proyecto", async () => {
    const usuario = userEvent.setup()
    render(<ProyectosPage />)

    await usuario.click(screen.getByRole("tab", { name: "Proyectos" }))
    const dialogo = await abrirDesdePapelera(usuario, ARIA_PROYECTO)
    await usuario.click(within(dialogo).getByRole("button", { name: "Eliminar" }))

    await waitFor(() => expect(removeProyecto).toHaveBeenCalledTimes(1))
    expect(removeProyecto).toHaveBeenCalledWith("mt-proy-1")
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull())
  })

  it("feriados: la papelera + confirmar llama al hook, cierra y conserva su mensaje", async () => {
    const usuario = userEvent.setup()
    render(<PersonalPage />)

    await usuario.click(screen.getByRole("tab", { name: "Feriados y Proyección" }))
    const dialogo = await abrirDesdePapelera(usuario, ARIA_FERIADO)
    await usuario.click(within(dialogo).getByRole("button", { name: "Eliminar" }))

    await waitFor(() => expect(removeFeriado).toHaveBeenCalledTimes(1))
    expect(removeFeriado).toHaveBeenCalledWith("f-1")
    expect(await screen.findByText("Feriado eliminado.")).toBeTruthy()
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull())
  })
})

describe("con la baja en vuelo un segundo click no dispara otra baja", () => {
  it("mantenciones: dos clicks sobre confirmar dejan una sola llamada", async () => {
    const usuario = userEvent.setup()
    const baja = bajaDiferida()
    removeMantencion.mockImplementationOnce(() => baja.promesa)
    render(<PanelMantenciones />)

    const dialogo = await abrirDesdePapelera(usuario, ARIA_MANTENCION)
    const confirmar = within(dialogo).getByRole("button", { name: "Eliminar" })
    await usuario.click(confirmar)
    await usuario.click(confirmar)

    expect(removeMantencion).toHaveBeenCalledTimes(1)

    baja.resolver({ ok: true })
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull())
    expect(removeMantencion).toHaveBeenCalledTimes(1)
  })

  it("reservas: dos clicks sobre confirmar dejan una sola llamada", async () => {
    const usuario = userEvent.setup()
    const baja = bajaDiferida()
    removeElemento.mockImplementationOnce(() => baja.promesa)
    render(<ReservasPage />)

    await usuario.click(screen.getByRole("tab", { name: "Elementos" }))
    const dialogo = await abrirDesdePapelera(usuario, ARIA_ELEMENTO)
    const confirmar = within(dialogo).getByRole("button", { name: "Eliminar" })
    await usuario.click(confirmar)
    await usuario.click(confirmar)

    expect(removeElemento).toHaveBeenCalledTimes(1)

    baja.resolver({ ok: true })
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull())
    expect(removeElemento).toHaveBeenCalledTimes(1)
  })

  it("proyectos: dos clicks sobre confirmar dejan una sola llamada", async () => {
    const usuario = userEvent.setup()
    const baja = bajaDiferida()
    removeProyecto.mockImplementationOnce(() => baja.promesa)
    render(<ProyectosPage />)

    await usuario.click(screen.getByRole("tab", { name: "Proyectos" }))
    const dialogo = await abrirDesdePapelera(usuario, ARIA_PROYECTO)
    const confirmar = within(dialogo).getByRole("button", { name: "Eliminar" })
    await usuario.click(confirmar)
    await usuario.click(confirmar)

    expect(removeProyecto).toHaveBeenCalledTimes(1)

    baja.resolver({ ok: true })
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull())
    expect(removeProyecto).toHaveBeenCalledTimes(1)
  })

  it("feriados: dos clicks sobre confirmar dejan una sola llamada", async () => {
    const usuario = userEvent.setup()
    const baja = bajaDiferida()
    removeFeriado.mockImplementationOnce(() => baja.promesa)
    render(<PersonalPage />)

    await usuario.click(screen.getByRole("tab", { name: "Feriados y Proyección" }))
    const dialogo = await abrirDesdePapelera(usuario, ARIA_FERIADO)
    const confirmar = within(dialogo).getByRole("button", { name: "Eliminar" })
    await usuario.click(confirmar)
    await usuario.click(confirmar)

    expect(removeFeriado).toHaveBeenCalledTimes(1)

    baja.resolver({ ok: true })
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull())
    expect(removeFeriado).toHaveBeenCalledTimes(1)
  })
})

describe("mantenciones: la pre-verificación de visitas técnicas se sigue leyendo", () => {
  it("el rechazo vuelve a la guarda, se lee dentro del diálogo y no se llamó al hook", async () => {
    visitasTecnicas = [VISITA]
    const MOTIVO =
      "No se puede eliminar la mantención: 1 visita(s) técnica(s) asociadas."
    const usuario = userEvent.setup()
    render(<PanelMantenciones />)

    const dialogo = await abrirDesdePapelera(usuario, ARIA_MANTENCION)
    await usuario.click(within(dialogo).getByRole("button", { name: "Eliminar" }))

    // Se lee DENTRO del diálogo (el overlay tapa el banner de la pantalla) y
    // además queda en el aviso inline, que es el manejo de error que ya existía.
    const sigueAbierto = await screen.findByRole("alertdialog")
    expect(within(sigueAbierto).getByRole("alert")).toHaveTextContent(MOTIVO)
    expect(screen.getAllByText(MOTIVO).length).toBe(2)
    expect(removeMantencion).not.toHaveBeenCalled()
  })
})
