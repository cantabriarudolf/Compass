// @vitest-environment jsdom
/**
 * Saneamiento de truncamientos silenciosos.
 *
 * Regla fija: si una lista de opciones muestra menos registros de los que
 * existen, el usuario tiene que verlo. Los tests fijan (a) el comportamiento
 * del componente de aviso y (b) el contrato de los paneles: con más de
 * LIMITE_SELECT personas, el select de destinatario/residente declara el
 * recorte en pantalla en vez de callarse.
 */
import React from "react"
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { resetStore } from "../helpers"
import { useCompassStore } from "@/lib/store"
import { AvisoTruncamiento, LIMITE_SELECT } from "@/components/pe/aviso-truncamiento"
import { VisitasPanel } from "@/components/pe/visitas-panel"
import type { Persona } from "@/lib/schemas"

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

beforeEach(() => {
  resetStore()
})

afterEach(() => {
  cleanup()
})

/** Genera N personas válidas a partir de la primera persona del seed. */
function personasSinteticas(n: number): Persona[] {
  const base = useCompassStore.getState().personas[0]!
  return Array.from({ length: n }, (_, i) => ({
    ...base,
    id: `p-test-${i + 1}`,
    rut: `${10_000_000 + i}-9`,
    nombreCompleto: `Persona Test ${i + 1}`,
    nombres: "Persona",
    apellidos: `Test ${i + 1}`,
    email: `persona${i + 1}@email.com`,
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
  it("con más de 100 personas en el store, no hay aviso: el selector busca en el servidor", async () => {
    const user = userEvent.setup()
    useCompassStore.setState({ personas: personasSinteticas(LIMITE_SELECT + 37) })
    const urls: string[] = []
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        urls.push(String(url))
        return new Response(JSON.stringify({ data: [] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
      })
    )

    render(<VisitasPanel diaReporte={HOY} onError={vi.fn()} onSuccess={vi.fn()} />)

    // Sin rótulo de recorte: el campo dejó de montar opciones del padrón del store.
    expect(screen.queryByText(/Mostrando \d+ de \d+/)).toBeNull()

    await user.type(screen.getByLabelText("Residente destino"), "Persona")
    await waitFor(() =>
      expect(urls.some((u) => u.includes("/api/pe/personas?q="))).toBe(true)
    )
    vi.unstubAllGlobals()
  })
})
