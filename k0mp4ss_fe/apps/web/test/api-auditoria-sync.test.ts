/**
 * @vitest-environment node
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest"
import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"

const state = vi.hoisted(() => ({ cookie: "" }))
vi.mock("next/headers", () => ({
  headers: () => Promise.resolve(new Headers(state.cookie ? { cookie: state.cookie, "x-forwarded-proto": "http" } : { "x-forwarded-proto": "http" })),
}))

const AUTH_SECRET = "test-secret-12345678"

describe("Auditoría sync — POST /api/auditoria/sync + GET /api/auditoria (C1.1)", () => {
  const comunidadA = "comunidad-a-auditoria"
  const comunidadB = "comunidad-b-auditoria"
  const adminEmailA = "auditoria-admin-a@test.cl"
  const adminEmailB = "auditoria-admin-b@test.cl"
  const sinMembresiaEmail = "auditoria-sin-m@test.cl"

  beforeAll(async () => {
    process.env.AUTH_SECRET = AUTH_SECRET
    for (const c of [
      { id: comunidadA, nombre: "Comunidad A Auditoria", slug: "comunidad-a-auditoria" },
      { id: comunidadB, nombre: "Comunidad B Auditoria", slug: "comunidad-b-auditoria" },
    ]) {
      await prisma.comunidad.upsert({ where: { id: c.id }, update: {}, create: c }).catch(async () => {
        await prisma.comunidad.upsert({ where: { slug: c.slug }, update: {}, create: c }).catch(() => {})
      })
    }
    for (const u of [
      { id: "auditoria-usuario-a", email: adminEmailA, activo: true },
      { id: "auditoria-usuario-b", email: adminEmailB, activo: true },
      { id: "auditoria-usuario-sin", email: sinMembresiaEmail, activo: true },
    ]) {
      await prisma.usuario.upsert({ where: { email: u.email }, update: { activo: true }, create: u })
    }
    const userA = await prisma.usuario.findUnique({ where: { email: adminEmailA } })
    const userB = await prisma.usuario.findUnique({ where: { email: adminEmailB } })
    const userSin = await prisma.usuario.findUnique({ where: { email: sinMembresiaEmail } })
    if (!userA || !userB || !userSin) throw new Error("seed usuarios auditoria falló")
    await prisma.membresia.deleteMany({ where: { usuarioId: { in: [userA.id, userB.id, userSin.id] } } })
    await prisma.membresia.create({ data: { usuarioId: userA.id, comunidadId: comunidadA, rol: "administrador" } })
    await prisma.membresia.create({ data: { usuarioId: userB.id, comunidadId: comunidadB, rol: "administrador" } })
    // userSin sin membresía
    // limpiar eventos previos de estas comunidades
    await prisma.eventoAuditoria.deleteMany({ where: { comunidadId: { in: [comunidadA, comunidadB] } } })
  }, 30_000)

  afterAll(async () => {
    try {
      state.cookie = ""
      await prisma.eventoAuditoria.deleteMany({ where: { comunidadId: { in: [comunidadA, comunidadB] } } })
      const userA = await prisma.usuario.findUnique({ where: { email: adminEmailA } })
      const userB = await prisma.usuario.findUnique({ where: { email: adminEmailB } })
      const userSin = await prisma.usuario.findUnique({ where: { email: sinMembresiaEmail } })
      const ids = [userA?.id, userB?.id, userSin?.id].filter(Boolean) as string[]
      if (ids.length) await prisma.membresia.deleteMany({ where: { usuarioId: { in: ids } } })
      if (userA) await prisma.usuario.delete({ where: { id: userA.id } }).catch(() => {})
      if (userB) await prisma.usuario.delete({ where: { id: userB.id } }).catch(() => {})
      if (userSin) await prisma.usuario.delete({ where: { id: userSin.id } }).catch(() => {})
      await prisma.comunidad.delete({ where: { id: comunidadA } }).catch(() => {})
      await prisma.comunidad.delete({ where: { id: comunidadB } }).catch(() => {})
    } catch {}
  })

  async function sesionCookie(email: string): Promise<string> {
    const user = await prisma.usuario.findUnique({ where: { email } })
    if (!user) throw new Error(`usuario no encontrado: ${email}`)
    const { cookieSesionAuthjs } = await import("./helpers/sesion-authjs")
    return cookieSesionAuthjs({ sub: user.id, email: user.email })
  }

  async function callPost({ email, eventos, comunidadId }: { email?: string; eventos?: unknown[]; comunidadId?: string }) {
    const { POST } = await import("@/app/api/auditoria/sync/route")
    const cookie = email ? await sesionCookie(email) : ""
    state.cookie = cookie
    const url = `http://localhost/api/auditoria/sync${comunidadId ? `?comunidadId=${comunidadId}` : ""}`
    const req = new NextRequest(url, {
      method: "POST",
      headers: {
        "x-forwarded-proto": "http",
        "content-type": "application/json",
        ...(cookie ? { cookie } : {}),
      },
      body: JSON.stringify({ eventos: eventos ?? [] }),
    })
    const res = await POST(req as unknown as Request)
    state.cookie = ""
    return res
  }

  async function callGet({ email, query, headers }: { email?: string; query?: string; headers?: Record<string, string> }) {
    const { GET } = await import("@/app/api/auditoria/route")
    const cookie = email ? await sesionCookie(email) : ""
    state.cookie = cookie
    const url = `http://localhost/api/auditoria${query ? `?${query}` : ""}`
    const req = new NextRequest(url, {
      headers: {
        "x-forwarded-proto": "http",
        ...(cookie ? { cookie } : {}),
        ...headers,
      },
    })
    const res = await GET(req as unknown as Request)
    state.cookie = ""
    return res
  }

  function eventoFactory(overrides: Partial<Record<string, string>> = {}): Record<string, string> {
    const base = Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
    return {
      id: `ev-test-${base}`,
      timestamp: new Date().toISOString(),
      usuario: "Admin",
      categoria: "VU",
      tipoAccion: "TEST_ACCION",
      referenciaId: "ref-001",
      descripcion: "evento de prueba auditoria",
      ...overrides,
    }
  }

  it("POST 401 sin sesión", async () => {
    const res = await callPost({ eventos: [eventoFactory()] })
    expect(res.status).toBe(401)
  })

  it("GET 401 sin sesión", async () => {
    const res = await callGet({})
    expect(res.status).toBe(401)
  })

  it("POST 403 sin membresía", async () => {
    const res = await callPost({ email: sinMembresiaEmail, eventos: [eventoFactory()] })
    expect(res.status).toBe(403)
  })

  it("GET 403 sin membresía", async () => {
    const res = await callGet({ email: sinMembresiaEmail })
    expect(res.status).toBe(403)
  })

  it("POST idempotente: 2 posts del mismo evento → 1 fila", async () => {
    const ev = eventoFactory({ id: `ev-idempotente-${Date.now()}` })
    const res1 = await callPost({ email: adminEmailA, eventos: [ev] })
    expect(res1.status).toBe(200)
    const j1 = await res1.json()
    expect(j1.ok).toBe(true)
    expect(j1.recibidos).toBe(1)
    expect(j1.persistidos).toBe(1)

    const res2 = await callPost({ email: adminEmailA, eventos: [ev] })
    expect(res2.status).toBe(200)
    const j2 = await res2.json()
    expect(j2.ok).toBe(true)
    expect(j2.persistidos).toBe(1)
    const count = await prisma.eventoAuditoria.count({ where: { id: ev.id } })
    expect(count).toBe(1)
    const row = await prisma.eventoAuditoria.findUnique({ where: { id: ev.id } })
    expect(row?.comunidadId).toBe(comunidadA)
  })

  it("scoping A/B: dato de B no visible en A", async () => {
    const evB = eventoFactory({ id: `ev-b-${Date.now()}`, descripcion: "solo B" })
    const resB = await callPost({ email: adminEmailB, eventos: [evB] })
    expect(resB.status).toBe(200)
    // GET A no debe ver evento de B
    const resA = await callGet({ email: adminEmailA, query: `q=solo%20B` })
    expect(resA.status).toBe(200)
    const jA = await resA.json()
    const idsA = (jA.eventos as { id: string }[]).map((e) => e.id)
    expect(idsA).not.toContain(evB.id)
    // GET B sí lo ve
    const resBGet = await callGet({ email: adminEmailB, query: `q=solo%20B` })
    expect(resBGet.status).toBe(200)
    const jB = await resBGet.json()
    expect((jB.eventos as { id: string }[]).some((e) => e.id === evB.id)).toBe(true)
  })

  it("filtros categoria y tipoAccion", async () => {
    const ev1 = eventoFactory({ id: `ev-fcat-${Date.now()}-1`, categoria: "FI", tipoAccion: "FI_PAGO" })
    const ev2 = eventoFactory({ id: `ev-fcat-${Date.now()}-2`, categoria: "PE", tipoAccion: "PE_VISITA" })
    await callPost({ email: adminEmailA, eventos: [ev1, ev2] })
    const resCat = await callGet({ email: adminEmailA, query: "categoria=FI" })
    expect(resCat.status).toBe(200)
    const jCat = await resCat.json()
    expect((jCat.eventos as { categoria: string }[]).every((e) => e.categoria === "FI")).toBe(true)
    expect((jCat.eventos as { id: string }[]).some((e) => e.id === ev1.id)).toBe(true)

    const resTipo = await callGet({ email: adminEmailA, query: "tipoAccion=PE_VISITA" })
    expect(resTipo.status).toBe(200)
    const jTipo = await resTipo.json()
    expect((jTipo.eventos as { id: string }[]).some((e) => e.id === ev2.id)).toBe(true)
  })

  it("filtro q busca en descripcion/tipoAccion/referenciaId", async () => {
    const uniq = `uniq-${Date.now()}`
    const ev = eventoFactory({ id: `ev-q-${Date.now()}`, descripcion: `pago ${uniq} especial`, referenciaId: `ref-${uniq}` })
    await callPost({ email: adminEmailA, eventos: [ev] })
    const res = await callGet({ email: adminEmailA, query: `q=${encodeURIComponent(uniq)}` })
    expect(res.status).toBe(200)
    const j = await res.json()
    expect((j.eventos as { id: string }[]).some((e) => e.id === ev.id)).toBe(true)
  })

  it("paginación page/pageSize orden timestamp desc", async () => {
    // limpiar y crear 5 eventos con timestamps incrementales
    await prisma.eventoAuditoria.deleteMany({ where: { comunidadId: comunidadA, categoria: "PAG" } })
    const baseTime = Date.now()
    const ids: string[] = []
    for (let i = 0; i < 5; i++) {
      const ev = eventoFactory({
        id: `ev-pag-${baseTime}-${i}`,
        categoria: "PAG",
        timestamp: new Date(baseTime + i * 1000).toISOString(),
      })
      ids.push(ev.id!)
      await callPost({ email: adminEmailA, eventos: [ev] })
    }
    const res1 = await callGet({ email: adminEmailA, query: "categoria=PAG&page=1&pageSize=2" })
    expect(res1.status).toBe(200)
    const j1 = await res1.json()
    expect(j1.total).toBeGreaterThanOrEqual(5)
    expect(j1.page).toBe(1)
    expect(j1.pageSize).toBe(2)
    expect(j1.eventos.length).toBe(2)
    // orden desc: el más reciente primero
    expect(j1.eventos[0].id).toBe(ids[4]!)
    expect(j1.eventos[1].id).toBe(ids[3]!)

    const res2 = await callGet({ email: adminEmailA, query: "categoria=PAG&page=2&pageSize=2" })
    const j2 = await res2.json()
    expect(j2.eventos.length).toBe(2)
    expect(j2.eventos[0].id).toBe(ids[2]!)
  })

  it("POST rechaza batch >500", async () => {
    const muchos = Array.from({ length: 501 }, () => eventoFactory())
    const res = await callPost({ email: adminEmailA, eventos: muchos })
    expect(res.status).toBe(400)
  })
})
