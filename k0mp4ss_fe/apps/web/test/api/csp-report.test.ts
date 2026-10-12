/**
 * @vitest-environment node
 */
import { describe, it, expect, vi } from "vitest"

const loggerMock = vi.hoisted(() => ({
  warn: vi.fn(),
  info: vi.fn(),
  error: vi.fn(),
}))
vi.mock("@/lib/logger", () => ({ logger: loggerMock }))

import { POST, GET } from "@/app/api/csp-report/route"

/**
 * El rate limit en memoria vive a nivel de módulo (Map por IP). Cada caso usa
 * una IP distinta para que el contador de un test no contamine a otro.
 */
function peticion(ip: string, body = ""): Request {
  return new Request("http://localhost/api/csp-report", {
    method: "POST",
    headers: { "content-type": "application/csp-report", "x-forwarded-for": ip },
    body,
  })
}

const REPORTE_VALIDO = JSON.stringify({
  "csp-report": {
    "document-uri": "https://compass.test/admin",
    "violated-directive": "script-src-elem",
    "blocked-uri": "inline",
    "effective-directive": "script-src",
  },
})

describe("POST/GET /api/csp-report — sink anónimo de telemetría CSP", () => {
  it("POST con csp-report bien formado → 204 y log solo con los 4 campos estándar", async () => {
    loggerMock.warn.mockClear()
    const res = await POST(peticion("10.1.0.1", REPORTE_VALIDO))
    expect(res.status).toBe(204)

    expect(loggerMock.warn).toHaveBeenCalledTimes(1)
    const primero = loggerMock.warn.mock.calls[0]?.[0] as { csp?: Record<string, unknown> }
    expect(primero).toHaveProperty("csp")
    expect(Object.keys(primero.csp ?? {}).sort()).toEqual([
      "blocked-uri",
      "document-uri",
      "effective-directive",
      "violated-directive",
    ])
  })

  it("POST con body malformado → 204 (nunca lanza)", async () => {
    const res = await POST(peticion("10.1.0.2", "{esto no es json"))
    expect(res.status).toBe(204)
  })

  it("rate limit: el POST 61 de la misma IP → 429 con error JSON (y no loguea el payload rechazado)", async () => {
    const ip = "10.1.0.3"
    let ultima: Response | undefined
    for (let i = 0; i < 60; i++) {
      ultima = await POST(peticion(ip, REPORTE_VALIDO))
    }
    expect(ultima?.status).toBe(204)

    loggerMock.warn.mockClear()
    const rechazada = await POST(peticion(ip, REPORTE_VALIDO))
    expect(rechazada.status).toBe(429)
    const body = (await rechazada.json()) as { error?: string }
    expect(body.error).toBe("Demasiadas solicitudes.")
    expect(loggerMock.warn).not.toHaveBeenCalled()
  })

  it("rate limit por IP: otra IP justo después → 204", async () => {
    const res = await POST(peticion("10.1.0.4", REPORTE_VALIDO))
    expect(res.status).toBe(204)
  })

  it("GET → 200 con ok:true y nota del sink CSP", async () => {
    const res = await GET()
    expect(res.status).toBe(200)
    const body = (await res.json()) as { ok?: boolean; note?: string }
    expect(body.ok).toBe(true)
    expect(body.note ?? "").toMatch(/CSP report sink/i)
  })

  it("GET no está limitado (lectura estática que usa el check e2e)", async () => {
    for (let i = 0; i < 70; i++) {
      const res = await GET()
      expect(res.status).toBe(200)
    }
  })
})
