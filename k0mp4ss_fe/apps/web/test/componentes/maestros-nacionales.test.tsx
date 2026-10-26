// @vitest-environment jsdom
/**
 * F20 (fase 1b) — la cara visible del catálogo nacional en /admin/maestros.
 *
 * El servidor REST es falso vía `vi.stubGlobal("fetch", …)` (mismo patrón que
 * `carga-inicial.test.tsx`); Radix necesita los stubs de `entorno-radix.ts`.
 * La pantalla decide qué fila es nacional por su id (`esNacional`, ids de la
 * semilla), así que los fixtures usan ids reales de `data/admin/maestros.ts`
 * (banco-estado, banco-bci) más uno propio que la semilla no siembra.
 */
import React from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { SWRConfig } from "swr"
import { instalarEntornoRadix } from "./entorno-radix"
import MaestrosPage from "@/app/admin/maestros/page"

const fetchFalso = vi.fn()

beforeEach(() => {
  instalarEntornoRadix()
  vi.stubGlobal("fetch", fetchFalso)
})

afterEach(() => {
  cleanup()
  fetchFalso.mockReset()
  vi.unstubAllGlobals()
})

function responderJson(datos: unknown, status = 200): Response {
  return new Response(JSON.stringify(datos), {
    status,
    headers: { "content-type": "application/json" },
  })
}

/** Cache SWR fresco por render: un test no hereda las filas del anterior. */
function renderPagina() {
  return render(
    <SWRConfig value={{ provider: () => new Map() }}>
      <MaestrosPage />
    </SWRConfig>
  )
}

async function abrirBancos(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  renderPagina()
  await user.click(screen.getByRole("tab", { name: /finanzas/i }))
  await user.click(screen.getByRole("button", { name: /instituciones bancarias/i }))
}

interface Fila {
  id: string
  nombre: string
  oculto?: boolean
}

/** Stub del backend: GET colección + PUT ocultar + DELETE/PUT de fila. */
function stubBackend(data: Fila[], respuestasMutacion: Record<string, () => Response> = {}) {
  fetchFalso.mockImplementation(async (url: unknown, init?: { method?: string; body?: string }) => {
    const u = String(url)
    const metodo = init?.method ?? "GET"
    if (metodo === "GET") {
      return responderJson({ data, page: 1, pageSize: 100, total: data.length })
    }
    const respuesta = respuestasMutacion[`${metodo} ${u}`]
    if (respuesta) return respuesta()
    return responderJson({ ok: true })
  })
}

function filaDe(nombre: string) {
  const celda = screen.getByText(nombre)
  const fila = celda.closest("tr")
  expect(fila).not.toBeNull()
  return within(fila as HTMLElement)
}

