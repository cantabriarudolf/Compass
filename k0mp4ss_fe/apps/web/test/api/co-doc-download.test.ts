/**
 * @vitest-environment node
 *
 * am-emisores-2 — `CO_DOC_DOWNLOAD` en `GET /api/co/documentos/[id]`.
 *
 * El documento CO es metadatos + URL (D1: jamás base64/Blob), así que no hay
 * endpoint de descarga: abrir el documento es el GET del detalle. La ruta ahora
 * audita esa lectura (categoría CO) después de resolverla, sin bloquearla, y no
 * emite en los caminos rojos ni en el listado paginado.
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

const comunidadA = "codoc-com-a"
const comunidadB = "codoc-com-b"
const emailAdmin = "codoc-admin@test.cl"
const emailResidente = "codoc-residente@test.cl"
const emailMantencion = "codoc-mantencion@test.cl"

const usuarios = [
  { id: "codoc-user-admin", email: emailAdmin, rol: "administrador" },
  { id: "codoc-user-residente", email: emailResidente, rol: "residente" },
  { id: "codoc-user-mantencion", email: emailMantencion, rol: "mantencion" },
]

function documento(id: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id,
    nombre: "Reglamento de copropiedad 2026.pdf",
    tipoMime: "application/pdf",
    tamanoKB: 812.5,
    url: `https://cdn.compass.cl/comunidad/${id}.pdf`,
    categoria: "reglamento",
    ...overrides,
  }
}

describe("/api/co/documentos/[id] — auditoría CO_DOC_DOWNLOAD (am-emisores-2)", () => {
  beforeAll(async () => {
    process.env.AUTH_SECRET = AUTH_SECRET
    process.env.NEXT_PUBLIC_APP_ENV = "development"
    for (const c of [
      { id: comunidadA, nombre: "Comunidad CO Documentos A", slug: "codoc-a" },
      { id: comunidadB, nombre: "Comunidad CO Documentos B", slug: "codoc-b" },
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
    for (const u of usuarios) {
      await prisma.membresia.create({
        data: {
          usuarioId: u.id,
          comunidadId: comunidadA,
          rol: u.rol,
        },
      })
    }
    await limpiar()
    for (const id of ["codoc-doc-a", "codoc-doc-res", "codoc-doc-403"]) {
      await prisma.documentoCO.create({
        data: { ...documento(id), comunidadId: comunidadA } as never,
      })
    }
    // Documento ajeno (otra comunidad) para el 404 de scope.
    await prisma.documentoCO.create({
      data: {
        ...documento("codoc-doc-ajeno", { nombre: "Acta de asamblea de otra comunidad.pdf" }),
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
    await prisma.documentoCO.deleteMany({
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

  async function getUno(id: string): Promise<Response> {
    const { GET } = await import("@/app/api/co/documentos/[id]/route")
    const req = new NextRequest(`http://localhost/api/co/documentos/${id}`)
    return GET(req, { params: Promise.resolve({ id }) })
  }

  const contarEventos = () =>
    prisma.eventoAuditoria.count({
      where: { comunidadId: comunidadA, tipoAccion: "CO_DOC_DOWNLOAD" },
    })

  it("GET admin del detalle → 200 y UN evento categoría CO con la referencia", async () => {
    await conSesion(emailAdmin, async () => {
      const res = await getUno("codoc-doc-a")
      expect(res.status).toBe(200)
      expect(((await res.json()) as { nombre: string }).nombre).toBe(
        "Reglamento de copropiedad 2026.pdf"
      )

      const eventos = await prisma.eventoAuditoria.findMany({
        where: { comunidadId: comunidadA, tipoAccion: "CO_DOC_DOWNLOAD" },
      })
      expect(eventos).toHaveLength(1)
      const evento = eventos[0]!
      expect(evento.categoria).toBe("CO")
      expect(evento.tipoAccion).toBe("CO_DOC_DOWNLOAD")
      expect(evento.referenciaId).toBe("codoc-doc-a")
      expect(evento.usuario).toBe("codoc-user-admin")
      expect(evento.descripcion).toContain("Reglamento de copropiedad 2026.pdf")
      expect(evento.descripcion).toContain("application/pdf")
      expect(evento.descripcion).toContain("812.5 KB")
    })
  })

  it("GET del residente sobre otro documento también se audita", async () => {
    await conSesion(emailResidente, async () => {
      const res = await getUno("codoc-doc-res")
      expect(res.status).toBe(200)
      expect(await contarEventos()).toBe(2)
      const evento = await prisma.eventoAuditoria.findFirst({
        where: { comunidadId: comunidadA, referenciaId: "codoc-doc-res" },
      })
      expect(evento?.usuario).toBe("codoc-user-residente")
    })
  })

  it("GET del listado paginado no emite evento (listar no es descargar)", async () => {
    await conSesion(emailAdmin, async () => {
      const { GET } = await import("@/app/api/co/documentos/route")
      const lista = await GET(new NextRequest("http://localhost/api/co/documentos"))
      expect(lista.status).toBe(200)
      expect(await contarEventos()).toBe(2)
    })
  })

  it("GET 403 (rol sin permiso CO) no emite evento", async () => {
    await conSesion(emailMantencion, async () => {
      const res = await getUno("codoc-doc-403")
      expect(res.status).toBe(403)
      expect(await contarEventos()).toBe(2)
    })
  })

  it("GET 404 (documento de otra comunidad) no emite evento", async () => {
    await conSesion(emailAdmin, async () => {
      const res = await getUno("codoc-doc-ajeno")
      expect(res.status).toBe(404)
      expect(await contarEventos()).toBe(2)
    })
  })

  it("GET 404 (documento inexistente) no emite evento", async () => {
    await conSesion(emailAdmin, async () => {
      const res = await getUno("codoc-doc-no-existe")
      expect(res.status).toBe(404)
      expect(await contarEventos()).toBe(2)
    })
  })
})
