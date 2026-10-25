// @vitest-environment jsdom
/**
 * Saneamiento de truncamientos silenciosos.
 *
 * Regla fija: si una lista de opciones muestra menos registros de los que
 * existen, el usuario tiene que verlo. Estos casos fijan (a) el comportamiento
 * del componente `AvisoTruncamiento` y (b) el pase del panel de visitas al
 * contrato del servidor padron: el «Residente destino» ya no recorta una lista
 * local, busca con `?q=` directamente en `/api/pe/personas`.
 */
import React from "react"
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { instalarApiPE } from "./api-pe-falsa"
import { AvisoTruncamiento, LIMITE_SELECT } from "@/components/pe/aviso-truncamiento"
import { VisitasPanel } from "@/components/pe/visitas-panel"

vi.setConfig({ testTimeout: 60_000 })

const HOY = new Date().toISOString().slice(0, 10)

/** Normaliza el texto del aviso (el markup inserta espacios entre nodos). */
const texto = (el: HTMLElement) => (el.textContent ?? "").replace(/\s+/g, " ").trim()

beforeAll(() => {
  // Radix (Select) en jsdom necesita el stub de ResizeObserver del Popper.
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  Object.defineProperty(window, "ResizeObserver", {
    value: ResizeObserverStub,
    configurable: true,
    writable: true,
  })
  window.HTMLElement.prototype.scrollIntoView = vi.fn()
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

/** Base mínima para generar personas sintéticas del padrón falso. */
const BASE_PERSONA = {
  rut: "15.123.456-9",
  nombreCompleto: "Juan Pérez González",
}

/** Genera N personas válidas para el padrón del servidor falso. */
function personasSinteticas(n: number): { id: string; rut: string; nombreCompleto: string }[] {
  return Array.from({ length: n }, (_, i) => ({
    ...BASE_PERSONA,
    id: `p-test-${i + 1}`,
    rut: `${10_000_000 + i}-9`,
    nombreCompleto: `Persona Test ${i + 1}`,
  }))
}

describe("AvisoTruncamiento", () => {
  it("no renderiza nada cuando no hay recorte (total <= mostrados)", () => {
    const { container } = render(<AvisoTruncamiento mostrados={100} total={100} />)
    expect(container.textContent).toBe("")
    expect(screen.queryByRole("status")).toBeNull()
  })

  it("no renderiza nada si el total es menor que lo mostrado", () => {
    const { container } = render(<AvisoTruncamiento mostrados={12} total={5} />)
    expect(container.textContent).toBe("")
  })

  it("muestra ambos números cuando hay recorte", () => {
    render(<AvisoTruncamiento mostrados={100} total={137} />)
    expect(texto(screen.getByRole("status"))).toBe(
      "Mostrando 100 de 137 — refiná la búsqueda para ver el resto."
    )
  })
})

describe("Paneles PE: el residente destino ya no trunca", () => {
  it("con 137 personas en la base no hay aviso: el selector busca en el servidor", async () => {
    const user = userEvent.setup()
    // La base tiene más de `LIMITE_SELECT` personas; el padron responde `?pageSize=100`
    // con la página recortada y el total real (137).
    const api = instalarApiPE({
      personas: personasSinteticas(LIMITE_SELECT + 37),
    })

    render(<VisitasPanel diaReporte={HOY} onError={vi.fn()} onSuccess={vi.fn()} />)

    // Sin rótulo de recorte: el panel de visitas no muestra listas truncadas.
    expect(screen.queryByText(/Mostrando \d+ de \d+/)).toBeNull()

    await user.type(screen.getByLabelText("Residente destino"), "Persona")
    await waitFor(() =>
      expect(api.peticiones.some((p) => p.url.includes("/api/pe/personas?q="))).toBe(true)
    )
  })
})
