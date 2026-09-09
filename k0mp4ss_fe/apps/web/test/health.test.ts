/**
 * @vitest-environment node
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"

const prismaMock = vi.hoisted(() => ({ $queryRaw: vi.fn() }))
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }))
vi.mock("@/lib/logger", () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}))

/**
 * Import dinámico con módulos reseteados: el rate limit en memoria del health
 * check vive a nivel de módulo, así cada caso parte del contador en cero.
 */
async function importarRuta() {
  vi.resetModules()
  return await import("@/app/api/health/route")
}

function request(ip = "10.0.0.1"): Request {
  return new Request("http://localhost/api/health", { headers: { "x-forwarded-for": ip } })
}

describe("GET /api/health — health check público", () => {
  let authSecretOriginal: string | undefined

  beforeEach(() => {
    prismaMock.$queryRaw.mockReset()
    authSecretOriginal = process.env.AUTH_SECRET
    process.env.AUTH_SECRET = "test-secret-12345678"
  })

  afterEach(() => {
    if (authSecretOriginal === undefined) delete process.env.AUTH_SECRET
    else process.env.AUTH_SECRET = authSecretOriginal
  })

  it("OK: retorna 200 con status ok y checks database+auth en ok", async () => {
    prismaMock.$queryRaw.mockResolvedValue([{ "1": 1 }])
    const { GET } = await importarRuta()
    const res = await GET(request())
    expect(res.status).toBe(200)
    const body = (await res.json()) as { status: string; timestamp: string; version: string; checks: Record<string, string> }
    expect(body.status).toBe("ok")
    expect(body.checks.database).toBe("ok")
    expect(body.checks.auth).toBe("ok")
    expect(typeof body.timestamp).toBe("string")
    expect(Number.isNaN(Date.parse(body.timestamp))).toBe(false)
    expect(typeof body.version).toBe("string")
  })

  it("DB fail: la query falla → 503, status degraded y checks.database error", async () => {
    prismaMock.$queryRaw.mockRejectedValue(new Error("no hay conexión"))
    const { GET } = await importarRuta()
    const res = await GET(request())
    expect(res.status).toBe(503)
    const body = (await res.json()) as { status: string; checks: Record<string, string> }
    expect(body.status).toBe("degraded")
    expect(body.checks.database).toBe("error")
    expect(body.checks.auth).toBe("ok")
  })

  it("AUTH_SECRET ausente → check auth en error y 503", async () => {
    delete process.env.AUTH_SECRET
    prismaMock.$queryRaw.mockResolvedValue([{ "1": 1 }])
    const { GET } = await importarRuta()
    const res = await GET(request())
    expect(res.status).toBe(503)
    const body = (await res.json()) as { status: string; checks: Record<string, string> }
    expect(body.checks.auth).toBe("error")
    expect(body.checks.database).toBe("ok")
  })

  it("rate limit: sobre el máximo por IP retorna 429", async () => {
    prismaMock.$queryRaw.mockResolvedValue([{ "1": 1 }])
    const { GET } = await importarRuta()
    let ultima = await GET(request())
    for (let i = 0; i < 70; i++) {
      ultima = await GET(request())
    }
    expect(ultima.status).toBe(429)
    // Otra IP no se ve afectada por el límite de la primera
    const otra = await GET(request("10.0.0.2"))
    expect(otra.status).toBe(200)
  })
})
