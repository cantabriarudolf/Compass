// @vitest-environment jsdom
/**
 * Estructura física — la búsqueda de unidades se resuelve en el servidor.
 *
 * Defecto medido (base de desarrollo): `/inventario/estructura` pedía una sola página del padrón
 * (`GET /api/unidades?pageSize=100`, ordenado por `createdAt` descendente) y después filtraba ese
 * arreglo en el navegador. De las 184 unidades de la base, la página 1 traía 100 —estacionamientos
 * y locales— y NINGUNO de los 80 departamentos, así que escribir «101» en el buscador no
 * encontraba nada: el departamento existía y era inalcanzable.
 *
 * El caso fija las dos mitades del arreglo: el término viaja a la API (`q=101`, el filtro se
 * resuelve sobre toda la colección) y la fila que antes no existía aparece en la tabla.
 *
 * Con el servidor falso de `api-inventario-falsa.ts` (184 unidades y los departamentos como los
 * más viejos, igual que en la base), este caso falla contra el comportamiento anterior por
 * construcción: sin `q` en la petición, «Depto 101» nunca entra en la primera página.
 *
 * Las filas de la página 1 que se usan como control son las primeras del orden descendente (los
 * locales L-01 y L-02): el departamento 101 está en la página 2.
 */
import React from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { SWRConfig } from "swr"
import { instalarEntornoRadix } from "./entorno-radix"
import { instalarApiInventario, type ApiInventario } from "./api-inventario-falsa"
import EstructuraFisicaPage from "@/app/inventario/estructura/page"

let api: ApiInventario

beforeEach(() => {
  instalarEntornoRadix()
  api = instalarApiInventario()
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

/** Cache SWR fresco por render: un caso no hereda las filas del anterior. */
function renderPagina() {
  return render(
    <SWRConfig value={{ provider: () => new Map() }}>
      <EstructuraFisicaPage />
    </SWRConfig>
  )
}

/** URL de cada GET contra la colección de unidades. */
function peticionesDeUnidades(): string[] {
  return api.peticiones.filter((url) => url.startsWith("/api/unidades?"))
}

describe("Estructura física — búsqueda de unidades en el servidor", () => {
  it("encuentra un departamento que está fuera de la primera página del padrón", async () => {
    const user = userEvent.setup({ delay: null })
    renderPagina()

    // Página 1 cargada (100 de 184): hay filas, pero ningún departamento.
    await waitFor(() => expect(screen.getByText("Local L-01")).toBeInTheDocument())
    expect(screen.getByText("Local L-02")).toBeInTheDocument()
    expect(screen.queryByText("Depto 101")).toBeNull()

    await user.type(screen.getByPlaceholderText(/Buscar por N°/), "101")

    // El término viaja a la API: el filtro no se resuelve sobre la página recibida.
    await waitFor(() =>
      expect(peticionesDeUnidades().some((url) => url.includes("q=101"))).toBe(true)
    )

    // Y la fila que el usuario busca aparece, aunque su departamento no estaba en la página 1.
    await waitFor(() => expect(screen.getByText("Depto 101")).toBeInTheDocument(), {
      timeout: 10_000,
    })
  })

  it("conserva la consulta de siempre cuando el buscador está vacío", async () => {
    renderPagina()

    // Sin término no se filtra nada: la primera petición es la de siempre (`?pageSize=100`).
    await waitFor(() => expect(peticionesDeUnidades().length).toBeGreaterThan(0))
    expect(peticionesDeUnidades()[0]).toBe("/api/unidades?pageSize=100")
    await waitFor(() => expect(screen.getByText("Local L-01")).toBeInTheDocument())
  })
})