describe("pantalla Maestros — catálogo nacional (F20 fase 1b)", () => {
  it("el listado de un tipo nacional pide incluirOcultos y las filas nacionales llevan el badge sin editar ni borrar", async () => {
    const user = userEvent.setup()
    stubBackend([
      { id: "banco-estado", nombre: "Banco Estado", oculto: false },
      { id: "banco-chile", nombre: "Banco de Chile", oculto: false },
      { id: "f20-banco-propio", nombre: "Banco Propio" },
    ])
    await abrirBancos(user)

    // El listado de administración pide también las ocultas.
    await waitFor(() => {
      expect(screen.getByText("Banco Estado")).toBeTruthy()
    })
    const url = fetchFalso.mock.calls.map((c) => String(c[0])).find((u) => u.includes("/api/maestros/bancos"))
    expect(url).toBeTruthy()
    expect(url).toMatch(/\/api\/maestros\/bancos\?pageSize=100&incluirOcultos=1$/)

    // Las filas nacionales muestran el badge y no ofrecen editar ni borrar.
    const nacional = filaDe("Banco Estado")
    expect(nacional.getByText("Catálogo nacional")).toBeTruthy()
    expect(nacional.getByRole("button", { name: "Ocultar" })).toBeTruthy()
    expect(nacional.queryByRole("button", { name: "Editar Banco Estado" })).toBeNull()
    expect(nacional.queryByRole("button", { name: "Borrar Banco Estado" })).toBeNull()
    const segunda = filaDe("Banco de Chile")
    expect(segunda.getByText("Catálogo nacional")).toBeTruthy()
    expect(segunda.queryByRole("button", { name: "Editar Banco de Chile" })).toBeNull()
  })

  it("el botón Ocultar pega a /api/maestros/bancos/ocultar con { maestroId, oculto: true }", async () => {
    const user = userEvent.setup()
    stubBackend([{ id: "banco-estado", nombre: "Banco Estado", oculto: false }])
    await abrirBancos(user)
    await waitFor(() => {
      expect(screen.getByText("Banco Estado")).toBeTruthy()
    })

    await user.click(filaDe("Banco Estado").getByRole("button", { name: "Ocultar" }))

    await waitFor(() => {
      const mutacion = fetchFalso.mock.calls.find(
        (c) => String(c[0]).endsWith("/api/maestros/bancos/ocultar")
      )
      expect(mutacion).toBeTruthy()
    })
    const mutacion = fetchFalso.mock.calls.find(
      (c) => String(c[0]).endsWith("/api/maestros/bancos/ocultar")
    ) as unknown as [string, { method: string; body: string }]
    expect(mutacion[1].method).toBe("PUT")
    expect(JSON.parse(mutacion[1].body)).toEqual({ maestroId: "banco-estado", oculto: true })
  })

  it("una fila nacional oculta se muestra atenuada con badge Oculto y botón Mostrar", async () => {
    const user = userEvent.setup()
    stubBackend([
      { id: "banco-estado", nombre: "Banco Estado", oculto: false },
      { id: "banco-bci", nombre: "BCI", oculto: true },
    ])
    await abrirBancos(user)
    await waitFor(() => {
      expect(screen.getByText("BCI")).toBeTruthy()
    })

    const oculta = filaDe("BCI")
    expect((oculta.getByText("BCI").closest("tr") as HTMLElement).className).toContain("opacity-50")
    expect(oculta.getByText("Oculto")).toBeTruthy()
    expect(oculta.getByRole("button", { name: "Mostrar" })).toBeTruthy()
    expect(oculta.queryByRole("button", { name: "Ocultar" })).toBeNull()
  })

  it("una fila propia conserva editar y borrar (DELETE al endpoint por id)", async () => {
    const user = userEvent.setup()
    stubBackend([{ id: "f20-banco-propio", nombre: "Banco Propio" }])
    await abrirBancos(user)
    await waitFor(() => {
      expect(screen.getByText("Banco Propio")).toBeTruthy()
    })

    const propia = filaDe("Banco Propio")
    expect(propia.queryByText("Catálogo nacional")).toBeNull()
    expect(propia.getByRole("button", { name: "Editar Banco Propio" })).toBeTruthy()

    await user.click(propia.getByRole("button", { name: "Borrar Banco Propio" }))
    await waitFor(() => {
      const borrado = fetchFalso.mock.calls.find(
        (c) => String(c[0]).endsWith("/api/maestros/bancos/f20-banco-propio")
      )
      expect(borrado).toBeTruthy()
      expect((borrado?.[1] as { method?: string } | undefined)?.method).toBe("DELETE")
    })
  })

  it("un 403 del servidor muestra el mensaje del servidor, no un error genérico", async () => {
    const user = userEvent.setup()
    stubBackend([{ id: "banco-estado", nombre: "Banco Estado", oculto: false }], {
      "PUT /api/maestros/bancos/ocultar": () =>
        responderJson({ error: "Permiso denegado." }, 403),
    })
    await abrirBancos(user)
    await waitFor(() => {
      expect(screen.getByText("Banco Estado")).toBeTruthy()
    })

    await user.click(filaDe("Banco Estado").getByRole("button", { name: "Ocultar" }))

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeTruthy()
    })
    expect(screen.getByText("Permiso denegado.")).toBeTruthy()
    expect(screen.queryByText(/sin conexión/i)).toBeNull()
  })

  it("el alta en un tipo nacional explica que lo agregado es propio de la comunidad", async () => {
    const user = userEvent.setup()
    stubBackend([{ id: "banco-estado", nombre: "Banco Estado", oculto: false }])
    await abrirBancos(user)
    await waitFor(() => {
      expect(screen.getByText("Banco Estado")).toBeTruthy()
    })

    await user.click(screen.getByRole("button", { name: /nuevo registro/i }))
    const dialogo = await screen.findByText("Añadir Nuevo Maestro")
    expect(dialogo).toBeTruthy()
    expect(
      screen.getByText(/propia de la comunidad/i)
    ).toBeTruthy()
    expect(screen.getByText(/el catálogo nacional no se modifica/i)).toBeTruthy()
  })
})
