/**
 * @vitest-environment node
 *
 * api-cobertura-fase4 (SERIE-DEUDA-1 P4) — /api/fondos-fi (71.16% → medido).
 *
 * route.ts (GET factory + POST upsert con unicidad de nombre por comunidad),
 * [id]/route.ts (GET_ONE, PUT parcial, DELETE con guard de movimientos) y
 * [id]/retirar/route.ts (POST de retiro con reglas de fondo, acta y saldo).
 * Prisma real, único mock `next/headers`; guardias 401 / 403 por rol / 404 por
 * scope / 400 de validación y de reglas / 409 de unicidad y movimientos.
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

const comunidadA = "ffi4-com-a"
const comunidadB = "ffi4-com-b"
const emailAdmin = "ffi4-admin@test.cl"
const emailComite = "ffi4-comite@test.cl"
const emailConserjeria = "ffi4-conserjeria@test.cl"
const emailAdminB = "ffi4-admin-b@test.cl"

const fondoActivo = "ffi4-fondo-activo"
const fondoInactivo = "ffi4-fondo-inactivo"
const fondoReserva = "ffi4-fondo-reserva"
const fondoAjeno = "ffi4-fondo-ajeno"
const fondoConMovimientos = "ffi4-fondo-movimientos"
const fondoBorrable = "ffi4-fondo-borrable"
const actaPublicada = "ffi4-acta-pub"
const actaBorrador = "ffi4-acta-borrador"

describe("/api/fondos-fi — fondos FI con BD real", () => {
  beforeAll(async () => {
    process.env.AUTH_SECRET = AUTH_SECRET
    process.env.NEXT_PUBLIC_APP_ENV = "development"
    for (const c of [
      { id: comunidadA, nombre: "Comunidad Fondos A", slug: "ffi4-a" },
      { id: comunidadB, nombre: "Comunidad Fondos B", slug: "ffi4-b" },
    ]) {
      await prisma.comunidad.upsert({ where: { id: c.id }, update: {}, create: c })
    }
    for (const u of [
      { id: "ffi4-user-admin", email: emailAdmin },
      { id: "ffi4-user-comite", email: emailComite },
      { id: "ffi4-user-conserjeria", email: emailConserjeria },
      { id: "ffi4-user-admin-b", email: emailAdminB },
    ]) {
      await prisma.usuario.upsert({
        where: { email: u.email },
        update: { activo: true },
        create: { ...u, activo: true },
      })
    }
    const membresias = [
      { usuarioId: "ffi4-user-admin", comunidadId: comunidadA, rol: "administrador" },
      { usuarioId: "ffi4-user-comite", comunidadId: comunidadA, rol: "comite" },
      { usuarioId: "ffi4-user-conserjeria", comunidadId: comunidadA, rol: "conserjeria" },
      { usuarioId: "ffi4-user-admin-b", comunidadId: comunidadB, rol: "administrador" },
    ]
    await prisma.membresia.deleteMany({
      where: { usuarioId: { in: membresias.map((m) => m.usuarioId) } },
    })
    for (const m of membresias) await prisma.membresia.create({ data: m })
    await limpiar()

    await prisma.fondoFI.createMany({
      data: [
        {
          id: fondoActivo,
          comunidadId: comunidadA,
          nombre: "Fondo FFi4 Activo",
          tipo: "gasto_comun",
          activo: true,
          saldoInicial: 500000,
        },
        {
          id: fondoInactivo,
          comunidadId: comunidadA,
          nombre: "Fondo FFi4 Inactivo",
          tipo: "gasto_comun",
          activo: false,
          saldoInicial: 100000,
        },
        {
          id: fondoReserva,
          comunidadId: comunidadA,
          nombre: "Fondo FFi4 Reserva",
          tipo: "reserva",
          activo: true,
          saldoInicial: 300000,
        },
        {
          id: fondoConMovimientos,
          comunidadId: comunidadA,
          nombre: "Fondo FFi4 Con Movimientos",
          tipo: "gasto_comun",
          activo: true,
          saldoInicial: 0,
        },
        {
          id: fondoBorrable,
          comunidadId: comunidadA,
          nombre: "Fondo FFi4 Borrable",
          tipo: "especial",
          activo: true,
          saldoInicial: 0,
        },
        {
          id: fondoAjeno,
          comunidadId: comunidadB,
          nombre: "Fondo FFi4 Ajeno",
          tipo: "gasto_comun",
          activo: true,
        },
      ],
    })
    await prisma.egresoFI.create({
      data: {
        id: "ffi4-egr-guard",
        comunidadId: comunidadA,
        fecha: "2026-01-10",
        categoria: "otro",
        descripcion: "Egreso que imputa movimientos al fondo",
        monto: 1000,
        fondoId: fondoConMovimientos,
        esRecurrente: false,
      },
    })
    await prisma.actaGD.create({
      data: {
        id: actaPublicada,
        comunidadId: comunidadA,
        fecha: "2026-01-01",
        hora: "19:00",
        lugar: "Sala de reuniones",
        tablaTemas: [],
        presentes: [],
        ausentes: [],
        invitados: [],
        minuta: "Acta publicada de prueba",
        adjuntos: [],
        estado: "publicada",
        aprobaciones: [],
      },
    })
    await prisma.actaGD.create({
      data: {
        id: actaBorrador,
        comunidadId: comunidadA,
        fecha: "2026-01-02",
        hora: "19:00",
        lugar: "Sala de reuniones",
        tablaTemas: [],
        presentes: [],
        ausentes: [],
        invitados: [],
        minuta: "Acta en borrador de prueba",
        adjuntos: [],
        estado: "borrador",
        aprobaciones: [],
      },
    })
  }, 30_000)

  afterAll(async () => {
    state.cookie = ""
    delete process.env.NEXT_PUBLIC_APP_ENV
    await limpiar()
    await prisma.membresia.deleteMany({
      where: {
        usuarioId: {
          in: ["ffi4-user-admin", "ffi4-user-comite", "ffi4-user-conserjeria", "ffi4-user-admin-b"],
        },
      },
    })
    await prisma.usuario.deleteMany({ where: { email: { startsWith: "ffi4-" } } })
    await prisma.comunidad.deleteMany({ where: { id: { in: [comunidadA, comunidadB] } } })
  })

  async function limpiar(): Promise<void> {
    const enComunidades = { in: [comunidadA, comunidadB] }
    await prisma.eventoAuditoria.deleteMany({ where: { comunidadId: enComunidades } })
    await prisma.egresoFI.deleteMany({ where: { comunidadId: enComunidades } })
    await prisma.ingresoFI.deleteMany({ where: { comunidadId: enComunidades } })
    await prisma.cobroFI.deleteMany({ where: { comunidadId: enComunidades } })
    await prisma.emisionGC.deleteMany({ where: { comunidadId: enComunidades } })
    await prisma.actaGD.deleteMany({ where: { comunidadId: enComunidades } })
    await prisma.fondoFI.deleteMany({ where: { comunidadId: enComunidades } })
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
    body?: unknown,
    sufijo = ""
  ): Promise<Response> {
    const esItem = id !== undefined
    const ruta = esItem
      ? await import("@/app/api/fondos-fi/[id]/route")
      : await import("@/app/api/fondos-fi/route")
    const req = new NextRequest(
      `http://localhost/api/fondos-fi${esItem ? `/${id}${sufijo}` : ""}`,
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
    type Handler = (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => Promise<Response>
    if (esItem) {
      const handler = (ruta as unknown as Record<string, Handler>)[metodo]
      if (!handler) throw new Error(`método no soportado: ${metodo}`)
      return handler(req, { params: Promise.resolve({ id }) })
    }
    const handler = (ruta as unknown as Record<string, (req: NextRequest) => Promise<Response>>)[metodo]
    if (!handler) throw new Error(`método no soportado: ${metodo}`)
    return handler(req)
  }

  async function retirar(id: string, body: unknown): Promise<Response> {
    const ruta = await import("@/app/api/fondos-fi/[id]/retirar/route")
    const req = new NextRequest(`http://localhost/api/fondos-fi/${id}/retirar`, {
      method: "POST",
      body: typeof body === "string" ? body : JSON.stringify(body ?? {}),
      headers: { "content-type": "application/json" },
    })
    return ruta.POST(req, { params: Promise.resolve({ id }) })
  }

  it("guardia de sesión: 401 sin cookie en GET, POST y PUT", async () => {
    state.cookie = ""
    expect((await llamar("GET")).status).toBe(401)
    expect((await llamar("POST", undefined, {})).status).toBe(401)
    expect((await llamar("PUT", fondoActivo, { nombre: "X" })).status).toBe(401)
  })

  it("conserjería (sin permiso FI): GET → 403", async () => {
    await conSesion(emailConserjeria, async () => {
      expect((await llamar("GET")).status).toBe(403)
    })
  })

  it("comité: GET → 200 y POST → 403 (no puede crear FI)", async () => {
    await conSesion(emailComite, async () => {
      const get = await llamar("GET")
      expect(get.status).toBe(200)
      const j = (await get.json()) as { data: { comunidadId: string }[]; total: number }
      expect(j.data.every((d) => d.comunidadId === comunidadA)).toBe(true)
      const post = await llamar("POST", undefined, {
        id: "ffi4-comite-crea",
        nombre: "No debería existir",
        tipo: "gasto_comun",
        activo: true,
      })
      expect(post.status).toBe(403)
      expect(await prisma.fondoFI.findUnique({ where: { id: "ffi4-comite-crea" } })).toBeNull()
    })
  })

  it("POST con JSON inválido y con schema inválido → 400", async () => {
    await conSesion(emailAdmin, async () => {
      const malJson = await llamar("POST", undefined, "{no-json")
      expect(malJson.status).toBe(400)
      expect(((await malJson.json()) as { error: string }).error).toBe("Cuerpo JSON inválido.")
      const malSchema = await llamar("POST", undefined, { id: "ffi4-x", tipo: "gasto_comun", activo: true })
      expect(malSchema.status).toBe(400)
      expect(((await malSchema.json()) as { error: string }).error).toBe("Datos inválidos.")
    })
  })

  it("POST nuevo → 201; upsert del mismo id → 200 y actualiza", async () => {
    await conSesion(emailAdmin, async () => {
      const alta = await llamar("POST", undefined, {
        id: "ffi4-fondo-nuevo",
        nombre: "Fondo FFi4 Nuevo",
        tipo: "gasto_comun",
        activo: true,
        descripcion: "creado en test",
      })
      expect(alta.status).toBe(201)
      const enBd = await prisma.fondoFI.findUnique({ where: { id: "ffi4-fondo-nuevo" } })
      expect(enBd?.comunidadId).toBe(comunidadA)

      const update = await llamar("POST", undefined, {
        id: "ffi4-fondo-nuevo",
        nombre: "Fondo FFi4 Nuevo",
        tipo: "gasto_comun",
        activo: false,
      })
      expect(update.status).toBe(200)
      expect((await prisma.fondoFI.findUnique({ where: { id: "ffi4-fondo-nuevo" } }))?.activo).toBe(false)

      await prisma.fondoFI.delete({ where: { id: "ffi4-fondo-nuevo" } })
    })
  })

  it("POST con nombre duplicado (case-insensitive) → 409 y no persiste", async () => {
    await conSesion(emailAdmin, async () => {
      const res = await llamar("POST", undefined, {
        id: "ffi4-fondo-duplicado",
        nombre: "fondo ffi4 activo",
        tipo: "gasto_comun",
        activo: true,
      })
      expect(res.status).toBe(409)
      expect(((await res.json()) as { error: string }).error).toMatch(/Ya existe un fondo/)
      expect(await prisma.fondoFI.findUnique({ where: { id: "ffi4-fondo-duplicado" } })).toBeNull()
    })
  })

  it("POST sobre un fondo de OTRA comunidad → 404", async () => {
    await conSesion(emailAdmin, async () => {
      const res = await llamar("POST", undefined, {
        id: fondoAjeno,
        nombre: "Intento cross-comunidad",
        tipo: "gasto_comun",
        activo: true,
      })
      expect(res.status).toBe(404)
      expect((await prisma.fondoFI.findUnique({ where: { id: fondoAjeno } }))?.comunidadId).toBe(comunidadB)
    })
  })

  it("GET_ONE propio → 200; ajeno o inexistente → 404", async () => {
    await conSesion(emailAdmin, async () => {
      expect((await llamar("GET", fondoActivo)).status).toBe(200)
      expect((await llamar("GET", fondoAjeno)).status).toBe(404)
      expect((await llamar("GET", "ffi4-no-existe")).status).toBe(404)
    })
  })

  it("PUT: 403 comité, 400 de validación, 404 ajeno, 200 parcial", async () => {
    await conSesion(emailComite, async () => {
      expect((await llamar("PUT", fondoActivo, { descripcion: "x" })).status).toBe(403)
    })
    await conSesion(emailAdmin, async () => {
      const malJson = await llamar("PUT", fondoActivo, "{no-json")
      expect(malJson.status).toBe(400)
      expect(((await malJson.json()) as { error: string }).error).toBe("Cuerpo JSON inválido.")

      const malSchema = await llamar("PUT", fondoActivo, { porcentajeAporte: "no-numero" })
      expect(malSchema.status).toBe(400)
      expect(((await malSchema.json()) as { error: string }).error).toBe("Datos inválidos.")

      expect((await llamar("PUT", fondoAjeno, { descripcion: "x" })).status).toBe(404)

      const ok = await llamar("PUT", fondoActivo, { descripcion: "descripción actualizada" })
      expect(ok.status).toBe(200)
      expect((await prisma.fondoFI.findUnique({ where: { id: fondoActivo } }))?.descripcion).toBe(
        "descripción actualizada"
      )
    })
  })

  it("PUT con nombre de otro fondo → 409", async () => {
    await conSesion(emailAdmin, async () => {
      const res = await llamar("PUT", fondoActivo, { nombre: "fondo ffi4 reserva" })
      expect(res.status).toBe(409)
      expect((await prisma.fondoFI.findUnique({ where: { id: fondoActivo } }))?.nombre).toBe(
        "Fondo FFi4 Activo"
      )
    })
  })

  it("DELETE con movimientos imputados → 409; sin movimientos → 200", async () => {
    await conSesion(emailAdmin, async () => {
      const guard = await llamar("DELETE", fondoConMovimientos)
      expect(guard.status).toBe(409)
      expect(((await guard.json()) as { error: string }).error).toMatch(/movimiento/i)
      expect(await prisma.fondoFI.findUnique({ where: { id: fondoConMovimientos } })).not.toBeNull()

      const ok = await llamar("DELETE", fondoBorrable)
      expect(ok.status).toBe(200)
      expect(await prisma.fondoFI.findUnique({ where: { id: fondoBorrable } })).toBeNull()
    })
  })

  // --- /api/fondos-fi/[id]/retirar ---

  it("retirar: 401 sin cookie y 403 comité", async () => {
    state.cookie = ""
    expect((await retirar(fondoActivo, { monto: 1000, descripcion: "x" })).status).toBe(401)
    await conSesion(emailComite, async () => {
      expect((await retirar(fondoActivo, { monto: 1000, descripcion: "x" })).status).toBe(403)
    })
  })

  it("retirar: JSON inválido, fondo ajeno y fondo inactivo → 400/404/400", async () => {
    await conSesion(emailAdmin, async () => {
      const malJson = await retirar(fondoActivo, "{no-json")
      expect(malJson.status).toBe(400)
      expect(((await malJson.json()) as { error: string }).error).toBe("Cuerpo JSON inválido.")

      const ajeno = await retirar(fondoAjeno, { monto: 1000, descripcion: "x" })
      expect(ajeno.status).toBe(404)

      const inactivo = await retirar(fondoInactivo, { monto: 1000, descripcion: "x" })
      expect(inactivo.status).toBe(400)
      expect(((await inactivo.json()) as { error: string }).error).toMatch(/inactivo/)
    })
  })

  it("retirar: monto y descripción inválidos → 400", async () => {
    await conSesion(emailAdmin, async () => {
      const sinMonto = await retirar(fondoActivo, { monto: 0, descripcion: "x" })
      expect(sinMonto.status).toBe(400)
      expect(((await sinMonto.json()) as { error: string }).error).toMatch(/monto/)

      const sinDesc = await retirar(fondoActivo, { monto: 1000, descripcion: "   " })
      expect(sinDesc.status).toBe(400)
      expect(((await sinDesc.json()) as { error: string }).error).toMatch(/describir/)
    })
  })

  it("retirar: acta inexistente / no publicada / reserva sin acta → 400", async () => {
    await conSesion(emailAdmin, async () => {
      const inexistente = await retirar(fondoActivo, {
        monto: 1000,
        descripcion: "x",
        aprobacionActaGDId: "ffi4-acta-inexistente",
      })
      expect(inexistente.status).toBe(400)
      expect(((await inexistente.json()) as { error: string }).error).toMatch(/no existe/)

      const borrador = await retirar(fondoActivo, {
        monto: 1000,
        descripcion: "x",
        aprobacionActaGDId: actaBorrador,
      })
      expect(borrador.status).toBe(400)
      expect(((await borrador.json()) as { error: string }).error).toMatch(/Publicada/)

      const reservaSinActa = await retirar(fondoReserva, { monto: 1000, descripcion: "x" })
      expect(reservaSinActa.status).toBe(400)
      expect(((await reservaSinActa.json()) as { error: string }).error).toMatch(/Fondo de Reserva/)
    })
  })

  it("retirar: saldo insuficiente → 400 sin crear egreso", async () => {
    await conSesion(emailAdmin, async () => {
      const res = await retirar(fondoActivo, { monto: 999_999_999, descripcion: "retiro gigante" })
      expect(res.status).toBe(400)
      expect(((await res.json()) as { error: string }).error).toMatch(/Saldo insuficiente/)
      expect(await prisma.egresoFI.findFirst({ where: { descripcion: "retiro gigante" } })).toBeNull()
    })
  })

  it("retirar: camino feliz con acta publicada → 200, egreso uso_de_fondo y evento FI_FUND_WITHDRAWN", async () => {
    await conSesion(emailAdmin, async () => {
      const res = await retirar(fondoReserva, {
        monto: 50000,
        descripcion: "Reparación ascensor",
        aprobacionActaGDId: actaPublicada,
      })
      expect(res.status).toBe(200)
      const j = (await res.json()) as { ok: boolean; egresoId: string }
      expect(j.ok).toBe(true)

      const egreso = await prisma.egresoFI.findUnique({ where: { id: j.egresoId } })
      expect(egreso?.categoria).toBe("uso_de_fondo")
      expect(egreso?.monto).toBe(50000)
      expect(egreso?.fondoId).toBe(fondoReserva)
      expect(egreso?.aprobacionActaGDId).toBe(actaPublicada)

      const evento = await prisma.eventoAuditoria.findFirst({
        where: { referenciaId: j.egresoId, tipoAccion: "FI_FUND_WITHDRAWN" },
      })
      expect(evento).not.toBeNull()
      expect(evento?.categoria).toBe("FI")
    })
  })
})
