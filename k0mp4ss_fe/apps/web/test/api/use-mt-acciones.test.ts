/**
 * Contrato de `verificarGarantiasMT` (V4 de SERIE-DEUDA-6, `lib/api/use-mt.ts`)
 * contra la ruta que ya existía: `POST /api/mt/garantias/verificar` (sin body).
 *
 * La ruta responde `{ ok: true, alertadas }` y es idempotente por trabajo; acá se
 * fija que el cliente mande el POST sin payload, propague `alertadas` y traduzca
 * los errores sin inventar mensajes (paridad con el `StoreResult` legacy).
 */
import { afterEach, describe, expect, it, vi } from "vitest"
import { verificarGarantiasMT } from "@/lib/api/use-mt"

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

function mockFetch(impl: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      llamadas.push({
        url,
        method: init?.method ?? "GET",
        body: typeof init?.body === "string" ? init.body : undefined,
      })
      return impl(url, init)
    })
  )
}

afterEach(() => {
  llamadas.length = 0
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("use-mt — verificarGarantiasMT", () => {
  it("hace POST a /api/mt/garantias/verificar sin body y devuelve las alertadas", async () => {
    mockFetch(() => json({ ok: true, alertadas: 2 }))

    const r = await verificarGarantiasMT()

    expect(r).toEqual({ ok: true, alertadas: 2 })
    expect(llamadas).toHaveLength(1)
    expect(llamadas[0]?.url).toBe("/api/mt/garantias/verificar")
    expect(llamadas[0]?.method).toBe("POST")
    expect(llamadas[0]?.body).toBe("{}")
  })

  it("propaga el error del servidor sin inventar texto", async () => {
    mockFetch(() => json({ error: "Permiso denegado." }, 403))

    const r = await verificarGarantiasMT()

    expect(r.ok).toBe(false)
    expect(r.error).toBe("Permiso denegado.")
  })

  it("cae al mensaje genérico del cliente HTTP cuando el servidor no devuelve error legible", async () => {
    mockFetch(() => json({}, 500))

    const r = await verificarGarantiasMT()

    expect(r.ok).toBe(false)
    expect(r.error).toBe("Error 500.")
  })

  it("devuelve el mensaje de conexión cuando el fetch rechaza", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down")
      })
    )

    const r = await verificarGarantiasMT()

    expect(r.ok).toBe(false)
    expect(r.error).toBe("Sin conexión con el servidor.")
  })
})
