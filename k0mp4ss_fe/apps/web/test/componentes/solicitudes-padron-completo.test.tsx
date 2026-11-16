// @vitest-environment jsdom
/**
 * Padrón completo en `operaciones/solicitudes` — identidad y selectores fuera de
 * la página 1 (F38/F40, lote «cerrar el techo de 100», T4).
 *
 * `app/operaciones/solicitudes/page.tsx` resuelve la identidad con
 * `personas.find()` (`nombrePersona`, filas del detalle y filtro de solicitante),
 * `unidades.find()` (`refUnidad`, celda de unidad de la bandja) y la relación
 * persona→unidad con `vinculos.find()`, y llena cuatro `Select` con los mismos
 * padrones («Actuar como», filtro de unidad, «Residente solicitante» y «Unidad
 * vinculada»). Los tres primeros provienen de `usePersonas()`/`useUnidades()`,
 * ambos `pageSize=100`; con un padrón de dos páginas: la unidad de la página 2
 * se imprime como id crudo en la fila, el solicitante de la página 2 se imprime
 * como id en el detalle, y ni la persona ni la unidad de la página 2 se pueden
 * elegir en los Select.
 *
 * La palanca ya existe en los dos hooks: `{ todasLasPaginas: true }` (universo
 * acotado: el padrón de una comunidad). El caso monta los hooks REALES de
 * personas y unidades y sustituye solo la capa de red (mismo arnés que
 * `reservas-padron-completo`): `/api/personas` y `/api/unidades` responden
 * `?pageSize=100` con `?page=N` respetado, así el RED cae por identidad o por
 * opción ausente, no por una petición ausente. Las colecciones GE, CO y VU no
 * son el padrón: van de una sola página y NO se tocan.
 */
