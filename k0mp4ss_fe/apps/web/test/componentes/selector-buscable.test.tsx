// @vitest-environment jsdom
/**
 * F6 — selector buscable con búsqueda en el servidor.
 *
 * El componente no conoce endpoints: el consumidor le pasa `buscar(q, { page })` y el término
 * viaja a la API, que resuelve el filtro sobre TODA la colección. Lo que se fija acá es el
 * contrato de interacción: la consulta va al servidor (no se filtra la lista en el navegador),
 * las filas anteriores siguen en pantalla mientras la nueva consulta está en vuelo, la lista se
 * puede recorrer hasta el final, se limpia el término, y el teclado alcanza para elegir sin que
 * el foco se escape del campo.
 *
 * El modo estático (`opciones` sin `buscar`) queda cubierto para no romper a los consumidores
 * que ya tienen la lista en memoria.
 */
import React from "react"
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"
import {
  SelectorBuscable,
  type ContextoBusqueda,
  type Opcion,
  type ResultadoBusqueda,
} from "@/components/selector-buscable"

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

const opciones = (...ids: string[]): Opcion[] =>
  ids.map((id) => ({ id, etiqueta: `Unidad ${id}` }))

function renderSelector(props: Partial<React.ComponentProps<typeof SelectorBuscable>> = {}) {
  const onSeleccionar = vi.fn()
  const buscar = props.buscar ?? vi.fn(async (): Promise<Opcion[]> => [])
  const utils = render(
    <SelectorBuscable
      valorId=""
      onSeleccionar={onSeleccionar}
      buscar={buscar}
      etiqueta="Unidad"
      placeholder="Buscar unidad"
      {...props}
    />
  )
  return { ...utils, onSeleccionar, buscar }
}

