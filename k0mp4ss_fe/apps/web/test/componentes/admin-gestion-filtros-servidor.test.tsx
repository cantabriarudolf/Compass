// @vitest-environment jsdom
/**
 * Gestión Administrativa — los roles del directorio se filtran y se cuentan en el servidor.
 *
 * Defecto medido (`prisma/dev.db`, 118 personas, página de 100): la pestaña «Directorio» ya
 * mandaba la búsqueda (`?q=`) al servidor, pero el filtro por rol se aplicaba en el navegador
 * sobre la primera página y los contadores de cada botón contaban esa página.
 *
 * El caso fija las dos mitades del arreglo:
 *   1. los contadores por rol salen de la colección COMPLETA del scope (auto-paginada como en
 *      `useUnidades({ todasLasPaginas: true })`), así que Zoe —única `personal`, la más vieja—
 *      aparece en el botón aunque su ficha quede fuera de la página 1;
 *   2. al elegir un rol el filtro viaja a la API (`rolDirectorio=personal`), y la tabla y el
 *      contador de la pestaña usan el `total` del servidor.
 *
 * Con el servidor falso de `api-personas-falsa.ts` el caso falla contra el comportamiento
 * anterior por construcción: sin `rolDirectorio=` en la petición, la tabla filtrada en el
 * navegador se queda con las 100 filas de la página 1 (donde Zoe no está) y los botones dicen
 * «Personal (0)».
 */
import React from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { SWRConfig } from "swr"
import { instalarEntornoRadix } from "./entorno-radix"
import {
  instalarApiPersonas,
  peticionesDePersonas,
  type ApiPersonas,
} from "./api-personas-falsa"
import GestionAdministrativaPage from "@/app/admin/gestion/page"

let api: ApiPersonas

beforeEach(() => {
  instalarEntornoRadix()
  api = instalarApiPersonas()
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

/** Cache SWR fresco por render: un caso no hereda las filas del anterior. */
function renderPagina() {
  return render(
    <SWRConfig value={{ provider: () => new Map() }}>
      <GestionAdministrativaPage />
    </SWRConfig>
  )
}

describe("Gestión Administrativa — roles del directorio en el servidor", () => {
  it("cuenta con la colección completa y filtra el rol en el servidor", async () => {
    const user = userEvent.setup({ delay: null })
    renderPagina()

    // Los contadores por rol ya no describen la página: Zoe (personal) se cuenta aunque su
    // ficha quede fuera de la página 1 (101 personas, 100 por página).
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Personal \(1\)/ })).toBeInTheDocument()
    )
    expect(screen.getByRole("button", { name: /Propietario \(99\)/ })).toBeInTheDocument()
    // El contador de la pestaña es el total del servidor, y la tabla declara el recorte.
    expect(screen.getByRole("tab", { name: /Directorio \(101\)/ })).toBeInTheDocument()
    expect(screen.getByText(/Mostrando 100 de 101/)).toBeInTheDocument()
    expect(screen.queryByText("Zoe Inalcanzable")).toBeNull()

    await user.click(screen.getByRole("button", { name: /Personal \(1\)/ }))

    // El rol viaja a la API en vez de filtrarse sobre la página recibida.
    await waitFor(() =>
      expect(
        peticionesDePersonas(api).some((url) => url.includes("rolDirectorio=personal"))
      ).toBe(true)
    )
    // Y la única persona `personal` del padrón aparece: antes era inalcanzable.
    await waitFor(() => expect(screen.getByText("Zoe Inalcanzable")).toBeInTheDocument())
    expect(screen.queryByText("Persona 001 Propietaria")).toBeNull()
    expect(screen.getByRole("tab", { name: /Directorio \(1\)/ })).toBeInTheDocument()
  })

  it("la búsqueda sigue viajando al servidor (`?q=`)", async () => {
    const user = userEvent.setup({ delay: null })
    renderPagina()

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Personal \(1\)/ })).toBeInTheDocument()
    )

    await user.type(screen.getByLabelText("Buscar personas"), "Dora")

    await waitFor(
      () => expect(peticionesDePersonas(api).some((url) => url.includes("q=Dora"))).toBe(true),
      { timeout: 5_000 }
    )
    await waitFor(() => expect(screen.getByText("Dora Directiva")).toBeInTheDocument())
  })
})