import React from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { SWRConfig } from "swr"
import { cleanup, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { instalarEntornoRadix } from "./entorno-radix"
import SolicitudesPage from "@/app/operaciones/solicitudes/page"

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

interface EstadoPadronSolicitudes {
  solicitudes: unknown[]
  personas: PersonaFalsa[]
  unidades: UnidadFalsa[]
  vinculos: unknown[]
  mensajes: unknown[]
}

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

/** El ticket de la página 1 referencia gente y unidad que viven en la página 2. */
function estadoDosPaginas(): EstadoPadronSolicitudes {
  const solicitudes = [
    {
      id: "sol-fuera",
      folio: "GE-0001",
      tipo: "grabaciones",
      titulo: "Cámaras del estacionamiento",
      descripcion: "Revisión de las cámaras del estacionamiento subterráneo, corte de 22:40.",
      solicitantePersonaId: "p-eva",
      unidadId: "u-fuera-907",
      estado: "en_revision",
      fechaCreacion: "2027-01-10",
      comentarios: [],
      historialEstados: [],
    },
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
  return { solicitudes, personas, unidades, vinculos: [], mensajes: [] }
}

/** Instala el servidor falso. Limpiar con `vi.unstubAllGlobals()`. */
function instalarApiSolicitudes(estado: EstadoPadronSolicitudes): { peticiones: string[] } {
  const peticiones: string[] = []
  vi.stubGlobal(
    "fetch",
    async (entrada: RequestInfo | URL): Promise<Response> => {
      const crudo =
        typeof entrada === "string" ? entrada : entrada instanceof URL ? entrada.href : entrada.url
      peticiones.push(crudo)
      const url = new URL(crudo, "http://localhost")
      switch (url.pathname) {
        case "/api/ge/solicitudes":
          return respuestaJson(paginar(estado.solicitudes, url))
        case "/api/personas":
          return respuestaJson(paginar(estado.personas, url))
        case "/api/unidades":
          return respuestaJson(paginar(estado.unidades, url))
        case "/api/vinculos":
          return respuestaJson(paginar(estado.vinculos, url))
        case "/api/co/mensajes-buzon":
          return respuestaJson(paginar(estado.mensajes, url))
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

/** La fila de la bandja que muestra ese folio. */
function filaDe(folio: string): HTMLElement {
  const celda = screen.getByText(folio)
  const tr = celda.closest("tr")
  if (!tr) throw new Error(`sin fila para ${folio}`)
  return tr as HTMLElement
}

describe("operaciones/solicitudes — padrón completo para la identidad", () => {
  it("la fila imprime la unidad de la página 2 y el detalle imprime el nombre del solicitante, no el id", async () => {
    const api = instalarApiSolicitudes(estadoDosPaginas())
    renderPagina(<SolicitudesPage />)

    // La celda de unidad de la fila se resuelve con el padrón completo: la
    // unidad vive en la página 2 y debe imprimir «Casa 907», no el id crudo.
    const fila = (await screen.findByText("GE-0001")).closest("tr") as HTMLElement
    await waitFor(
      () => {
        expect(within(fila).getByText("Casa 907")).toBeInTheDocument()
      },
      { timeout: 10_000 }
    )
    expect(within(fila).queryByText("u-fuera-907")).toBeNull()

    // El detalle resuelve al solicitante con nombre: vive en la página 2.
    const user = userEvent.setup({ delay: null })
    await user.click(within(fila).getByRole("button", { name: /Ver/ }))
    const dialogo = await screen.findByRole("dialog")
    await waitFor(
      () => {
        expect(within(dialogo).getByText(/Eva Fuera De Pagina/)).toBeInTheDocument()
      },
      { timeout: 10_000 }
    )
    expect(within(dialogo).queryByText(/p-eva/)).toBeNull()

    // La identidad salió de las páginas 2 de ambos padrones: se caminaron.
    expect(api.peticiones).toContain("/api/personas?pageSize=100&page=2")
    expect(api.peticiones).toContain("/api/unidades?pageSize=100&page=2")
  })
})

describe("operaciones/solicitudes — padrón completo para los selectores", () => {
  it("la persona activa y la unidad de la página 2 se pueden elegir en el diálogo de conserjería", async () => {
    const api = instalarApiSolicitudes(estadoDosPaginas())
    renderPagina(<SolicitudesPage />)

    // La bandja debe estar servida antes de abrir el diálogo; la caminata del
    // padrón sigue en vuelo y el listbox la refleja mientras está abierto.
    await screen.findByText("GE-0001")

    const user = userEvent.setup({ delay: null })
    await user.click(screen.getByRole("button", { name: /Enviar Solicitud/ }))
    const dialogo = await screen.findByRole("dialog")
    // Conserjería obliga a vincular persona/unidad: aparecen los dos Select del padrón.
    await user.click(within(dialogo).getByRole("checkbox", { name: /conserje/i }))
    const combos = within(dialogo).getAllByRole("combobox")
    // 0: Tipo de gestión · 1: Residente solicitante · 2: Unidad vinculada
    expect(combos).toHaveLength(3)

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
    expect(await within(dialogo).findByText("Eva Fuera De Pagina")).toBeInTheDocument()

    const combosTrasPersona = within(dialogo).getAllByRole("combobox")
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
    expect(await within(dialogo).findByText("Casa 907")).toBeInTheDocument()

    // Los dos Select se llenaron con el padrón completo: se caminó la página 2.
    expect(api.peticiones).toContain("/api/personas?pageSize=100&page=2")
    expect(api.peticiones).toContain("/api/unidades?pageSize=100&page=2")
  })

  it("el selector «Actuar como» de la vista vecino ofrece y elige a la persona de la página 2", async () => {
    instalarApiSolicitudes(estadoDosPaginas())
    renderPagina(<SolicitudesPage />)

    await screen.findByText("GE-0001")

    const user = userEvent.setup({ delay: null })
    // La cabecera tiene un solo combobox al abrir: el de vista.
    await user.click(screen.getAllByRole("combobox")[0]!)
    const listaVista = await screen.findByRole("listbox", {}, { timeout: 5_000 })
    await user.click(within(listaVista).getByRole("option", { name: "Vecino" }))

    // En vista vecino aparece «Actuar como» junto a la vista: el padrón sigue
    // caminando y el listbox debe terminar ofreciendo a la persona de la página 2.
    await screen.findByText("Actuar como")
    const combosVecino = screen.getAllByRole("combobox")
    // 0: Vista · 1: Actuar como (en vecino) · 2: filtro Unidad · 3: filtro Tipo
    expect(combosVecino).toHaveLength(4)
    await user.click(combosVecino[1]!)
    const listaActuar = await screen.findByRole("listbox", {}, { timeout: 5_000 })
    await waitFor(
      () => {
        const textos = within(listaActuar)
          .getAllByRole("option")
          .map((o) => o.textContent)
        expect(textos).toContain("Eva Fuera De Pagina")
      },
      { timeout: 10_000 }
    )
    await user.click(
      within(listaActuar)
        .getAllByRole("option")
        .find((o) => o.textContent === "Eva Fuera De Pagina") as HTMLElement
    )

    // El ticket se imprime en la bandja vecina: «Actuar como» quedó en la
    // persona real de la página 2, no en la primera fila del padrón.
    await waitFor(() => expect(screen.getAllByText("GE-0001").length).toBeGreaterThan(0), {
      timeout: 10_000,
    })
  })
})

describe("operaciones/solicitudes — padrones en una sola página", () => {
  it("la identidad y los selectores no cambian y no se piden páginas extra", async () => {
    const api = instalarApiSolicitudes({
      solicitudes: [
        {
          id: "sol-1",
          folio: "GE-0001",
          tipo: "grabaciones",
          titulo: "Cámaras del estacionamiento",
          descripcion: "Revisión de las cámaras del estacionamiento subterráneo, corte de 22:40.",
          solicitantePersonaId: "p-lidia",
          unidadId: "u-1",
          estado: "en_revision",
          fechaCreacion: "2027-01-10",
          comentarios: [],
          historialEstados: [],
        },
      ],
      personas: [persona("p-lidia", "Lidia", "Propietaria", "activa")],
      unidades: [{ id: "u-1", numero: "1", etiqueta: "Depto" }],
      vinculos: [],
      mensajes: [],
    })
    renderPagina(<SolicitudesPage />)

    // Todo cabe en una página: la identidad se resuelve igual.
    const fila = (await screen.findByText("GE-0001")).closest("tr") as HTMLElement
    expect(within(fila).getByText("Depto 1")).toBeInTheDocument()
    const user = userEvent.setup({ delay: null })
    await user.click(within(fila).getByRole("button", { name: /Ver/ }))
    const dialogo = await screen.findByRole("dialog")
    expect(within(dialogo).getByText(/Lidia Propietaria/)).toBeInTheDocument()

    // Ningún padrón pidió completarse: completarlos no agrega peticiones.
    expect(api.peticiones.some((p) => p.includes("&page=2"))).toBe(false)
  })
})
