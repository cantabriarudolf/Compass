// @vitest-environment jsdom
/**
 * T11 (S10) — la nómina de la directiva se arma buscando en el servidor.
 *
 * El diálogo de `/comunidad/directiva` montaba un checkbox por persona sobre el
 * padrón del cliente (`usePersonas()` → `/api/personas?pageSize=100`): una
 * persona fuera de las primeras cien filas del padrón no podía ser nombrada
 * directora. Ahora hay dos partes: los miembros YA ELEGIDOS (con su checkbox
 * para quitarlos, como antes) y un `BuscadorEntidad` que pregunta al servidor
 * (`GET /api/periodos-directiva/buscar-personas`).
 *
 * Lo que se fija acá:
 *   · un director buscado ENTRA a la nómina aunque el padrón del cliente esté
 *     VACÍO (no lo conoce: quedó fuera de sus primeras cien filas);
 *   · el payload que sale a `crearPeriodo` lo INCLUYE con su nombre resuelto
 *     desde la fila buscada — no con el fallback al id que tenía el código
 *     anterior cuando el padrón no conocía a la persona;
 *   · quitar un miembro ya elegido sigue funcionando (checkbox) y el payload
 *     final lo excluye.
 */
import * as React from "react"
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { instalarEntornoRadix } from "./entorno-radix"

const PRESUPUESTO_CARGA = 60_000

/** Estado compartido con las factories de `vi.mock`. El padrón del cliente NO conoce a la buscada. */
const estado = vi.hoisted(() => ({
  filas: [] as {
    id: string
    nombres: string
    apellidos: string
    estadoCuenta: string
    roles: string[]
  }[],
  crearPeriodo: vi.fn<(registro: unknown) => Promise<{ ok: true }>>(async () => ({ ok: true as const })),
}))

vi.mock("@/lib/api/use-personas", () => ({
  usePersonas: () => ({
    personas: estado.filas,
    total: estado.filas.length,
    isLoading: false,
    isValidando: false,
    error: null,
    hasMore: false,
    cargarMas: vi.fn(),
    cargandoMas: false,
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    vinculosVigentes: [],
  }),
}))

vi.mock("@/lib/api/use-actas-gd", () => ({
  useActasGD: () => ({
    actas: [],
    isLoading: false,
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    aprobar: vi.fn(),
  }),
}))

vi.mock("@/lib/api/use-periodos-directiva", () => ({
  usePeriodosDirectiva: () => ({
    periodos: [],
    vigente: undefined,
    isLoading: false,
    create: estado.crearPeriodo,
    update: vi.fn(),
    remove: vi.fn(),
    cerrar: vi.fn(),
  }),
}))

vi.mock("@/lib/api/use-controles-propiedad", () => ({
  useControlesPropiedad: () => ({ controles: [], isLoading: false }),
}))

const { default: DirectivaPage } = await import("@/app/comunidad/directiva/page")

/** Fila que responde `GET /api/periodos-directiva/buscar-personas?q=ana`. */
const FILA_BUSCADA = {
  id: "t11-per-1",
  nombreCompleto: "Ana Directora",
  rut: "7.654.321-K",
}

beforeAll(() => {
  instalarEntornoRadix()
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  estado.crearPeriodo.mockClear()
  estado.filas = []
})

