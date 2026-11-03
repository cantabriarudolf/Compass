// @vitest-environment jsdom
/**
 * Directorio de Comunidad — los filtros de rol y estado de cuenta van al servidor.
 *
 * Defecto medido (`prisma/dev.db`, 118 personas, página de 100): la pantalla ya mandaba el texto
 * (`?q=`) al servidor, pero el rol y el estado de cuenta los filtraba en el navegador sobre la
 * primera página, y los contadores describían esa página como si fuera el padrón.
 *
 * El caso fija las tres mitades del arreglo:
 *   1. el rol viaja a la API (`rol=personal`) en vez de filtrarse sobre la página recibida;
 *   2. el estado de cuenta viaja con el valor REAL de la base (`estadoCuenta=inactiva`, no el
 *      plural `inactivos` que nunca coincidía con `Persona.estadoCuenta`);
 *   3. el contador de la tabla es el `total` del servidor (`101 personas en este filtro`), no el
 *      tamaño de la página, y `Ver más` declara «Mostrando 100 de 101».
 *
 * Con el servidor falso de `api-personas-falsa.ts` (101 personas y Zoe —la única `personal`— como
 * la más vieja, igual que en la base) el caso falla contra el comportamiento anterior por
 * construcción: sin `rol=`/`estadoCuenta=` en la petición, Zoe nunca entra en la primera página.
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
import DirectorioPersonasPage from "@/app/comunidad/personas/page"

/**
 * `components/comunidad/roles-donut.tsx` no importa React (usa el JSX clásico del proyecto), así
 * que no se puede montar bajo Vitest, y no es el sujeto de este caso: el donut solo consume
 * `roles`. Se reemplaza por un doble que expone cuántas entradas de rol recibió, que es lo que
 * acá se afirma (la distribución sale de la colección completa, no de la página).
 */
vi.mock("@/components/comunidad/roles-donut", () => ({
  RolesDonut: ({ roles }: { roles: string[] }) =>
    React.createElement(
      "span",
      { "data-testid": "roles-donut" },
      `roles recibidos: ${roles.length}`
    ),
}))

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
      <DirectorioPersonasPage />
    </SWRConfig>
  )
}

describe("Directorio de Comunidad — filtros de rol y estado en el servidor", () => {
  it("manda el rol al servidor y alcanza a quien quedó fuera de la primera página", async () => {
    const user = userEvent.setup({ delay: null })
    renderPagina()

    // Página 1 cargada (100 de 101): hay filas, pero Zoe (la más vieja) no está.
    await waitFor(() => expect(screen.getByText("Persona 001 Propietaria")).toBeInTheDocument())
    expect(screen.queryByText("Zoe Inalcanzable")).toBeNull()

    // El contador es el total del servidor, no el tamaño de la página.
    expect(screen.getByText("101 personas en este filtro.")).toBeInTheDocument()
    expect(screen.getByText(/Mostrando 100 de 101/)).toBeInTheDocument()
    // El donut y los contadores por rol también describen los 101, no las 100 de la página.
    expect(screen.getByTestId("roles-donut")).toHaveTextContent("roles recibidos: 101")

    await user.click(screen.getByRole("button", { name: /PERSONAL/i }))

    // El rol viaja a la API: no se resuelve sobre la página recibida.
    await waitFor(() =>
      expect(peticionesDePersonas(api).some((url) => url.includes("rol=personal"))).toBe(true)
    )
    // Y la fila que el usuario busca aparece, aunque estaba fuera de la página 1.
    await waitFor(() => expect(screen.getByText("Zoe Inalcanzable")).toBeInTheDocument())
    expect(screen.getByText("1 personas en este filtro.")).toBeInTheDocument()
  })

  it("manda el estado de cuenta al servidor con el valor real de la base", async () => {
    const user = userEvent.setup({ delay: null })
    renderPagina()

    await waitFor(() => expect(screen.getByText("Persona 001 Propietaria")).toBeInTheDocument())
    expect(screen.queryByText("Zoe Inalcanzable")).toBeNull()

    // El panel lateral y el filtro rápido ofrecen el mismo estado: cualquiera de los dos sirve.
    const [botonInactivos] = screen.getAllByRole("button", { name: /INACTIVOS/i })
    if (!botonInactivos) throw new Error("no se encontró el filtro INACTIVOS")
    await user.click(botonInactivos)

    await waitFor(() =>
      expect(
        peticionesDePersonas(api).some((url) => url.includes("estadoCuenta=inactiva"))
      ).toBe(true)
    )
    await waitFor(() => expect(screen.getByText("Zoe Inalcanzable")).toBeInTheDocument())
    expect(screen.getByText("1 personas en este filtro.")).toBeInTheDocument()
  })

  it("sin filtros la consulta de la lista es la de siempre (`?pageSize=100`)", async () => {
    renderPagina()

    await waitFor(() =>
      expect(peticionesDePersonas(api).some((url) => url === "/api/personas?pageSize=100")).toBe(
        true
      )
    )
    await waitFor(() => expect(screen.getByText("Persona 001 Propietaria")).toBeInTheDocument())
  })
})
