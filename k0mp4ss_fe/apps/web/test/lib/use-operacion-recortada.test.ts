// @vitest-environment jsdom
/**
 * S11 — el techo del hook no se hereda en silencio, también en los padrones de
 * la operación.
 *
 * `usePersonasOperacion` y `useUnidadesOperacion` piden `pageSize=100` igual que
 * sus hermanos de colección, así que sus consumidores (los paneles PE)
 * compartían el techo sin escribirlo. `db16b1a` expuso `recortada` en
 * `usePersonas`/`useUnidades` y dejó anotado, sin abrir, que los dos de la
 * operación no lo tenían: este archivo cierra ese hueco con el MISMO contrato
 * aditivo —campos existentes intactos y la URL de la petición byte a byte
 * igual—, para que el borde que muestra la lista pueda declararlo (S10,
 * `components/pe/aviso-truncamiento.tsx`) sin pedir nada extra.
 */
import * as React from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, renderHook, waitFor } from "@testing-library/react"
import { SWRConfig } from "swr"
import { usePersonasOperacion } from "@/lib/api/use-personas"
import { useUnidadesOperacion } from "@/lib/api/use-unidades"

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

/** Envelope del servidor: como mucho `pageSize` filas, con el `total` real. */
function coleccion(total: number) {
  const filas = Math.min(total, 100)
  return {
    data: Array.from({ length: filas }, (_, i) => ({ id: `fila-${i}` })),
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
  const fetchMock = vi.fn(async (_entrada: RequestInfo | URL): Promise<Response> =>
    json(coleccion(total))
  )
  vi.stubGlobal("fetch", fetchMock)
  return fetchMock
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe("usePersonasOperacion — S11: el techo del padrón de operación se declara", () => {
  it("con `total` mayor que lo pedido (100), el dato derivado dice recortada", async () => {
    stubColeccion(150)
    const { result } = renderHook(() => usePersonasOperacion(), { wrapper: envoltura })

    await waitFor(() => expect(result.current.personas).toHaveLength(100))
    expect(result.current.total).toBe(150)
    expect(result.current.recortada).toBe(true)
  })

  it("con `total` igual a lo pedido no hay recorte", async () => {
    stubColeccion(100)
    const { result } = renderHook(() => usePersonasOperacion(), { wrapper: envoltura })

    await waitFor(() => expect(result.current.personas).toHaveLength(100))
    expect(result.current.total).toBe(100)
    expect(result.current.recortada).toBe(false)
  })

  it("con `total` menor que lo pedido tampoco", async () => {
    stubColeccion(40)
    const { result } = renderHook(() => usePersonasOperacion(), { wrapper: envoltura })

    await waitFor(() => expect(result.current.personas).toHaveLength(40))
    expect(result.current.total).toBe(40)
    expect(result.current.recortada).toBe(false)
  })

  it("PRESERVE — la petición sigue siendo `?pageSize=100` y los campos existentes no cambian", async () => {
    const fetchMock = stubColeccion(150)
    const { result } = renderHook(() => usePersonasOperacion(), { wrapper: envoltura })

    await waitFor(() => expect(result.current.personas).toHaveLength(100))
    // Sumar el campo no cambia la clave SWR ni la petición de ningún panel PE.
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/pe/personas?pageSize=100")
    expect(result.current.total).toBe(150)
    expect(result.current.isLoading).toBe(false)
    expect(result.current.error).toBeNull()
  })
})

describe("useUnidadesOperacion — S11: el techo del padrón de operación se declara", () => {
  it("con `total` mayor que lo pedido (100), el dato derivado dice recortada", async () => {
    stubColeccion(150)
    const { result } = renderHook(() => useUnidadesOperacion(), { wrapper: envoltura })

    await waitFor(() => expect(result.current.unidades).toHaveLength(100))
    expect(result.current.total).toBe(150)
    expect(result.current.recortada).toBe(true)
  })

  it("con `total` igual a lo pedido no hay recorte", async () => {
    stubColeccion(100)
    const { result } = renderHook(() => useUnidadesOperacion(), { wrapper: envoltura })

    await waitFor(() => expect(result.current.unidades).toHaveLength(100))
    expect(result.current.total).toBe(100)
    expect(result.current.recortada).toBe(false)
  })

  it("con `total` menor que lo pedido tampoco", async () => {
    stubColeccion(40)
    const { result } = renderHook(() => useUnidadesOperacion(), { wrapper: envoltura })

    await waitFor(() => expect(result.current.unidades).toHaveLength(40))
    expect(result.current.total).toBe(40)
    expect(result.current.recortada).toBe(false)
  })

  it("PRESERVE — la petición sigue siendo `?pageSize=100` y los campos existentes no cambian", async () => {
    const fetchMock = stubColeccion(150)
    const { result } = renderHook(() => useUnidadesOperacion(), { wrapper: envoltura })

    await waitFor(() => expect(result.current.unidades).toHaveLength(100))
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/pe/unidades?pageSize=100")
    expect(result.current.total).toBe(150)
    expect(result.current.isLoading).toBe(false)
    expect(result.current.error).toBeNull()
  })
})
