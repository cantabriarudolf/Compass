// @vitest-environment jsdom
/**
 * `ConfirmarEliminacion` — diálogo de baja compartido por las pantallas.
 *
 * El criterio es el contrato observable del componente, no su forma interna:
 * muestra el título y la consecuencia (que es obligatoria: no existe un
 * «¿estás seguro?» sin decir qué se pierde), cancelar no borra, confirmar avisa
 * una sola vez y, mientras la baja está en vuelo, el botón destructivo queda
 * deshabilitado para que un doble click no mande dos DELETE.
 */
import React from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { ConfirmarEliminacion } from "@/components/confirmar-eliminacion"
import { instalarEntornoRadix } from "./entorno-radix"

const TITULO = '¿Eliminar el fondo "Fondo de Reserva"?'
const CONSECUENCIA =
  "Los egresos, ingresos y proyectos de mantenimiento que lo usan quedan sin fondo."

beforeEach(() => {
  instalarEntornoRadix()
})

afterEach(() => {
  cleanup()
})

function montar(
  props: Partial<React.ComponentProps<typeof ConfirmarEliminacion>> = {}
) {
  const onConfirmar = vi.fn()
  const onCancelar = vi.fn()
  render(
    <ConfirmarEliminacion
      abierto
      titulo={TITULO}
      consecuencia={CONSECUENCIA}
      etiquetaConfirmar="Eliminar"
      onConfirmar={onConfirmar}
      onCancelar={onCancelar}
      {...props}
    />
  )
  return { onConfirmar, onCancelar }
}

describe("ConfirmarEliminacion", () => {
  it("muestra el título y la consecuencia de la baja", () => {
    montar()

    const dialogo = screen.getByRole("alertdialog")
    expect(dialogo).toHaveTextContent(TITULO)
    expect(dialogo).toHaveTextContent(CONSECUENCIA)
  })

  it("cancelar cierra el diálogo sin confirmar la baja", async () => {
    const usuario = userEvent.setup()
    const { onConfirmar, onCancelar } = montar()

    await usuario.click(screen.getByRole("button", { name: "Cancelar" }))

    expect(onCancelar).toHaveBeenCalledTimes(1)
    expect(onConfirmar).not.toHaveBeenCalled()
  })

  it("confirmar avisa una sola vez", async () => {
    const usuario = userEvent.setup()
    const { onConfirmar } = montar()

    await usuario.click(screen.getByRole("button", { name: "Eliminar" }))

    expect(onConfirmar).toHaveBeenCalledTimes(1)
  })

  it("con la baja en vuelo el botón de confirmar queda deshabilitado", async () => {
    const usuario = userEvent.setup()
    const { onConfirmar } = montar({ ocupado: true })

    const confirmar = screen.getByRole("button", { name: "Eliminar" })
    expect(confirmar).toBeDisabled()

    await usuario.click(confirmar)

    expect(onConfirmar).not.toHaveBeenCalled()
  })
})
