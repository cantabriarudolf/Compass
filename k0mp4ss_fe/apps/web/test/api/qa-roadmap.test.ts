/**
 * @vitest-environment node
 *
 * api-cobertura-fase3 (SERIE-DEUDA-1 P3) — /api/qa-roadmap (62.5% → medido).
 *
 * Un único handler GET: guard de entorno (`isWriteApiEnabled()` → 404 en
 * producción), 401 sin sesión, 400 cuando el `alcance` no está en
 * `ALCANCES_ROADMAP`, y camino feliz con el alcance explícito y el default.
 * Prisma real para la sesión, único mock `next/headers`.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest"
import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"

const state = vi.hoisted(() => ({ cookie: "" }))
vi.mock("next/headers", () => ({
  headers: () =>
    Promise.resolve(
      new Headers(
        state.cookie
          ? { cookie: state.cookie, "x-forwarded-proto": "http" }
          : { "x-forwarded-proto": "http" }
      )
    ),
}))

const AUTH_SECRET = "test-secret-12345678"
const emailUsuario = "qar-usuario@test.cl"

async function GET(url = "http://localhost/api/qa-roadmap"): Promise<Response> {
  const ruta = await import("@/app/api/qa-roadmap/route")
  return ruta.GET(new NextRequest(url))
}

describe("/api/qa-roadmap — roadmap QA con sesión real", () => {
  beforeAll(async () => {
    process.env.AUTH_SECRET = AUTH_SECRET
    process.env.NEXT_PUBLIC_APP_ENV = "development"
    await prisma.usuario.upsert({
      where: { email: emailUsuario },
      update: { activo: true },
      create: { id: "qar-usuario-1", email: emailUsuario, activo: true },
    })
    const user = await prisma.usuario.findUniqueOrThrow({ where: { email: emailUsuario } })
    const { cookieSesionAuthjs } = await import("../helpers/sesion-authjs")
    state.cookie = await cookieSesionAuthjs({ sub: user.id, email: user.email })
  }, 30_000)

  afterAll(async () => {
    state.cookie = ""
    delete process.env.NEXT_PUBLIC_APP_ENV
    await prisma.usuario.delete({ where: { email: emailUsuario } }).catch(() => {})
  })

  it("guard de entorno: NEXT_PUBLIC_APP_ENV=production → 404", async () => {
    process.env.NEXT_PUBLIC_APP_ENV = "production"
    try {
      const res = await GET()
      expect(res.status).toBe(404)
      expect(((await res.json()) as { error: string }).error).toBe("Not Found")
    } finally {
      process.env.NEXT_PUBLIC_APP_ENV = "development"
    }
  })

  it("guardia de sesión: 401 sin cookie", async () => {
    const cookie = state.cookie
    state.cookie = ""
    try {
      const res = await GET()
      expect(res.status).toBe(401)
      expect(((await res.json()) as { error: string }).error).toBe("No autenticado.")
    } finally {
      state.cookie = cookie
    }
  })

  it("alcance no reconocido → 400 con el alcance en el mensaje", async () => {
    const res = await GET("http://localhost/api/qa-roadmap?alcance=inexistente")
    expect(res.status).toBe(400)
    const j = (await res.json()) as { ok: boolean; error: string }
    expect(j.ok).toBe(false)
    expect(j.error).toBe("Alcance no reconocido: inexistente")
  })

  it("sin `alcance` → 200 con el plan de la suite completa", async () => {
    const res = await GET()
    expect(res.status).toBe(200)
    const j = (await res.json()) as {
      alcance: string
      etapas: { id: string }[]
      totalMinutos: number
      factorCarga: number
    }
    expect(j.alcance).toBe("suite completa")
    expect(Array.isArray(j.etapas)).toBe(true)
    expect(j.etapas.length).toBeGreaterThan(0)
    expect(typeof j.totalMinutos).toBe("number")
    expect(j.factorCarga).toBeGreaterThan(0)
  })

  it("alcance `smoke` → 200 y el plan queda acotado a setup + smoke", async () => {
    const res = await GET("http://localhost/api/qa-roadmap?alcance=smoke")
    expect(res.status).toBe(200)
    const j = (await res.json()) as { etapas: { id: string }[] }
    const ids = j.etapas.map((e) => e.id)
    expect(ids).toContain("setup")
    expect(ids).toContain("smoke")
    expect(ids.every((id) => id === "setup" || id === "smoke")).toBe(true)
  })

  it("alcance `crud general` → 200 (alias de `crud`)", async () => {
    const res = await GET("http://localhost/api/qa-roadmap?alcance=crud%20general")
    expect(res.status).toBe(200)
    const j = (await res.json()) as { etapas: { id: string }[] }
    expect(j.etapas.every((e) => e.id === "setup" || e.id.startsWith("crud-"))).toBe(true)
  })
})
