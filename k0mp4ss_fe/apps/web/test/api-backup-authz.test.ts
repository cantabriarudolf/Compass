/**
 * @vitest-environment node
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { prisma } from "@/lib/prisma"
import { crearToken, nuevaExpiracion } from "@/lib/auth"

describe("POST /api/backup — reforzado con authz B3 (segundo punto)", () => {
  const comunidadA = "comunidad-backup-a"
  const adminEmail = "backup-admin@test.cl"
  const conserjeEmail = "backup-conserjeria@test.cl"

  beforeAll(async () => {
    process.env.AUTH_SECRET = "test-secret-12345678"
    process.env.NEXT_PUBLIC_APP_ENV = "development"
    // re-seed por si otro suite limpió (aislamiento entre archivos)
    for (const c of [
      { id: comunidadA, nombre: "Comunidad Backup A", slug: "comunidad-backup-a" },
    ]) {
      await prisma.comunidad.upsert({ where: { id: c.id }, update: {}, create: c }).catch(() => {})
    }
    for (const u of [
      { id: "backup-usuario-admin", email: adminEmail, activo: true },
      { id: "backup-usuario-conserje", email: conserjeEmail, activo: true },
    ]) {
      await prisma.usuario.upsert({ where: { email: u.email }, update: { activo: true }, create: u })
    }
    const adminUser = await prisma.usuario.findUnique({ where: { email: adminEmail } })
    const conserjeUser = await prisma.usuario.findUnique({ where: { email: conserjeEmail } })
    if (adminUser && conserjeUser) {
      await prisma.membresia.deleteMany({ where: { usuarioId: { in: [adminUser.id, conserjeUser.id] } } })
      await prisma.membresia.create({ data: { usuarioId: adminUser.id, comunidadId: comunidadA, rol: "administrador" } })
      await prisma.membresia.create({ data: { usuarioId: conserjeUser.id, comunidadId: comunidadA, rol: "conserjeria" } })
    }
  })

  afterAll(async () => {
    try {
      const adminUser = await prisma.usuario.findUnique({ where: { email: adminEmail } })
      const conserjeUser = await prisma.usuario.findUnique({ where: { email: conserjeEmail } })
      const ids = [adminUser?.id, conserjeUser?.id].filter(Boolean) as string[]
      if (ids.length) await prisma.membresia.deleteMany({ where: { usuarioId: { in: ids } } })
    } catch {}
  })

  async function callBackup(email: string | null, comunidadId?: string) {
    const { POST } = await import("@/app/api/backup/route")
    const token = email ? crearToken({ sub: email, exp: nuevaExpiracion() }) : null
    const headers: Record<string, string> = { "Content-Type": "application/json" }
    if (token) headers["cookie"] = `compass_session=${token}`
    if (comunidadId) headers["x-comunidad-id"] = comunidadId
    const body = JSON.stringify({ content: "{}", fileName: "test-backup.json" })
    const req = new Request("http://localhost/api/backup", { method: "POST", headers, body })
    return POST(req as never)
  }

  it("sin sesión → 401", async () => {
    const res = await callBackup(null)
    expect(res.status).toBe(401)
  })

  it("conserjeria no puede ejecutar backup → 403", async () => {
    const res = await callBackup(conserjeEmail, comunidadA)
    expect(res.status).toBe(403)
  })

  it("administrador sí puede ejecutar backup → 200 o 500 por file pero no 403/401", async () => {
    const res = await callBackup(adminEmail, comunidadA)
    // Puede ser 200 ok o 500 si falla guardar, pero no debe ser 403/401
    expect([200, 500]).toContain(res.status)
    expect(res.status).not.toBe(403)
    expect(res.status).not.toBe(401)
  })
})
