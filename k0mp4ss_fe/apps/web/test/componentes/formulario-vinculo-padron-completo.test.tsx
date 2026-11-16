// @vitest-environment jsdom
/**
 * Padrón completo en el formulario de vínculos — la unidad de la página 2 se
 * puede elegir (F38/F40, lote «cerrar el techo de 100», T7).
 *
 * `components/comunidad/formulario-vinculo.tsx` llena el Select de «Unidad del
 * Inventario» con lo que trae `useUnidades()`, que pide `pageSize=100`. Las
 * opciones salen de dos filtros en el cliente sobre esa página
 * (`unidades.filter(u => !unidadesVinculadasIds.includes(u.id))` y el filtro de
 * búsqueda), así que con un padrón de dos páginas la unidad de la página 2 no
 * existe para el formulario: no sale como opción y no se puede vincular. Los
 * roles y las condiciones especiales son maestros y no están en el padrón: no
 * se tocan.
 *
 * La palanca ya existe en el hook: `{ todasLasPaginas: true }` (universo
 * acotado: el padrón de una comunidad). El caso monta el componente REAL y
 * sustituye solo la capa de red con un falso que respeta `?pageSize=100` y
 * `?page=N` (mismo arnés que `padron-completo-identidad-comunidad.test.tsx`):
 * el RED cae por opción ausente, no por una petición ausente.
 */
import React from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { SWRConfig } from "swr"
import { instalarEntornoRadix } from "./entorno-radix"
import { FormularioVinculoUnidad } from "@/components/comunidad/formulario-vinculo"

vi.setConfig({ testTimeout: 60_000 })

interface UnidadFalsa {
  id: string
  numero: string
  etiqueta: string
}

interface EstadoArnés {
  /** En el orden en que el servidor las sirve (las de la página 2, al final). */
  unidades: UnidadFalsa[]
}

interface ApiArnés {
  /** URL de cada petición que atravesó el falso, en orden. */
  peticiones: string[]
}

function respuestaJson(datos: unknown, status = 200): Response {
  return new Response(JSON.stringify(datos), {
    status,
    headers: { "content-type": "application/json" },
  })
}

/** Página con el mismo envelope y el mismo tope de `pageSize` que el servidor. */
function paginar(filas: unknown[], url: URL): { data: unknown[]; page: number; pageSize: number; total: number } {
  const page = Math.max(1, Number.parseInt(url.searchParams.get("page") ?? "1", 10) || 1)
  const pageSize = Math.min(
    100,
    Math.max(1, Number.parseInt(url.searchParams.get("pageSize") ?? "100", 10) || 100)
  )
  const desde = (page - 1) * pageSize
  return { data: filas.slice(desde, desde + pageSize), page, pageSize, total: filas.length }
}

function unidad(id: string, numero: string, etiqueta: string): UnidadFalsa {
  return { id, numero, etiqueta }
}

/** Padrón de dos páginas: 100 deptos, la vinculada adentro, y «Casa 901» en la página 2. */
function estadoPadronDeDosPaginas(): EstadoArnés {
  const unidades: UnidadFalsa[] = []
  for (let i = 1; i <= 100; i++) {
    unidades.push(unidad(`u-f-${String(i).padStart(3, "0")}`, String(i), "Depto"))
  }
  unidades.push(unidad("u-901", "901", "Casa"))
  return { unidades }
}

/** Padrón chico: todo entra en la página 1 y nada extra se pide. */
function estadoPadronChico(): EstadoArnés {
  return {
    unidades: [unidad("u-1", "1", "Casa"), unidad("u-2", "2", "Casa"), unidad("u-3", "3", "Casa")],
  }
}

/** Instala el servidor falso. Limpiar con `vi.unstubAllGlobals()`. */
function instalarApiArnés(estado: EstadoArnés): ApiArnés {
  const api: ApiArnés = { peticiones: [] }

  vi.stubGlobal("fetch", async (entrada: RequestInfo | URL): Promise<Response> => {
    const crudo =
      typeof entrada === "string" ? entrada : entrada instanceof URL ? entrada.href : entrada.url
    api.peticiones.push(crudo)
    const url = new URL(crudo, "http://localhost")
    const ruta = url.pathname

    if (ruta === "/api/unidades") return respuestaJson(paginar(estado.unidades, url))
    if (ruta === "/api/micro-sectores" || ruta === "/api/macro-sectores") {
      return respuestaJson({ data: [], page: 1, pageSize: 100, total: 0 })
    }
    if (ruta.startsWith("/api/maestros/")) {
      return respuestaJson({ data: [], page: 1, pageSize: 100, total: 0 })
    }

    // Cualquier otra ruta es un contrato que el falso no declaró: 404 a la vista.
    return respuestaJson({ error: `ruta no servida por el falso: ${ruta}` }, 404)
  })

  return api
}

