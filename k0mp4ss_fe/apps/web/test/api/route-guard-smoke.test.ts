/**
 * @vitest-environment node
 *
 * Smoke de guardias para 19 route handlers que hoy están a 0% de cobertura.
 *
 * Contratos ejercitados (reproducidos leyendo cada `route.ts`):
 * - Rutas de dominio `[id]` (factory CRUD): sin sesión → 401 desde
 *   `withComunidadScope()` ANTES de tocar Prisma (la BD no se consulta).
 *   El segundo argumento de Next 16 es `{ params: Promise<{ id }> }` y el id
 *   se resuelve a un valor inexistente por diseño: el handler corta en 401.
 * - `/api/csp-report`: sink PÚBLICO (sin auth); POST siempre → 204, incluso
 *   con cuerpo malformado (JSON.parse falla → se loguea el raw, nunca lanza).
 * - `/api/admin/seed-authz` y `/api/backup`: APIs de escritura dev-only.
 *   `isWriteApiEnabled()` decide ANTES de auth (404 cuando el guard está apagado)
 *   y solo después se evalúa la sesión (401 sin cookie).
 */
import { describe, it, expect, vi, afterEach } from "vitest"
import { NextRequest } from "next/server"

// Mismo patrón que test/api/api-certificados-ct.test.ts: auth() resuelve la
// cookie vía headers(). Sin cookie seteada → sesión nula → 401.
vi.mock("next/headers", () => ({
  headers: () => Promise.resolve(new Headers({ "x-forwarded-proto": "http" })),
}))

const ID_INEXISTENTE = "test-inexistente"
const CTX_ITEM = { params: Promise.resolve({ id: ID_INEXISTENTE }) }

type HandlerItem = (
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) => Promise<Response>

interface ModuloItem {
  GET: HandlerItem
  PUT: HandlerItem
  DELETE: HandlerItem
}

/** Las 16 rutas `[id]` a cubrir (GET_ONE / PUT parcial / DELETE vía factory). */
const RUTAS_ITEM: Array<{ nombre: string; cargar: () => Promise<unknown> }> = [
  { nombre: "co/documentos", cargar: () => import("@/app/api/co/documentos/[id]/route") },
  { nombre: "co/envios", cargar: () => import("@/app/api/co/envios/[id]/route") },
  { nombre: "co/plantillas", cargar: () => import("@/app/api/co/plantillas/[id]/route") },
  { nombre: "cv/plantillas", cargar: () => import("@/app/api/cv/plantillas/[id]/route") },
  { nombre: "egresos-fi", cargar: () => import("@/app/api/egresos-fi/[id]/route") },
  { nombre: "in/tipos", cargar: () => import("@/app/api/in/tipos/[id]/route") },
  { nombre: "ir/entregas-epp", cargar: () => import("@/app/api/ir/entregas-epp/[id]/route") },
  {
    nombre: "ir/solicitudes-insumo",
    cargar: () => import("@/app/api/ir/solicitudes-insumo/[id]/route"),
  },
  { nombre: "pe/cierres-turno", cargar: () => import("@/app/api/pe/cierres-turno/[id]/route") },
  { nombre: "pe/encomiendas", cargar: () => import("@/app/api/pe/encomiendas/[id]/route") },
  {
    nombre: "pe/ingresos-contratistas",
    cargar: () => import("@/app/api/pe/ingresos-contratistas/[id]/route"),
  },
  { nombre: "pe/mantenciones", cargar: () => import("@/app/api/pe/mantenciones/[id]/route") },
  { nombre: "pe/proveedores", cargar: () => import("@/app/api/pe/proveedores/[id]/route") },
  { nombre: "pe/proyecciones", cargar: () => import("@/app/api/pe/proyecciones/[id]/route") },
  {
    nombre: "pe/visitas-tecnicas",
    cargar: () => import("@/app/api/pe/visitas-tecnicas/[id]/route"),
  },
  { nombre: "ra/elementos", cargar: () => import("@/app/api/ra/elementos/[id]/route") },
]

function requestItem(
  nombre: string,
  metodo: "GET" | "PUT" | "DELETE"
): NextRequest {
  const url = `http://localhost/api/${nombre}/${ID_INEXISTENTE}`
  if (metodo === "GET") return new NextRequest(url)
  return new NextRequest(url, {
    method: metodo,
    body: metodo === "PUT" ? JSON.stringify({ id: ID_INEXISTENTE }) : undefined,
    headers: metodo === "PUT" ? { "content-type": "application/json" } : undefined,
  })
}

