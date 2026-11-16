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

async function GETColeccion(): Promise<Response> {
  const { GET: handler } = await import("@/app/api/certificados-ct/route")
  return handler(new NextRequest("http://localhost/api/certificados-ct?pageSize=100"))
}

async function DELETE(id: string): Promise<Response> {
  const { DELETE: handler } = await import("@/app/api/certificados-ct/[id]/route")
  return handler(
    new NextRequest(`http://localhost/api/certificados-ct/${id}`, { method: "DELETE" }),
    { params: Promise.resolve({ id }) }
  )
}

async function PUT(id: string, body: unknown): Promise<Response> {
  const { PUT: handler } = await import("@/app/api/certificados-ct/[id]/route")
  return handler(
    new NextRequest(`http://localhost/api/certificados-ct/${id}`, {
      method: "PUT",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    }),
    { params: Promise.resolve({ id }) }
  )
}

const enBd = (id: string) => prisma.certificadoCT.findUnique({ where: { id } })

/** Texto exacto del rechazo: el documento emitido no cambia. */
const INMUTABLE =
  "Documento inmutable: no se puede cambiar el tipo, la unidad, la persona ni el detalle de un certificado."

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
    // La unidad de la comunidad vecina: existe de verdad, así que un `unidadId`
    // ajeno no falla por clave foránea sino por la guarda.
    await prisma.unidad.deleteMany({ where: { id: "ctitem-unidad-b" } })
    await prisma.unidad.create({
      data: {
        id: "ctitem-unidad-b",
        comunidadId: otraComunidad,
        microSectorId: "ctitem-b-ms",
        numero: "101",
        etiqueta: "Depto 101",
        tipoUnidadId: "ctitem-b-tu",
        metraje: 55,
        prorrateo: 1,
        rolSii: "ctitem-b-101",
        estadoId: "ctitem-b-ocu",
        servicios: {},
      },
    })
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
      await prisma.unidad.deleteMany({ where: { id: "ctitem-unidad-b" } })
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

  it("GET colección → administrador y comité ven toda la comunidad (el alcance no los acota)", async () => {
    // Preserva el comportamiento histórico del GET de colección para los roles de
    // gestión: `alcanceCertificadosCT` devuelve `null` para ellos y el `where`
    // sigue siendo la comunidad.
    await sembrarCertificado("ctitem-cert-2", comunidad)
    for (const email of [emailAdmin, emailComite]) {
      await conSesion(email, async () => {
        const res = await GETColeccion()
        expect(res.status).toBe(200)
        const json = (await res.json()) as { data: Array<{ id: string }> }
        expect(new Set(json.data.map((c) => c.id))).toEqual(
          new Set(["ctitem-cert-1", "ctitem-cert-2"])
        )
      })
    }
  })

  it("GET colección → residente sin vínculos no recibe los certificados de la comunidad", async () => {
    // El residente de este arnés no tiene `personaId` ni vínculos: «lo propio»
    // queda vacío y la colección no puede devolver lo que antes entregaba la
    // factory (solo `comunidadId`).
    await conSesion(emailResidente, async () => {
      const res = await GETColeccion()
      expect(res.status).toBe(200)
      const json = (await res.json()) as { data: unknown[]; total: number }
      expect(json.data).toEqual([])
      expect(json.total).toBe(0)
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
      expect(await enBd("ctitem-cert-1")).not.toBeNull()
    })
  })

  it("PUT con un `unidadId` de OTRA comunidad → 409 y la unidad no se guarda", async () => {
    await conSesion(emailAdmin, async () => {
      const res = await PUT("ctitem-cert-1", { unidadId: "ctitem-unidad-b" })
      expect(res.status).toBe(409)
      expect(await res.json()).toEqual({ error: INMUTABLE })
      expect((await enBd("ctitem-cert-1"))?.unidadId).toBeNull()
    })
  })

  it("PUT que cambia el `tipo` → 409 y el tipo emitido sigue siendo el mismo", async () => {
    await conSesion(emailAdmin, async () => {
      const res = await PUT("ctitem-cert-1", { tipo: "al_dia" })
      expect(res.status).toBe(409)
      expect(await res.json()).toEqual({ error: INMUTABLE })
      expect((await enBd("ctitem-cert-1"))?.tipo).toBe("residencia")
    })
  })

  it("PUT que cambia la `personaId` → 409 y la persona no se guarda", async () => {
    await conSesion(emailAdmin, async () => {
      const res = await PUT("ctitem-cert-1", { personaId: "ctitem-persona-otra" })
      expect(res.status).toBe(409)
      expect(await res.json()).toEqual({ error: INMUTABLE })
      expect((await enBd("ctitem-cert-1"))?.personaId).toBeNull()
    })
  })

  it("PUT que cambia el `detalle` → 409 y el detalle archivado no se toca", async () => {
    await conSesion(emailAdmin, async () => {
      const res = await PUT("ctitem-cert-1", {
        detalle: [{ clave: "Saldo pendiente", valor: "$1" }],
      })
      expect(res.status).toBe(409)
      expect(await res.json()).toEqual({ error: INMUTABLE })
      expect((await enBd("ctitem-cert-1"))?.detalle).toEqual([
        { clave: "Unidad", valor: "101" },
      ])
    })
  })

  it("PUT que reenvía un campo inmutable con su MISMO valor sí pasa: la guarda rechaza mutaciones, no reenvíos", async () => {
    await conSesion(emailAdmin, async () => {
      const antes = await enBd("ctitem-cert-1")
      const res = await PUT("ctitem-cert-1", {
        tipo: antes?.tipo,
        detalle: antes?.detalle,
        resumen: "Certificado de residencia (actualizado)",
      })
      expect(res.status).toBe(200)
      const despues = await enBd("ctitem-cert-1")
      expect(despues?.resumen).toBe("Certificado de residencia (actualizado)")
      expect(despues?.tipo).toBe("residencia")
    })
  })

  it("PUT sin sesión → 401 antes que la guarda", async () => {
    state.cookie = ""
    expect((await PUT("ctitem-cert-1", { tipo: "al_dia" })).status).toBe(401)
  })

  it("PUT con rol sin `ct` editar (comité y residente) → 403, no 409", async () => {
    for (const email of [emailComite, emailResidente]) {
      await conSesion(email, async () => {
        const res = await PUT("ctitem-cert-1", { tipo: "al_dia" })
        expect(res.status).toBe(403)
        expect(await res.json()).toEqual({ error: "Permiso denegado." })
      })
    }
  })

  it("PUT de un certificado de otra comunidad → 404, no 409 (no filtra existencia)", async () => {
    await conSesion(emailAdmin, async () => {
      const res = await PUT("ctitem-cert-b", { tipo: "al_dia" })
      expect(res.status).toBe(404)
      expect(await res.json()).toEqual({ error: "Registro no encontrado." })
      expect((await enBd("ctitem-cert-b"))?.tipo).toBe("residencia")
    })
  })
})
