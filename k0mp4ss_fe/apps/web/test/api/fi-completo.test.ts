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

const comunidad = "fi-comunidad-a"
const emailAdmin = "fi-admin@test.cl"
const emailResidente = "fi-residente@test.cl"

const cargaModulos = async () => ({
  fondos: await import("@/app/api/fondos-fi/route"),
  fondoItem: await import("@/app/api/fondos-fi/[id]/route"),
  egresos: await import("@/app/api/egresos-fi/route"),
  ingresos: await import("@/app/api/ingresos-fi/route"),
  ingresoItem: await import("@/app/api/ingresos-fi/[id]/route"),
  emisiones: await import("@/app/api/emisiones-gc/route"),
  emisionItem: await import("@/app/api/emisiones-gc/[id]/route"),
  cobros: await import("@/app/api/cobros-fi/route"),
  cobroItem: await import("@/app/api/cobros-fi/[id]/route"),
})

type Coleccion = {
  POST(req: NextRequest): Promise<Response>
  GET(req: NextRequest): Promise<Response>
}

type Item = {
  GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<Response>
  PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<Response>
  DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<Response>
}

function fondoValido(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "fi-fondo-gc",
    nombre: "Fondo Gasto Común",
    tipo: "gasto_comun",
    activo: true,
    ...overrides,
  }
}

