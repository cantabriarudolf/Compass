/**
 * @vitest-environment node
 *
 * `/api/certificados-ct/[id]` — ramas de detalle y baja inmutable que no cubre
 * `api-certificados-ct.test.ts`: 401 sin sesión, 403 sin `ct` eliminar, 404
 * cross-comunidad y el 409 del documento inmutable visto desde cada rol.
 *
 * La ruta evalúa authz y scoping ANTES del rechazo: el 409 solo confirma la
 * inmutabilidad de un registro propio, nunca filtra existencia ajena.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest"
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

const comunidad = "ctitem-comunidad-a"
const otraComunidad = "ctitem-comunidad-b"
const emailAdmin = "ctitem-admin@test.cl"
const emailComite = "ctitem-comite@test.cl"
const emailResidente = "ctitem-residente@test.cl"
const emailAdminOtra = "ctitem-admin-b@test.cl"

const idDe = (email: string): string => email.split("@")[0] ?? email

async function conSesion(email: string, fn: () => Promise<void>): Promise<void> {
  const usuario = await prisma.usuario.findUnique({ where: { email } })
  if (!usuario) throw new Error(`usuario no encontrado: ${email}`)
  const { cookieSesionAuthjs } = await import("../helpers/sesion-authjs")
  state.cookie = await cookieSesionAuthjs({ sub: usuario.id, email: usuario.email })
  try {
    await fn()
  } finally {
    state.cookie = ""
  }
}

async function GET(id: string): Promise<Response> {
  const { GET: handler } = await import("@/app/api/certificados-ct/[id]/route")
  return handler(new NextRequest(`http://localhost/api/certificados-ct/${id}`), {
    params: Promise.resolve({ id }),
  })
}

async function DELETE(id: string): Promise<Response> {
  const { DELETE: handler } = await import("@/app/api/certificados-ct/[id]/route")
  return handler(
    new NextRequest(`http://localhost/api/certificados-ct/${id}`, { method: "DELETE" }),
    { params: Promise.resolve({ id }) }
  )
}

const sembrarCertificado = (id: string, comunidadId: string): Promise<unknown> =>
  prisma.certificadoCT.create({
    data: {
      id,
      comunidadId,
      folio: `CT-${id}`,
      codigoVerificacion: "ABC123",
      tipo: "residencia",
      solicitanteNombre: "Ana Pérez",
      resumen: "Certificado de residencia",
      detalle: [{ clave: "Unidad", valor: "101" }],
      fechaEmision: "2026-01-15",
    },
  })

describe("/api/certificados-ct/[id] — detalle y baja inmutable scoped", () => {
  beforeAll(async () => {
    process.env.AUTH_SECRET = AUTH_SECRET
    for (const [id, slug] of [
      [comunidad, "ctitem-a"],
      [otraComunidad, "ctitem-b"],
    ] as const) {
      await prisma.comunidad.upsert({
        where: { id },
        update: {},
        create: { id, nombre: `Comunidad ${id}`, slug },
      })
    }
    const usuarios: Array<[string, string, string]> = [
      [emailAdmin, "administrador", comunidad],
      [emailComite, "comite", comunidad],
      [emailResidente, "residente", comunidad],
      [emailAdminOtra, "administrador", otraComunidad],
    ]
    for (const [email, rol, comunidadId] of usuarios) {
      await prisma.usuario.upsert({
        where: { email },
        update: {},
        create: { id: idDe(email), email, activo: true },
      })
      await prisma.membresia.deleteMany({ where: { usuarioId: idDe(email) } })
      await prisma.membresia.create({
        data: { usuarioId: idDe(email), comunidadId, rol },
      })
    }
  }, 30_000)

  beforeEach(async () => {
    state.cookie = ""
    await prisma.certificadoCT.deleteMany({
      where: { comunidadId: { in: [comunidad, otraComunidad] } },
    })
    await sembrarCertificado("ctitem-cert-1", comunidad)
    await sembrarCertificado("ctitem-cert-b", otraComunidad)
  })

  afterAll(async () => {
    try {
      state.cookie = ""
      await prisma.certificadoCT.deleteMany({
        where: { comunidadId: { in: [comunidad, otraComunidad] } },
      })
      for (const email of [emailAdmin, emailComite, emailResidente, emailAdminOtra]) {
        await prisma.membresia.deleteMany({ where: { usuarioId: idDe(email) } })
        await prisma.usuario.delete({ where: { id: idDe(email) } }).catch(() => {})
      }
      await prisma.comunidad.delete({ where: { id: otraComunidad } }).catch(() => {})
      await prisma.comunidad.delete({ where: { id: comunidad } }).catch(() => {})
    } catch {
      // limpieza best-effort
    }
  })

  it("GET sin sesión → 401", async () => {
    state.cookie = ""
    const res = await GET("ctitem-cert-1")
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: "No autenticado." })
  })

  it("GET propio → 200 para admin y comité (ct ver)", async () => {
    await conSesion(emailAdmin, async () => {
      const res = await GET("ctitem-cert-1")
      expect(res.status).toBe(200)
      const json = (await res.json()) as { id: string; comunidadId: string }
      expect(json.id).toBe("ctitem-cert-1")
      expect(json.comunidadId).toBe(comunidad)
    })
    await conSesion(emailComite, async () => {
      expect((await GET("ctitem-cert-1")).status).toBe(200)
    })
  })

  it("GET inexistente o de otra comunidad → 404", async () => {
    await conSesion(emailAdmin, async () => {
      expect((await GET("ctitem-no-existe")).status).toBe(404)
      const ajena = await GET("ctitem-cert-b")
      expect(ajena.status).toBe(404)
      expect(await ajena.json()).toEqual({ error: "Registro no encontrado." })
    })
  })

  it("DELETE sin sesión → 401", async () => {
    state.cookie = ""
    expect((await DELETE("ctitem-cert-1")).status).toBe(401)
  })

  it("DELETE con rol sin `ct` eliminar (comité y residente) → 403 y el certificado sigue", async () => {
    for (const email of [emailComite, emailResidente]) {
      await conSesion(email, async () => {
        const res = await DELETE("ctitem-cert-1")
        expect(res.status).toBe(403)
        expect(await res.json()).toEqual({ error: "Permiso denegado." })
      })
    }
    expect(
      await prisma.certificadoCT.findUnique({ where: { id: "ctitem-cert-1" } })
    ).not.toBeNull()
  })

  it("DELETE de un certificado de otra comunidad → 404 (no 409) y no lo toca", async () => {
    await conSesion(emailAdmin, async () => {
      const res = await DELETE("ctitem-cert-b")
      expect(res.status).toBe(404)
      expect(await res.json()).toEqual({ error: "Registro no encontrado." })
      expect(
        await prisma.certificadoCT.findUnique({ where: { id: "ctitem-cert-b" } })
      ).not.toBeNull()
    })
  })

  it("DELETE inexistente → 404", async () => {
    await conSesion(emailAdmin, async () => {
      expect((await DELETE("ctitem-no-existe")).status).toBe(404)
    })
  })

  it("DELETE propio → 409 documento inmutable y el certificado permanece", async () => {
    await conSesion(emailAdmin, async () => {
      const res = await DELETE("ctitem-cert-1")
      expect(res.status).toBe(409)
      expect(await res.json()).toEqual({
        error: "Documento inmutable: no se puede eliminar un certificado.",
      })
      expect(
        await prisma.certificadoCT.findUnique({ where: { id: "ctitem-cert-1" } })
      ).not.toBeNull()
    })
  })
})
