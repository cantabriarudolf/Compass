/**
 * @vitest-environment node
 *
 * api-cobertura-fase3 (SERIE-DEUDA-1 P3) — /api/emisiones-gc (66.89% → medido).
 *
 * route.ts (GET factory + POST de emisión GC con transacción de cobros) y
 * [id]/route.ts (GET_ONE, PUT parcial con revalidación del merge, DELETE con
 * guarda 409 por cobros pagados). Prisma real, único mock `next/headers`;
 * guardias 401 / 403 por rol / 404 por scope / 400 de validación y de reglas,
 * más los caminos felices en modo fijo y variable.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest"
import { NextRequest } from "next/server"
import { Prisma } from "@prisma/client"
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

const comunidadA = "egc3-com-a"
const comunidadB = "egc3-com-b"
const comunidadC = "egc3-com-c"
const emailAdmin = "egc3-admin@test.cl"
const emailComite = "egc3-comite@test.cl"
const emailResidente = "egc3-residente@test.cl"
const emailAdminC = "egc3-admin-c@test.cl"

const emisionAjeno = "egc3-egc-ajena"
const emisionSeed = "egc3-egc-seed"
const emisionIncompleta = "egc3-egc-incompleta"
const fondoGC = "egc3-fondo-gc"
const fondoReserva = "egc3-fondo-res"

function emisionSeedData(
  id: string,
  lineas: Prisma.InputJsonValue
): {
  id: string
  comunidadId: string
  periodo: string
  modo: string
  gastoTotal: number
  lineas: Prisma.InputJsonValue
  fondoReservaAporte: Prisma.InputJsonValue
  fechaEmision: string
} {
  return {
    id,
    comunidadId: comunidadA,
    periodo: id === emisionIncompleta ? "2026-02" : "2026-01",
    modo: "fijo",
    gastoTotal: 60000,
    lineas,
    // El PUT parcial revalida la entidad completa mergeada: el seed debe pasar
    // `EmisionGCSchema` entero (un `null` en este Json opcional no es válido).
    fondoReservaAporte: { fondoId: "egc3-fondo-res", monto: 6000 },
    fechaEmision: "2026-01-05",
  }
}

const lineaSeed: Prisma.InputJsonValue = [
  { unidadId: "egc3-u-1", responsablePersonaId: "egc3-p-1", monto: 60000, cobroId: "egc3-cob-seed" },
]

describe("/api/emisiones-gc — emisiones de Gasto Común con BD real", () => {
  beforeAll(async () => {
    process.env.AUTH_SECRET = AUTH_SECRET
    process.env.NEXT_PUBLIC_APP_ENV = "development"
    for (const c of [
      { id: comunidadA, nombre: "Comunidad Emisiones A", slug: "egc3-a" },
      { id: comunidadB, nombre: "Comunidad Emisiones B", slug: "egc3-b" },
      { id: comunidadC, nombre: "Comunidad Emisiones C", slug: "egc3-c" },
    ]) {
      await prisma.comunidad.upsert({ where: { id: c.id }, update: {}, create: c })
    }
    for (const u of [
      { id: "egc3-user-admin", email: emailAdmin },
      { id: "egc3-user-comite", email: emailComite },
      { id: "egc3-user-residente", email: emailResidente },
      { id: "egc3-user-admin-c", email: emailAdminC },
    ]) {
      await prisma.usuario.upsert({
        where: { email: u.email },
        update: { activo: true },
        create: { ...u, activo: true },
      })
    }
    const membresias = [
      { usuarioId: "egc3-user-admin", comunidadId: comunidadA, rol: "administrador" },
      { usuarioId: "egc3-user-comite", comunidadId: comunidadA, rol: "comite" },
      { usuarioId: "egc3-user-residente", comunidadId: comunidadA, rol: "residente" },
      { usuarioId: "egc3-user-admin-c", comunidadId: comunidadC, rol: "administrador" },
    ]
    await prisma.membresia.deleteMany({
      where: { usuarioId: { in: membresias.map((m) => m.usuarioId) } },
    })
    for (const m of membresias) await prisma.membresia.create({ data: m })

    await limpiarEntidades()
    await prisma.tipoUnidad.create({
      data: {
        id: "egc3-tu-1",
        comunidadId: comunidadA,
        nombre: "Departamento 60m2",
        categoria: "departamento",
        metraje: 60,
        montoBaseGc: 60000,
        activo: true,
        historialTarifas: [],
      },
    })
    for (const u of [
      { id: "egc3-u-1", numero: "101", prorrateo: 0.6 },
      { id: "egc3-u-2", numero: "102", prorrateo: 0.4 },
      { id: "egc3-u-3", numero: "103", prorrateo: 0.2 },
    ]) {
      await prisma.unidad.create({
        data: {
          id: u.id,
          comunidadId: comunidadA,
          microSectorId: "egc3-ms-1",
          numero: u.numero,
          etiqueta: `Depto ${u.numero}`,
          tipoUnidadId: "egc3-tu-1",
          metraje: 60,
          prorrateo: u.prorrateo,
          rolSii: `9999-${u.numero}`,
          estadoId: "egc3-est-1",
          servicios: {},
        },
      })
    }
    for (const p of [
      { id: "egc3-p-1", rut: "11111111-1" },
      { id: "egc3-p-2", rut: "22222222-2" },
    ]) {
      await prisma.persona.create({
        data: {
          id: p.id,
          comunidadId: comunidadA,
          rut: p.rut,
          nombreCompleto: `Persona ${p.id}`,
          nombres: "Persona",
          apellidos: p.id,
          email: `${p.id}@test.cl`,
          telefonoMovil: "+56900000000",
          estadoCuenta: "activa",
          condicionesEspecialesIds: [],
          roles: [],
        },
      })
    }
    // Sólo u-1 y u-2 tienen responsable de cobro: u-3 existe para el 400.
    for (const v of [
      { id: "egc3-v-1", personaId: "egc3-p-1", unidadId: "egc3-u-1" },
      { id: "egc3-v-2", personaId: "egc3-p-2", unidadId: "egc3-u-2" },
    ]) {
      await prisma.vinculoUnidad.create({
        data: {
          ...v,
          comunidadId: comunidadA,
          rol: "propietario",
          fechaInicio: "2025-01-01",
          permiteVerFinanzas: true,
        },
      })
    }
    await prisma.fondoFI.create({
      data: {
        id: fondoGC,
        comunidadId: comunidadA,
        nombre: "Fondo Gasto Común EGC3",
        tipo: "gasto_comun",
        activo: true,
      },
    })
    await prisma.fondoFI.create({
      data: {
        id: fondoReserva,
        comunidadId: comunidadA,
        nombre: "Fondo Reserva EGC3",
        tipo: "reserva",
        activo: true,
        porcentajeAporte: 10,
      },
    })
    await prisma.emisionGC.create({ data: emisionSeedData(emisionSeed, lineaSeed) })
    await prisma.emisionGC.create({ data: emisionSeedData(emisionIncompleta, []) })
    await prisma.emisionGC.create({
      data: { ...emisionSeedData(emisionAjeno, lineaSeed), id: emisionAjeno, comunidadId: comunidadB },
    })
  }, 30_000)

  afterAll(async () => {
    state.cookie = ""
    delete process.env.NEXT_PUBLIC_APP_ENV
    await limpiarEntidades()
    await prisma.membresia.deleteMany({
      where: {
        usuarioId: {
          in: ["egc3-user-admin", "egc3-user-comite", "egc3-user-residente", "egc3-user-admin-c"],
        },
      },
    })
    await prisma.usuario.deleteMany({ where: { email: { startsWith: "egc3-" } } })
    await prisma.comunidad.deleteMany({ where: { id: { in: [comunidadB, comunidadC, comunidadA] } } })
  })

  async function limpiarEntidades(): Promise<void> {
    const enComunidades = { in: [comunidadA, comunidadB, comunidadC] }
    await prisma.cobroFI.deleteMany({ where: { comunidadId: enComunidades } })
    await prisma.emisionGC.deleteMany({ where: { comunidadId: enComunidades } })
    await prisma.vinculoUnidad.deleteMany({ where: { comunidadId: enComunidades } })
    await prisma.persona.deleteMany({ where: { comunidadId: enComunidades } })
    await prisma.unidad.deleteMany({ where: { comunidadId: enComunidades } })
    await prisma.tipoUnidad.deleteMany({ where: { comunidadId: enComunidades } })
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
    body?: unknown
  ): Promise<Response> {
    const esItem = id !== undefined
    const ruta = esItem
      ? await import("@/app/api/emisiones-gc/[id]/route")
      : await import("@/app/api/emisiones-gc/route")
    const req = new NextRequest(`http://localhost/api/emisiones-gc${esItem ? `/${id}` : ""}`, {
      method: metodo,
      ...(metodo === "GET" || metodo === "DELETE"
        ? {}
        : {
            body: typeof body === "string" ? body : JSON.stringify(body ?? {}),
            headers: { "content-type": "application/json" },
          }),
    })
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

  it("guardia de sesión: 401 sin cookie en GET y POST", async () => {
    state.cookie = ""
    const get = await llamar("GET")
    expect(get.status).toBe(401)
    const post = await llamar("POST", undefined, { periodo: "2026-05", modo: "fijo" })
    expect(post.status).toBe(401)
  })

  it("residente (sin permiso FI): GET y GET_ONE → 403", async () => {
    await conSesion(emailResidente, async () => {
      expect((await llamar("GET")).status).toBe(403)
      expect((await llamar("GET", emisionSeed)).status).toBe(403)
    })
  })

  it("comité: GET → 200 y POST → 403 (no puede crear FI)", async () => {
    await conSesion(emailComite, async () => {
      const get = await llamar("GET")
      expect(get.status).toBe(200)
      const j = (await get.json()) as { data: { comunidadId: string }[]; total: number }
      expect(j.total).toBeGreaterThanOrEqual(2)
      expect(j.data.every((d) => d.comunidadId === comunidadA)).toBe(true)
      const post = await llamar("POST", undefined, { periodo: "2026-05", modo: "fijo" })
      expect(post.status).toBe(403)
      expect(await prisma.emisionGC.findFirst({ where: { periodo: "2026-05" } })).toBeNull()
    })
  })

  it("GET_ONE propio → 200; ajeno o inexistente → 404", async () => {
    await conSesion(emailAdmin, async () => {
      const ok = await llamar("GET", emisionSeed)
      expect(ok.status).toBe(200)
      expect(((await ok.json()) as { id: string }).id).toBe(emisionSeed)
      expect((await llamar("GET", emisionAjeno)).status).toBe(404)
      expect((await llamar("GET", "egc3-egc-nada")).status).toBe(404)
    })
  })

  it("POST con JSON inválido → 400 «Cuerpo JSON inválido.»", async () => {
    await conSesion(emailAdmin, async () => {
      const res = await llamar("POST", undefined, "{no-json")
      expect(res.status).toBe(400)
      expect(((await res.json()) as { error: string }).error).toBe("Cuerpo JSON inválido.")
    })
  })

  it("POST con body que no pasa el schema → 400 «Datos inválidos.»", async () => {
    await conSesion(emailAdmin, async () => {
      const res = await llamar("POST", undefined, { periodo: "2026/05", modo: "fijo" })
      expect(res.status).toBe(400)
      expect(((await res.json()) as { error: string }).error).toBe("Datos inválidos.")
    })
  })

  it("POST modo variable sin gasto total → 400 de regla de negocio", async () => {
    await conSesion(emailAdmin, async () => {
      const res = await llamar("POST", undefined, {
        periodo: "2026-04",
        modo: "variable",
        unidadIds: ["egc3-u-1"],
      })
      expect(res.status).toBe(400)
      expect(((await res.json()) as { error: string }).error).toBe(
        "La modalidad prorrateo exige definir el gasto total a recaudar."
      )
    })
  })

  it("POST con unidad sin responsable de cobro → 400 y nada persistido", async () => {
    await conSesion(emailAdmin, async () => {
      const res = await llamar("POST", undefined, {
        periodo: "2026-04",
        modo: "fijo",
        unidadIds: ["egc3-u-3"],
      })
      expect(res.status).toBe(400)
      expect(((await res.json()) as { error: string }).error).toBe(
        "Emisión bloqueada: 1 unidad(es) sin responsable de cobro asignado."
      )
      expect(await prisma.emisionGC.findFirst({ where: { comunidadId: comunidadA, periodo: "2026-04" } })).toBeNull()
    })
  })

  it("POST sin unidades elegibles (ids inexistentes) → 400", async () => {
    await conSesion(emailAdmin, async () => {
      const res = await llamar("POST", undefined, {
        periodo: "2026-04",
        modo: "fijo",
        unidadIds: ["egc3-u-no-existe"],
      })
      expect(res.status).toBe(400)
      expect(((await res.json()) as { error: string }).error).toBe(
        "No hay unidades elegibles para la emisión."
      )
    })
  })

  it("comunidad sin Fondo de Gasto Común activo → 400; sin unidades → 400", async () => {
    await conSesion(emailAdminC, async () => {
      const sinFondo = await llamar("POST", undefined, { periodo: "2026-04", modo: "fijo" })
      expect(sinFondo.status).toBe(400)
      expect(((await sinFondo.json()) as { error: string }).error).toBe(
        "No existe un Fondo de Gasto Común activo para imputar la emisión."
      )
      await prisma.fondoFI.create({
        data: {
          id: "egc3-fondo-gc-c",
          comunidadId: comunidadC,
          nombre: "Fondo GC C",
          tipo: "gasto_comun",
          activo: true,
        },
      })
      const sinUnidades = await llamar("POST", undefined, { periodo: "2026-04", modo: "fijo" })
      expect(sinUnidades.status).toBe(400)
      expect(((await sinUnidades.json()) as { error: string }).error).toBe(
        "No hay unidades elegibles para la emisión."
      )
    })
  })

  it("POST modo fijo → 201 con la emisión y sus cobros en una transacción", async () => {
    await conSesion(emailAdmin, async () => {
      const res = await llamar("POST", undefined, {
        periodo: "2026-05",
        modo: "fijo",
        unidadIds: ["egc3-u-1", "egc3-u-2"],
      })
      expect(res.status).toBe(201)
      const j = (await res.json()) as {
        emision: { id: string; gastoTotal: number; fondoReservaAporte?: { monto: number } }
        cobros: { id: string; montoBase: number }[]
      }
      expect(j.emision.gastoTotal).toBe(120000)
      expect(j.emision.fondoReservaAporte?.monto).toBe(12000)
      expect(j.cobros.length).toBe(2)
      expect(j.cobros.every((c) => c.montoBase === 60000)).toBe(true)
      const guardados = await prisma.cobroFI.findMany({
        where: { comunidadId: comunidadA, origenRef: j.emision.id },
      })
      expect(guardados.length).toBe(2)
    })
  })

  it("POST duplicado por período → 409 y no crea una segunda emisión", async () => {
    await conSesion(emailAdmin, async () => {
      const res = await llamar("POST", undefined, {
        periodo: "2026-05",
        modo: "fijo",
        unidadIds: ["egc3-u-1"],
      })
      expect(res.status).toBe(409)
      expect(((await res.json()) as { error: string }).error).toBe(
        "El periodo 2026-05 ya fue procesado previamente."
      )
      expect(await prisma.emisionGC.count({ where: { comunidadId: comunidadA, periodo: "2026-05" } })).toBe(1)
    })
  })

  it("POST modo variable → 201 prorratea el gasto total de la unidad", async () => {
    await conSesion(emailAdmin, async () => {
      const res = await llamar("POST", undefined, {
        periodo: "2026-03",
        modo: "variable",
        gastoTotal: 100000,
        unidadIds: ["egc3-u-1"],
      })
      expect(res.status).toBe(201)
      const j = (await res.json()) as {
        emision: { id: string; modo: string; gastoTotal: number; fondoReservaAporte?: { monto: number } }
        cobros: { montoBase: number }[]
      }
      expect(j.emision.modo).toBe("variable")
      expect(j.emision.gastoTotal).toBe(100000)
      expect(j.cobros[0]?.montoBase).toBe(60000)
      expect(j.emision.fondoReservaAporte?.monto).toBe(6000)
    })
  })

  it("PUT: 401 sin sesión y 403 con comité (no edita FI)", async () => {
    state.cookie = ""
    expect((await llamar("PUT", emisionSeed, { gastoTotal: 1 })).status).toBe(401)
    await conSesion(emailComite, async () => {
      const res = await llamar("PUT", emisionSeed, { gastoTotal: 1 })
      expect(res.status).toBe(403)
      expect(((await prisma.emisionGC.findUnique({ where: { id: emisionSeed } }))?.gastoTotal)).toBe(60000)
    })
  })

  it("PUT: 400 con JSON inválido, con campo inválido y con el merge incompleto", async () => {
    await conSesion(emailAdmin, async () => {
      const malJson = await llamar("PUT", emisionSeed, "{no-json")
      expect(malJson.status).toBe(400)
      expect(((await malJson.json()) as { error: string }).error).toBe("Cuerpo JSON inválido.")

      const campo = await llamar("PUT", emisionSeed, { modo: "nope" })
      expect(campo.status).toBe(400)
      expect(((await campo.json()) as { error: string }).error).toBe("Datos inválidos.")

      // El parche es válido por sí solo, pero el registro mergeado queda sin
      // líneas (el seed incompleto tiene `lineas: []`) → la revalidación completa da 400.
      const merge = await llamar("PUT", emisionIncompleta, { gastoTotal: 70000 })
      expect(merge.status).toBe(400)
      expect(((await merge.json()) as { error: string }).error).toBe("Datos inválidos.")
      expect((await prisma.emisionGC.findUnique({ where: { id: emisionIncompleta } }))?.gastoTotal).toBe(60000)
    })
  })

  it("PUT: 404 con emisión de otra comunidad o inexistente", async () => {
    await conSesion(emailAdmin, async () => {
      expect((await llamar("PUT", emisionAjeno, { gastoTotal: 1 })).status).toBe(404)
      expect((await llamar("PUT", "egc3-egc-nada", { gastoTotal: 1 })).status).toBe(404)
    })
  })

  it("PUT parcial → 200 y el cambio queda en la BD", async () => {
    await conSesion(emailAdmin, async () => {
      const res = await llamar("PUT", emisionSeed, { gastoTotal: 75000 })
      expect(res.status).toBe(200)
      expect((await prisma.emisionGC.findUnique({ where: { id: emisionSeed } }))?.gastoTotal).toBe(75000)
    })
  })

  it("DELETE: 403 con residente (autorización antes del scope)", async () => {
    await conSesion(emailResidente, async () => {
      const res = await llamar("DELETE", emisionSeed)
      expect(res.status).toBe(403)
      expect(await prisma.emisionGC.findUnique({ where: { id: emisionSeed } })).not.toBeNull()
    })
  })

  it("DELETE: 404 con emisión ajena o inexistente", async () => {
    await conSesion(emailAdmin, async () => {
      expect((await llamar("DELETE", emisionAjeno)).status).toBe(404)
      expect((await llamar("DELETE", "egc3-egc-nada")).status).toBe(404)
    })
  })

  it("DELETE: 409 si un cobro de la emisión tiene pagos", async () => {
    await conSesion(emailAdmin, async () => {
      const emision = await prisma.emisionGC.findFirst({
        where: { comunidadId: comunidadA, periodo: "2026-05" },
      })
      if (!emision) throw new Error("emisión 2026-05 no encontrada")
      const cobro = await prisma.cobroFI.findFirstOrThrow({
        where: { comunidadId: comunidadA, origenRef: emision.id },
      })
      await prisma.cobroFI.update({
        where: { id: cobro.id },
        data: { pagos: [{ id: "egc3-pago-1", monto: 60000, fecha: "2026-05-10", medio: "transferencia" }] },
      })
      const res = await llamar("DELETE", emision.id)
      expect(res.status).toBe(409)
      expect(((await res.json()) as { error: string }).error).toContain("cobro(s) tienen pagos registrados")
      expect(await prisma.emisionGC.findUnique({ where: { id: emision.id } })).not.toBeNull()
      expect(await prisma.cobroFI.count({ where: { comunidadId: comunidadA, origenRef: emision.id } })).toBe(2)
    })
  })

  it("DELETE: 200 borra la emisión y sus cobros cuando ninguno tiene pagos", async () => {
    await conSesion(emailAdmin, async () => {
      const emision = await prisma.emisionGC.findFirstOrThrow({
        where: { comunidadId: comunidadA, periodo: "2026-03" },
      })
      expect(await prisma.cobroFI.count({ where: { comunidadId: comunidadA, origenRef: emision.id } })).toBe(1)
      const res = await llamar("DELETE", emision.id)
      expect(res.status).toBe(200)
      expect(((await res.json()) as { ok: boolean }).ok).toBe(true)
      expect(await prisma.emisionGC.findUnique({ where: { id: emision.id } })).toBeNull()
      expect(await prisma.cobroFI.count({ where: { comunidadId: comunidadA, origenRef: emision.id } })).toBe(0)
    })
  })
})