beforeEach(() => {
  instalarEntornoRadix()
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

/** Cache SWR fresco por render: un caso no hereda las filas del anterior. */
function renderFormulario(unidadesVinculadasIds: string[]): void {
  render(
    <SWRConfig value={{ provider: () => new Map() }}>
      <FormularioVinculoUnidad
        unidadesVinculadasIds={unidadesVinculadasIds}
        onSave={vi.fn(async () => ({ ok: true }))}
        onCancel={vi.fn()}
      />
    </SWRConfig>
  )
}

/** Abre el Select de unidad y devuelve el listbox con sus opciones. */
async function abrirSelectorUnidades(
  user: ReturnType<typeof userEvent.setup>
): Promise<HTMLElement> {
  // 0: Unidad del Inventario · 1: Rol (y el de estado sólo con rol propietario).
  const combos = screen.getAllByRole("combobox")
  await user.click(combos[0]!)
  return screen.findByRole("listbox", {}, { timeout: 5_000 })
}

describe("formulario de vínculos — padrón completo para las opciones de unidad", () => {
  it("la unidad de la página 2 sale como opción y se puede elegir; la vinculada sigue excluida", async () => {
    const api = instalarApiArnés(estadoPadronDeDosPaginas())
    const user = userEvent.setup({ delay: null })
    renderFormulario(["u-f-007"])

    const lista = await abrirSelectorUnidades(user)

    // La página 1 está servida (el listbox muestra su última fila) y la
    // caminata completa el padrón con el listbox abierto: la unidad de la
    // página 2 tiene que TERMINAR en el listbox, no sólo en los datos.
    await waitFor(
      () => {
        const textos = within(lista)
          .getAllByRole("option")
          .map((o) => o.textContent)
        expect(textos).toContain("Depto 100")
      },
      { timeout: 10_000 }
    )
    await waitFor(
      () => {
        const textos = within(lista)
          .getAllByRole("option")
          .map((o) => o.textContent)
        expect(textos).toContain("Casa 901")
      },
      { timeout: 10_000 }
    )
    // La caminata pidió la página 2 del padrón de unidades.
    expect(
      api.peticiones.some((p) => p.startsWith("/api/unidades?") && p.includes("page=2"))
    ).toBe(true)

    // La ya vinculada (página 1) sigue excluida: la regla de exclusión no cambia.
    const textos = within(lista)
      .getAllByRole("option")
      .map((o) => o.textContent)
    expect(textos).not.toContain("Depto 7")
    expect(textos).toContain("Depto 100")

    // Elegir la unidad de la página 2: queda como valor del selector.
    await user.click(
      within(lista)
        .getAllByRole("option")
        .find((o) => o.textContent === "Casa 901") as HTMLElement
    )
    const combos = screen.getAllByRole("combobox")
    expect(combos[0]).toHaveTextContent("Casa 901")
  })

  it("con el padrón entero en la página 1 nada cambia y no se piden páginas extra", async () => {
    const api = instalarApiArnés(estadoPadronChico())
    const user = userEvent.setup({ delay: null })
    renderFormulario(["u-1"])

    const lista = await abrirSelectorUnidades(user)

    await waitFor(() => {
      const textos = within(lista)
        .getAllByRole("option")
        .map((o) => o.textContent)
      expect(textos).toContain("Casa 3")
    })

    // La vinculada de la única página sigue excluida y las libres salen.
    const textos = within(lista)
      .getAllByRole("option")
      .map((o) => o.textContent)
    expect(textos).toContain("Casa 2")
    expect(textos).toContain("Casa 3")
    expect(textos).not.toContain("Casa 1")

    // El padrón completo cabe en una página: completarlo no agrega peticiones.
    expect(
      api.peticiones.some((p) => p.startsWith("/api/unidades?") && p.includes("page=2"))
    ).toBe(false)

    // Y elegir sigue siendo elegir: la unidad libre queda como valor.
    await user.click(
      within(lista)
        .getAllByRole("option")
        .find((o) => o.textContent === "Casa 2") as HTMLElement
    )
    const combos = screen.getAllByRole("combobox")
    expect(combos[0]).toHaveTextContent("Casa 2")
  })
})
