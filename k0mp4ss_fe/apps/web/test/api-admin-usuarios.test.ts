/**
 * @vitest-environment node
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest"
import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import { crearToken, nuevaExpiracion } from "@/lib/auth"

const AUTH_SECRET = "test-secret-12345678"

describe("GET /api/admin/usuarios — autorización server-side (B3)", () => {
  const comunidadA = "comunidad-a-endpoint"
  const comunidadB = "comunidad-b-endpoint"
  const adminEmail = "endpoint-admin@test.cl"
  const conserjeEmail = "endpoint-conserjeria@test.cl"

  beforeAll(async () => {
    process.env.AUTH_SECRET = AUTH_SECRET
    // Asegura comunidades de test
    for (const c of [
      { id: comunidadA, nombre: "Comunidad A Endpoint", slug: "comunidad-a-endpoint" },
      { id: comunidadB, nombre: "Comunidad B Endpoint", slug: "comunidad-b-endpoint" },
    ]) {
      await prisma.comunidad.upsert({ where: { id: c.id }, update: {}, create: c }).catch(async () => {
        // si slug colisiona, actualiza
        await prisma.comunidad.upsert({ where: { slug: c.slug }, update: {}, create: c }).catch(() => {})
      })
    }
    // Usuarios
    for (const u of [
      { id: "endpoint-usuario-admin", email: adminEmail, activo: true },
      { id: "endpoint-usuario-conserje", email: conserjeEmail, activo: true },
    ]) {
      await prisma.usuario.upsert({ where: { email: u.email }, update: { activo: true }, create: u })
    }
    const adminUser = await prisma.usuario.findUnique({ where: { email: adminEmail } })
    const conserjeUser = await prisma.usuario.findUnique({ where: { email: conserjeEmail } })
    if (!adminUser || !conserjeUser) throw new Error("seed usuarios endpoint falló")

    // Limpia membresias previas de estos usuarios
    await prisma.membresia.deleteMany({ where: { usuarioId: { in: [adminUser.id, conserjeUser.id] } } })
    // Crea membresías: admin solo en A, conserje solo en A
    await prisma.membresia.create({ data: { usuarioId: adminUser.id, comunidadId: comunidadA, rol: "administrador" } })
    await prisma.membresia.create({ data: { usuarioId: conserjeUser.id, comunidadId: comunidadA, rol: "conserjeria" } })
    // Importante: admin no tiene membresía en B -> prueba aislamiento
  }, 30_000)

  afterAll(async () => {
    try {
      const adminUser = await prisma.usuario.findUnique({ where: { email: adminEmail } })
      const conserjeUser = await prisma.usuario.findUnique({ where: { email: conserjeEmail } })
      const ids = [adminUser?.id, conserjeUser?.id].filter(Boolean) as string[]
      if (ids.length) await prisma.membresia.deleteMany({ where: { usuarioId: { in: ids } } })
      if (adminUser) await prisma.usuario.delete({ where: { id: adminUser.id } }).catch(() => {})
      if (conserjeUser) await prisma.usuario.delete({ where: { id: conserjeUser.id } }).catch(() => {})
      await prisma.comunidad.delete({ where: { id: comunidadA } }).catch(() => {})
      await prisma.comunidad.delete({ where: { id: comunidadB } }).catch(() => {})
    } catch {}
  })

  async function callGet({ comunidadId, email, cookie, headers }: { comunidadId?: string; email?: string; cookie?: string; headers?: Record<string, string> }) {
    const { GET } = await import("@/app/api/admin/usuarios/route")
    const url = `http://localhost/api/admin/usuarios${comunidadId ? `?comunidadId=${comunidadId}` : ""}`
    const token = email ? crearToken({ sub: email, exp: nuevaExpiracion() }) : null
    const cookieHeader = cookie ?? (token ? `compass_session=${token}` : "")
    const req = new NextRequest(url, {
      headers: {
        ...(cookieHeader ? { cookie: cookieHeader } : {}),
        ...headers,
      },
    })
    return GET(req)
  }

  it("responde 401 sin sesión", async () => {
    const res = await callGet({ comunidadId: comunidadA })
    expect(res.status).toBe(401)
  })

  it("responde 400 sin comunidadId", async () => {
    const res = await callGet({ email: adminEmail })
    expect(res.status).toBe(400)
  })

  it("responde 403 con rol sin permiso (conserjeria) en misma comunidad", async () => {
    const res = await callGet({ comunidadId: comunidadA, email: conserjeEmail })
    expect(res.status).toBe(403)
    const j = await res.json()
    expect(j.error).toMatch(/Permiso denegado/i)
  })

  it("responde 200 con rol válido (administrador) en su comunidad", async () => {
    const res = await callGet({ comunidadId: comunidadA, email: adminEmail })
    expect(res.status).toBe(200)
    const j = await res.json()
    expect(j.comunidadId).toBe(comunidadA)
    expect(Array.isArray(j.membresias)).toBe(true)
    expect(j.total).toBeGreaterThanOrEqual(1)
    // solo membresias de A, no fuga de B
    expect(j.membresias.every((m: { comunidadId: string }) => m.comunidadId === comunidadA)).toBe(true)
  })

  it("aislamiento A/B: admin de A no ve comunidad B sin membresia", async () => {
    const res = await callGet({ comunidadId: comunidadB, email: adminEmail })
    expect(res.status).toBe(403)
  })

  it("header x-comunidad-id alternativo funciona para admin", async () => {
    const token = crearToken({ sub: adminEmail, exp: nuevaExpiracion() })
    const req = new NextRequest(`http://localhost/api/admin/usuarios`, {
      headers: { cookie: `compass_session=${token}`, "x-comunidad-id": comunidadA },
    })
    const { GET } = await import("@/app/api/admin/usuarios/route")
    const res = await GET(req)
    expect(res.status).toBe(200)
  })
})
