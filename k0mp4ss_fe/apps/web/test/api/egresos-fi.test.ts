/**
 * @vitest-environment node
 *
 * api-cobertura-fases fase 2 — /api/egresos-fi (57.81% → medido).
 *
 * route.ts (GET factory + POST upsert con folio FE-#### auto al alta y
 * verificación de FKs: fondo activo, sub-sectores, unidad, acta de aprobación)
 * y [id]/route.ts (GET_ONE / PUT parcial / DELETE). Handlers exportados con
 * sesión Auth.js real (cookie mintida), Prisma sin mocks, guardias 401/403/404
 * y reglas de negocio espejo de saveEgresoFI.
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

const comunidadA = "egrfi-com-a"
const comunidadB = "egrfi-com-b"
const emailAdmin = "egrfi-admin@test.cl"
const emailResidente = "egrfi-residente@test.cl"
const emailComite = "egrfi-comite@test.cl"

const fondoActivo = "egrfi-fondo-a"
const fondoInactivo = "egrfi-fondo-off"
const egresoAjeno = "egrfi-egr-ajeno"

function egresoValido(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "egrfi-egr-1",
    fecha: "2026-01-15",
    categoria: "mantencion",
    descripcion: "Reparación bomba de agua",
    monto: 150000,
    fondoId: fondoActivo,
    esRecurrente: false,
    ...overrides,
  }
}

describe("/api/egresos-fi — egresos a fondo FI con BD real", () => {
  beforeAll(async () => {
    process.env.AUTH_SECRET = AUTH_SECRET
    process.env.NEXT_PUBLIC_APP_ENV = "development"
    await prisma.comunidad.upsert({
      where: { id: comunidadA },
      update: {},
      create: { id: comunidadA, nombre: "Comunidad Egresos FI A", slug: "egrfi-a" },
    })
    await prisma.comunidad.upsert({
      where: { id: comunidadB },
      update: {},
      create: { id: comunidadB, nombre: "Comunidad Egresos FI B", slug: "egrfi-b" },
    })
    for (const u of [
      { id: "egrfi-user-admin", email: emailAdmin, activo: true },
      { id: "egrfi-user-residente", email: emailResidente, activo: true },
      { id: "egrfi-user-comite", email: emailComite, activo: true },
    ]) {
      await prisma.usuario.upsert({ where: { email: u.email }, update: {}, create: u })
    }
    await prisma.membresia.deleteMany({
      where: { usuarioId: { in: ["egrfi-user-admin", "egrfi-user-residente", "egrfi-user-comite"] } },
    })
    await prisma.membresia.create({
      data: { usuarioId: "egrfi-user-admin", comunidadId: comunidadA, rol: "administrador" },
    })
    await prisma.membresia.create({
      data: { usuarioId: "egrfi-user-residente", comunidadId: comunidadA, rol: "residente" },
    })
    await prisma.membresia.create({
      data: { usuarioId: "egrfi-user-comite", comunidadId: comunidadA, rol: "comite" },
    })
    await limpiarEntidades()
    await prisma.fondoFI.create({
      data: { id: fondoActivo, comunidadId: comunidadA, nombre: "Fondo Activo Egr", tipo: "gasto_comun", activo: true },
    })
    await prisma.fondoFI.create({
      data: { id: fondoInactivo, comunidadId: comunidadA, nombre: "Fondo Fuera Egr", tipo: "especial", activo: false },
    })
    // Registro ajeno en otra comunidad para los 404 de scope.
    await prisma.egresoFI.create({
      data: {
        id: egresoAjeno,
        comunidadId: comunidadB,
        folio: "FE-0001",
        fecha: "2026-01-01",
        categoria: "otro",
        descripcion: "Egreso de otra comunidad",
        monto: 1000,
        fondoId: "egrfi-fondo-b",
        esRecurrente: false,
      },
    })
  }, 30_000)

  afterAll(async () => {
    state.cookie = ""
    delete process.env.NEXT_PUBLIC_APP_ENV
    await limpiarEntidades()
    for (const id of ["egrfi-user-admin", "egrfi-user-residente", "egrfi-user-comite"]) {
      await prisma.usuario.delete({ where: { id } }).catch(() => {})
    }
    await prisma.comunidad.delete({ where: { id: comunidadB } }).catch(() => {})
    await prisma.comunidad.delete({ where: { id: comunidadA } }).catch(() => {})
  })

  async function limpiarEntidades(): Promise<void> {
    await prisma.egresoFI.deleteMany({ where: { comunidadId: { in: [comunidadA, comunidadB] } } })
    await prisma.fondoFI.deleteMany({ where: { comunidadId: { in: [comunidadA, comunidadB] } } })
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

  async function llamar(
    metodo: "GET" | "POST" | "PUT" | "DELETE",
    id?: string,
    body?: unknown
  ): Promise<Response> {
    const esItem = id !== undefined
    const ruta = esItem ? await import("@/app/api/egresos-fi/[id]/route") : await import("@/app/api/egresos-fi/route")
    const req = new NextRequest(
      `http://localhost/api/egresos-fi${esItem ? `/${id}` : ""}`,
      {
        method: metodo,
        ...(metodo === "GET" || metodo === "DELETE"
          ? {}
          : {
              body: typeof body === "string" ? body : JSON.stringify(body ?? {}),
              headers: { "content-type": "application/json" },
            }),
      }
    )
    if (esItem) return (ruta as unknown as Record<string, (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => Promise<Response>>)[metodo](req, { params: Promise.resolve({ id }) })
    return (ruta as unknown as Record<string, (req: NextRequest) => Promise<Response>>)[metodo](req)
  }

  it("guardia de sesión: 401 sin cookie en GET y POST", async () => {
    state.cookie = ""
    const get = await llamar("GET")
    expect(get.status).toBe(401)
    const post = await llamar("POST", undefined, egresoValido())
    expect(post.status).toBe(401)
  })

  it("comité: GET lista → 200 (puede ver FI) y POST → 403 (no puede crear)", async () => {
    await conSesion(emailComite, async () => {
      const get = await llamar("GET")
      expect(get.status).toBe(200)
      const post = await llamar("POST", undefined, egresoValido({ id: "egrfi-egr-comite" }))
      expect(post.status).toBe(403)
      expect(await prisma.egresoFI.findUnique({ where: { id: "egrfi-egr-comite" } })).toBeNull()
    })
  })

  it("residente: GET, POST, GET_ONE y DELETE → 403", async () => {
    await conSesion(emailResidente, async () => {
      const get = await llamar("GET")
      expect(get.status).toBe(403)
      const post = await llamar("POST", undefined, egresoValido())
      expect(post.status).toBe(403)
      const getOne = await llamar("GET", egresoAjeno)
      expect(getOne.status).toBe(403)
      // DELETE: el 404 de scope corre ANTES del authz en la factory, así que el
      // 403 se prueba con un registro propio sembrado por prisma.
      await prisma.egresoFI.create({
        data: {
          id: "egrfi-egr-residente",
          comunidadId: comunidadA,
          fecha: "2026-01-02",
          categoria: "otro",
          descripcion: "Egreso de prueba residente",
          monto: 100,
          fondoId: fondoActivo,
          esRecurrente: false,
        },
      })
      const del = await llamar("DELETE", "egrfi-egr-residente")
      expect(del.status).toBe(403)
      expect(await prisma.egresoFI.findUnique({ where: { id: "egrfi-egr-residente" } })).not.toBeNull()
      await prisma.egresoFI.delete({ where: { id: "egrfi-egr-residente" } })
    })
  })

  it("admin POST → folio FE-0001 auto, 201 y queda en la BD", async () => {
    await conSesion(emailAdmin, async () => {
      const res = await llamar("POST", undefined, egresoValido())
      expect(res.status).toBe(201)
      const j = (await res.json()) as { folio: string }
      expect(j.folio).toBe("FE-0001")
      const enBd = await prisma.egresoFI.findUnique({ where: { id: "egrfi-egr-1" } })
      expect(enBd?.comunidadId).toBe(comunidadA)
      expect(enBd?.folio).toBe("FE-0001")
      expect(enBd?.esRecurrente).toBe(false)
    })
  })

  it("segundo POST sin folio → FE-0002 (correlativo por comunidad)", async () => {
    await conSesion(emailAdmin, async () => {
      const res = await llamar("POST", undefined, egresoValido({ id: "egrfi-egr-2" }))
      expect(res.status).toBe(201)
      expect(((await res.json()) as { folio: string }).folio).toBe("FE-0002")
    })
  })

  it("POST con folio propio lo respeta y el correlativo sigue desde el máximo", async () => {
    await conSesion(emailAdmin, async () => {
      const res = await llamar("POST", undefined, egresoValido({ id: "egrfi-egr-3", folio: "FE-1000" }))
      expect(res.status).toBe(201)
      expect(((await res.json()) as { folio: string }).folio).toBe("FE-1000")
      const res2 = await llamar("POST", undefined, egresoValido({ id: "egrfi-egr-4" }))
      expect(res2.status).toBe(201)
      expect(((await res2.json()) as { folio: string }).folio).toBe("FE-1001")
    })
  })

  it("POST con id de otra comunidad → 404 (sin filtrar existencia)", async () => {
    await conSesion(emailAdmin, async () => {
      const res = await llamar("POST", undefined, egresoValido({ id: egresoAjeno }))
      expect(res.status).toBe(404)
    })
  })

  it("POST schema inválido (monto 0 y categoria fuera del enum) → 400 y nada persistido", async () => {
    await conSesion(emailAdmin, async () => {
      const res = await llamar("POST", undefined, egresoValido({ id: "egrfi-egr-bad", monto: 0, categoria: "no-existe" }))
      expect(res.status).toBe(400)
      expect(((await res.json()) as { error: string }).error).toBe("Datos inválidos.")
      expect(await prisma.egresoFI.findUnique({ where: { id: "egrfi-egr-bad" } })).toBeNull()
    })
  })

  it("POST body JSON inválido → 400 «Cuerpo JSON inválido.»", async () => {
    await conSesion(emailAdmin, async () => {
      const res = await llamar("POST", undefined, "{no-json")
      expect(res.status).toBe(400)
      expect(((await res.json()) as { error: string }).error).toBe("Cuerpo JSON inválido.")
    })
  })

  it("POST a fondo inexistente o inactivo → 400 y nada persistido", async () => {
    await conSesion(emailAdmin, async () => {
      const falta = await llamar("POST", undefined, egresoValido({ id: "egrfi-egr-fx", fondoId: "egrfi-no-existe" }))
      expect(falta.status).toBe(400)
      expect(((await falta.json()) as { error: string }).error).toBe(
        "No se puede guardar el gasto: el fondo de imputación no existe."
      )
      const inactivo = await llamar("POST", undefined, egresoValido({ id: "egrfi-egr-fx", fondoId: fondoInactivo }))
      expect(inactivo.status).toBe(400)
      expect(((await inactivo.json()) as { error: string }).error).toBe(
        "No se puede guardar el gasto: el fondo \"Fondo Fuera Egr\" está inactivo."
      )
      expect(await prisma.egresoFI.findUnique({ where: { id: "egrfi-egr-fx" } })).toBeNull()
    })
  })

  it("POST con sub-sector inexistente → 400 y nada persistido", async () => {
    await conSesion(emailAdmin, async () => {
      const res = await llamar("POST", undefined, egresoValido({
        id: "egrfi-egr-micro-x",
        microSectoresIds: ["egrfi-micro-no-existe"],
      }))
      expect(res.status).toBe(400)
      expect(((await res.json()) as { error: string }).error).toBe(
        "No se puede guardar el gasto: uno de los sub-sectores diferenciados no existe."
      )
      expect(await prisma.egresoFI.findUnique({ where: { id: "egrfi-egr-micro-x" } })).toBeNull()
    })
  })

  it("POST con unidad inexistente → 400 y nada persistido", async () => {
    await conSesion(emailAdmin, async () => {
      const res = await llamar("POST", undefined, egresoValido({ id: "egrfi-egr-unidad-x", unidadId: "egrfi-unidad-no-existe" }))
      expect(res.status).toBe(400)
      expect(((await res.json()) as { error: string }).error).toBe(
        "No se puede guardar el gasto: la unidad indicada no existe en el inventario."
      )
      expect(await prisma.egresoFI.findUnique({ where: { id: "egrfi-egr-unidad-x" } })).toBeNull()
    })
  })

  it("POST con acta de aprobación inexistente → 400 y nada persistido", async () => {
    await conSesion(emailAdmin, async () => {
      const res = await llamar("POST", undefined, egresoValido({
        id: "egrfi-egr-acta-x",
        aprobacionActaGDId: "egrfi-acta-no-existe",
      }))
      expect(res.status).toBe(400)
      expect(((await res.json()) as { error: string }).error).toBe(
        "No se puede guardar el gasto: el acta de aprobación indicada no existe."
      )
      expect(await prisma.egresoFI.findUnique({ where: { id: "egrfi-egr-acta-x" } })).toBeNull()
    })
  })

  it("GET lista → 200 con total > 0", async () => {
    await conSesion(emailAdmin, async () => {
      const res = await llamar("GET")
      expect(res.status).toBe(200)
      const j = (await res.json()) as { data: unknown[]; total: number; page: number; pageSize: number }
      expect(j.total).toBeGreaterThanOrEqual(4)
      expect(Array.isArray(j.data)).toBe(true)
      expect(j.data.length).toBeGreaterThan(0)
    })
  })

  it("GET_ONE propio → 200; de otra comunidad o inexistente → 404", async () => {
    await conSesion(emailAdmin, async () => {
      const ok = await llamar("GET", "egrfi-egr-1")
      expect(ok.status).toBe(200)
      expect(((await ok.json()) as { id: string }).id).toBe("egrfi-egr-1")
      const ajeno = await llamar("GET", egresoAjeno)
      expect(ajeno.status).toBe(404)
      const nesta = await llamar("GET", "egrfi-no-existe")
      expect(nesta.status).toBe(404)
    })
  })

  it("PUT parcial cambia monto y flag recurrente → 200 y se refleja en la BD", async () => {
    await conSesion(emailAdmin, async () => {
      const res = await llamar("PUT", "egrfi-egr-1", { monto: 175000, esRecurrente: true })
      expect(res.status).toBe(200)
      const enBd = await prisma.egresoFI.findUnique({ where: { id: "egrfi-egr-1" } })
      expect(enBd?.monto).toBe(175000)
      expect(enBd?.esRecurrente).toBe(true)
    })
  })

  it("PUT con fondo inexistente → 400 y el registro conserva su fondo", async () => {
    await conSesion(emailAdmin, async () => {
      const res = await llamar("PUT", "egrfi-egr-1", { fondoId: "egrfi-no-existe" })
      expect(res.status).toBe(400)
      expect((await prisma.egresoFI.findUnique({ where: { id: "egrfi-egr-1" } }))?.fondoId).toBe(fondoActivo)
    })
  })

  it("PUT sobre inexistente o de otra comunidad → 404", async () => {
    await conSesion(emailAdmin, async () => {
      const nesta = await llamar("PUT", "egrfi-no-existe", { monto: 1 })
      expect(nesta.status).toBe(404)
      const ajeno = await llamar("PUT", egresoAjeno, { monto: 1 })
      expect(ajeno.status).toBe(404)
    })
  })

  it("PUT body JSON inválido → 400", async () => {
    await conSesion(emailAdmin, async () => {
      const res = await llamar("PUT", "egrfi-egr-1", "{no-json")
      expect(res.status).toBe(400)
      expect(((await res.json()) as { error: string }).error).toBe("Cuerpo JSON inválido.")
    })
  })

  it("DELETE propio → 200 y desaparece; de otra comunidad → 404", async () => {
    await conSesion(emailAdmin, async () => {
      const res = await llamar("DELETE", "egrfi-egr-4")
      expect(res.status).toBe(200)
      expect((await res.json()) as { ok: boolean }).toEqual({ ok: true })
      expect(await prisma.egresoFI.findUnique({ where: { id: "egrfi-egr-4" } })).toBeNull()
      const ajeno = await llamar("DELETE", egresoAjeno)
      expect(ajeno.status).toBe(404)
      expect(await prisma.egresoFI.findUnique({ where: { id: egresoAjeno } })).not.toBeNull()
    })
  })
})
