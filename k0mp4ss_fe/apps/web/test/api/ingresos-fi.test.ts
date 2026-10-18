/**
 * @vitest-environment node
 *
 * api-cobertura-fases fase 2 — /api/ingresos-fi (54.07% → medido).
 *
 * Carpeta app/api/ingresos-fi de menor cobertura en la superficie API: route.ts
 * (GET paginado de factory + POST upsert con verificación del fondo) y [id]/
 * route.ts (GET_ONE / PUT parcial / DELETE). Se ejercita contra los handlers
 * exportados con sesión Auth.js real (cookie mintida), Prisma sin mocks y
 * guardias de sesión (401), permisos (403 comité/residente), scope de
 * comunidad (404) y validación de fondo activo (400).
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

const comunidadA = "ingfi-com-a"
const comunidadB = "ingfi-com-b"
const emailAdmin = "ingfi-admin@test.cl"
const emailResidente = "ingfi-residente@test.cl"
const emailComite = "ingfi-comite@test.cl"

const fondoActivo = "ingfi-fondo-a"
const fondoInactivo = "ingfi-fondo-off"
const ingresoMio = "ingfi-ing-1"
const ingresoAjeno = "ingfi-ing-ajeno"

function ingresoValido(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: ingresoMio,
    fecha: "2026-01-20",
    monto: 500000,
    concepto: "Cuota extraordinaria",
    fondoId: fondoActivo,
    ...overrides,
  }
}

describe("/api/ingresos-fi — ingresos a fondo FI con BD real", () => {
  beforeAll(async () => {
    process.env.AUTH_SECRET = AUTH_SECRET
    process.env.NEXT_PUBLIC_APP_ENV = "development"
    await prisma.comunidad.upsert({
      where: { id: comunidadA },
      update: {},
      create: { id: comunidadA, nombre: "Comunidad Ingresos FI A", slug: "ingfi-a" },
    })
    await prisma.comunidad.upsert({
      where: { id: comunidadB },
      update: {},
      create: { id: comunidadB, nombre: "Comunidad Ingresos FI B", slug: "ingfi-b" },
    })
    for (const u of [
      { id: "ingfi-user-admin", email: emailAdmin, activo: true },
      { id: "ingfi-user-residente", email: emailResidente, activo: true },
      { id: "ingfi-user-comite", email: emailComite, activo: true },
    ]) {
      await prisma.usuario.upsert({ where: { email: u.email }, update: {}, create: u })
    }
    await prisma.membresia.deleteMany({
      where: { usuarioId: { in: ["ingfi-user-admin", "ingfi-user-residente", "ingfi-user-comite"] } },
    })
    await prisma.membresia.create({
      data: { usuarioId: "ingfi-user-admin", comunidadId: comunidadA, rol: "administrador" },
    })
    await prisma.membresia.create({
      data: { usuarioId: "ingfi-user-residente", comunidadId: comunidadA, rol: "residente" },
    })
    await prisma.membresia.create({
      data: { usuarioId: "ingfi-user-comite", comunidadId: comunidadA, rol: "comite" },
    })
    // Estado limpio de las entidades bajo test (idempotencia en re-runs).
    await limpiarEntidades()
    await prisma.fondoFI.create({
      data: { id: fondoActivo, comunidadId: comunidadA, nombre: "Fondo Activo", tipo: "gasto_comun", activo: true },
    })
    await prisma.fondoFI.create({
      data: { id: fondoInactivo, comunidadId: comunidadA, nombre: "Fondo Fuera", tipo: "especial", activo: false },
    })
    // Registro ajeno en otra comunidad para los 404 de scope.
    await prisma.ingresoFI.create({
      data: {
        id: ingresoAjeno,
        comunidadId: comunidadB,
        fecha: "2026-01-01",
        monto: 1000,
        concepto: "Ingreso de otra comunidad",
        fondoId: "ingfi-fondo-b",
      },
    })
  }, 30_000)

  afterAll(async () => {
    state.cookie = ""
    delete process.env.NEXT_PUBLIC_APP_ENV
    await limpiarEntidades()
    for (const id of ["ingfi-user-admin", "ingfi-user-residente", "ingfi-user-comite"]) {
      await prisma.usuario.delete({ where: { id } }).catch(() => {})
    }
    await prisma.comunidad.delete({ where: { id: comunidadB } }).catch(() => {})
    await prisma.comunidad.delete({ where: { id: comunidadA } }).catch(() => {})
  })

  async function limpiarEntidades(): Promise<void> {
    await prisma.eventoAuditoria.deleteMany({ where: { comunidadId: { in: [comunidadA, comunidadB] } } })
    await prisma.ingresoFI.deleteMany({ where: { comunidadId: { in: [comunidadA, comunidadB] } } })
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
    const ruta = esItem ? await import("@/app/api/ingresos-fi/[id]/route") : await import("@/app/api/ingresos-fi/route")
    const req = new NextRequest(
      `http://localhost/api/ingresos-fi${esItem ? `/${id}` : ""}`,
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
    if (esItem) {
      const handler = (ruta as unknown as Record<string, (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => Promise<Response>>)[metodo]
      if (!handler) throw new Error(`método no soportado: ${metodo}`)
      return handler(req, { params: Promise.resolve({ id }) })
    }
    const handler = (ruta as unknown as Record<string, (req: NextRequest) => Promise<Response>>)[metodo]
    if (!handler) throw new Error(`método no soportado: ${metodo}`)
    return handler(req)
  }

  it("guardia de sesión: 401 sin cookie en GET y POST", async () => {
    state.cookie = ""
    const get = await llamar("GET")
    expect(get.status).toBe(401)
    const post = await llamar("POST", undefined, ingresoValido())
    expect(post.status).toBe(401)
  })

  it("comité: GET lista → 200 (puede ver FI) y POST → 403 (no puede crear)", async () => {
    await conSesion(emailComite, async () => {
      const get = await llamar("GET")
      expect(get.status).toBe(200)
      const post = await llamar("POST", undefined, ingresoValido({ id: "ingfi-ing-comite" }))
      expect(post.status).toBe(403)
      expect(await prisma.ingresoFI.findUnique({ where: { id: "ingfi-ing-comite" } })).toBeNull()
    })
  })

  it("residente: GET, POST, GET_ONE, PUT y DELETE → 403", async () => {
    await conSesion(emailResidente, async () => {
      const get = await llamar("GET")
      expect(get.status).toBe(403)
      const post = await llamar("POST", undefined, ingresoValido())
      expect(post.status).toBe(403)
      const getOne = await llamar("GET", ingresoAjeno)
      expect(getOne.status).toBe(403)
      const put = await llamar("PUT", ingresoAjeno, { concepto: "x" })
      expect(put.status).toBe(403)
      // DELETE: el scope 404 corre ANTES del authz en la factory, así que el
      // 403 se prueba con un registro propio. La factory chequea findUnique
      // (scope) que aún no existe → 404; se prueba el 403 sembrando uno propio.
      await prisma.ingresoFI.create({
        data: {
          id: "ingfi-ing-residente",
          comunidadId: comunidadA,
          fecha: "2026-01-02",
          monto: 100,
          concepto: "Ingreso de prueba residente",
          fondoId: fondoActivo,
        },
      })
      const del = await llamar("DELETE", "ingfi-ing-residente")
      expect(del.status).toBe(403)
      expect(await prisma.ingresoFI.findUnique({ where: { id: "ingfi-ing-residente" } })).not.toBeNull()
      await prisma.ingresoFI.delete({ where: { id: "ingfi-ing-residente" } })
    })
  })

  it("admin POST → 201, upsert idempotente y queda en la BD", async () => {
    await conSesion(emailAdmin, async () => {
      const res = await llamar("POST", undefined, ingresoValido({ familia: "fondo_reserva" }))
      expect(res.status).toBe(201)
      const enBd = await prisma.ingresoFI.findUnique({ where: { id: ingresoMio } })
      expect(enBd?.comunidadId).toBe(comunidadA)
      expect(enBd?.monto).toBe(500000)
      expect(enBd?.concepto).toBe("Cuota extraordinaria")
      expect(enBd?.familia).toBe("fondo_reserva")
      // Re-POST con el mismo id → 200 (rail upsert), monto actualizado.
      const dos = await llamar("POST", undefined, ingresoValido({ monto: 750000 }))
      expect(dos.status).toBe(200)
      expect((await prisma.ingresoFI.findUnique({ where: { id: ingresoMio } }))?.monto).toBe(750000)
    })
  })

  it("POST body JSON inválido → 400 «Cuerpo JSON inválido.»", async () => {
    await conSesion(emailAdmin, async () => {
      const res = await llamar("POST", undefined, "{no-json")
      expect(res.status).toBe(400)
      expect(((await res.json()) as { error: string }).error).toBe("Cuerpo JSON inválido.")
    })
  })

  it("POST schema inválido (monto 0 y concepto faltante) → 400 y nada persistido", async () => {
    await conSesion(emailAdmin, async () => {
      const res = await llamar("POST", undefined, ingresoValido({ id: "ingfi-ing-bad", monto: 0, concepto: undefined }))
      expect(res.status).toBe(400)
      expect(((await res.json()) as { error: string }).error).toBe("Datos inválidos.")
      expect(await prisma.ingresoFI.findUnique({ where: { id: "ingfi-ing-bad" } })).toBeNull()
    })
  })

  it("POST a fondo inexistente → 400 y nada persistido", async () => {
    await conSesion(emailAdmin, async () => {
      const res = await llamar("POST", undefined, ingresoValido({ id: "ingfi-ing-fondo-x", fondoId: "ingfi-no-existe" }))
      expect(res.status).toBe(400)
      expect(((await res.json()) as { error: string }).error).toBe(
        "No se puede registrar el ingreso: el fondo de imputación no existe."
      )
      expect(await prisma.ingresoFI.findUnique({ where: { id: "ingfi-ing-fondo-x" } })).toBeNull()
    })
  })

  it("POST a fondo inactivo → 400 con el nombre del fondo", async () => {
    await conSesion(emailAdmin, async () => {
      const res = await llamar("POST", undefined, ingresoValido({ id: "ingfi-ing-fondo-off", fondoId: fondoInactivo }))
      expect(res.status).toBe(400)
      expect(((await res.json()) as { error: string }).error).toBe(
        "No se puede registrar el ingreso: el fondo \"Fondo Fuera\" está inactivo."
      )
      expect(await prisma.ingresoFI.findUnique({ where: { id: "ingfi-ing-fondo-off" } })).toBeNull()
    })
  })

  it("POST con id ya usado en otra comunidad → 404 (sin filtrar existencia)", async () => {
    await conSesion(emailAdmin, async () => {
      const res = await llamar("POST", undefined, ingresoValido({ id: ingresoAjeno }))
      expect(res.status).toBe(404)
    })
  })

  it("GET lista paginada → 200 con total y data de la comunidad propia", async () => {
    await conSesion(emailAdmin, async () => {
      const res = await llamar("GET")
      expect(res.status).toBe(200)
      const j = (await res.json()) as { data: unknown[]; page: number; pageSize: number; total: number }
      expect(j.total).toBe(1)
      expect(Array.isArray(j.data)).toBe(true)
      expect((j.data[0] as { id: string }).id).toBe(ingresoMio)
      const paginado = await llamar("GET")
      expect(paginado.status).toBe(200)
    })
  })

  it("GET_ONE propio → 200; de otra comunidad o inexistente → 404", async () => {
    await conSesion(emailAdmin, async () => {
      const ok = await llamar("GET", ingresoMio)
      expect(ok.status).toBe(200)
      expect(((await ok.json()) as { id: string }).id).toBe(ingresoMio)
      const ajeno = await llamar("GET", ingresoAjeno)
      expect(ajeno.status).toBe(404)
      const nesta = await llamar("GET", "ingfi-no-existe")
      expect(nesta.status).toBe(404)
    })
  })

  it("PUT parcial cambia concepto → 200 y se refleja en la BD", async () => {
    await conSesion(emailAdmin, async () => {
      const res = await llamar("PUT", ingresoMio, { concepto: "Cuota corregida" })
      expect(res.status).toBe(200)
      expect((await prisma.ingresoFI.findUnique({ where: { id: ingresoMio } }))?.concepto).toBe("Cuota corregida")
    })
  })

  it("PUT con fondo inexistente o inactivo → 400 y el registro no cambia", async () => {
    await conSesion(emailAdmin, async () => {
      const falta = await llamar("PUT", ingresoMio, { fondoId: "ingfi-no-existe" })
      expect(falta.status).toBe(400)
      const inactivo = await llamar("PUT", ingresoMio, { fondoId: fondoInactivo })
      expect(inactivo.status).toBe(400)
      expect((await prisma.ingresoFI.findUnique({ where: { id: ingresoMio } }))?.fondoId).toBe(fondoActivo)
    })
  })

  it("PUT sobre inexistente o de otra comunidad → 404", async () => {
    await conSesion(emailAdmin, async () => {
      const nesta = await llamar("PUT", "ingfi-no-existe", { concepto: "x" })
      expect(nesta.status).toBe(404)
      const ajeno = await llamar("PUT", ingresoAjeno, { concepto: "x" })
      expect(ajeno.status).toBe(404)
    })
  })

  it("PUT body JSON inválido → 400", async () => {
    await conSesion(emailAdmin, async () => {
      const res = await llamar("PUT", ingresoMio, "{no-json")
      expect(res.status).toBe(400)
      expect(((await res.json()) as { error: string }).error).toBe("Cuerpo JSON inválido.")
    })
  })

  it("DELETE propio → 200 y desaparece; de otra comunidad → 404", async () => {
    await conSesion(emailAdmin, async () => {
      const res = await llamar("DELETE", ingresoMio)
      expect(res.status).toBe(200)
      expect((await res.json()) as { ok: boolean }).toEqual({ ok: true })
      expect(await prisma.ingresoFI.findUnique({ where: { id: ingresoMio } })).toBeNull()
      // Re-sembrar para probar el 404 de scope.
      await prisma.ingresoFI.create({
        data: { id: ingresoMio, comunidadId: comunidadA, fecha: "2026-01-20", monto: 1, concepto: "temp", fondoId: fondoActivo },
      })
      const ajeno = await llamar("DELETE", ingresoAjeno)
      expect(ajeno.status).toBe(404)
      expect(await prisma.ingresoFI.findUnique({ where: { id: ingresoAjeno } })).not.toBeNull()
    })
  })

  describe("Auditoría FI_INGRESO_REGISTRADO (am-emisores-1)", () => {
    const idAuditado = "ingfi-ing-audit"

    const limpiarEventos = async (): Promise<void> => {
      await prisma.eventoAuditoria.deleteMany({
        where: { comunidadId: comunidadA, tipoAccion: "FI_INGRESO_REGISTRADO" },
      })
    }

    it("POST admin exitoso emite UN evento categoría FI con la referencia del ingreso", async () => {
      await conSesion(emailAdmin, async () => {
        await limpiarEventos()
        const res = await llamar("POST", undefined, ingresoValido({ id: idAuditado }))
        expect(res.status).toBe(201)

        const eventos = await prisma.eventoAuditoria.findMany({
          where: { comunidadId: comunidadA, tipoAccion: "FI_INGRESO_REGISTRADO" },
        })
        expect(eventos).toHaveLength(1)
        const evento = eventos[0]!
        expect(evento.categoria).toBe("FI")
        expect(evento.tipoAccion).toBe("FI_INGRESO_REGISTRADO")
        expect(evento.referenciaId).toBe(idAuditado)
        expect(evento.usuario).toBe("ingfi-user-admin")
        expect(evento.descripcion).toContain("500.000")
        expect(evento.descripcion).toContain("Cuota extraordinaria")
      })
    })

    it("POST 403 (comité no crea) no emite evento", async () => {
      await conSesion(emailComite, async () => {
        await limpiarEventos()
        const res = await llamar("POST", undefined, ingresoValido({ id: "ingfi-ing-audit-403" }))
        expect(res.status).toBe(403)
        expect(
          await prisma.eventoAuditoria.count({
            where: { comunidadId: comunidadA, tipoAccion: "FI_INGRESO_REGISTRADO" },
          })
        ).toBe(0)
      })
    })

    it("POST 400 (fondo inexistente o schema inválido) no emite evento", async () => {
      await conSesion(emailAdmin, async () => {
        await limpiarEventos()
        const sinFondo = await llamar(
          "POST",
          undefined,
          ingresoValido({ id: "ingfi-ing-audit-400", fondoId: "ingfi-no-existe" })
        )
        expect(sinFondo.status).toBe(400)
        const invalido = await llamar(
          "POST",
          undefined,
          ingresoValido({ id: "ingfi-ing-audit-mal", monto: 0 })
        )
        expect(invalido.status).toBe(400)
        expect(
          await prisma.eventoAuditoria.count({
            where: { comunidadId: comunidadA, tipoAccion: "FI_INGRESO_REGISTRADO" },
          })
        ).toBe(0)
      })
    })
  })
})