/** Stub de fetch que responde la búsqueda del servidor y graba cada URL pedida. */
function stubBuscarNomina(): { llamadas: string[] } {
  const llamadas: string[] = []
  vi.stubGlobal(
    "fetch",
    vi.fn((recurso: string | URL | Request) => {
      const url = typeof recurso === "string" ? recurso : String(recurso)
      llamadas.push(url)
      return Promise.resolve(
        new Response(JSON.stringify({ data: [FILA_BUSCADA], page: 1, pageSize: 25, total: 1 }), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
      )
    })
  )
  return { llamadas }
}

interface RegistroPeriodo {
  id: string
  fechaInicio: string
  duracionMeses: number
  estado: string
  miembros: {
    personaId: string
    nombre: string
    cargo: string
    fechaAsuncion: string
    capacidad?: string
  }[]
}

/** Abre el diálogo de período: la vista administradora es la que muestra el botón. */
async function abrirDialogoPeriodo(user: ReturnType<typeof userEvent.setup>): Promise<HTMLElement> {
  render(<DirectivaPage />)
  await user.click(screen.getByRole("combobox")) // el selector de vista (único con el diálogo cerrado)
  await user.click(await screen.findByRole("option", { name: "Administrador/Directiva" }))
  await user.click(await screen.findByRole("button", { name: /Registrar período/i }))
  await screen.findByText("Registrar período de directiva")
  return screen.getByRole("dialog")
}

describe("T11 — la nómina de la directiva se busca en el servidor", () => {
  it("un director buscado entra a la nómina y el payload final lo incluye con su nombre", async () => {
    // El padrón del cliente está VACÍO: la persona que la administración quiere
    // nombrar quedó fuera de las primeras cien filas que `usePersonas` trae.
    // Con el código anterior no había forma de elegir ni nombrarla.
    const { llamadas } = stubBuscarNomina()
    const user = userEvent.setup()
    const dialogo = await abrirDialogoPeriodo(user)

    await user.type(screen.getByPlaceholderText("Buscar por nombre o RUT…"), "ana")
    await screen.findByText("Ana Directora")
    await user.click(screen.getByText("Ana Directora"))

    // La consulta fue al endpoint de la nómina, con `q`: no al padrón truncado del cliente.
    expect(llamadas.some((u) => u.startsWith("/api/periodos-directiva/buscar-personas?q=ana"))).toBe(true)
    // Entró a la nómina: aparece como miembro ya elegido, con su checkbox puesto.
    expect(within(dialogo).getByText("Ana Directora")).toBeTruthy()
    expect(within(dialogo).getByRole("checkbox")).toBeChecked()

    // Elegir el cargo es obligatorio: el payload sólo lleva miembros con cargo.
    // El texto del placeholder vive en el `SelectValue`, que tiene
    // `pointer-events: none`: el clic va al gatillo (el botón que lo contiene).
    // Las opciones se abren en un portal fuera del diálogo, sobre la pantalla.
    await user.click(within(dialogo).getByText("Cargo").closest("button") as Element)
    const listbox = await screen.findByRole("listbox")
    await user.click(within(listbox).getByRole("option", { name: "Presidente" }))

    const inicio = dialogo.querySelector('input[type="date"]')
    expect(inicio).toBeTruthy()
    fireEvent.change(inicio as Element, { target: { value: "2026-03-01" } })

    await user.click(within(dialogo).getByRole("button", { name: "Registrar período" }))

    expect(estado.crearPeriodo).toHaveBeenCalledTimes(1)
    const registro = estado.crearPeriodo.mock.calls[0]?.[0] as RegistroPeriodo
    // El nombre viene de la FILA BUSCADA, no del fallback al id: el padrón del
    // cliente no conocía a Ana (filas []) y el payload igual la nombró bien.
    expect(registro.miembros).toEqual([
      {
        personaId: "t11-per-1",
        nombre: "Ana Directora",
        cargo: "presidente",
        fechaAsuncion: "2026-03-01",
      },
    ])
  }, PRESUPUESTO_CARGA)

  it("un miembro ya elegido se quita con su checkbox y el payload final lo excluye", async () => {
    // La forma importa: la nómina no es un Select cerrado — quien ya está en la
    // lista se puede quitar, igual que con el checkbox que había.
    stubBuscarNomina()
    const user = userEvent.setup()
    const dialogo = await abrirDialogoPeriodo(user)

    await user.type(screen.getByPlaceholderText("Buscar por nombre o RUT…"), "ana")
    await screen.findByText("Ana Directora")
    await user.click(screen.getByText("Ana Directora"))
    expect(within(dialogo).getByText("Ana Directora")).toBeTruthy()

    await user.click(within(dialogo).getByRole("checkbox"))
    expect(within(dialogo).queryByText("Ana Directora")).toBeNull()

    await user.click(within(dialogo).getByRole("button", { name: "Registrar período" }))

    expect(estado.crearPeriodo).toHaveBeenCalledTimes(1)
    const registro = estado.crearPeriodo.mock.calls[0]?.[0] as RegistroPeriodo
    expect(registro.miembros).toEqual([])
  }, PRESUPUESTO_CARGA)
})
