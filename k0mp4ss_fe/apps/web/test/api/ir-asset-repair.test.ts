/**
 * @vitest-environment node
 *
 * am-emisores-2 — `IR_ASSET_REPAIR` en `PUT /api/ir/recursos/[id]`.
 *
 * El paso de un activo a Reparación se persiste por el put-merge genérico, que
 * no auditaba. La ruta ahora emite el evento (categoría IR) en la transición
 * real, después de la escritura y sin bloquearla. Se fija además la NO emisión
 * en el re-guardado del mismo estado y en los caminos rojos (400/403/404).
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

const comunidadA = "irrep-com-a"
const comunidadB = "irrep-com-b"
const emailAdmin = "irrep-admin@test.cl"
const emailResidente = "irrep-residente@test.cl"

const usuarios = [
  { id: "irrep-user-admin", email: emailAdmin },
  { id: "irrep-user-residente", email: emailResidente },
]

function recursoValido(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "irrep-rec-a",
    codigo: "IR-A-0007",
    nombre: "Cortadora de arbustos",
    categoria: "infraestructura",
    estadoActivo: "disponible",
    stock: 1,
    esCritico: false,
    ...overrides,
  }
}

describe("/api/ir/recursos/[id] — auditoría IR_ASSET_REPAIR (am-emisores-2)", () => {
  beforeAll(async () => {
    process.env.AUTH_SECRET = AUTH_SECRET
    process.env.NEXT_PUBLIC_APP_ENV = "development"
    for (const c of [
      { id: comunidadA, nombre: "Comunidad IR Reparación A", slug: "irrep-a" },
      { id: comunidadB, nombre: "Comunidad IR Reparación B", slug: "irrep-b" },
    ]) {
      await prisma.comunidad.upsert({ where: { id: c.id }, update: {}, create: c })
    }
    for (const u of usuarios) {
      await prisma.usuario.upsert({
        where: { email: u.email },
        update: {},
        create: { id: u.id, email: u.email, activo: true },
      })
    }
    await prisma.membresia.deleteMany({
      where: { usuarioId: { in: usuarios.map((u) => u.id) } },
    })
    await prisma.membresia.create({
      data: { usuarioId: "irrep-user-admin", comunidadId: comunidadA, rol: "administrador" },
    })
    await prisma.membresia.create({
      data: { usuarioId: "irrep-user-residente", comunidadId: comunidadA, rol: "residente" },
    })
    await limpiar()
    for (const id of ["irrep-rec-a", "irrep-rec-notrans", "irrep-rec-rep", "irrep-rec-403"]) {
      await prisma.recursoIR.create({
        data: { ...recursoValido({ id }), comunidadId: comunidadA } as never,
      })
    }
    // Registro ajeno (otra comunidad) para el 404 de scope.
    await prisma.recursoIR.create({
      data: {
        ...recursoValido({ id: "irrep-rec-ajeno" }),
        comunidadId: comunidadB,
      } as never,
    })
  }, 30_000)

  afterAll(async () => {
    try {
      state.cookie = ""
      delete process.env.NEXT_PUBLIC_APP_ENV
      await limpiar()
      await prisma.membresia.deleteMany({
        where: { usuarioId: { in: usuarios.map((u) => u.id) } },
      })
      for (const u of usuarios) {
        await prisma.usuario.delete({ where: { id: u.id } }).catch(() => {})
      }
      await prisma.comunidad.delete({ where: { id: comunidadB } }).catch(() => {})
      await prisma.comunidad.delete({ where: { id: comunidadA } }).catch(() => {})
    } catch {
      // intencional: limpieza best-effort
    }
  })

  async function limpiar(): Promise<void> {
    await prisma.eventoAuditoria.deleteMany({
      where: { comunidadId: { in: [comunidadA, comunidadB] } },
    })
    await prisma.recursoIR.deleteMany({
      where: { comunidadId: { in: [comunidadA, comunidadB] } },
    })
  }

  async function conSesion(email: string, fn: () => Promise<void>): Promise<void> {
    const user = await prisma.usuario.findUnique({ where: { email } })
    if (!user) throw new Error(`usuario no encontrado: ${email}`)
    const { cookieSesionAuthjs } = await import("../helpers/sesion-authjs")
    state.cookie = await cookieSesionAuthjs({ sub: user.id, email: user.email })
    try {
      await fn()
    } finally {
      state.cookie = ""
    }
  }

  async function put(id: string, body?: unknown): Promise<Response> {
    const { PUT } = await import("@/app/api/ir/recursos/[id]/route")
    const req = new NextRequest(`http://localhost/api/ir/recursos/${id}`, {
      method: "PUT",
      ...(body !== undefined
        ? { body: JSON.stringify(body), headers: { "content-type": "application/json" } }
        : {}),
    })
    return PUT(req, { params: Promise.resolve({ id }) })
  }

  const contarEventos = () =>
    prisma.eventoAuditoria.count({
      where: { comunidadId: comunidadA, tipoAccion: "IR_ASSET_REPAIR" },
    })

  it("PUT admin con estadoActivo reparacion → 200 y UN evento categoría IR", async () => {
    await conSesion(emailAdmin, async () => {
      const res = await put("irrep-rec-a", { estadoActivo: "reparacion" })
      expect(res.status).toBe(200)

      const eventos = await prisma.eventoAuditoria.findMany({
        where: { comunidadId: comunidadA, tipoAccion: "IR_ASSET_REPAIR" },
      })
      expect(eventos).toHaveLength(1)
      const evento = eventos[0]!
      expect(evento.categoria).toBe("IR")
      expect(evento.tipoAccion).toBe("IR_ASSET_REPAIR")
      expect(evento.referenciaId).toBe("irrep-rec-a")
      expect(evento.usuario).toBe("irrep-user-admin")
      expect(evento.descripcion).toContain("IR-A-0007")
      expect(evento.descripcion).toContain("Cortadora de arbustos")
      expect(evento.descripcion).toContain("disponible")

      const enBd = await prisma.recursoIR.findUnique({ where: { id: "irrep-rec-a" } })
      expect(enBd?.estadoActivo).toBe("reparacion")
    })
  })

  it("re-guardar el mismo estado reparacion no vuelve a emitir (sin transición)", async () => {
    await conSesion(emailAdmin, async () => {
      // El recurso ya quedó en reparación en el test anterior.
      const res = await put("irrep-rec-a", { estadoActivo: "reparacion" })
      expect(res.status).toBe(200)
      expect(await contarEventos()).toBe(1)
    })
  })

  it("PUT que no toca estadoActivo (stock) no emite evento", async () => {
    await conSesion(emailAdmin, async () => {
      const res = await put("irrep-rec-notrans", { stock: 7 })
      expect(res.status).toBe(200)
      expect(await contarEventos()).toBe(1)
    })
  })

  it("PUT 403 (residente no edita) no emite evento", async () => {
    await conSesion(emailResidente, async () => {
      const res = await put("irrep-rec-403", { estadoActivo: "reparacion" })
      expect(res.status).toBe(403)
      expect(await contarEventos()).toBe(1)
      const enBd = await prisma.recursoIR.findUnique({ where: { id: "irrep-rec-403" } })
      expect(enBd?.estadoActivo).toBe("disponible")
    })
  })

  it("PUT 404 (recurso de otra comunidad) no emite evento", async () => {
    await conSesion(emailAdmin, async () => {
      const res = await put("irrep-rec-ajeno", { estadoActivo: "reparacion" })
      expect(res.status).toBe(404)
      expect(await contarEventos()).toBe(1)
    })
  })

  it("PUT 400 (estado inválido) no emite evento", async () => {
    await conSesion(emailAdmin, async () => {
      const res = await put("irrep-rec-rep", { estadoActivo: "reparacion_total" })
      expect(res.status).toBe(400)
      expect(await contarEventos()).toBe(1)
    })
  })
})
