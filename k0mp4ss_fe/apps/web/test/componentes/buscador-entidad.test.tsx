// @vitest-environment jsdom
/**
 * F36 — `BuscadorEntidad`, el buscador que pregunta AL SERVIDOR.
 *
 * El formulario de certificados ofrecía una lista truncada: un `Select` alimentado
 * con la primera página de 100 del padrón. Un certificado de residencia es un
 * documento legal sobre UNA persona, y esa persona tenía que estar dentro de las
 * primeras 100 filas para poder elegirse. Este componente reemplaza el patrón: el
 * término viaja a un endpoint ligero (`?q=&page=`), la respuesta declara el total y
 * el pie dice «Mostrando N de M», de modo que nunca se carga la colección completa
 * y el usuario ve cuánto quedó fuera de la página.
 *
 * Lo que se fija acá es el CONTRATO DEL COMPONENTE (la pantalla es de
 * `certificados-emision-buscador.test.tsx`):
 *   · sin texto no hay petición (nunca carga el padrón entero);
 *   · con texto la consulta viaja al servidor con `q` y lo que se dibuja es la
 *     respuesta del servidor —una fila que NO matchea el término en el cliente
 *     prueba que no hay filtro local—;
 *   · el total queda declarado («Mostrando N de M») y «Cargar más» acumula la
 *     página siguiente sin duplicar;
 *   · elegir entrega la selección como `{ id, etiqueta }` (más la fila completa
 *     para el consumidor que la necesita) y quitar entrega `null`;
 *   · una respuesta tardía de un término viejo no pisa la búsqueda nueva.
 */
import * as React from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { BuscadorEntidad, type EntidadSeleccion } from "@/components/buscador-entidad"

/** Fila de prueba: lo mínimo que un endpoint de búsqueda devuelve por fila. */
interface FilaPrueba {
  id: string
  nombre: string
}

const fila = (id: string, nombre: string): FilaPrueba => ({ id, nombre })

