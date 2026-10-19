/**
 * @vitest-environment node
 *
 * api-cobertura-fases fase 1 — /api/dev-dashboard (31.25% → medido).
 *
 * Ruta dev/QA que sirve el dashboard de desarrollo: lee el árbol openspec y
 * manipula tasks.md de changes y notas de módulos. Se ejercita contra los
 * handlers exportados con la sesión Auth.js real (cookie mintida), Prisma sin
 * mocks y efectos secundarios sobre el repo domados:
 * - `toggleTask()` ESCRIBE el tasks.md de un change → el test crea un change
 *   temporal y lo borra en afterAll.
 * - `saveModuleNotes()` escribe en `openspec/notes/` → nota temporal + borrado.
 * - El sandbox de `readProjectFile` se prueba con rutas fuera de los prefijos
 *   permitidos (404 sin leer nada).
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest"
import { NextRequest } from "next/server"
import { existsSync, readFileSync, rmSync, mkdirSync, writeFileSync } from "node:fs"
import path from "node:path"
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
const EMAIL = "dev-dash-user@test.cl"
const REPO_ROOT = path.resolve(process.cwd(), "../../..")
const CAMBIOS_DIR = path.join(REPO_ROOT, "openspec", "changes")
const CHANGE_TEMPORAL = "test-dev-dashboard-tmp"
const DIR_TEMPORAL = path.join(CAMBIOS_DIR, CHANGE_TEMPORAL)
const NOTA_BASE = "test-dev-dashboard-notas"
const NOTA_FILE = path.join(REPO_ROOT, "openspec", "notes", `${NOTA_BASE}.md`)

describe("/api/dev-dashboard — ruta dev con sesión Auth.js real", () => {
  beforeAll(async () => {
    process.env.AUTH_SECRET = AUTH_SECRET
    process.env.NEXT_PUBLIC_APP_ENV = "development"
    const user = await prisma.usuario.upsert({
      where: { email: EMAIL },
      update: { activo: true },
      create: { id: "dev-dash-user-1", email: EMAIL, activo: true },
    })
    const { cookieSesionAuthjs } = await import("../helpers/sesion-authjs")
    state.cookie = await cookieSesionAuthjs({ sub: user.id, email: user.email })
  }, 30_000)

  afterAll(async () => {
    state.cookie = ""
    delete process.env.NEXT_PUBLIC_APP_ENV
    rmSync(DIR_TEMPORAL, { recursive: true, force: true })
    rmSync(NOTA_FILE, { force: true })
    await prisma.usuario.delete({ where: { email: EMAIL } }).catch(() => {})
  })

  type Metodo = "GET" | "POST" | "PUT" | "PATCH"

  async function llamar(metodo: Metodo, body?: unknown): Promise<Response> {
    const ruta = await import("@/app/api/dev-dashboard/route")
    const req = new NextRequest("http://localhost/api/dev-dashboard", {
      method: metodo,
      body: body === undefined ? undefined : JSON.stringify(body),
      headers: {
        cookie: state.cookie,
        "x-forwarded-proto": "http",
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
    })
    return ruta[metodo](req as Request & typeof req)
  }

  it("guard de entorno: NEXT_PUBLIC_APP_ENV=production → 404 en los 4 métodos", async () => {
    process.env.NEXT_PUBLIC_APP_ENV = "production"
    try {
      for (const metodo of ["GET", "POST", "PUT", "PATCH"] as Metodo[]) {
        const res = await llamar(metodo, metodo === "GET" ? undefined : {})
        expect(res.status, metodo).toBe(404)
        expect(((await res.json()) as { error: string }).error).toBe("Not Found")
      }
    } finally {
      process.env.NEXT_PUBLIC_APP_ENV = "development"
    }
  })

  it("guardia de sesión: 401 sin cookie en los 4 métodos", async () => {
    const cookie = state.cookie
    state.cookie = ""
    try {
      for (const metodo of ["GET", "POST", "PUT", "PATCH"] as Metodo[]) {
        const res = await llamar(metodo, metodo === "GET" ? undefined : {})
        expect(res.status, metodo).toBe(401)
      }
    } finally {
      state.cookie = cookie
    }
  })

  it("GET → 200 con modules/changes/specs/stats del árbol openspec", async () => {
    const res = await llamar("GET")
    expect(res.status).toBe(200)
    const j = (await res.json()) as {
      modules: unknown[]
      changes: unknown[]
      specs: unknown[]
      stats: { total: number; completado: number; pendiente: number }
    }
    expect(Array.isArray(j.modules)).toBe(true)
    expect(j.modules.length).toBeGreaterThan(0)
    expect(Array.isArray(j.changes)).toBe(true)
    expect(Array.isArray(j.specs)).toBe(true)
    expect(typeof j.stats.total).toBe("number")
    expect(j.stats.completado + j.stats.pendiente).toBeLessThanOrEqual(j.stats.total)
  }, 30_000)

  it("POST lee un archivo permitido → 200 con su contenido", async () => {
    const res = await llamar("POST", { file: "openspec/specs/RG-reglas-generales/spec.md" })
    expect(res.status).toBe(200)
    const j = (await res.json()) as { ok: boolean; file: string; content: string }
    expect(j.ok).toBe(true)
    expect(j.file).toBe("openspec/specs/RG-reglas-generales/spec.md")
    expect(j.content).toContain("Requirement")
  })

  it("POST sin file → 400; rutas fuera del sandbox → 404 sin leer nada", async () => {
    const sinFile = await llamar("POST", {})
    expect(sinFile.status).toBe(400)

    for (const file of ["../../etc/passwd", "prisma/dev.db", "k0mp4ss_fe/apps/web/.env"]) {
      const res = await llamar("POST", { file })
      expect(res.status, file).toBe(404)
      expect(((await res.json()) as { error: string }).error).toBe("Recurso no disponible")
    }
  })

  it("PUT sin file → 400; con file pero sin content ni status → 400", async () => {
    const sinFile = await llamar("PUT", {})
    expect(sinFile.status).toBe(400)
    const sinContenido = await llamar("PUT", { file: NOTA_BASE })
    expect(sinContenido.status).toBe(400)
    const j = (await sinContenido.json()) as { error: string }
    expect(j.error).toBe("content o status son requeridos")
  })

  it("PUT guarda notas de módulo con status → 200 y el archivo queda con la línea de estado", async () => {
    const res = await llamar("PUT", {
      file: NOTA_BASE,
      content: "Notas temporales del test de dev-dashboard.",
      status: "pendientes",
    })
    expect(res.status).toBe(200)
    const j = (await res.json()) as { ok: boolean; file: string; status?: string }
    expect(j.ok).toBe(true)
    expect(j.status).toBe("pendientes")
    const escrito = readFileSync(NOTA_FILE, "utf8")
    expect(escrito).toContain("<!-- estado: pendientes -->")
    expect(escrito).toContain("Notas temporales del test")
  })

  it("PUT solo status reutiliza la nota existente → 200 y cambia el estado", async () => {
    const res = await llamar("PUT", { file: NOTA_BASE, status: "atendidas" })
    expect(res.status).toBe(200)
    const escrito = readFileSync(NOTA_FILE, "utf8")
    expect(escrito).toContain("<!-- estado: atendidas -->")
    expect(escrito).not.toContain("pendientes")
  })

  describe("PATCH toggleTask sobre un change temporal", () => {
    beforeAll(() => {
      rmSync(DIR_TEMPORAL, { recursive: true, force: true })
      mkdirSync(DIR_TEMPORAL, { recursive: true })
      writeFileSync(
        path.join(DIR_TEMPORAL, "tasks.md"),
        "# Tasks: test temporal\n\n## Fase Test\n\n- [ ] 9.1 tarea temporal del test\n",
        "utf8"
      )
    })

    afterAll(() => {
      rmSync(DIR_TEMPORAL, { recursive: true, force: true })
    })

    it("sin changeId o sin taskId → 400", async () => {
      const sinChange = await llamar("PATCH", { taskId: "9.1" })
      expect(sinChange.status).toBe(400)
      const sinTask = await llamar("PATCH", { changeId: CHANGE_TEMPORAL })
      expect(sinTask.status).toBe(400)
    })

    it("changeId inexistente → 404", async () => {
      const res = await llamar("PATCH", { changeId: "no-existe-xyz", taskId: "9.1" })
      expect(res.status).toBe(404)
    })

    it("camino feliz: marca y desmarca la tarea del change temporal", async () => {
      const marcado = await llamar("PATCH", { changeId: CHANGE_TEMPORAL, taskId: "9.1" })
      expect(marcado.status).toBe(200)
      const j = (await marcado.json()) as {
        ok: boolean
        change: { id: string; tasks: { id: string; completed: boolean }[] }
      }
      expect(j.ok).toBe(true)
      expect(j.change.id).toBe(CHANGE_TEMPORAL)
      expect(j.change.tasks).toHaveLength(1)
      expect(j.change.tasks[0]?.id).toBe("9.1")
      expect(j.change.tasks[0]?.completed).toBe(true)
      expect(readFileSync(path.join(DIR_TEMPORAL, "tasks.md"), "utf8")).toContain("- [x] 9.1")

      const desmarcado = await llamar("PATCH", { changeId: CHANGE_TEMPORAL, taskId: "9.1" })
      expect(desmarcado.status).toBe(200)
      const j2 = (await desmarcado.json()) as { change: { tasks: { completed: boolean }[] } }
      expect(j2.change.tasks[0]?.completed).toBe(false)
      expect(existsSync(path.join(DIR_TEMPORAL, "tasks.md"))).toBe(true)
    })
  })
})
