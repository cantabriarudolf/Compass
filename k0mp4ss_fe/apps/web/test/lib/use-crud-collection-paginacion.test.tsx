// @vitest-environment jsdom
/**
 * F11 — paginación real en `useCrudCollection`.
 *
 * El hook pide `pageSize=100` sin `query`, así que `items.length` puede ser
 * menor que `total` (recorte de la lista). Este test fija el contrato aditivo:
 *
 *   - `hasMore` es true mientras `items.length < total`.
 *   - `cargarMas()` pide la página siguiente (con `page=N`) y la acumula al
 *     final, en orden.
 *   - agotado el total, `cargarMas()` no dispara una petición nueva.
 *   - una mutación (`remove`) limpia las páginas extra: la lista vuelve a la
 *     página 1, que es la única fuente fresca tras el cambio.
 *
 * Nada de esto cambia la URL de la página 1 (`?pageSize=100`): la clave de SWR
 * y el `pageSize` que mandan los consumidores con `query` quedan intactos.
 */
import React from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, renderHook, waitFor } from "@testing-library/react"
import { SWRConfig } from "swr"
import { useCrudCollection } from "@/lib/api/use-crud-collection"

const BASE = "/api/coleccion-fi"
const TOTAL = 166

interface Fila {
  id: string
}

const fila = (n: number): Fila => ({ id: `fila-${n}` })

/** Peticiones vistas por el `fetch` stub, en orden: "GET <url>" / "DELETE <url>". */
const llamadas: string[] = []

/** Página del servidor: 100 filas la primera, 66 la segunda, `total` constante. */
function pagina(page: number) {
  const desde = (page - 1) * 100
  const hasta = Math.min(page * 100, TOTAL)
  return {
    data: Array.from({ length: hasta - desde }, (_, i) => fila(desde + i)),
    page,
    pageSize: 100,
    total: TOTAL,
  }
}

function json(cuerpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(cuerpo), {
    status,
    headers: { "content-type": "application/json" },
  })
}

function stubFetch(): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (entrada: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = String(entrada)
      const method = init?.method ?? "GET"
      llamadas.push(`${method} ${url}`)
      if (method === "GET") {
        const pedida = /[?&]page=(\d+)/.exec(url)
        return json(pagina(pedida ? Number(pedida[1]) : 1))
      }
      return json({ ok: true })
    })
  )
}

const peticionesDePagina = (): string[] =>
  llamadas.filter((l) => l.startsWith("GET ") && /[?&]page=\d+/.test(l))

function envoltura({ children }: { children: React.ReactNode }) {
  return (
    <SWRConfig
      value={{
        provider: () => new Map(),
        dedupingInterval: 0,
        revalidateOnFocus: false,
        shouldRetryOnError: false,
      }}
    >
      {children}
    </SWRConfig>
  )
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  llamadas.length = 0
})

describe("useCrudCollection — paginación acumulativa", () => {
  it("declara hasMore con la página 1 recortada y acumula la página 2 al pedir más", async () => {
    stubFetch()
    const { result } = renderHook(() => useCrudCollection<Fila>(BASE), {
      wrapper: envoltura,
    })

    await waitFor(() => expect(result.current.items).toHaveLength(100))
    expect(result.current.total).toBe(TOTAL)
    expect(result.current.hasMore).toBe(true)
    expect(result.current.cargandoMas).toBe(false)

    await act(async () => {
      await result.current.cargarMas()
    })

    await waitFor(() => expect(result.current.items).toHaveLength(TOTAL))
    expect(result.current.items.at(0)?.id).toBe("fila-0")
    expect(result.current.items.at(TOTAL - 1)?.id).toBe(`fila-${TOTAL - 1}`)
    expect(result.current.total).toBe(TOTAL)
    expect(result.current.hasMore).toBe(false)
    expect(result.current.cargandoMas).toBe(false)
    expect(peticionesDePagina()).toEqual([`GET ${BASE}?pageSize=100&page=2`])
  })

  it("no pide una tercera página cuando ya se mostró el total", async () => {
    stubFetch()
    const { result } = renderHook(() => useCrudCollection<Fila>(BASE), {
      wrapper: envoltura,
    })

    await waitFor(() => expect(result.current.items).toHaveLength(100))
    await act(async () => {
      await result.current.cargarMas()
    })
    await waitFor(() => expect(result.current.hasMore).toBe(false))
    const antes = llamadas.length

    await act(async () => {
      await result.current.cargarMas()
    })

    expect(llamadas).toHaveLength(antes)
    expect(result.current.items).toHaveLength(TOTAL)
  })

  it("una mutación (remove) limpia las páginas extra y vuelve a la página 1", async () => {
    stubFetch()
    const { result } = renderHook(() => useCrudCollection<Fila>(BASE), {
      wrapper: envoltura,
    })

    await waitFor(() => expect(result.current.items).toHaveLength(100))
    await act(async () => {
      await result.current.cargarMas()
    })
    await waitFor(() => expect(result.current.items).toHaveLength(TOTAL))

    await act(async () => {
      const r = await result.current.remove("fila-0")
      expect(r.ok).toBe(true)
    })

    await waitFor(() => expect(result.current.items).toHaveLength(100))
    expect(result.current.hasMore).toBe(true)
    expect(result.current.items.map((f) => f.id)).not.toContain("fila-100")
    expect(llamadas).toContain(`DELETE ${BASE}/fila-0`)
    expect(peticionesDePagina()).toHaveLength(1)
  })
})