describe("/api FI completo — finanzas con BD real (BD-FUENTE-VERDAD Fase 3)", () => {
  beforeAll(async () => {
    process.env.AUTH_SECRET = AUTH_SECRET
    await prisma.comunidad.upsert({
      where: { id: comunidad },
      update: {},
      create: { id: comunidad, nombre: "Comunidad A FI", slug: "fi-comunidad-a" },
    })
    for (const u of [
      { id: "fi-usuario-admin", email: emailAdmin, activo: true },
      { id: "fi-usuario-residente", email: emailResidente, activo: true },
    ]) {
      await prisma.usuario.upsert({ where: { email: u.email }, update: {}, create: u })
    }
    await prisma.membresia.deleteMany({
      where: { usuarioId: { in: ["fi-usuario-admin", "fi-usuario-residente"] } },
    })
    await prisma.membresia.create({
      data: { usuarioId: "fi-usuario-admin", comunidadId: comunidad, rol: "administrador" },
    })
    await prisma.membresia.create({
      data: { usuarioId: "fi-usuario-residente", comunidadId: comunidad, rol: "residente" },
    })
    // Estado limpio de las entidades bajo test.
    await prisma.cobroFI.deleteMany({ where: { comunidadId: comunidad } })
    await prisma.emisionGC.deleteMany({ where: { comunidadId: comunidad } })
    await prisma.egresoFI.deleteMany({ where: { comunidadId: comunidad } })
    await prisma.ingresoFI.deleteMany({ where: { comunidadId: comunidad } })
    await prisma.fondoFI.deleteMany({ where: { comunidadId: comunidad } })
  }, 30_000)

  afterAll(async () => {
    try {
      state.cookie = ""
      await prisma.cobroFI.deleteMany({ where: { comunidadId: comunidad } })
      await prisma.emisionGC.deleteMany({ where: { comunidadId: comunidad } })
      await prisma.egresoFI.deleteMany({ where: { comunidadId: comunidad } })
      await prisma.ingresoFI.deleteMany({ where: { comunidadId: comunidad } })
      await prisma.fondoFI.deleteMany({ where: { comunidadId: comunidad } })
      await prisma.vinculoUnidad.deleteMany({ where: { comunidadId: comunidad } })
      await prisma.unidad.deleteMany({ where: { comunidadId: comunidad } })
      await prisma.microSector.deleteMany({ where: { comunidadId: comunidad } })
      await prisma.macroSector.deleteMany({ where: { comunidadId: comunidad } })
      await prisma.tipoUnidad.deleteMany({ where: { comunidadId: comunidad } })
      await prisma.persona.deleteMany({ where: { comunidadId: comunidad } })
      await prisma.membresia.deleteMany({
        where: { usuarioId: { in: ["fi-usuario-admin", "fi-usuario-residente"] } },
      })
      for (const id of ["fi-usuario-admin", "fi-usuario-residente"]) {
        await prisma.usuario.delete({ where: { id } }).catch(() => {})
      }
      await prisma.comunidad.delete({ where: { id: comunidad } }).catch(() => {})
    } catch {
      // intencional: limpieza best-effort
    }
  })

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
    modulo: Promise<Coleccion | Item>,
    metodo: "POST" | "GET" | "PUT" | "DELETE",
    path: string,
    body?: unknown
  ): Promise<Response> {
    const m = (await modulo) as unknown as Record<string, (req: NextRequest, ctx?: { params: Promise<{ id: string }> }) => Promise<Response>>
    // SAFETY: el path es interno del test (colección o colección/id, con query opcional).
    const limpio = path.split("?")[0] ?? path
    const id = limpio.split("/").pop() ?? ""
    const fn = m[metodo]
    if (!fn) throw new Error(`handler no encontrado: ${metodo} ${path}`)
    const esItem = metodo !== "POST" && !["fondos-fi", "egresos-fi", "ingresos-fi", "emisiones-gc", "cobros-fi"].includes(id)
    const req = new NextRequest(`http://localhost/api/${path}`, {
      method: metodo,
      ...(body !== undefined
        ? { body: JSON.stringify(body), headers: { "content-type": "application/json" } }
        : {}),
    })
    if (esItem) return fn(req, { params: Promise.resolve({ id }) })
    return (fn as (req: NextRequest) => Promise<Response>)(req)
  }

  it("401 sin sesión (GET y POST fondos)", async () => {
    const { fondos } = await cargaModulos()
    state.cookie = ""
    const get = await fondos.GET(
      new NextRequest("http://localhost/api/fondos-fi")
    )
    expect(get.status).toBe(401)
    const post = await fondos.POST(
      new NextRequest("http://localhost/api/fondos-fi", {
        method: "POST",
        body: JSON.stringify(fondoValido()),
        headers: { "content-type": "application/json" },
      })
    )
    expect(post.status).toBe(401)
  })

  it("admin crea fondo → 201 y queda en la BD", async () => {
    const { fondos } = await cargaModulos()
    await conSesion(emailAdmin, async () => {
      const res = await llamar(Promise.resolve(fondos), "POST", "fondos-fi", fondoValido())
      expect(res.status).toBe(201)
      const enBd = await prisma.fondoFI.findUnique({ where: { id: "fi-fondo-gc" } })
      expect(enBd).not.toBeNull()
      expect(enBd?.comunidadId).toBe(comunidad)
      expect(enBd?.nombre).toBe("Fondo Gasto Común")
    })
  })

  it("nombre de fondo duplicado (otro id) → 409", async () => {
    const { fondos } = await cargaModulos()
    await conSesion(emailAdmin, async () => {
      const res = await llamar(
        Promise.resolve(fondos),
        "POST",
        "fondos-fi",
        fondoValido({ id: "fi-fondo-dup", nombre: "FONDO GASTO COMÚN" })
      )
      expect(res.status).toBe(409)
      expect(await prisma.fondoFI.findUnique({ where: { id: "fi-fondo-dup" } })).toBeNull()
    })
  })

  it("admin crea egreso → folio FE- auto y queda en la BD", async () => {
    const { egresos } = await cargaModulos()
    await conSesion(emailAdmin, async () => {
      const res = await llamar(Promise.resolve(egresos), "POST", "egresos-fi", {
        id: "fi-egr-1",
        fecha: "2026-01-15",
        categoria: "mantencion",
        descripcion: "Reparación bomba",
        monto: 150000,
        fondoId: "fi-fondo-gc",
        esRecurrente: false,
      })
      expect(res.status).toBe(201)
      const j = (await res.json()) as { folio: string }
      expect(j.folio).toBe("FE-0001")
      const enBd = await prisma.egresoFI.findUnique({ where: { id: "fi-egr-1" } })
      expect(enBd?.comunidadId).toBe(comunidad)
      expect(enBd?.folio).toBe("FE-0001")
    })
  })

  it("egreso a fondo inactivo → 400", async () => {
    const { fondos, egresos } = await cargaModulos()
    await conSesion(emailAdmin, async () => {
      const f = await llamar(
        Promise.resolve(fondos),
        "POST",
        "fondos-fi",
        fondoValido({ id: "fi-fondo-off", nombre: "Fondo Inactivo", tipo: "especial", activo: false })
      )
      expect(f.status).toBe(201)
      const res = await llamar(Promise.resolve(egresos), "POST", "egresos-fi", {
        id: "fi-egr-off",
        fecha: "2026-01-16",
        categoria: "otro",
        descripcion: "Gasto a fondo inactivo",
        monto: 1000,
        fondoId: "fi-fondo-off",
        esRecurrente: false,
      })
      expect(res.status).toBe(400)
      expect(await prisma.egresoFI.findUnique({ where: { id: "fi-egr-off" } })).toBeNull()
    })
  })

  it("admin registra ingreso → queda en la BD", async () => {
    const { ingresos } = await cargaModulos()
    await conSesion(emailAdmin, async () => {
      const res = await llamar(Promise.resolve(ingresos), "POST", "ingresos-fi", {
        id: "fi-ing-1",
        fecha: "2026-01-20",
        monto: 500000,
        concepto: "Cuota extraordinaria",
        fondoId: "fi-fondo-gc",
      })
      expect(res.status).toBe(201)
      const enBd = await prisma.ingresoFI.findUnique({ where: { id: "fi-ing-1" } })
      expect(enBd?.comunidadId).toBe(comunidad)
      expect(enBd?.monto).toBe(500000)
    })
  })

  it("residente: POST fondo → 403 y GET fondos → 403", async () => {
    const { fondos } = await cargaModulos()
    await conSesion(emailResidente, async () => {
      const post = await llamar(Promise.resolve(fondos), "POST", "fondos-fi", fondoValido({ id: "fi-fondo-x", nombre: "Fondo X" }))
      expect(post.status).toBe(403)
      const get = await llamar(Promise.resolve(fondos), "GET", "fondos-fi")
      expect(get.status).toBe(403)
    })
  })

  async function seedEmision(): Promise<void> {
    await prisma.tipoUnidad.upsert({
      where: { id: "fi-tipo-a" },
      update: {},
      create: {
        id: "fi-tipo-a",
        comunidadId: comunidad,
        nombre: "Depto",
        categoria: "habitacional",
        metraje: 60,
        montoBaseGc: 80000,
        activo: true,
        historialTarifas: [],
      },
    })
    await prisma.macroSector.upsert({
      where: { id: "fi-macro-1" },
      update: {},
      create: { id: "fi-macro-1", comunidadId: comunidad, nombre: "Torre", etiqueta: "T" },
    })
    await prisma.microSector.upsert({
      where: { id: "fi-micro-1" },
      update: {},
      create: { id: "fi-micro-1", comunidadId: comunidad, macroSectorId: "fi-macro-1", nombre: "Piso 1", etiqueta: "P1" },
    })
    for (const [uid, numero, prorrateo] of [["fi-u-1", "101", 0.6], ["fi-u-2", "102", 0.4]] as const) {
      await prisma.unidad.upsert({
        where: { id: uid },
        update: {},
        create: {
          id: uid,
          comunidadId: comunidad,
          microSectorId: "fi-micro-1",
          numero,
          etiqueta: `Depto ${numero}`,
          tipoUnidadId: "fi-tipo-a",
          metraje: 60,
          prorrateo,
          rolSii: "0-0",
          estadoId: "ocupado",
          servicios: {},
        },
      })
    }
    for (const [pid, email, nombre] of [
      ["fi-pers-1", "fi-prop1@test.cl", "Prop Uno"],
      ["fi-pers-2", "fi-prop2@test.cl", "Prop Dos"],
    ] as const) {
      await prisma.persona.upsert({
        where: { id: pid },
        update: {},
        create: {
          id: pid,
          comunidadId: comunidad,
          rut: pid === "fi-pers-1" ? "11111111-1" : "22222222-2",
          nombreCompleto: nombre,
          nombres: "Prop",
          apellidos: pid === "fi-pers-1" ? "Uno" : "Dos",
          email,
          telefonoMovil: "+56900000000",
          estadoCuenta: "activa",
          condicionesEspecialesIds: [],
          roles: [],
        },
      })
    }
    for (const [vid, pid, uid] of [["fi-vinc-1", "fi-pers-1", "fi-u-1"], ["fi-vinc-2", "fi-pers-2", "fi-u-2"]] as const) {
      await prisma.vinculoUnidad.upsert({
        where: { id: vid },
        update: {},
        create: {
          id: vid,
          comunidadId: comunidad,
          personaId: pid,
          unidadId: uid,
          rol: "propietario",
          fechaInicio: "2026-01-01",
          permiteVerFinanzas: true,
        },
      })
    }
    // El residente es propietario de fi-u-1.
    await prisma.usuario.update({
      where: { id: "fi-usuario-residente" },
      data: { personaId: "fi-pers-1" },
    })
  }

  it("emitirGastoComun variable crea EmisionGC + 2 CobroFI en Prisma", async () => {
    const { emisiones } = await cargaModulos()
    await seedEmision()
    await conSesion(emailAdmin, async () => {
      const res = await llamar(Promise.resolve(emisiones), "POST", "emisiones-gc", {
        periodo: "2026-02",
        modo: "variable",
        gastoTotal: 100000,
      })
      expect(res.status).toBe(201)
      const j = (await res.json()) as {
        emision: { id: string; periodo: string; gastoTotal: number }
        cobros: { id: string; unidadId: string; montoBase: number }[]
      }
      expect(j.emision.periodo).toBe("2026-02")
      expect(j.cobros).toHaveLength(2)
      const porUnidad = new Map(j.cobros.map((c) => [c.unidadId, c.montoBase]))
      expect(porUnidad.get("fi-u-1")).toBe(60000)
      expect(porUnidad.get("fi-u-2")).toBe(40000)
      expect(await prisma.emisionGC.findFirst({ where: { comunidadId: comunidad, periodo: "2026-02" } })).not.toBeNull()
      expect(await prisma.cobroFI.count({ where: { comunidadId: comunidad, periodo: "2026-02" } })).toBe(2)
    })
  })

  it("período duplicado → 409", async () => {
    const { emisiones } = await cargaModulos()
    await conSesion(emailAdmin, async () => {
      const res = await llamar(Promise.resolve(emisiones), "POST", "emisiones-gc", {
        periodo: "2026-02",
        modo: "variable",
        gastoTotal: 50000,
      })
      expect(res.status).toBe(409)
    })
  })

  it("residente ve solo sus propios cobros", async () => {
    const { cobros } = await cargaModulos()
    await conSesion(emailResidente, async () => {
      const res = await llamar(Promise.resolve(cobros), "GET", "cobros-fi")
      expect(res.status).toBe(200)
      const j = (await res.json()) as { data: { unidadId: string }[]; total: number }
      expect(j.total).toBe(1)
      expect(j.data[0]?.unidadId).toBe("fi-u-1")
    })
  })

  it("DELETE emisión con cobro pagado → 409", async () => {
    const { cobros, cobroItem, emisionItem } = await cargaModulos()
    await conSesion(emailAdmin, async () => {
      const lista = await llamar(Promise.resolve(cobros), "GET", "cobros-fi?periodo=2026-02")
      const j = (await lista.json()) as { data: { id: string }[] }
      const cobroId = j.data[0]?.id
      expect(cobroId).toBeTruthy()
      const pago = await llamar(Promise.resolve(cobroItem), "PUT", `cobros-fi/${cobroId}`, {
        pagos: [{ id: "pago-1", monto: 1000, fecha: "2026-02-10", medio: "transferencia" }],
      })
      expect(pago.status).toBe(200)
      const emision = await prisma.emisionGC.findFirst({
        where: { comunidadId: comunidad, periodo: "2026-02" },
      })
      const del = await llamar(Promise.resolve(emisionItem), "DELETE", `emisiones-gc/${emision?.id}`)
      expect(del.status).toBe(409)
      expect(await prisma.emisionGC.findFirst({ where: { comunidadId: comunidad, periodo: "2026-02" } })).not.toBeNull()
    })
  })

  it("DELETE fondo con movimientos → 409; fondo limpio → 200", async () => {
    const { fondos, fondoItem } = await cargaModulos()
    await conSesion(emailAdmin, async () => {
      const conMov = await llamar(Promise.resolve(fondoItem), "DELETE", "fondos-fi/fi-fondo-gc")
      expect(conMov.status).toBe(409)
      expect(await prisma.fondoFI.findUnique({ where: { id: "fi-fondo-gc" } })).not.toBeNull()
      const limpio = await llamar(Promise.resolve(fondos), "POST", "fondos-fi", fondoValido({ id: "fi-fondo-tmp", nombre: "Fondo Temporal", tipo: "especial" }))
      expect(limpio.status).toBe(201)
      const del = await llamar(Promise.resolve(fondoItem), "DELETE", "fondos-fi/fi-fondo-tmp")
      expect(del.status).toBe(200)
      expect(await prisma.fondoFI.findUnique({ where: { id: "fi-fondo-tmp" } })).toBeNull()
    })
  })
})