describe("SelectorBuscable", () => {
  it("consulta al servidor en vez de filtrar la lista en el cliente", async () => {
    const user = userEvent.setup()
    // La respuesta del servidor NO contiene el término tipeado: si el componente
    // filtrara en el navegador, esta fila no se vería nunca.
    const buscar = vi.fn(async () => [{ id: "p-9", etiqueta: "Rosa Núñez" }])
    renderSelector({ buscar })

    await user.type(screen.getByLabelText("Unidad"), "zz")

    expect(await screen.findByText("Rosa Núñez")).toBeTruthy()
    expect(buscar).toHaveBeenCalledWith("zz", { page: 1 })
  })

  it("no busca con menos de 2 caracteres", async () => {
    const { buscar } = renderSelector()
    const input = screen.getByLabelText("Unidad")

    fireEvent.change(input, { target: { value: "1" } })

    await new Promise((r) => setTimeout(r, 350))
    expect(buscar).not.toHaveBeenCalled()
    expect(screen.queryByRole("listbox")).toBeNull()
  })

  it("hace debounce: tipear rápido dispara una sola búsqueda con el término final", async () => {
    vi.useFakeTimers()
    const { buscar } = renderSelector()
    const input = screen.getByLabelText("Unidad")

    fireEvent.change(input, { target: { value: "ab" } })
    await act(async () => {
      vi.advanceTimersByTime(250)
    })
    expect(buscar).not.toHaveBeenCalled()

    fireEvent.change(input, { target: { value: "abc" } })
    await act(async () => {
      vi.advanceTimersByTime(300)
    })

    expect(buscar).toHaveBeenCalledTimes(1)
    expect(buscar).toHaveBeenCalledWith("abc", { page: 1 })
  })

  it("cancela los resultados viejos: una respuesta tardía no pisa la búsqueda nueva", async () => {
    const pendientes: Record<string, (valor: Opcion[]) => void> = {}
    const buscar = vi.fn(
      (q: string) =>
        new Promise<Opcion[]>((resolver) => {
          pendientes[q] = resolver
        })
    )
    render(<SelectorBuscable valorId="" onSeleccionar={vi.fn()} buscar={buscar} etiqueta="Unidad" />)
    const input = screen.getByLabelText("Unidad")

    fireEvent.change(input, { target: { value: "ab" } })
    await waitFor(() => expect(buscar).toHaveBeenCalledWith("ab", { page: 1 }))

    fireEvent.change(input, { target: { value: "abc" } })
    await waitFor(() => expect(buscar).toHaveBeenCalledWith("abc", { page: 1 }))

    // La búsqueda nueva responde primero; la vieja responde después.
    await act(async () => {
      pendientes["abc"]!([{ id: "nuevo", etiqueta: "Resultado nuevo" }])
    })
    await act(async () => {
      pendientes["ab"]!([{ id: "viejo", etiqueta: "Resultado viejo" }])
    })

    expect(screen.getByText("Resultado nuevo")).toBeTruthy()
    expect(screen.queryByText("Resultado viejo")).toBeNull()
  })

  it("mantiene las filas anteriores mientras la búsqueda nueva está en vuelo", async () => {
    const user = userEvent.setup()
    let resolverNueva: (valor: Opcion[]) => void = () => {}
    const buscar = vi.fn((q: string) =>
      q === "an"
        ? Promise.resolve<Opcion[]>([{ id: "p-1", etiqueta: "Ana Pérez" }])
        : new Promise<Opcion[]>((resolver) => {
            resolverNueva = resolver
          })
    )
    renderSelector({ buscar })
    const input = screen.getByLabelText("Unidad")

    await user.type(input, "an")
    expect(await screen.findByText("Ana Pérez")).toBeTruthy()

    await user.type(input, "a")
    await waitFor(() => expect(buscar).toHaveBeenCalledWith("ana", { page: 1 }))

    // La consulta anterior sigue en pantalla junto al indicador de carga: la lista
    // no se vacía ni salta de tamaño mientras se espera la respuesta.
    expect(screen.getByText("Ana Pérez")).toBeTruthy()
    expect(screen.getByText("Buscando…")).toBeTruthy()

    await act(async () => {
      resolverNueva([{ id: "p-2", etiqueta: "Ana María Soto" }])
    })

    expect(screen.getByText("Ana María Soto")).toBeTruthy()
    expect(screen.queryByText("Ana Pérez")).toBeNull()
  })

  it("muestra el estado vacío con el término buscado", async () => {
    const buscar = vi.fn(async (): Promise<Opcion[]> => [])
    render(
      <SelectorBuscable valorId="" onSeleccionar={vi.fn()} buscar={buscar} etiqueta="Unidad" />
    )

    fireEvent.change(screen.getByLabelText("Unidad"), { target: { value: "zz" } })

    expect(await screen.findByText('Sin resultados para "zz".')).toBeTruthy()
  })

  it("permite limpiar el término y cierra la lista", async () => {
    const user = userEvent.setup()
    const buscar = vi.fn(async () => [{ id: "p-1", etiqueta: "Ana Pérez" }])
    renderSelector({ buscar })
    const input = screen.getByLabelText("Unidad") as HTMLInputElement

    await user.type(input, "an")
    expect(await screen.findByText("Ana Pérez")).toBeTruthy()

    await user.click(screen.getByRole("button", { name: "Limpiar búsqueda" }))

    expect(input.value).toBe("")
    expect(screen.queryByRole("listbox")).toBeNull()
    expect(input).toBe(document.activeElement)
  })

  it("permite elegir con el teclado (ArrowDown + Enter), cierra la lista y conserva el foco", async () => {
    const user = userEvent.setup()
    const buscar = vi.fn(async () => opciones("u-101", "u-102"))
    const onSeleccionar = vi.fn()
    render(
      <SelectorBuscable
        valorId=""
        onSeleccionar={onSeleccionar}
        buscar={buscar}
        etiqueta="Unidad"
      />
    )
    const input = screen.getByLabelText("Unidad")

    await user.type(input, "10")
    const listbox = await screen.findByRole("listbox", {}, { timeout: 3_000 })
    expect(await within(listbox).findAllByRole("option")).toHaveLength(2)

    await user.keyboard("{ArrowDown}{Enter}")

    expect(onSeleccionar).toHaveBeenCalledWith({ id: "u-101", etiqueta: "Unidad u-101" })
    await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull())
    // El foco no se va de la pantalla: sin esto el navegador desplaza la página.
    expect(input).toBe(document.activeElement)
  })

  it("cierra la lista con Escape sin perder el término", async () => {
    const user = userEvent.setup()
    const buscar = vi.fn(async () => opciones("u-101"))
    renderSelector({ buscar })
    const input = screen.getByLabelText("Unidad") as HTMLInputElement

    await user.type(input, "10")
    expect(await screen.findByRole("listbox")).toBeTruthy()

    await user.keyboard("{Escape}")

    await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull())
    expect(input.value).toBe("10")
  })

  it("carga más resultados y los acumula hasta el final", async () => {
    const user = userEvent.setup()
    const paginas: Record<number, ResultadoBusqueda> = {
      1: { opciones: [{ id: "p-1", etiqueta: "Ana Pérez" }], hayMas: true },
      2: { opciones: [{ id: "p-2", etiqueta: "Ana Rojas" }], hayMas: false },
    }
    const buscar = vi.fn(
      async (_q: string, contexto: ContextoBusqueda) => paginas[contexto.page]!
    )
    renderSelector({ buscar })
    const input = screen.getByLabelText("Unidad")

    await user.type(input, "an")
    expect(await screen.findByText("Ana Pérez")).toBeTruthy()

    await user.click(screen.getByRole("button", { name: /cargar más/i }))

    expect(buscar).toHaveBeenCalledWith("an", { page: 2 })
    expect(await screen.findByText("Ana Rojas")).toBeTruthy()
    expect(screen.getByText("Ana Pérez")).toBeTruthy()
    expect(screen.queryByRole("button", { name: /cargar más/i })).toBeNull()
  })

  it("muestra el valor actual aunque no esté entre los resultados", async () => {
    const { buscar } = renderSelector({
      valorId: "u-999",
      valorEtiqueta: "Depto 999",
      buscar: vi.fn(async () => opciones("u-101")),
    })

    expect(screen.getByText("Depto 999")).toBeTruthy()

    fireEvent.change(screen.getByLabelText("Unidad"), { target: { value: "zz" } })

    await waitFor(() => expect(buscar).toHaveBeenCalledWith("zz", { page: 1 }))
    // El valor seleccionado sigue visible incluso cuando la lista no lo trae
    // (chip de selección + fila del valor actual en el listbox).
    expect(screen.getAllByText("Depto 999").length).toBeGreaterThan(0)
  })

  it("modo estático: sin `buscar` filtra la lista recibida en el cliente", async () => {
    const user = userEvent.setup()
    const onSeleccionar = vi.fn()
    render(
      <SelectorBuscable
        valorId=""
        onSeleccionar={onSeleccionar}
        opciones={opciones("u-101", "u-102")}
        etiqueta="Unidad"
      />
    )
    const input = screen.getByLabelText("Unidad")

    await user.type(input, "102")

    expect(await screen.findByText("Unidad u-102")).toBeTruthy()
    expect(screen.queryByText("Unidad u-101")).toBeNull()

    await user.keyboard("{ArrowDown}{Enter}")
    expect(onSeleccionar).toHaveBeenCalledWith({ id: "u-102", etiqueta: "Unidad u-102" })
  })
})
