// @vitest-environment jsdom
/**
 * PE-visitas — normalización de lo que escribe el conserje.
 *
 * Pedido del owner (2026-11-01): si se escribe un RUT sin puntos ni guion, o en
 * minúscula el dígito verificador, que quede con la grafía chilena; y el nombre
 * en Título Caso. La normalización corre al SALIR del campo (onBlur), no en cada
 * tecla: formatear mientras se escribe pelea con el cursor.
 */
import React from "react"
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { instalarEntornoRadix } from "./entorno-radix"
import { instalarApiPE } from "./api-pe-falsa"
import { VisitasPanel } from "@/components/pe/visitas-panel"

vi.setConfig({ testTimeout: 120_000 })

const HOY = new Date().toISOString().slice(0, 10)

beforeAll(() => {
  instalarEntornoRadix()
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function campo(id: string): HTMLInputElement {
  return screen.getByLabelText(id) as HTMLInputElement
}

describe("VisitasPanel — normalización de los datos escritos", () => {
  it("el RUT sin puntos ni guion queda con la grafía chilena al salir del campo", async () => {
    const user = userEvent.setup()
    instalarApiPE()
    render(<VisitasPanel diaReporte={HOY} onError={vi.fn()} onSuccess={vi.fn()} />)

    await user.type(campo("DNI *"), "164445550")
    // Mientras se escribe no se toca: el cursor no salta.
    expect(campo("DNI *").value).toBe("164445550")
    await user.tab()
    expect(campo("DNI *").value).toBe("16.444.555-0")
  })

  it("el dígito verificador en minúscula sube a mayúscula", async () => {
    const user = userEvent.setup()
    instalarApiPE()
    render(<VisitasPanel diaReporte={HOY} onError={vi.fn()} onSuccess={vi.fn()} />)

    await user.type(campo("DNI *"), "1000005k")
    await user.tab()
    expect(campo("DNI *").value).toBe("1.000.005-K")
  })

  it("un documento que no es RUN se deja como está, sin inventarle formato", async () => {
    const user = userEvent.setup()
    instalarApiPE()
    render(<VisitasPanel diaReporte={HOY} onError={vi.fn()} onSuccess={vi.fn()} />)

    await user.type(campo("DNI *"), "AB123456")
    await user.tab()
    expect(campo("DNI *").value).toBe("AB123456")
  })

  it("el nombre queda en Título Caso respetando las partículas", async () => {
    const user = userEvent.setup()
    instalarApiPE()
    render(<VisitasPanel diaReporte={HOY} onError={vi.fn()} onSuccess={vi.fn()} />)

    await user.type(campo("Nombre *"), "juan pérez de la fuente")
    await user.tab()
    expect(campo("Nombre *").value).toBe("Juan Pérez de la Fuente")
  })
})
