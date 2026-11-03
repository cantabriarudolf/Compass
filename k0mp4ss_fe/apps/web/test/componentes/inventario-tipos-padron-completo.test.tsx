// @vitest-environment jsdom
/**
 * Tipos de unidad — los conteos y las listas ven el padrón completo.
 *
 * Defecto medido (base de desarrollo): `/inventario/tipos` calculaba el conteo por tipo y la
 * lista de unidades de cada tipo sobre la primera página del padrón (`GET /api/unidades?pageSize=100`,
 * ordenado por `createdAt` descendente). Esa página no trae ningún departamento, así que
 * «Depto Tipo A» y «Depto Tipo B» mostraban 0 unidades aunque tienen 40 cada uno, y abrir el tipo
 * decía «No hay unidades asociadas a este tipo de unidad» con 80 departamentos en la base.
 *
 * El arreglo es paginación real: la colección se completa con la misma paginación del servidor
 * (`page=2`), así que el conteo y la lista se calculan sobre las 184 unidades y no sobre 100.
 *
 * Con el servidor falso de `api-inventario-falsa.ts` este caso falla contra el comportamiento
 * anterior por construcción: sin la segunda página, el conteo de «Depto Tipo A» es 0 y
 * «Depto 101» (fuera de la página 1) no está en la tabla.
 */
import React from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { SWRConfig } from "swr"
import { instalarEntornoRadix } from "./entorno-radix"
import { instalarApiInventario, type ApiInventario } from "./api-inventario-falsa"
import TiposUnidadPage from "@/app/inventario/tipos/page"

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
      <TiposUnidadPage />
    </SWRConfig>
  )
}

/** Pidió el servidor la página siguiente del padrón de unidades. */
function pidioSegundaPagina(): boolean {
  return api.peticiones.some(
    (url) => url.startsWith("/api/unidades?") && url.includes("page=2")
  )
}

describe("Tipos de unidad — conteos sobre el padrón completo", () => {
  it("cuenta las 40 unidades de «Depto Tipo A» y las lista todas", async () => {
    const user = userEvent.setup({ delay: null })
    renderPagina()

    // La colección se completa con la paginación del servidor, no con un pageSize más grande.
    await waitFor(() => expect(pidioSegundaPagina()).toBe(true))
    expect(api.peticiones.filter((url) => url.startsWith("/api/unidades?")).length).toBe(2)

    // La vista global es una tabla de tipos: ahí vive el conteo por tipo.
    const tabla = await screen.findByRole("table")
    const filaTipoA = within(tabla).getByText("Depto Tipo A").closest("tr")
    expect(filaTipoA).not.toBeNull()
    // Antes decía 0: los 40 departamentos del tipo viven fuera de la primera página.
    expect(within(filaTipoA!).getByText("40")).toBeInTheDocument()

    await user.click(screen.getByRole("tab", { name: /depto tipo a/i }))

    // La lista del tipo incluye la unidad que la página 1 no traía.
    await waitFor(() => expect(screen.getByText("Depto 101")).toBeInTheDocument())
    expect(
      screen.queryByText("No hay unidades asociadas a este tipo de unidad.")
    ).toBeNull()
    expect(screen.getByText("40 unidades vinculadas a este tipo.")).toBeInTheDocument()
  })
})
