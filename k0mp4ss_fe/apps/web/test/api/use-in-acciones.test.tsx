// @vitest-environment jsdom
/**
 * Fija el contrato de las tres acciones IN cableadas en la V3 de SERIE-DEUDA-6
 * (`lib/api/use-in.ts`) contra las rutas que ya existían:
 *   POST /api/in/infracciones/[id]/aplicar     — sin body (la ruta no lo lee)
 *   POST /api/in/infracciones/[id]/desestimar  — body `{ justificacion }`
 *   POST /api/in/infracciones/[id]/apelar      — body `{ descargos }`
 * Un caso por acción: éxito (200 `{ ok: true }` → `{ ok: true }`) y error del
 * servidor (4xx con `{ error }` → mismo texto, para que la página lo muestre
 * sin inventar mensajes).
 */
import React from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, renderHook, waitFor } from "@testing-library/react"
import { SWRConfig } from "swr"
import { useInfraccionesIN } from "@/lib/api/use-in"
import type { InfraccionIN } from "@/lib/schemas"

const INF = {
  id: "in-v3-1",
  folio: "IN-0001",
  tipoInfraccionId: "tin-v3-ruidos",
  unidadId: "uni-v3",
  fechaSuceso: "2026-10-20",
  horaSuceso: "22:35",
  antecedentes: "Ruidos molestos reiterados después de las 22:00 según conserjería.",
  evidencias: [],
  estado: "en_revision",
  fechaRegistro: "2026-10-21",
  comentariosDirectiva: [],
  respaldosDirectiva: [],
} as unknown as InfraccionIN

const PAGINA = { data: [INF], page: 1, pageSize: 100, total: 1 }

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

/** Stubea `fetch`: la colección responde siempre paginada; el POST, lo que pida el caso. */
function stubFetch(respuestaAccion: () => Response): void {
  const mock = vi.fn(
    async (entrada: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = String(entrada)
      const method = init?.method ?? "GET"
      llamadas.push({
        url,
        method,
        ...(init?.body !== undefined ? { body: String(init.body) } : {}),
      })
      if (method === "GET") return json(PAGINA)
      return respuestaAccion()
    }
  )
  vi.stubGlobal("fetch", mock)
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

async function arrancar(respuestaAccion: () => Response) {
  stubFetch(respuestaAccion)
  const { result } = renderHook(() => useInfraccionesIN(), { wrapper: envoltura })
  await waitFor(() => expect(result.current.items).toHaveLength(1))
  return result
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  llamadas.length = 0
})

describe("useInfraccionesIN.aplicar", () => {
  it("POSTea a /aplicar sin body y devuelve ok", async () => {
    const result = await arrancar(() => json({ ok: true }))

    const r = await result.current.aplicar(INF.id)

    expect(r).toEqual({ ok: true })
    const post = llamadas.filter(l => l.method === "POST")
    expect(post).toHaveLength(1)
    expect(post[0]!.url).toBe(`/api/in/infracciones/${INF.id}/aplicar`)
    expect(post[0]!.body).toBe("{}")
  })

  it("propaga el error del servidor (200 → 400 sin respaldo de directiva)", async () => {
    const mensaje =
      "Las multas Grave/Gravísima requieren el respaldo de la directiva antes de cargarse al Gasto Común."
    const result = await arrancar(() => json({ error: mensaje }, 400))

    const r = await result.current.aplicar(INF.id)

    expect(r).toEqual({ ok: false, error: mensaje })
  })
})

describe("useInfraccionesIN.desestimar", () => {
  it("POSTea a /desestimar con { justificacion } y devuelve ok", async () => {
    const result = await arrancar(() => json({ ok: true }))

    const r = await result.current.desestimar(
      INF.id,
      "Descargos verificados: mudanza autorizada por administración."
    )

    expect(r).toEqual({ ok: true })
    const post = llamadas.filter(l => l.method === "POST")
    expect(post).toHaveLength(1)
    expect(post[0]!.url).toBe(`/api/in/infracciones/${INF.id}/desestimar`)
    expect(JSON.parse(post[0]!.body ?? "{}")).toEqual({
      justificacion: "Descargos verificados: mudanza autorizada por administración.",
    })
  })

  it("propaga el error del servidor (justificación obligatoria)", async () => {
    const mensaje = "La desestimación exige justificación obligatoria."
    const result = await arrancar(() => json({ error: mensaje }, 400))

    const r = await result.current.desestimar(INF.id, "")

    expect(r).toEqual({ ok: false, error: mensaje })
  })
})

describe("useInfraccionesIN.apelar", () => {
  it("POSTea a /apelar con { descargos } y devuelve ok", async () => {
    const result = await arrancar(() => json({ ok: true }))

    const r = await result.current.apelar(
      INF.id,
      "Mi mascota siempre usa correa; las cámaras del hall lo demuestran."
    )

    expect(r).toEqual({ ok: true })
    const post = llamadas.filter(l => l.method === "POST")
    expect(post).toHaveLength(1)
    expect(post[0]!.url).toBe(`/api/in/infracciones/${INF.id}/apelar`)
    expect(JSON.parse(post[0]!.body ?? "{}")).toEqual({
      descargos: "Mi mascota siempre usa correa; las cámaras del hall lo demuestran.",
    })
  })

  it("propaga el error del servidor (descargos de menos de 10 caracteres)", async () => {
    const mensaje =
      "Los descargos deben detallar la posición del vecino (mínimo 10 caracteres)."
    const result = await arrancar(() => json({ error: mensaje }, 400))

    const r = await result.current.apelar(INF.id, "no fue")

    expect(r).toEqual({ ok: false, error: mensaje })
  })
})