/** Respuesta del endpoint ligero: `{ data, page, pageSize, total }`. */
function respuesta(data: FilaPrueba[], total: number, page = 1, pageSize = 2): Response {
  return new Response(JSON.stringify({ data, page, pageSize, total }), {
    status: 200,
    headers: { "content-type": "application/json" },
  })
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function renderBuscador(props: Partial<React.ComponentProps<typeof BuscadorEntidad<FilaPrueba>>> = {}) {
  const onSeleccion = vi.fn<(s: EntidadSeleccion | null, f: FilaPrueba | null) => void>()
  const utils = render(
    <BuscadorEntidad<FilaPrueba>
      url="/api/certificados-ct/buscar-personas"
      idDe={(f) => f.id}
      etiquetaDe={(f) => f.nombre}
      etiqueta="Persona"
      placeholder="Buscar por nombre o RUT…"
      onSeleccion={onSeleccion}
      {...props}
    />
  )
  return { ...utils, onSeleccion }
}

/** Stub de fetch que graba cada URL pedida y responde con la cola indicada. */
function stubFetch(
  respuestas: (url: string) => Response
): { llamadas: string[] } {
  const llamadas: string[] = []
  vi.stubGlobal(
    "fetch",
    vi.fn((recurso: string | URL | Request) => {
      const url = typeof recurso === "string" ? recurso : String(recurso)
      llamadas.push(url)
      return Promise.resolve(respuestas(url))
    })
  )
  return { llamadas }
}

describe("BuscadorEntidad — la búsqueda va al servidor", () => {
  it("sin texto no consulta nada: nunca carga la colección completa", async () => {
    const { llamadas } = stubFetch(() => respuesta([], 0))
    renderBuscador()

    await new Promise((r) => setTimeout(r, 400))

    expect(llamadas).toEqual([])
    expect(screen.queryByRole("listbox")).toBeNull()
  })

  it("con texto consulta al servidor con q y dibuja SU respuesta, no un filtro local", async () => {
    const user = userEvent.setup()
    // La fila devuelta NO contiene el término tipeado: si el componente filtrara en
    // el navegador, «Rosa Núñez» no se vería nunca tras tipear «ana».
    const { llamadas } = stubFetch((url) =>
      url.includes("q=ana")
        ? respuesta([fila("p-9", "Rosa Núñez")], 1)
        : respuesta([], 0)
    )
    renderBuscador()

    await user.type(screen.getByLabelText("Persona"), "ana")
    expect(await screen.findByText("Rosa Núñez")).toBeTruthy()

    const consulta = llamadas.find((u) => u.includes("q=ana"))
    expect(consulta).toContain("/api/certificados-ct/buscar-personas?q=ana&page=1")
  })

  it("declara el total del servidor: «Mostrando N de M» con lo que quedó fuera", async () => {
    const user = userEvent.setup()
    stubFetch(() =>
      respuesta([fila("p-1", "Ana Uno"), fila("p-2", "Ana Dos")], 7)
    )
    renderBuscador()

    await user.type(screen.getByLabelText("Persona"), "ana")
    await screen.findByText("Ana Uno")

    expect(screen.getByText("Mostrando 2 de 7")).toBeTruthy()
  })

  it("«Cargar más» pide la página siguiente y acumula sin duplicar", async () => {
    const user = userEvent.setup()
    const pagina1 = [fila("p-1", "Ana Uno"), fila("p-2", "Ana Dos")]
    const pagina2 = [fila("p-2", "Ana Dos"), fila("p-3", "Ana Tres")]
    const { llamadas } = stubFetch((url) =>
      url.includes("page=2") ? respuesta(pagina2, 3, 2) : respuesta(pagina1, 3)
    )
    renderBuscador()

    await user.type(screen.getByLabelText("Persona"), "ana")
    await screen.findByText("Ana Uno")
    expect(screen.getByText("Mostrando 2 de 3")).toBeTruthy()

    await user.click(screen.getByRole("button", { name: /Cargar más resultados/i }))
    await screen.findByText("Ana Tres")

    expect(llamadas.some((u) => u.includes("page=2"))).toBe(true)
    expect(screen.getByText("Mostrando 3 de 3")).toBeTruthy()
    // La fila repetida en las dos páginas no se pinta dos veces.
    expect(screen.getAllByText("Ana Dos")).toHaveLength(1)
  })

  it("elegir una opción entrega la selección { id, etiqueta } y la fila", async () => {
    const user = userEvent.setup()
    stubFetch(() => respuesta([fila("p-9", "Ana Buscada")], 1))
    const { onSeleccion } = renderBuscador()

    await user.type(screen.getByLabelText("Persona"), "ana")
    await screen.findByText("Ana Buscada")
    await user.click(screen.getByText("Ana Buscada"))

    expect(onSeleccion).toHaveBeenCalledTimes(1)
    expect(onSeleccion).toHaveBeenCalledWith(
      { id: "p-9", etiqueta: "Ana Buscada" },
      fila("p-9", "Ana Buscada")
    )
  })

  it("la selección vigente se ve aunque la búsqueda no la devuelva, y quitar entrega null", async () => {
    const { onSeleccion } = renderBuscador({
      seleccion: { id: "p-9", etiqueta: "Ana Buscada" },
    })

    // El chip con lo elegido, sin ninguna búsqueda en vuelo.
    expect(screen.getByText("Ana Buscada")).toBeTruthy()
    expect(screen.queryByRole("listbox")).toBeNull()

    await userEvent.click(screen.getByRole("button", { name: "Quitar selección" }))
    expect(onSeleccion).toHaveBeenCalledWith(null, null)
  })

  it("una respuesta tardía de un término viejo no pisa la búsqueda nueva", async () => {
    const user = userEvent.setup()
    const pendientes = new Map<string, (r: Response) => void>()
    vi.stubGlobal(
      "fetch",
      vi.fn((recurso: string | URL | Request) => {
        const url = typeof recurso === "string" ? recurso : String(recurso)
        return new Promise<Response>((resolver) => {
          pendientes.set(url, resolver)
        })
      })
    )
    renderBuscador()
    const input = screen.getByLabelText("Persona")

    await user.type(input, "ab")
    await waitFor(() => expect(pendientes.has("/api/certificados-ct/buscar-personas?q=ab&page=1")).toBe(true))
    await user.type(input, "c")
    await waitFor(() => expect(pendientes.has("/api/certificados-ct/buscar-personas?q=abc&page=1")).toBe(true))

    // Primero llega la respuesta VIEJA, después la nueva: la vieja se descarta.
    const claveVieja = "/api/certificados-ct/buscar-personas?q=ab&page=1"
    const claveNueva = "/api/certificados-ct/buscar-personas?q=abc&page=1"
    await act(async () => {
      pendientes.get(claveVieja)!(respuesta([fila("viejo", "Resultado viejo")], 1))
    })
    await act(async () => {
      pendientes.get(claveNueva)!(respuesta([fila("nuevo", "Resultado nuevo")], 1))
    })

    expect(await screen.findByText("Resultado nuevo")).toBeTruthy()
    expect(screen.queryByText("Resultado viejo")).toBeNull()
    expect(screen.getByText("Mostrando 1 de 1")).toBeTruthy()
  })
})
