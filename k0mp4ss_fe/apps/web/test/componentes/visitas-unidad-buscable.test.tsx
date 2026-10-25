// @vitest-environment jsdom
/**
 * F6 — «Unidad destino» de la bitácora PE busca en el servidor.
 *
 * Antes el panel montaba las unidades del store legacy y recortaba a `LIMITE_SELECT`: con 166
 * unidades en el seed (100 en producción) el conserje no podía elegir la que no estaba en la
 * lista, y el filtro `!id.startsWith("u-E-")` se comía los 16 deptos de la torre E porque las
 * plazas de estacionamiento usan el mismo prefijo.
 *
 * Estos casos fijan lo observable: el término viaja a `/api/pe/unidades?q=`, la opción muestra el
 * rol SII para desambiguar homónimas, el estacionamiento no es destino, la unidad elegida queda
 * en la visita con su id, y sin coincidencias el registro sigue disponible.
 */
import React from "react"
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { resetStore } from "../helpers"
import { instalarEntornoRadix } from "./entorno-radix"
import { useCompassStore } from "@/lib/store"
import { VisitasPanel } from "@/components/pe/visitas-panel"
import { buscarUnidades } from "@/lib/api/use-unidades"
import { esUnidadDestino, etiquetaUnidad } from "@/lib/unidades-destino"

vi.setConfig({ testTimeout: 120_000 })

const HOY = new Date().toISOString().slice(0, 10)

/** Cinco unidades llamadas «Depto 101» (torres A–E) y una plaza homónima por prefijo de id. */
const UNIDADES_API = [
  { id: "u-A-101", numero: "101", etiqueta: "Depto", rolSii: "123-A11" },
  { id: "u-E-101", numero: "101", etiqueta: "Depto", rolSii: "123-E11" },
  { id: "u-E-001", numero: "E-001", etiqueta: "Estacionamiento", rolSii: "" },
]

function json(cuerpo: unknown): Response {
  return new Response(JSON.stringify(cuerpo), {
    status: 200,
    headers: { "content-type": "application/json" },
  })
}

/** Stub de fetch que registra las URLs pedidas y responde unidades / colección vacía. */
function stubFetch(unidades: unknown[] = UNIDADES_API): string[] {
  const urls: string[] = []
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const pedida = String(url)
      urls.push(pedida)
      if (pedida.startsWith("/api/pe/unidades")) {
        return json({ data: unidades, page: 1, pageSize: 25, total: unidades.length })
      }
      return json({ data: [], page: 1, pageSize: 10, total: 0 })
    })
  )
  return urls
}

beforeAll(() => {
  instalarEntornoRadix()
})

beforeEach(() => {
  resetStore()
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe("unidades destino (cliente)", () => {
  it("la etiqueta visible lleva número y rol SII cuando existe", () => {
    expect(etiquetaUnidad({ numero: "101", etiqueta: "Depto", rolSii: "123-A11" })).toBe(
      "Depto 101 · 123-A11"
    )
    expect(etiquetaUnidad({ numero: "L-01", etiqueta: "Local", rolSii: "" })).toBe("Local L-01")
  })

  it("el destino lo decide la etiqueta, no el prefijo del id", () => {
    expect(esUnidadDestino({ id: "u-A-101", etiqueta: "Depto" })).toBe(true)
    // Torre E: comparte prefijo `u-E-` con las plazas y sigue siendo un departamento.
    expect(esUnidadDestino({ id: "u-E-101", etiqueta: "Depto" })).toBe(true)
    expect(esUnidadDestino({ id: "u-E-001", etiqueta: "Estacionamiento" })).toBe(false)
  })

  it("buscarUnidades consulta el término en el servidor y descarta el estacionamiento", async () => {
    const urls = stubFetch()

    const opciones = await buscarUnidades("101")

    expect(urls.some((u) => u.startsWith("/api/pe/unidades?") && u.includes("q=101"))).toBe(true)
    expect(opciones).toEqual([
      { id: "u-A-101", etiqueta: "Depto 101 · 123-A11" },
      { id: "u-E-101", etiqueta: "Depto 101 · 123-E11" },
    ])
  })

  it("buscarUnidades propaga el error para que el selector lo declare", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("boom", { status: 500 }))
    )

    await expect(buscarUnidades("101")).rejects.toThrow()
  })
})

describe("VisitasPanel — Unidad destino buscable (F6)", () => {
  it("busca en el servidor y registra la visita con la unidad elegida", async () => {
    const user = userEvent.setup()
    const urls = stubFetch()

    render(<VisitasPanel diaReporte={HOY} onError={vi.fn()} onSuccess={vi.fn()} />)

    await user.type(screen.getByLabelText("Unidad destino"), "101")
    const lista = await screen.findByRole(
      "listbox",
      { name: /Resultados de Unidad destino/ },
      { timeout: 10_000 }
    )
    // El estacionamiento no se ofrece y las homónimas se distinguen por rol SII.
    expect(within(lista).queryByText(/Estacionamiento/)).toBeNull()
    await user.click(await within(lista).findByRole("option", { name: /123-E11/ }))

    await user.type(screen.getByLabelText("Nombre *"), "Visita F6")
    await user.type(screen.getByLabelText("DNI *"), "16.444.555-0")
    await user.click(screen.getByRole("button", { name: /Registrar visita/ }))

    await waitFor(() =>
      expect(useCompassStore.getState().bitacoraVisitasPE.at(-1)?.unidadId).toBe("u-E-101")
    )
    expect(urls.some((u) => u.includes("q=101"))).toBe(true)

    // La fila del día muestra la etiqueta de la unidad, no su id crudo.
    const fila = screen.getByRole("row", { name: /Visita F6/ })
    expect(within(fila).getByText("Depto 101 · 123-E11")).toBeTruthy()
  })

  it("sin coincidencias lo declara y la visita se puede registrar con residente destino", async () => {
    const user = userEvent.setup()
    stubFetch([])

    render(<VisitasPanel diaReporte={HOY} onError={vi.fn()} onSuccess={vi.fn()} />)

    await user.type(screen.getByLabelText("Unidad destino"), "zzz")
    expect(
      await screen.findByText(/Ninguna unidad coincide/, {}, { timeout: 10_000 })
    ).toBeTruthy()

    // El registro no se bloquea: se completa el destino con el residente.
    await user.type(screen.getByLabelText("Nombre *"), "Visita sin unidad")
    await user.type(screen.getByLabelText("DNI *"), "16.444.555-0")
    const combos = screen.getAllByRole("combobox")
    await user.click(combos[combos.length - 1]!)
    const lista = await screen.findByRole("listbox", {}, { timeout: 10_000 })
    const residente = within(lista)
      .getAllByRole("option")
      .find((o) => !/^Sin /.test(o.textContent ?? ""))!
    await user.click(residente)
    await user.click(screen.getByRole("button", { name: /Registrar visita/ }))

    await waitFor(() => {
      const visita = useCompassStore.getState().bitacoraVisitasPE.at(-1)
      expect(visita?.destinoPersonaId).toBeTruthy()
      expect(visita?.unidadId).toBeUndefined()
    })
  })
})