describe("rutas [id] — sin sesión → 401 antes de Prisma", () => {
  it.each(RUTAS_ITEM)("$nombre: GET, PUT y DELETE → 401", async ({ nombre, cargar }) => {
    const mod = (await cargar()) as ModuloItem

    const resGet = await mod.GET(requestItem(nombre, "GET"), CTX_ITEM)
    expect(resGet.status).toBe(401)
    expect(((await resGet.json()) as { error: string }).error).toMatch(/autenticado/i)

    const resPut = await mod.PUT(requestItem(nombre, "PUT"), CTX_ITEM)
    expect(resPut.status).toBe(401)

    const resDelete = await mod.DELETE(requestItem(nombre, "DELETE"), CTX_ITEM)
    expect(resDelete.status).toBe(401)
  })
})

describe("/api/csp-report — sink público, nunca lanza", () => {
  it("POST con cuerpo malformado → 204 (JSON.parse falla y se loguea el raw)", async () => {
    const { POST } = await import("@/app/api/csp-report/route")
    const res = await POST(
      new NextRequest("http://localhost/api/csp-report", {
        method: "POST",
        body: "{ no-es-json",
        headers: { "content-type": "application/json" },
      })
    )
    expect(res.status).toBe(204)
    expect(await res.text()).toBe("")
  })

  it("POST con reporte CSP bien formado → 204 (solo campos estándar al log)", async () => {
    const { POST } = await import("@/app/api/csp-report/route")
    const res = await POST(
      new NextRequest("http://localhost/api/csp-report", {
        method: "POST",
        body: JSON.stringify({
          "csp-report": {
            "document-uri": "https://localhost/panel",
            "violated-directive": "script-src 'self'",
            "blocked-uri": "https://cdn.example/evil.js",
            "effective-directive": "script-src",
          },
        }),
        headers: { "content-type": "application/json" },
      })
    )
    expect(res.status).toBe(204)
  })

  it("POST con JSON válido sin csp-report → 204 (rama raw truncada a 200 chars)", async () => {
    const { POST } = await import("@/app/api/csp-report/route")
    const res = await POST(
      new NextRequest("http://localhost/api/csp-report", {
        method: "POST",
        body: JSON.stringify({ otro: "campo" }),
        headers: { "content-type": "application/json" },
      })
    )
    expect(res.status).toBe(204)
  })

  it("GET → 200 con nota del sink", async () => {
    const { GET } = await import("@/app/api/csp-report/route")
    const res = await GET()
    expect(res.status).toBe(200)
    const json = (await res.json()) as { ok: boolean; note: string }
    expect(json.ok).toBe(true)
    expect(json.note).toMatch(/CSP report sink/i)
  })
})

describe("/api/admin/seed-authz y /api/backup — env-guard antes de auth", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  async function cargaWrites(): Promise<{
    seed: { POST: () => Promise<Response> }
    backup: { POST: (req: Request) => Promise<Response> }
  }> {
    return {
      seed: await import("@/app/api/admin/seed-authz/route"),
      backup: await import("@/app/api/backup/route"),
    }
  }

  const reqBackup = () =>
    new NextRequest("http://localhost/api/backup", {
      method: "POST",
      body: JSON.stringify({ content: "{}", fileName: "x.json" }),
      headers: { "content-type": "application/json" },
    })

  it("sin NEXT_PUBLIC_APP_ENV: el status previo al auth sigue a isWriteApiEnabled()", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_ENV", undefined)
    vi.stubEnv("APP_ENV", undefined)
    const { isWriteApiEnabled } = await import("@/lib/env-guard")
    const habilitado = isWriteApiEnabled()
    const esperado = habilitado ? 401 : 404
    const { seed, backup } = await cargaWrites()

    const resSeed = await seed.POST()
    expect(resSeed.status).toBe(esperado)
    const resBackup = await backup.POST(reqBackup())
    expect(resBackup.status).toBe(esperado)

    // Invariante del guard: cuando está apagado, corta ANTES de auth.
    if (!habilitado) {
      expect(((await resSeed.json()) as { error: string }).error).toMatch(/not found/i)
      expect(((await resBackup.json()) as { error: string }).error).toMatch(/not found/i)
    }
  })

  it("NEXT_PUBLIC_APP_ENV=production → 404 sin sesión (guard corta antes de auth)", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_ENV", "production")
    const { seed, backup } = await cargaWrites()

    const resSeed = await seed.POST()
    expect(resSeed.status).toBe(404)
    expect(((await resSeed.json()) as { error: string }).error).toMatch(/not found/i)

    const resBackup = await backup.POST(reqBackup())
    expect(resBackup.status).toBe(404)
    expect(((await resBackup.json()) as { error: string }).error).toMatch(/not found/i)
  })

  it("NEXT_PUBLIC_APP_ENV=development sin sesión → 401 tras el guard", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_ENV", "development")
    const { seed, backup } = await cargaWrites()

    const resSeed = await seed.POST()
    expect(resSeed.status).toBe(401)
    expect(((await resSeed.json()) as { error: string }).error).toMatch(/autenticado/i)

    const resBackup = await backup.POST(reqBackup())
    expect(resBackup.status).toBe(401)
    expect(((await resBackup.json()) as { error: string }).error).toMatch(/autenticado/i)
  })
})
