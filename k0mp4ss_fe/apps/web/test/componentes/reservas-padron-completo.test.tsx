// @vitest-environment jsdom
/**
 * Padrón completo en `operaciones/reservas` — identidad y selector fuera de la
 * página 1 (F38/F40, lote «cerrar el techo de 100», T3).
 *
 * `app/operaciones/reservas/page.tsx` resuelve la identidad con
 * `personas.find()` (`nombrePersona`) y `unidades.find()` (rótulo de la unidad
 * en la fila del calendario) sobre lo que trajeron `usePersonas()` y
 * `useUnidades()` —ambos `pageSize=100`— y llena el `Select` de solicitante y
 * el de «Unidad del residente» con esos mismos padrones. Con un padrón de dos
 * páginas: la fila del calendario imprime el id crudo del residente que cayó
 * fuera de la página 1 y pierde el rótulo de su unidad, y la persona y la
 * unidad de la página 2 no se pueden elegir.
 *
 * La palanca ya existe en los dos hooks: `{ todasLasPaginas: true }` (universo
 * acotado: el padrón de una comunidad). El caso monta los hooks REALES de
 * personas y unidades y sustituye solo la capa de red (mismo arnés que
 * `multas-padron-completo`): `/api/personas` y `/api/unidades` responden
 * `?pageSize=100` con `?page=N` respetado, así el RED cae por identidad o por
 * opción ausente, no por una petición ausente. Las colecciones RA (elementos
 * reservables, micro-sectores, activos IR) no son el padrón: van mockeadas o
 * de una sola página y NO se tocan.
 */
