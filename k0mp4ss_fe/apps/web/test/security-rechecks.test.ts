/* eslint-disable @typescript-eslint/no-explicit-any -- tests de seguridad con fakes de NextAuth/Request */
/**
 * @vitest-environment node
 * D-iii re-chequeos scripted — 5 checks repetibles invocando handlers directamente.
 * Cada test imprime OK/FAIL y falla si no pasa (vitest expect).
 * Uso: npm test -- test/security-rechecks.test.ts  y  node scripts/security-recheck.mjs (estático)
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest"
import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import { readFileSync } from "node:fs"
import path from "node:path"

const state = vi.hoisted(() => ({ cookie: "" }))
vi.mock("next/headers", () => ({
  headers: () => Promise.resolve(new Headers(state.cookie ? { cookie: state.cookie, "x-forwarded-proto": "http" } : { "x-forwarded-proto": "http" })),
}))

describe("D-iii re-chequeos 5/5 (scripted)", () => {
  const comunidadA = "comunidad-recheck-a"
  const adminEmail = "recheck-admin@test.cl"
  const originalSecret = process.env.AUTH_SECRET
  const originalAppEnv = process.env.NEXT_PUBLIC_APP_ENV

  beforeAll(async () => {
    process.env.AUTH_SECRET = "test-secret-12345678"
    process.env.NEXT_PUBLIC_APP_ENV = "development"
    for (const c of [{ id: comunidadA, nombre: "Comunidad Recheck A", slug: "comunidad-recheck-a" }]) {
      await prisma.comunidad.upsert({ where: { id: c.id }, update: {}, create: c }).catch(() => {})
    }
    await prisma.usuario.upsert({ where: { email: adminEmail }, update: { activo: true }, create: { id: "recheck-usuario-admin", email: adminEmail, activo: true } })
    const adminUser = await prisma.usuario.findUnique({ where: { email: adminEmail } })
    if (adminUser) {
      await prisma.membresia.deleteMany({ where: { usuarioId: adminUser.id } })
      await prisma.membresia.create({ data: { usuarioId: adminUser.id, comunidadId: comunidadA, rol: "administrador" } })
    }
    console.log("[recheck] setup comunidad/usuario admin listo")
  })

  afterAll(async () => {
    try {
      state.cookie = ""
      const u = await prisma.usuario.findUnique({ where: { email: adminEmail } })
      if (u) {
        await prisma.membresia.deleteMany({ where: { usuarioId: u.id } })
        await prisma.usuario.delete({ where: { id: u.id } }).catch(() => {})
      }
      await prisma.comunidad.delete({ where: { id: comunidadA } }).catch(() => {
        // intencional: vacío por diseño
      })
    } catch {
      // intencional: el fallo ya se verifica arriba
    }
    if (originalSecret === undefined) delete process.env.AUTH_SECRET
    else process.env.AUTH_SECRET = originalSecret
    if (originalAppEnv === undefined) delete process.env.NEXT_PUBLIC_APP_ENV
    else process.env.NEXT_PUBLIC_APP_ENV = originalAppEnv
    console.log("[recheck] teardown")
  })

  async function cookieAdmin() {
    const u = await prisma.usuario.findUnique({ where: { email: adminEmail } })
    if (!u) throw new Error("admin no encontrado")
    const { cookieSesionAuthjs } = await import("./helpers/sesion-authjs")
    return cookieSesionAuthjs({ sub: u.id, email: u.email })
  }

  it("[1/5] POST /api/backup con >10MB → 413", async () => {
    const { POST } = await import("@/app/api/backup/route")
    const cookie = await cookieAdmin()
    state.cookie = cookie
    process.env.NEXT_PUBLIC_APP_ENV = "development"
    // vía header content-length (evita crear body 10MB real para velocidad)
    const headers = {
      "Content-Type": "application/json",
      "x-forwarded-proto": "http",
      "x-comunidad-id": comunidadA,
      cookie,
      "content-length": String(11 * 1024 * 1024),
    }
    const req = new Request("http://localhost/api/backup", {
      method: "POST",
      headers,
      body: JSON.stringify({ content: "x", fileName: "big.json" }),
    })
    const res = await POST(req as never)
    state.cookie = ""
    console.log(`[1/5] backup >10MB → 413: ${res.status === 413 ? "OK" : `FAIL (status=${res.status})`}`)
    expect(res.status).toBe(413)
    const j = await res.json()
    expect(j.error).toMatch(/demasiado grande/i)

    // también vía body real >10MB (con content-length no declarado)
    const cookie2 = await cookieAdmin()
    state.cookie = cookie2
    const bigContent = "a".repeat(10 * 1024 * 1024 + 1)
    const req2 = new Request("http://localhost/api/backup", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-forwarded-proto": "http",
        "x-comunidad-id": comunidadA,
        cookie: cookie2,
      },
      body: JSON.stringify({ content: bigContent, fileName: "big2.json" }),
    })
    const res2 = await POST(req2 as never)
    state.cookie = ""
    console.log(`[1/5b] backup body >10MB → 413: ${res2.status === 413 ? "OK" : `FAIL (status=${res2.status})`}`)
    expect(res2.status).toBe(413)
  })

  it("[2/5] APIs escritura con APP_ENV=production → 404", async () => {
    process.env.NEXT_PUBLIC_APP_ENV = "production"
    // seed-authz POST (seed dev de usuarios TEST)
    const { POST: seedPost } = await import("@/app/api/admin/seed-authz/route")
    const r1 = await seedPost()
    console.log(`[2/5] POST /api/admin/seed-authz production → 404: ${r1.status === 404 ? "OK" : `FAIL (status=${r1.status})`}`)
    expect(r1.status).toBe(404)

    // backup POST (aunque sin sesión, debe ser 404 antes de 401 por env-guard)
    const { POST } = await import("@/app/api/backup/route")
    const req = new Request("http://localhost/api/backup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "{}", fileName: "x.json" }),
    })
    const r2 = await POST(req as never)
    console.log(`[2/5] POST /api/backup production → 404: ${r2.status === 404 ? "OK" : `FAIL (status=${r2.status})`}`)
    expect(r2.status).toBe(404)

    process.env.NEXT_PUBLIC_APP_ENV = "development"
  })

  it("[3/5] nombre de archivo del cliente → sanitizado (sin traversal)", async () => {
    // El cliente solo aporta un prefijo semántico: la fecha y el nombre final los
    // fija el servidor, así que un `fileName`/`prefijo` con traversal no puede
    // convertirse en una ruta del servidor.
    process.env.NEXT_PUBLIC_APP_ENV = "development"
    const { POST } = await import("@/app/api/backup/route")
    const cookie = await cookieAdmin()
    state.cookie = cookie
    const req = new Request("http://localhost/api/backup", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-comunidad-id": comunidadA, cookie },
      body: JSON.stringify({
        content: "{}",
        fileName: "../../etc/passwd",
        prefijo: "../../etc/passwd",
      }),
    })
    const res = await POST(req as never)
    const disposicion = res.headers.get("content-disposition") ?? ""
    const nombre = disposicion.match(/filename="([^"]+)"/)?.[1] ?? ""
    console.log(`[3/5] backup con prefijo traversal → ${nombre}: ${res.status === 200 && /^compass-backup-\d{4}-\d{2}-\d{2}_\d{2}-\d{2}\.json$/.test(nombre) ? "OK" : `FAIL (status=${res.status})`}`)
    expect(res.status).toBe(200)
    expect(nombre).toMatch(/^compass-backup-\d{4}-\d{2}-\d{2}_\d{2}-\d{2}\.json$/)
    expect(disposicion).not.toContain("..")
    expect(disposicion).not.toContain("etc/passwd")

    // Un prefijo válido se conserva (el saneo no rompe el uso legítimo)
    const reqValido = new Request("http://localhost/api/backup", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-comunidad-id": comunidadA, cookie },
      body: JSON.stringify({ content: "{}", prefijo: "compass-seed-report" }),
    })
    const resValido = await POST(reqValido as never)
    state.cookie = ""
    const nombreValido = (resValido.headers.get("content-disposition") ?? "").match(/filename="([^"]+)"/)?.[1] ?? ""
    console.log(`[3/5b] backup con prefijo válido → ${nombreValido}: ${nombreValido.startsWith("compass-seed-report-") ? "OK" : "FAIL"}`)
    expect(nombreValido).toMatch(/^compass-seed-report-\d{4}-\d{2}-\d{2}_\d{2}-\d{2}\.json$/)
  })

  it("[4/5] GET /admin sin cookie → redirect /ingresar?next=", async () => {
    const proxy = (await import("@/proxy")).default
    process.env.AUTH_SECRET = "test-secret-12345678"
    const req = new NextRequest("http://localhost/admin/permisos", {
      headers: { "x-forwarded-proto": "http" },
    })
    const res: any = await (proxy as any)(req as any, undefined as never)
    const loc = res?.headers.get("location") ?? ""
    console.log(`[4/5] /admin sin cookie → redirect: ${[307, 308].includes(res?.status) && loc.includes("/ingresar") && loc.includes("next=") ? "OK" : `FAIL (status=${res?.status} loc=${loc})`}`)
    expect([307, 308].includes(res?.status)).toBe(true)
    expect(loc).toContain("/ingresar")
    expect(loc).toContain(encodeURIComponent("/admin/permisos"))
  })

  it("[5/5] API sin sesión → 401", async () => {
    const proxy = (await import("@/proxy")).default
    const req = new NextRequest("http://localhost/api/admin/usuarios?comunidadId=x", {
      headers: { "x-forwarded-proto": "http" },
    })
    const res: any = await (proxy as any)(req as any, undefined as never)
    console.log(`[5/5] proxy /api sin sesión → 401: ${res?.status === 401 ? "OK" : `FAIL (status=${res?.status})`}`)
    expect(res?.status).toBe(401)

    // también handler directo sin sesión
    const { GET } = await import("@/app/api/admin/usuarios/route")
    state.cookie = ""
    const req2 = new NextRequest("http://localhost/api/admin/usuarios?comunidadId=x", {
      headers: { "x-forwarded-proto": "http" },
    })
    const res2 = await GET(req2)
    console.log(`[5/5] GET /api/admin/usuarios sin sesión → 401: ${res2.status === 401 ? "OK" : `FAIL (status=${res2.status})`}`)
    expect(res2.status).toBe(401)
  })

  it("D-i: CSP Report-Only con nonce por request y report-uri", async () => {
        const proxy = (await import("@/proxy")).default
        const r1: any = await (proxy as any)(new NextRequest("http://localhost/", { headers: { "x-forwarded-proto": "http" } }) as any, undefined as never)
        const r2: any = await (proxy as any)(new NextRequest("http://localhost/", { headers: { "x-forwarded-proto": "http" } }) as any, undefined as never)
        const csp1 = r1.headers.get("content-security-policy-report-only") ?? ""
        const csp2 = r2.headers.get("content-security-policy-report-only") ?? ""
        const enforce = r1.headers.get("content-security-policy") ?? ""
        console.log(`[CSP] Report-Only nonce único: ${csp1.includes("nonce-") && csp2.includes("nonce-") && csp1 !== csp2 ? "OK" : `FAIL`}`)
        expect(csp1).toContain("nonce-")
        expect(csp2).toContain("nonce-")
        expect(csp1).not.toBe(csp2) // nonce por request
        expect(enforce).toBe("") // NO enforcement, solo Report-Only
        expect(csp1).toContain("report-uri /api/csp-report")
        expect(csp1).toContain("youtube.com")
        expect(csp1).toContain("img-src")
  })

  it("headers D-ii: next.config HSTS sin preload y complementos", async () => {
    const raw = readFileSync(path.join(process.cwd(), "next.config.mjs"), "utf8")
    expect(raw).toContain("Strict-Transport-Security")
    expect(raw).toContain("includeSubDomains")
    const hstsVal = raw.match(/Strict-Transport-Security[^}]*value:\s*"([^"]+)"/)?.[1] ?? ""
    expect(hstsVal).not.toContain("preload")
    expect(hstsVal).toContain("max-age=63072000")
    expect(raw).toContain("X-DNS-Prefetch-Control")
    expect(raw).toContain("Cross-Origin-Opener-Policy")
    console.log("[D-ii] HSTS sin preload + headers complementados: OK")

    const envEx = readFileSync(path.join(process.cwd(), ".env.example"), "utf8")
    expect(envEx).toContain("PUBLIC_DOMAIN")
    console.log("[D-ii] PUBLIC_DOMAIN en .env.example: OK")
  })
})
