/**
 * @vitest-environment node
 *
 * Folio de certificado CT — server-side (auditoría "funciones de palo" 2026-10-23).
 *
 * Antes el folio `CT-####` se calculaba en el cliente con `max+1` sobre la lista
 * cargada: dos clientes emitiendo a la vez producían el MISMO folio, y el
 * historial quedaba con huecos. Ahora `POST /api/certificados-ct` completa el
 * correlativo (y el código `VC-…`) dentro de una transacción, por comunidad, y
 * el índice único `(comunidadId, folio)` es la garantía dura contra la carrera.
 *
 * Este test fija el contrato observable:
 *   1. dos altas consecutivas sin folio → `CT-0001` y `CT-0002`;
 *   2. dos comunidades NO comparten correlativo (cada una arranca en `CT-0001`);
 *   3. un folio explícito se respeta (imports/QA-Lab no cambian de número);
 *   4. reenviar el mismo id no consume un número nuevo (documento inmutable);
 *   5. folio explícito repetido → 409 (no se renombra un documento emitido);
 *   6. `folio: ""` lo completa el servidor (el cliente ya no lo calcula).
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

const comunidadA = "ct-folio-comunidad-a"
const comunidadB = "ct-folio-comunidad-b"
const emailAdminA = "ct-folio-admin-a@test.cl"
const emailAdminB = "ct-folio-admin-b@test.cl"

/** Alta mínima válida de un certificado de residencia (sin unidad, sin gate). */
function altaCertificado(
  id: string,
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    id,
    tipo: "residencia",
    solicitanteNombre: "Solicitante Folio",
    resumen: "Certificado de residencia (test de folio).",
    detalle: [{ clave: "Unidad", valor: "Depto 101" }],
    fechaEmision: "2026-10-23",
    ...overrides,
  }
}

