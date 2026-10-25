// @vitest-environment jsdom
/**
 * F6 — selector buscable con búsqueda en el servidor.
 *
 * El componente no conoce endpoints: el consumidor le pasa `buscar(q)`. Lo que
 * se fija acá es el contrato de interacción: debounce, cancelación de
 * resultados viejos, valor actual visible aunque no esté en los resultados y
 * estado vacío con el término buscado.
 */
import React from "react"
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"
import { SelectorBuscable, type Opcion } from "@/components/selector-buscable"

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
    expect(buscar).toHaveBeenCalledWith("abc")
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
    await waitFor(() => expect(buscar).toHaveBeenCalledWith("ab"))

    fireEvent.change(input, { target: { value: "abc" } })
    await waitFor(() => expect(buscar).toHaveBeenCalledWith("abc"))

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

  it("muestra el valor actual aunque no esté entre los resultados", async () => {
    const { buscar } = renderSelector({
      valorId: "u-999",
      valorEtiqueta: "Depto 999",
      buscar: vi.fn(async () => opciones("u-101")),
    })

    expect(screen.getByText("Depto 999")).toBeTruthy()

    fireEvent.change(screen.getByLabelText("Unidad"), { target: { value: "zz" } })

    await waitFor(() => expect(buscar).toHaveBeenCalledWith("zz"))
    // El valor seleccionado sigue visible incluso cuando la lista no lo trae
    // (chip de selección + fila del valor actual en el listbox).
    expect(screen.getAllByText("Depto 999").length).toBeGreaterThan(0)
  })

  it("muestra el estado vacío con el término buscado", async () => {
    const buscar = vi.fn(async (): Promise<Opcion[]> => [])
    render(
      <SelectorBuscable valorId="" onSeleccionar={vi.fn()} buscar={buscar} etiqueta="Unidad" />
    )

    fireEvent.change(screen.getByLabelText("Unidad"), { target: { value: "zz" } })

    expect(await screen.findByText('Sin resultados para "zz".')).toBeTruthy()
  })

  it("permite elegir con el teclado (ArrowDown + Enter) y cierra la lista", async () => {
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
  })

  it("expone estado de carga mientras la búsqueda está en vuelo", async () => {
    let resolver: (valor: Opcion[]) => void = () => {}
    const buscar = vi.fn(
      () =>
        new Promise<Opcion[]>((r) => {
          resolver = r
        })
    )
    render(
      <SelectorBuscable valorId="" onSeleccionar={vi.fn()} buscar={buscar} etiqueta="Unidad" />
    )

    fireEvent.change(screen.getByLabelText("Unidad"), { target: { value: "ab" } })

    expect(await screen.findByText("Buscando…")).toBeTruthy()
    await waitFor(() => expect(buscar).toHaveBeenCalled())

    await act(async () => {
      resolver(opciones("u-101"))
    })
    await waitFor(() => expect(screen.queryByText("Buscando…")).toBeNull())
  })
})
