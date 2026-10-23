// @vitest-environment jsdom
/**
 * S6 — hooks de lectura y desglose de CO (change co-lectura-residente, tarea 1.6).
 *
 * Contratos que fija este test:
 *   POST /api/co/envios/[id]/leer     — registra la lectura propia (idempotente en
 *                                       el servidor) y revalida la bandeja.
 *   GET  /api/co/envios/[id]/lecturas — desglose nominativo del administrador,
 *                                       con `personaId` y `leidoEn`.
 * Un caso por contrato: éxito y error del servidor (el texto del servidor se
 * propaga tal cual, sin inventar mensajes).
 */
import React from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, renderHook, waitFor } from "@testing-library/react"
import { SWRConfig } from "swr"
import { useDesgloseLecturasCO, useLecturaCO } from "@/lib/api/use-co"

const ENVIO_ID = "co-hook-envio-1"

interface Llamada {
  url: string
  method: string
  body?: string
}

const llamadas: Llamada[] = []

function json(cuerpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(cuerpo), {
    status,
    headers: { "content-type": "application/json" },
  })
}

/** Stubea `fetch`: el GET del desglose devuelve `desglose`, el POST responde `accion`. */
function stubFetch(desglose: () => Response, accion: () => Response): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (entrada: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = String(entrada)
      const method = init?.method ?? "GET"
      llamadas.push({
        url,
        method,
        ...(init?.body !== undefined ? { body: String(init.body) } : {}),
      })
      return method === "GET" ? desglose() : accion()
    })
  )
}

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

describe("useLecturaCO — registrar la lectura propia", () => {
  it("POSTea a /api/co/envios/[id]/leer y devuelve ok", async () => {
    stubFetch(() => json([]), () => json({ ok: true, lecturas: 1 }))
    const { result } = renderHook(() => useLecturaCO(), { wrapper: envoltura })

    const r = await result.current.registrar(ENVIO_ID)

    expect(r).toEqual({ ok: true })
    const post = llamadas.filter((l) => l.method === "POST")
    expect(post).toHaveLength(1)
    expect(post[0]?.url).toBe(`/api/co/envios/${ENVIO_ID}/leer`)
    expect(post[0]?.body).toBe("{}")
  })

  it("propaga el error del servidor (404 del envío ajeno)", async () => {
    const mensaje = "Registro no encontrado."
    stubFetch(() => json([]), () => json({ error: mensaje }, 404))
    const { result } = renderHook(() => useLecturaCO(), { wrapper: envoltura })

    const r = await result.current.registrar(ENVIO_ID)

    expect(r).toEqual({ ok: false, error: mensaje })
  })
})

describe("useDesgloseLecturasCO — desglose nominativo (admin)", () => {
  const LECTURAS = [
    { personaId: "co-hook-p-a", leidoEn: "2026-11-02T07:30:00.000Z" },
    { personaId: "co-hook-p-b", leidoEn: null },
  ]

  it("consulta /api/co/envios/[id]/lecturas y expone las parejas persona/fecha", async () => {
    stubFetch(() => json(LECTURAS), () => json({ ok: true }))
    const { result } = renderHook(() => useDesgloseLecturasCO(ENVIO_ID), {
      wrapper: envoltura,
    })

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.lecturas).toEqual(LECTURAS)
    expect(result.current.error).toBeNull()
    expect(llamadas.filter((l) => l.method === "GET")[0]?.url).toBe(
      `/api/co/envios/${ENVIO_ID}/lecturas`
    )
  })

  it("sin envío seleccionado no consulta y devuelve lista vacía", async () => {
    stubFetch(() => json(LECTURAS), () => json({ ok: true }))
    const { result } = renderHook(() => useDesgloseLecturasCO(null), { wrapper: envoltura })

    expect(result.current.lecturas).toEqual([])
    expect(llamadas).toHaveLength(0)
  })

  it("expone el error del servidor (403 del comité)", async () => {
    stubFetch(() => json({ error: "Permiso denegado." }, 403), () => json({ ok: true }))
    const { result } = renderHook(() => useDesgloseLecturasCO(ENVIO_ID), {
      wrapper: envoltura,
    })

    await waitFor(() => expect(result.current.error).not.toBeNull())
    expect(result.current.error?.message).toBe("Permiso denegado.")
    expect(result.current.lecturas).toEqual([])
  })
})
