/**
 * @vitest-environment node
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

function certificadoValido(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "ct-cert-1",
    folio: "CERT-001",
    codigoVerificacion: "ABC123",
    tipo: "residencia",
    solicitanteNombre: "Juan Pérez",
    resumen: "Certificado de residencia",
    detalle: [{ clave: "Unidad", valor: "101" }],
    fechaEmision: "2026-01-15",
    ...overrides,
  }
}

describe("/api/certificados-ct — CT con BD real (BD-FUENTE-VERDAD)", () => {
  const comunidadA = "ct-comunidad-a"
  /** Comunidad VECINA (A4): existe en la base, no es la de la sesión. */
  const comunidadB = "ct-comunidad-b"
  const emailAdmin = "ct-admin@test.cl"
  const unidadConDeuda = "ct-u-con-deuda"
  const unidadAlDia = "ct-u-al-dia"
  /** Unidad y persona de la comunidad B: la fila que la sesión de A no puede emitir. */
  const unidadComunidadB = "ct-u-b-9001"
  const personaComunidadB = "ct-p-b-1"

  async function nuevaUnidad(id: string, numero: string): Promise<void> {
    await prisma.unidad.upsert({
      where: { id },
      update: {},
      create: {
        id,
        comunidadId: comunidadA,
        microSectorId: "ct-ms-1",
        numero,
        etiqueta: `Depto ${numero}`,
        tipoUnidadId: "ct-tu-1",
        metraje: 60,
        prorrateo: 1,
        rolSii: `ct-${numero}`,
        estadoId: "ct-ocu-1",
        servicios: {},
      },
    })
  }

  const cargaModulos = async () => ({
    coleccion: await import("@/app/api/certificados-ct/route"),
    item: await import("@/app/api/certificados-ct/[id]/route"),
  })

  beforeAll(async () => {
    process.env.AUTH_SECRET = AUTH_SECRET
    await prisma.comunidad.upsert({
      where: { id: comunidadA },
      update: {},
      create: { id: comunidadA, nombre: "Comunidad A CT", slug: "ct-comunidad-a" },
    })
    await prisma.usuario.upsert({
      where: { email: emailAdmin },
      update: {},
      create: { id: "ct-usuario-admin", email: emailAdmin, activo: true },
    })
    await prisma.membresia.deleteMany({ where: { usuarioId: "ct-usuario-admin" } })
    await prisma.membresia.create({
      data: { usuarioId: "ct-usuario-admin", comunidadId: comunidadA, rol: "administrador" },
    })
    await prisma.certificadoCT.deleteMany({ where: { comunidadId: comunidadA } })
    await prisma.cobroFI.deleteMany({ where: { comunidadId: comunidadA } })
    await prisma.unidad.deleteMany({ where: { comunidadId: comunidadA } })
    await nuevaUnidad(unidadConDeuda, "9001")
    await nuevaUnidad(unidadAlDia, "9002")
    // A4 — la comunidad vecina y una fila de cada padrón. La sesión de `comunidadA`
    // no las puede nombrar: `withComunidadScope` las trata como inexistentes.
    await prisma.comunidad.upsert({
      where: { id: comunidadB },
      update: {},
      create: { id: comunidadB, nombre: "Comunidad B CT", slug: "ct-comunidad-b" },
    })
    await prisma.unidad.deleteMany({ where: { comunidadId: comunidadB } })
    await prisma.unidad.create({
      data: {
        id: unidadComunidadB,
        comunidadId: comunidadB,
        microSectorId: "ct-b-ms-1",
        numero: "9001",
        etiqueta: "Depto 9001",
        tipoUnidadId: "ct-b-tu-1",
        metraje: 60,
        prorrateo: 1,
        rolSii: "ct-b-9001",
        estadoId: "ct-b-ocu-1",
        servicios: {},
      },
    })
    await prisma.persona.deleteMany({ where: { comunidadId: comunidadB } })
    await prisma.persona.create({
      data: {
        id: personaComunidadB,
        comunidadId: comunidadB,
        nombreCompleto: "Persona Vecina CT",
        nombres: "Persona Vecina",
        apellidos: "CT",
        rut: "11.111.111-1",
        email: "vecina-ct@test.cl",
        telefonoMovil: "+56911111111",
        estadoCuenta: "activa",
        condicionesEspecialesIds: [],
        roles: [],
      },
    })
    await prisma.cobroFI.create({
      data: {
        id: "ct-cobro-deuda-1",
        comunidadId: comunidadA,
        unidadId: unidadConDeuda,
        periodo: "2026-01",
        concepto: "gasto_comun",
        origenModulo: "manual",
        fondoId: "ct-fondo-gc",
        descripcion: "GC TEST con saldo pendiente",
        montoBase: 88_000,
        fechaCargo: "2026-01-01",
        fechaVencimiento: "2026-01-31",
        moras: [],
        pagos: [],
        diferencias: [],
      },
    })
  }, 30_000)

  afterAll(async () => {
    try {
      state.cookie = ""
      await prisma.certificadoCT.deleteMany({ where: { comunidadId: comunidadA } })
      await prisma.cobroFI.deleteMany({ where: { comunidadId: comunidadA } })
      await prisma.unidad.deleteMany({ where: { comunidadId: comunidadA } })
      await prisma.membresia.deleteMany({ where: { usuarioId: "ct-usuario-admin" } })
      await prisma.usuario.delete({ where: { id: "ct-usuario-admin" } }).catch(() => {})
      await prisma.comunidad.delete({ where: { id: comunidadA } }).catch(() => {})
      // A4 — la comunidad vecina y sus filas no quedan en la base de la suite.
      await prisma.unidad.deleteMany({ where: { comunidadId: comunidadB } })
      await prisma.persona.deleteMany({ where: { comunidadId: comunidadB } })
      await prisma.comunidad.delete({ where: { id: comunidadB } }).catch(() => {})
    } catch { /* best-effort */ }
  })

  async function conSesion(email: string, fn: () => Promise<void>): Promise<void> {
    const user = await prisma.usuario.findUnique({ where: { email } })
    if (!user) throw new Error(`usuario no encontrado: ${email}`)
    const { cookieSesionAuthjs } = await import("../helpers/sesion-authjs")
    state.cookie = await cookieSesionAuthjs({ sub: user.id, email: user.email })
    try { await fn() } finally { state.cookie = "" }
  }

  async function POST(body: unknown): Promise<Response> {
    const { coleccion } = await cargaModulos()
    return coleccion.POST(
      new NextRequest("http://localhost/api/certificados-ct", {
        method: "POST",
        body: JSON.stringify(body),
        headers: { "content-type": "application/json" },
      })
    )
  }

  async function GET(query = ""): Promise<Response> {
    const { coleccion } = await cargaModulos()
    return coleccion.GET(new NextRequest(`http://localhost/api/certificados-ct${query}`))
  }

  async function PUT(id: string, body: unknown): Promise<Response> {
    const { item } = await cargaModulos()
    return item.PUT(
      new NextRequest(`http://localhost/api/certificados-ct/${id}`, {
        method: "PUT",
        body: JSON.stringify(body),
        headers: { "content-type": "application/json" },
      }),
      { params: Promise.resolve({ id }) }
    )
  }

  async function DELETE(id: string): Promise<Response> {
    const { item } = await cargaModulos()
    return item.DELETE(
      new NextRequest(`http://localhost/api/certificados-ct/${id}`, { method: "DELETE" }),
      { params: Promise.resolve({ id }) }
    )
  }

  it("401 sin sesión", async () => {
    state.cookie = ""
    expect((await GET()).status).toBe(401)
    expect((await POST(certificadoValido())).status).toBe(401)
  })

  it("admin crea certificado → 201 y queda en BD", async () => {
    await conSesion(emailAdmin, async () => {
      const res = await POST(certificadoValido())
      expect(res.status).toBe(201)
      const enBd = await prisma.certificadoCT.findUnique({ where: { id: "ct-cert-1" } })
      expect(enBd).not.toBeNull()
      expect(enBd?.comunidadId).toBe(comunidadA)
      expect(enBd?.folio).toBe("CERT-001")
    })
  })

  it("GET lista paginada", async () => {
    await conSesion(emailAdmin, async () => {
      const res = await GET()
      expect(res.status).toBe(200)
      const json = await res.json()
      expect(Array.isArray(json.data)).toBe(true)
      expect(json.data.length).toBeGreaterThanOrEqual(1)
    })
  })

  it("PUT parcial → 200 y refleja en BD", async () => {
    await conSesion(emailAdmin, async () => {
      const res = await PUT("ct-cert-1", { resumen: "Certificado Actualizado" })
      expect(res.status).toBe(200)
      const enBd = await prisma.certificadoCT.findUnique({ where: { id: "ct-cert-1" } })
      expect(enBd?.resumen).toBe("Certificado Actualizado")
    })
  })

  it("Al Día con deuda → rechazo explícito y NO queda en BD (gate deuda/saldo)", async () => {
    await conSesion(emailAdmin, async () => {
      const res = await POST(
        certificadoValido({
          id: "ct-cert-deuda",
          folio: "CERT-DEUDA",
          codigoVerificacion: "DEUDA1",
          tipo: "al_dia",
          unidadId: unidadConDeuda,
        })
      )
      expect([400, 409]).toContain(res.status)
      const json = await res.json()
      expect(String(json.error)).toMatch(/saldo/i)
      expect(
        await prisma.certificadoCT.findUnique({ where: { id: "ct-cert-deuda" } })
      ).toBeNull()
    })
  })

  it("Al Día sin saldo pendiente → 201 y queda en BD", async () => {
    await conSesion(emailAdmin, async () => {
      const res = await POST(
        certificadoValido({
          id: "ct-cert-al-dia",
          folio: "CERT-ALDIA",
          codigoVerificacion: "ALDIA1",
          tipo: "al_dia",
          unidadId: unidadAlDia,
        })
      )
      expect(res.status).toBe(201)
      const enBd = await prisma.certificadoCT.findUnique({
        where: { id: "ct-cert-al-dia" },
      })
      expect(enBd?.unidadId).toBe(unidadAlDia)
    })
  })

  it("Estado de cuenta con deuda → 201 (el gate de saldo aplica solo a Al Día)", async () => {
    await conSesion(emailAdmin, async () => {
      const res = await POST(
        certificadoValido({
          id: "ct-cert-estado",
          folio: "CERT-ESTADO",
          codigoVerificacion: "ESTADO",
          tipo: "estado_cuenta",
          unidadId: unidadConDeuda,
        })
      )
      expect(res.status).toBe(201)
    })
  })

  it("DELETE → 409 (documento inmutable) y el certificado permanece en BD", async () => {
    await conSesion(emailAdmin, async () => {
      const res = await DELETE("ct-cert-1")
      expect(res.status).toBe(409)
      const json = await res.json()
      expect(String(json.error)).toMatch(/inmutable|no se puede eliminar/i)
      const enBd = await prisma.certificadoCT.findUnique({ where: { id: "ct-cert-1" } })
      expect(enBd).not.toBeNull()
      expect(enBd?.folio).toBe("CERT-001")
    })
  })

  // A4 (advisory de la revisión de T20) — fuga de ALCANCE: la gestión emite para
  // toda la COMUNIDAD DE LA SESIÓN, no para cualquier comunidad. Antes de este
  // pin, `rechazoDeEmisionAjena` devolvía `null` para administración/comité sin
  // mirar la fila: un `unidadId` de la comunidad B llegaba hasta `cifrasDeUnidad`,
  // que acota por `comunidadId` de la sesión, no encontraba cobros y dejaba pasar
  // el portón de Al Día con 0/0/0 — un certificado 201 que afirmaba «al día»
  // sobre una unidad que esa comunidad no conoce y con cifras inventadas.
  it("A4 — unidad de OTRA comunidad: 404 y no queda certificado emitido", async () => {
    await conSesion(emailAdmin, async () => {
      const res = await POST(
        certificadoValido({
          id: "ct-cert-unidad-ajena",
          folio: "CERT-AJENA",
          codigoVerificacion: "AJENA1",
          tipo: "al_dia",
          unidadId: unidadComunidadB,
        })
      )
      expect(res.status).toBe(404)
      const json = await res.json()
      expect(String(json.error)).toBe("Registro no encontrado.")
      expect(
        await prisma.certificadoCT.findUnique({ where: { id: "ct-cert-unidad-ajena" } }),
        "una emisión vacía sobre una unidad que la comunidad no ve no deja documento"
      ).toBeNull()
    })
  })

  it("A4 — persona de OTRA comunidad: 404 y no queda certificado emitido", async () => {
    await conSesion(emailAdmin, async () => {
      const res = await POST(
        certificadoValido({
          id: "ct-cert-persona-ajena",
          folio: "CERT-AJENA-P",
          codigoVerificacion: "AJENAP",
          tipo: "residencia",
          personaId: personaComunidadB,
        })
      )
      expect(res.status).toBe(404)
      expect(
        await prisma.certificadoCT.findUnique({ where: { id: "ct-cert-persona-ajena" } })
      ).toBeNull()
    })
  })

  it("PRESERVE — la unidad y la persona de la comunidad de la sesión siguen emitiendo", async () => {
    await conSesion(emailAdmin, async () => {
      expect(
        (
          await POST(
            certificadoValido({
              id: "ct-cert-propia",
              folio: "CERT-PROPIA",
              codigoVerificacion: "PROPIA",
              tipo: "al_dia",
              unidadId: unidadAlDia,
            })
          )
        ).status
      ).toBe(201)
    })
  })
})