import React from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { SWRConfig } from "swr"
import { cleanup, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { instalarEntornoRadix } from "./entorno-radix"
import type { ElementoRA, ReservaRA } from "@/lib/schemas"

vi.mock("@/lib/api/use-micro-sectores", () => ({
  useMicroSectores: () => ({ items: [], total: 0, isLoading: false, error: null }),
}))
vi.mock("@/lib/api/use-ir", () => ({
  useRecursosIR: () => ({ items: [], total: 0, isLoading: false, error: null }),
}))

import ReservasPage from "@/app/operaciones/reservas/page"

vi.setConfig({ testTimeout: 60_000 })

interface PersonaFalsa {
  id: string
  nombres: string
  apellidos: string
  estadoCuenta: string
}

interface UnidadFalsa {
  id: string
  numero: string
  etiqueta: string
}

interface EstadoPadronReservas {
  reservas: ReservaRA[]
  elementos: ElementoRA[]
  personas: PersonaFalsa[]
  unidades: UnidadFalsa[]
}

const ELEMENTO: ElementoRA = {
  id: "el-quincho",
  nombre: "Quincho",
  tipo: "espacio_fisico",
  franja: "bloques_horas",
  duracionBloqueHoras: 2,
  tarifaUso: 15_000,
  garantiaRequerida: 5_000,
  activo: true,
} as unknown as ElementoRA

function respuestaJson(datos: unknown, status = 200): Response {
  return new Response(JSON.stringify(datos), {
    status,
    headers: { "content-type": "application/json" },
  })
}

/** Página con el mismo envelope y el mismo tope de `pageSize` que el servidor. */
function paginar(
  filas: unknown[],
  url: URL
): { data: unknown[]; page: number; pageSize: number; total: number } {
  const page = Math.max(1, Number.parseInt(url.searchParams.get("page") ?? "1", 10) || 1)
  const pageSize = Math.min(
    100,
    Math.max(1, Number.parseInt(url.searchParams.get("pageSize") ?? "100", 10) || 100)
  )
  const desde = (page - 1) * pageSize
  return { data: filas.slice(desde, desde + pageSize), page, pageSize, total: filas.length }
}

function persona(id: string, nombres: string, apellidos: string, estadoCuenta: string): PersonaFalsa {
  return { id, nombres, apellidos, estadoCuenta }
}

/** La reserva de la página 1 del calendario referencia gente y unidad de la página 2. */
function estadoDosPaginas(): EstadoPadronReservas {
  const reservas: ReservaRA[] = [
    {
      id: "rs-fuera",
      folio: "RA-0001",
      elementoId: ELEMENTO.id,
      solicitantePersonaId: "p-eva",
      unidadId: "u-fuera-907",
      fecha: "2027-01-15",
      horaInicio: "10:00",
      horaFin: "12:00",
      estado: "confirmada",
      montoTarifa: 15_000,
      montoGarantia: 5_000,
    } as unknown as ReservaRA,
  ]
  const personas: PersonaFalsa[] = []
  for (let i = 1; i <= 100; i++) {
    personas.push(persona(`p-f-${String(i).padStart(3, "0")}`, `Relleno ${i}`, "Padron", "activa"))
  }
  // Página 2: Eva es activa (debe poder elegirse y resolverse por nombre) y
  // Rosa inactiva (no debe ofrecerse nunca, tampoco desde el padrón completo).
  personas.push(persona("p-eva", "Eva", "Fuera De Pagina", "activa"))
  personas.push(persona("p-rosa", "Rosa", "Inactiva", "inactiva"))
  const unidades: UnidadFalsa[] = []
  for (let i = 1; i <= 100; i++) {
    unidades.push({ id: `u-f-${String(i).padStart(3, "0")}`, numero: String(i), etiqueta: "Depto" })
  }
  unidades.push({ id: "u-fuera-907", numero: "907", etiqueta: "Casa" })
  return { reservas, elementos: [ELEMENTO], personas, unidades }
}

/** Instala el servidor falso. Limpiar con `vi.unstubAllGlobals()`. */
function instalarApiReservas(estado: EstadoPadronReservas): { peticiones: string[] } {
  const peticiones: string[] = []
  vi.stubGlobal(
    "fetch",
    async (entrada: RequestInfo | URL): Promise<Response> => {
      const crudo =
        typeof entrada === "string" ? entrada : entrada instanceof URL ? entrada.href : entrada.url
      peticiones.push(crudo)
      const url = new URL(crudo, "http://localhost")
      switch (url.pathname) {
        case "/api/ra/reservas":
          return respuestaJson(paginar(estado.reservas, url))
        case "/api/ra/elementos":
          return respuestaJson(paginar(estado.elementos, url))
        case "/api/personas":
          return respuestaJson(paginar(estado.personas, url))
        case "/api/unidades":
          return respuestaJson(paginar(estado.unidades, url))
        default:
          // Cualquier otra ruta es un contrato que el falso no declaró: 404.
          return respuestaJson({ error: `ruta no servida por el falso: ${url.pathname}` }, 404)
      }
    }
  )
  return { peticiones }
}

beforeEach(() => {
  instalarEntornoRadix()
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

/** SWR con caché fresca por render: un caso no hereda las filas del anterior. */
function renderPagina(nodo: React.ReactElement): void {
  render(<SWRConfig value={{ provider: () => new Map() }}>{nodo}</SWRConfig>)
}

/** La fila de la tabla que muestra ese folio. */
function filaDe(folio: string): HTMLElement {
  const celda = screen.getByText(folio)
  const tr = celda.closest("tr")
  if (!tr) throw new Error(`sin fila para ${folio}`)
  return tr as HTMLElement
}

describe("operaciones/reservas — padrón completo para la identidad", () => {
  it("la fila del calendario imprime el nombre y la unidad de la página 2, no el id", async () => {
    const api = instalarApiReservas(estadoDosPaginas())
    renderPagina(<ReservasPage />)

    // La reserva de la página 1 referencia persona y unidad que viven en la
    // página 2 de los padrones: el nombre y el rótulo se resuelven, sin ids.
    const fila = await screen.findByText("RA-0001").then((celda) => celda.closest("tr") as HTMLElement)
    expect(within(fila).getByText("Eva Fuera De Pagina")).toBeInTheDocument()
    expect(within(fila).queryByText("p-eva")).toBeNull()
    expect(within(fila).getByText("Casa 907")).toBeInTheDocument()
    expect(within(fila).queryByText("u-fuera-907")).toBeNull()

    // La identidad salió de las páginas 2 de ambos padrones: se caminaron.
    expect(api.peticiones.some((p) => p === "/api/personas?pageSize=100&page=2")).toBe(true)
    expect(api.peticiones.some((p) => p === "/api/unidades?pageSize=100&page=2")).toBe(true)
  })
})

describe("operaciones/reservas — padrón completo para los selectores", () => {
  it("la persona activa y la unidad de la página 2 se pueden elegir; la inactiva no se ofrece", async () => {
    instalarApiReservas(estadoDosPaginas())
    renderPagina(<ReservasPage />)

    // La tabla debe estar servida antes de abrir el diálogo; la caminata del
    // padrón sigue en vuelo y el listbox la refleja mientras está abierto.
    await screen.findByText("RA-0001")

    const user = userEvent.setup({ delay: null })
    await user.click(screen.getByRole("button", { name: /Nueva reserva/ }))
    const dialog = await screen.findByRole("dialog")
    const combos = await within(dialog).findAllByRole("combobox")
    // 0 Elemento reservable · 1 Solicitante (MP) · 2 Unidad del residente · 3 Tramo horario
    expect(combos).toHaveLength(4)

    await user.click(combos[1]!)
    const listaPersonas = await screen.findByRole("listbox", {}, { timeout: 5_000 })
    // La caminata completa el padrón con el listbox abierto: la activa de la
    // página 2 tiene que TERMINAR en el listbox, no sólo en los datos.
    await waitFor(
      () => {
        const textos = within(listaPersonas)
          .getAllByRole("option")
          .map((o) => o.textContent)
        expect(textos).toContain("Eva Fuera De Pagina")
      },
      { timeout: 10_000 }
    )
    const eva = within(listaPersonas)
      .getAllByRole("option")
      .find((o) => o.textContent === "Eva Fuera De Pagina")
    // La inactiva de la página 2 sigue sin ofrecerse con el padrón completo.
    expect(within(listaPersonas).queryByText("Rosa Inactiva")).toBeNull()
    await user.click(eva as HTMLElement)
    expect(await within(dialog).findByText("Eva Fuera De Pagina")).toBeInTheDocument()

    const combosTrasPersona = await within(dialog).findAllByRole("combobox")
    await user.click(combosTrasPersona[2]!)
    const listaUnidades = await screen.findByRole("listbox", {}, { timeout: 5_000 })
    await waitFor(
      () => {
        const textos = within(listaUnidades)
          .getAllByRole("option")
          .map((o) => o.textContent)
        expect(textos).toContain("Casa 907")
      },
      { timeout: 10_000 }
    )
    const casa907 = within(listaUnidades)
      .getAllByRole("option")
      .find((o) => o.textContent === "Casa 907")
    await user.click(casa907 as HTMLElement)
    expect(await within(dialog).findByText("Casa 907")).toBeInTheDocument()
  })
})

describe("operaciones/reservas — padrones en una sola página", () => {
  it("la identidad y los selectores no cambian y no se piden páginas extra", async () => {
    const api = instalarApiReservas({
      reservas: [
        {
          id: "rs-1",
          folio: "RA-0001",
          elementoId: ELEMENTO.id,
          solicitantePersonaId: "p-lidia",
          unidadId: "u-1",
          fecha: "2027-01-15",
          horaInicio: "10:00",
          horaFin: "12:00",
          estado: "confirmada",
          montoTarifa: 15_000,
          montoGarantia: 5_000,
        } as unknown as ReservaRA,
      ],
      elementos: [ELEMENTO],
      personas: [persona("p-lidia", "Lidia", "Propietaria", "activa")],
      unidades: [{ id: "u-1", numero: "1", etiqueta: "Depto" }],
    })
    renderPagina(<ReservasPage />)

    // Todo cabe en una página: la identidad se resuelve igual.
    const fila = await screen.findByText("RA-0001").then((celda) => celda.closest("tr") as HTMLElement)
    await waitFor(() => expect(within(fila).getByText("Lidia Propietaria")).toBeInTheDocument())
    expect(within(fila).getByText("Depto 1")).toBeInTheDocument()
    // Ningún padrón pidió completarse: completarlos no agrega peticiones.
    expect(api.peticiones.some((p) => p.includes("&page=2"))).toBe(false)
  })
})
