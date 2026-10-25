// @vitest-environment jsdom
/**
 * `components/ver-mas.tsx` — control de «Ver más» para listados paginados (F11).
 *
 * Contrato: el control existe solo cuando la lista está recortada
 * (`mostrados < total`), dice cuántas filas se ven sobre el total real del
 * servidor y dispara `onCargarMas` al click. Sin recorte no renderiza nada.
 */
import React from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { VerMas } from "@/components/ver-mas"

afterEach(() => cleanup())

describe("VerMas", () => {
  it("muestra el botón con «Mostrando X de Y» cuando la lista está recortada", () => {
    render(<VerMas mostrados={100} total={166} cargando={false} onCargarMas={() => {}} />)

    expect(screen.getByRole("button", { name: /ver más/i })).toBeInTheDocument()
    expect(screen.getByText(/mostrando 100 de 166/i)).toBeInTheDocument()
  })

  it("llama a onCargarMas al hacer click", async () => {
    const onCargarMas = vi.fn()
    render(<VerMas mostrados={100} total={166} cargando={false} onCargarMas={onCargarMas} />)

    await userEvent.click(screen.getByRole("button", { name: /ver más/i }))

    expect(onCargarMas).toHaveBeenCalledTimes(1)
  })

  it("no renderiza nada cuando ya se muestran todas las filas", () => {
    const { container } = render(
      <VerMas mostrados={166} total={166} cargando={false} onCargarMas={() => {}} />
    )

    expect(container).toBeEmptyDOMElement()
    expect(screen.queryByRole("button")).not.toBeInTheDocument()
  })

  it("deshabilita el botón mientras carga la página siguiente", () => {
    render(<VerMas mostrados={100} total={166} cargando onCargarMas={() => {}} />)

    expect(screen.getByRole("button", { name: /cargando/i })).toBeDisabled()
  })
})
