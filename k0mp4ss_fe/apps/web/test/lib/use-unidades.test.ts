// @vitest-environment jsdom
/**
 * S11 — el techo del hook no se hereda en silencio: `useUnidades` declara el
 * recorte.
 *
 * El hook pide `pageSize=100` por defecto, así que sus consumidores comparten
 * el techo sin escribirlo (S11). El dato derivado `recortada` —comparado contra
 * lo pedido, no contra las filas acumuladas— expone el techo desde la raíz:
 * cada pantalla lo declara con una línea cuando muestra la lista (S10,
 * `AvisoTruncamiento`), sin tocar a los consumidores existentes.
 *
 * El contrato es ADITIVO: los campos que ya existían no cambian y la URL de la
 * petición queda byte a byte igual (`?pageSize=100`).
 */
import * as React from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, renderHook, waitFor } from "@testing-library/react"
import { SWRConfig } from "swr"
import { useUnidades } from "@/lib/api/use-unidades"

/** Envelope del servidor: `pageSize` filas por página, hasta `total`. */
function coleccion(total: number) {
  const filas = Math.min(total, 100)
  return {
    data: Array.from({ length: filas }, (_, i) => ({ id: `unidad-${i}` })),
    page: 1,
    pageSize: 100,
    total,
  }
}

function json(cuerpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(cuerpo), {
    status,
    headers: { "content-type": "application/json" },
  })
}

/** Stub de `fetch` que responde la colección con el `total` dado y devuelve el mock. */
function stubColeccion(total: number) {
  const fetchMock = vi.fn(async (entrada: RequestInfo | URL): Promise<Response> =>
    json(coleccion(total))
  )
  vi.stubGlobal("fetch", fetchMock)
  return fetchMock
}

function envoltura({ children }: { children: React.ReactNode }) {
  return React.createElement(
    SWRConfig,
    {
      value: {
        provider: () => new Map(),
        dedupingInterval: 0,
        revalidateOnFocus: false,
        shouldRetryOnError: false,
      },
    },
    children
  )
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe("useUnidades — S11: el techo del hook se declara (`recortada`)", () => {
  it("con `total` mayor que lo pedido (100), el dato derivado dice recortada", async () => {
    stubColeccion(150)
    const { result } = renderHook(() => useUnidades(), { wrapper: envoltura })

    await waitFor(() => expect(result.current.items).toHaveLength(100))
    expect(result.current.total).toBe(150)
    expect(result.current.recortada).toBe(true)
  })

  it("con `total` igual a lo pedido no hay recorte", async () => {
    stubColeccion(100)
    const { result } = renderHook(() => useUnidades(), { wrapper: envoltura })

    await waitFor(() => expect(result.current.items).toHaveLength(100))
    expect(result.current.total).toBe(100)
    expect(result.current.recortada).toBe(false)
  })

  it("con `total` menor que lo pedido tampoco", async () => {
    stubColeccion(40)
    const { result } = renderHook(() => useUnidades(), { wrapper: envoltura })

    await waitFor(() => expect(result.current.items).toHaveLength(40))
    expect(result.current.total).toBe(40)
    expect(result.current.recortada).toBe(false)
  })

  it("PRESERVE — la petición sigue siendo `?pageSize=100` y los campos existentes no cambian", async () => {
    const fetchMock = stubColeccion(150)
    const { result } = renderHook(() => useUnidades(), { wrapper: envoltura })

    await waitFor(() => expect(result.current.items).toHaveLength(100))
    // La URL de la página 1 es la de siempre: sumar el campo no cambia la clave
    // SWR ni la petición de ningún consumidor existente.
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/unidades?pageSize=100")
    expect(result.current.total).toBe(150)
    expect(result.current.hasMore).toBe(true)
    expect(result.current.isLoading).toBe(false)
    expect(result.current.error).toBeNull()
  })
})
