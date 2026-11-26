// @vitest-environment jsdom
/**
 * `EliminarConConfirmacion` — la guarda única de las bajas (T2, S1/S2).
 *
 * El contrato observable, no la forma interna:
 *
 *   1. El primer click en el botón de papelera NO borra: abre el diálogo con el
 *      nombre concreto de la entidad y la consecuencia literal (nunca un
 *      «¿estás seguro?» vacío).
 *   2. Confirmar ejecuta `onEliminar` UNA vez y cierra sólo cuando la baja
 *      volvió `ok`; con `!ok` el diálogo queda abierto y el motivo literal del
 *      servidor sale por `onError` — ese texto es lo que el usuario tiene que
 *      leer, así que no se traduce.
 *   3. Un segundo click con la baja en vuelo no dispara otra baja.
 *   4. El disparador es el botón de icono de papelera (con `aria-label`: sin él
 *      un lector de pantalla no puede usar el control) y `disabled` lo apaga
 *      sin abrir el diálogo.
 *
 * El diálogo detrás es `components/confirmar-eliminacion.tsx` (el único del
 * repo); acá se afirma lo que ese diálogo muestra y cuándo el padre lo cierra.
 */
import React from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import {
  EliminarConConfirmacion,
  type ResultadoBorrado,
} from "@/components/eliminar-con-confirmacion"
import { instalarEntornoRadix } from "./entorno-radix"

const TITULO = 'Eliminar la encomienda de "Starken" · Caja chica'
const CONSECUENCIA = "Se pierde la constancia de quién la recibió y quién la retiró."
const ARIA = "Eliminar la encomienda de Starken"

function montar(
  props: Partial<React.ComponentProps<typeof EliminarConConfirmacion>> = {}
) {
  const onEliminar = vi.fn(async (): Promise<ResultadoBorrado> => ({ ok: true }))
  const onError = vi.fn()
  render(
    <EliminarConConfirmacion
      titulo={TITULO}
      consecuencia={CONSECUENCIA}
      ariaLabel={ARIA}
      onEliminar={onEliminar}
      onError={onError}
      {...props}
    />
  )
  return { onEliminar, onError }
}

/** El disparador: un botón de icono, por eso su nombre accesible es el `aria-label`. */
function disparador(): HTMLElement {
  return screen.getByRole("button", { name: ARIA })
}

async function abrirDialogo(usuario: ReturnType<typeof userEvent.setup>): Promise<HTMLElement> {
  await usuario.click(disparador())
  return screen.findByRole("alertdialog")
}

beforeEach(() => {
  instalarEntornoRadix()
})

afterEach(() => {
  cleanup()
})

describe("EliminarConConfirmacion", () => {
  it("el primer click abre el diálogo con el título y la consecuencia, sin borrar", async () => {
    const usuario = userEvent.setup()
    const { onEliminar } = montar()

    const dialogo = await abrirDialogo(usuario)

    expect(within(dialogo).getByText(TITULO)).toBeTruthy()
    expect(dialogo).toHaveTextContent(CONSECUENCIA)
    expect(onEliminar).not.toHaveBeenCalled()
  })

  it("cancelar cierra el diálogo sin ejecutar la baja", async () => {
    const usuario = userEvent.setup()
    const { onEliminar } = montar()

    const dialogo = await abrirDialogo(usuario)
    await usuario.click(within(dialogo).getByRole("button", { name: "Cancelar" }))

    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull())
    expect(onEliminar).not.toHaveBeenCalled()
  })

  it("confirmar ejecuta la baja una vez y cierra cuando el servidor responde ok", async () => {
    const usuario = userEvent.setup()
    const { onEliminar, onError } = montar()

    const dialogo = await abrirDialogo(usuario)
    await usuario.click(within(dialogo).getByRole("button", { name: "Eliminar" }))

    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull())
    expect(onEliminar).toHaveBeenCalledTimes(1)
    expect(onError).not.toHaveBeenCalled()
  })

  it("si el servidor rechaza no cierra el diálogo y reporta el motivo literal", async () => {
    const MOTIVO = "La encomienda ya fue retirada: no se puede eliminar."
    const usuario = userEvent.setup()
    const onEliminar = vi.fn(async (): Promise<ResultadoBorrado> => ({ ok: false, error: MOTIVO }))
    const { onError } = montar({ onEliminar })

    const dialogo = await abrirDialogo(usuario)
    await usuario.click(within(dialogo).getByRole("button", { name: "Eliminar" }))

    await waitFor(() => expect(onError).toHaveBeenCalledWith(MOTIVO))
    expect(onError).toHaveBeenCalledTimes(1)
    expect(onEliminar).toHaveBeenCalledTimes(1)
    // El motivo se lee DENTRO del diálogo: el overlay del modal tapa el banner
    // de la pantalla, así que reportarlo sólo ahí dejaría el diálogo abierto
    // sin decir por qué.
    const sigueAbierto = screen.getByRole("alertdialog")
    expect(sigueAbierto).toHaveTextContent(MOTIVO)
  })

  it("un segundo click con la baja en vuelo no dispara otra baja", async () => {
    const usuario = userEvent.setup()
    let resolver: (resultado: ResultadoBorrado) => void = () => {}
    const onEliminar = vi.fn(
      () =>
        new Promise<ResultadoBorrado>((resolve) => {
          resolver = resolve
        })
    )
    montar({ onEliminar })

    const dialogo = await abrirDialogo(usuario)
    const confirmar = within(dialogo).getByRole("button", { name: "Eliminar" })
    await usuario.click(confirmar)
    await usuario.click(confirmar)

    expect(onEliminar).toHaveBeenCalledTimes(1)
    resolver({ ok: true })
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull())
    expect(onEliminar).toHaveBeenCalledTimes(1)
  })

  it("una baja lógica se confirma con su verbo, no con «Eliminar»", async () => {
    const usuario = userEvent.setup()
    montar({ etiquetaConfirmar: "Archivar" })

    const dialogo = await abrirDialogo(usuario)

    expect(within(dialogo).getByRole("button", { name: "Archivar" })).toBeTruthy()
    expect(within(dialogo).queryByRole("button", { name: "Eliminar" })).toBeNull()
  })

  it("con etiqueta el disparador muestra el verbo a la vista y sigue sin borrar al primer click", async () => {
    const usuario = userEvent.setup()
    const { onEliminar } = montar({ etiqueta: "Desvincular", ariaLabel: "Desvincular la unidad 101" })

    const disparadorConTexto = screen.getByRole("button", { name: "Desvincular la unidad 101" })
    expect(disparadorConTexto).toHaveTextContent("Desvincular")

    await usuario.click(disparadorConTexto)

    expect(await screen.findByRole("alertdialog")).toBeTruthy()
    expect(onEliminar).not.toHaveBeenCalled()
  })

  it("con el disparador deshabilitado no abre el diálogo ni ejecuta la baja", async () => {
    const usuario = userEvent.setup()
    const { onEliminar } = montar({ disabled: true })

    expect(disparador()).toBeDisabled()
    await usuario.click(disparador())

    expect(screen.queryByRole("alertdialog")).toBeNull()
    expect(onEliminar).not.toHaveBeenCalled()
  })
})
