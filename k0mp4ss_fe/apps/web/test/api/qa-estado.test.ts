/**
 * @vitest-environment node
 *
 * api-cobertura-fases fase 1 — /api/qa-estado (45.65% → medido).
 *
 * Dashboard QA: `qa-estado.json` está TRACKEADO en git, así que el test
 * respalda su contenido en beforeAll y lo restaura byte-a-byte en afterAll
 * (el worktree queda limpio tras la corrida). Guard de entorno y sesión se
 * ejercitan de verdad (isWriteApiEnabled + auth() con cookie mintida).
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest"
import { NextRequest } from "next/server"
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import path from "node:path"

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
const QA_ESTADO_PATH = path.join(process.cwd(), "qa-estado.json")
const RUN_ID = "run-test-1"

function runSeed(): Record<string, unknown> {
  return {
    runs: [
      {
        id: RUN_ID,
        fecha: "2026-10-15T10:00:00-04:00",
        tipo: "e2e",
        resultado: { estado: "passed", passed: 9, failed: 0, skipped: 0, duracion: "5m", fallos: [] },
        etapas: [{ id: "smoke" }, { id: "flujo" }],
      },
    ],
    baselinesEtapa: {},
  }
}

describe("/api/qa-estado — dashboard QA con archivo respaldado", () => {
  let original: string | null = null

  beforeAll(async () => {
    process.env.AUTH_SECRET = AUTH_SECRET
    process.env.NEXT_PUBLIC_APP_ENV = "development"
    original = existsSync(QA_ESTADO_PATH) ? readFileSync(QA_ESTADO_PATH, "utf8") : null
    const user = await import("@/lib/prisma").then((m) =>
      m.prisma.usuario.upsert({
        where: { email: "qa-estado-user@test.cl" },
        update: { activo: true },
        create: { id: "qa-estado-user-1", email: "qa-estado-user@test.cl", activo: true },
      })
    )
    const { cookieSesionAuthjs } = await import("../helpers/sesion-authjs")
    state.cookie = await cookieSesionAuthjs({ sub: user.id, email: user.email })
  }, 30_000)

  afterAll(async () => {
    state.cookie = ""
    delete process.env.NEXT_PUBLIC_APP_ENV
    if (original !== null) writeFileSync(QA_ESTADO_PATH, original, "utf8")
    else rmSync(QA_ESTADO_PATH, { force: true })
    await import("@/lib/prisma").then((m) =>
      m.prisma.usuario.delete({ where: { email: "qa-estado-user@test.cl" } }).catch(() => {})
    )
  })

  type Metodo = "GET" | "POST"

  async function llamar(metodo: Metodo, body?: unknown): Promise<Response> {
    const ruta = await import("@/app/api/qa-estado/route")
    const req = new NextRequest("http://localhost/api/qa-estado", {
      method: metodo,
      body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
      headers: {
        cookie: state.cookie,
        "x-forwarded-proto": "http",
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
    })
    return ruta[metodo](req as Request & typeof req)
  }

  it("guard de entorno: NEXT_PUBLIC_APP_ENV=production → 404 en GET y POST", async () => {
    process.env.NEXT_PUBLIC_APP_ENV = "production"
    try {
      for (const metodo of ["GET", "POST"] as Metodo[]) {
        const res = await llamar(metodo, metodo === "GET" ? undefined : {})
        expect(res.status, metodo).toBe(404)
      }
    } finally {
      process.env.NEXT_PUBLIC_APP_ENV = "development"
    }
  })

  it("guardia de sesión: 401 sin cookie en GET y POST", async () => {
    const cookie = state.cookie
    state.cookie = ""
    try {
      for (const metodo of ["GET", "POST"] as Metodo[]) {
        const res = await llamar(metodo, metodo === "GET" ? undefined : {})
        expect(res.status, metodo).toBe(401)
      }
    } finally {
      state.cookie = cookie
    }
  })

  it("GET sin qa-estado.json → 200 con estado null", async () => {
    rmSync(QA_ESTADO_PATH, { force: true })
    const res = await llamar("GET")
    expect(res.status).toBe(200)
    const j = (await res.json()) as {
      estado: unknown
      sistema: { cores: number }
      estimados: unknown[]
    }
    expect(j.estado).toBeNull()
    expect(j.sistema.cores).toBeGreaterThan(0)
    expect(Array.isArray(j.estimados)).toBe(true)
  })

  it("GET con qa-estado.json sembrado → 200 con el run persistido", async () => {
    writeFileSync(QA_ESTADO_PATH, JSON.stringify(runSeed(), null, 2), "utf8")
    const res = await llamar("GET")
    expect(res.status).toBe(200)
    const j = (await res.json()) as { estado: { runs: { id: string }[] } }
    expect(j.estado.runs[0]?.id).toBe(RUN_ID)
  })

  it("POST body malformado → 400", async () => {
    const res = await llamar("POST", "esto-no-es-json{")
    expect(res.status).toBe(400)
    const j = (await res.json()) as { ok: boolean; error: string }
    expect(j.ok).toBe(false)
    expect(j.error).toBe("Body inválido")
  })

  it("POST acción desconocida → 400", async () => {
    const res = await llamar("POST", { accion: "otra-cosa" })
    expect(res.status).toBe(400)
    const j = (await res.json()) as { error: string }
    expect(j.error).toBe("Acción no reconocida")
  })

  describe("POST accion=nota", () => {
    it("campos obligatorios ausentes → 400", async () => {
      const sinRun = await llamar("POST", { accion: "nota", etapaId: "smoke", texto: "x" })
      expect(sinRun.status).toBe(400)
      const sinEtapa = await llamar("POST", { accion: "nota", runId: RUN_ID, texto: "x" })
      expect(sinEtapa.status).toBe(400)
      const j = (await sinEtapa.json()) as { error: string }
      expect(j.error).toBe("runId y etapaId son obligatorios")
    })

    it("nota vacía → 400", async () => {
      const res = await llamar("POST", { accion: "nota", runId: RUN_ID, etapaId: "smoke", texto: "  " })
      expect(res.status).toBe(400)
      const j = (await res.json()) as { error: string }
      expect(j.error).toBe("La nota no puede estar vacía")
    })

    it("run o etapa inexistentes → 400", async () => {
      const run = await llamar("POST", { accion: "nota", runId: "no-existe", etapaId: "smoke", texto: "x" })
      expect(run.status).toBe(400)
      expect(((await run.json()) as { error: string }).error).toContain("Run no encontrado")
      const etapa = await llamar("POST", { accion: "nota", runId: RUN_ID, etapaId: "inexistente", texto: "x" })
      expect(etapa.status).toBe(400)
      expect(((await etapa.json()) as { error: string }).error).toContain("no existe en el run")
    })

    it("camino feliz: persiste la nota en qa-estado.json", async () => {
      writeFileSync(QA_ESTADO_PATH, JSON.stringify(runSeed(), null, 2), "utf8")
      const res = await llamar("POST", {
        accion: "nota",
        runId: RUN_ID,
        etapaId: "smoke",
        texto: "corrida impecable",
      })
      expect(res.status).toBe(200)
      const j = (await res.json()) as { ok: boolean }
      expect(j.ok).toBe(true)
      const persistido = JSON.parse(readFileSync(QA_ESTADO_PATH, "utf8")) as {
        runs: { etapas: { id: string; nota?: string }[] }[]
      }
      expect(persistido.runs[0]?.etapas.find((e) => e.id === "smoke")?.nota).toBe("corrida impecable")
    })
  })

  describe("POST accion=recalibrar", () => {
    it("etapa desconocida o minutos inválidos → 400", async () => {
      const etapa = await llamar("POST", { accion: "recalibrar", etapaId: "inexistente", minutosReales: 3 })
      expect(etapa.status).toBe(400)
      const minutos = await llamar("POST", { accion: "recalibrar", etapaId: "smoke", minutosReales: 0 })
      expect(minutos.status).toBe(400)
      const j = (await minutos.json()) as { error: string }
      expect(j.error).toBe("minutosReales debe ser un número > 0")
    })

    it("sin qa-estado.json → 400 (no hay dónde persistir el baseline)", async () => {
      rmSync(QA_ESTADO_PATH, { force: true })
      const res = await llamar("POST", { accion: "recalibrar", etapaId: "smoke", minutosReales: 3.7 })
      expect(res.status).toBe(400)
      expect(((await res.json()) as { error: string }).error).toContain("qa-estado.json")
    })

    it("camino feliz: recalibra el baseline de la etapa", async () => {
      writeFileSync(QA_ESTADO_PATH, JSON.stringify(runSeed(), null, 2), "utf8")
      const res = await llamar("POST", { accion: "recalibrar", etapaId: "smoke", minutosReales: 3.7 })
      expect(res.status).toBe(200)
      const j = (await res.json()) as { ok: boolean; mensaje: string }
      expect(j.ok).toBe(true)
      expect(j.mensaje).toContain("3.7")
      const persistido = JSON.parse(readFileSync(QA_ESTADO_PATH, "utf8")) as {
        baselinesEtapa: Record<string, { minutosBase: number }>
      }
      expect(persistido.baselinesEtapa.smoke?.minutosBase).toBe(3.7)
    })
  })
})