describe("/api/certificados-ct — folio correlativo server-side", () => {
  const idsCertificados: string[] = [
    "ct-folio-a-1",
    "ct-folio-a-2",
    "ct-folio-a-3",
    "ct-folio-b-1",
    "ct-folio-explicito",
    "ct-folio-vacio",
    "ct-folio-repetido-1",
    "ct-folio-repetido-2",
  ]

  /** Cookies de sesión ya minadas (el JWE tarda ~2 s: se hace una vez). */
  const cookies = new Map<string, string>()

  /** Alta como admin de la comunidad indicada; devuelve status + body. */
  async function alta(
    email: string,
    body: Record<string, unknown>
  ): Promise<{ status: number; json: Record<string, unknown> }> {
    const cookie = cookies.get(email)
    if (!cookie) throw new Error(`sin cookie de sesión para ${email}`)
    state.cookie = cookie
    try {
      const res = await POST(body)
      return {
        status: res.status,
        json: (await res.json().catch(() => ({}))) as Record<string, unknown>,
      }
    } finally {
      state.cookie = ""
    }
  }

  async function POST(body: unknown): Promise<Response> {
    const { POST: postCertificado } = await import("@/app/api/certificados-ct/route")
    return postCertificado(
      new NextRequest("http://localhost/api/certificados-ct", {
        method: "POST",
        body: JSON.stringify(body),
        headers: { "content-type": "application/json" },
      })
    )
  }

  beforeAll(async () => {
    process.env.AUTH_SECRET = AUTH_SECRET
    // El JWE de sesión es lento (~2 s) y el default de 5 s por test no alcanza
    // para varias emisiones: presupuesto explícito para el archivo entero.
    vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 })
    for (const c of [
      { id: comunidadA, nombre: "Comunidad Folio A", slug: "ct-folio-comunidad-a" },
      { id: comunidadB, nombre: "Comunidad Folio B", slug: "ct-folio-comunidad-b" },
    ]) {
      await prisma.comunidad.upsert({ where: { id: c.id }, update: {}, create: c })
    }
    for (const u of [
      { id: "ct-folio-usuario-a", email: emailAdminA },
      { id: "ct-folio-usuario-b", email: emailAdminB },
    ]) {
      await prisma.usuario.upsert({
        where: { email: u.email },
        update: { activo: true },
        create: { ...u, activo: true },
      })
    }
    // Base limpia: el correlativo se mide desde cero en cada comunidad.
    await prisma.certificadoCT.deleteMany({
      where: { comunidadId: { in: [comunidadA, comunidadB] } },
    })
    await prisma.membresia.deleteMany({
      where: { usuarioId: { in: ["ct-folio-usuario-a", "ct-folio-usuario-b"] } },
    })
    await prisma.membresia.create({
      data: { usuarioId: "ct-folio-usuario-a", comunidadId: comunidadA, rol: "administrador" },
    })
    await prisma.membresia.create({
      data: { usuarioId: "ct-folio-usuario-b", comunidadId: comunidadB, rol: "administrador" },
    })
    // Una sola minada por usuario: reusar la cookie evita 2 s por emisión.
    const { cookieSesionAuthjs } = await import("../helpers/sesion-authjs")
    cookies.set(
      emailAdminA,
      await cookieSesionAuthjs({ sub: "ct-folio-usuario-a", email: emailAdminA })
    )
    cookies.set(
      emailAdminB,
      await cookieSesionAuthjs({ sub: "ct-folio-usuario-b", email: emailAdminB })
    )
  }, 60_000)

  afterAll(async () => {
    try {
      state.cookie = ""
      await prisma.certificadoCT.deleteMany({
        where: { comunidadId: { in: [comunidadA, comunidadB] } },
      })
      await prisma.membresia.deleteMany({
        where: { usuarioId: { in: ["ct-folio-usuario-a", "ct-folio-usuario-b"] } },
      })
      await prisma.usuario.deleteMany({
        where: { id: { in: ["ct-folio-usuario-a", "ct-folio-usuario-b"] } },
      })
      await prisma.comunidad.deleteMany({ where: { id: { in: [comunidadA, comunidadB] } } })
    } catch {
      // intencional: best-effort
    }
  })

  it("dos altas consecutivas sin folio → CT-0001 y CT-0002", async () => {
    const primera = await alta(emailAdminA, altaCertificado(idsCertificados[0]!))
    expect(primera.status).toBe(201)
    expect(primera.json.folio).toBe("CT-0001")
    expect(String(primera.json.codigoVerificacion)).toMatch(/^VC-[A-Z0-9]{8}$/)

    const segunda = await alta(emailAdminA, altaCertificado(idsCertificados[1]!))
    expect(segunda.status).toBe(201)
    expect(segunda.json.folio).toBe("CT-0002")

    // Persistido, no solo en la respuesta.
    const filas = await prisma.certificadoCT.findMany({
      where: { id: { in: [idsCertificados[0]!, idsCertificados[1]!] } },
      orderBy: { folio: "asc" },
    })
    expect(filas.map((f) => f.folio)).toEqual(["CT-0001", "CT-0002"])
  })

  it("dos comunidades no comparten correlativo (B arranca en CT-0001)", async () => {
    const enB = await alta(emailAdminB, altaCertificado(idsCertificados[3]!))
    expect(enB.status).toBe(201)
    expect(enB.json.folio).toBe("CT-0001")
    // El de A sigue en su propio correlativo: el siguiente es CT-0003.
    const siguienteA = await alta(emailAdminA, altaCertificado(idsCertificados[2]!))
    expect(siguienteA.status).toBe(201)
    expect(siguienteA.json.folio).toBe("CT-0003")
  })

  it("folio explícito se respeta y el correlativo sigue el máximo de la comunidad", async () => {
    const explicito = await alta(
      emailAdminA,
      altaCertificado(idsCertificados[4]!, { folio: "CT-9001" })
    )
    expect(explicito.status).toBe(201)
    expect(explicito.json.folio).toBe("CT-9001")

    // El siguiente automático sigue el máximo numérico de la comunidad.
    const siguiente = await alta(emailAdminA, altaCertificado(idsCertificados[5]!, { folio: "" }))
    expect(siguiente.status).toBe(201)
    expect(siguiente.json.folio).toBe("CT-9002")
  })

  it("el correlativo ignora folios no numéricos de la comunidad", async () => {
    // `TEST-CT-1234…` (e2e) y otros folios libres no son correlativos: no deben
    // romper `max+1` ni empujar el número (parseInt → NaN los descarta).
    const raro = await alta(
      emailAdminA,
      altaCertificado("ct-folio-raro", { folio: "TEST-CT-1750000000000" })
    )
    expect(raro.status).toBe(201)

    const siguiente = await alta(emailAdminA, altaCertificado("ct-folio-a-4"))
    expect(siguiente.status).toBe(201)
    expect(siguiente.json.folio).toBe("CT-9003")
  })

  it("reenviar el mismo id no consume un número nuevo (folio inmutable)", async () => {
    const emitido = await prisma.certificadoCT.findUnique({
      where: { id: idsCertificados[0]! },
    })
    expect(emitido?.folio).toBe("CT-0001")

    const reenvio = await alta(
      emailAdminA,
      altaCertificado(idsCertificados[0]!, { folio: "" })
    )
    expect(reenvio.status).toBe(200)
    expect(reenvio.json.folio).toBe("CT-0001")
  })

  it("folio explícito repetido en la misma comunidad → 409 (no se renombra)", async () => {
    const primera = await alta(
      emailAdminA,
      altaCertificado(idsCertificados[6]!, { folio: "CT-7777", codigoVerificacion: "VC-AAAA1111" })
    )
    expect(primera.status).toBe(201)

    const segunda = await alta(
      emailAdminA,
      altaCertificado(idsCertificados[7]!, { folio: "CT-7777", codigoVerificacion: "VC-BBBB2222" })
    )
    expect(segunda.status).toBe(409)
    expect(await prisma.certificadoCT.findUnique({ where: { id: idsCertificados[7]! } })).toBeNull()
  })
})
