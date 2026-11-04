/**
 * @vitest-environment node
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest"
import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"

const state = vi.hoisted(() => ({ cookie: "" }))
vi.mock("next/headers", () => ({
  headers: () => Promise.resolve(new Headers(state.cookie ? { cookie: state.cookie, "x-forwarded-proto": "http" } : { "x-forwarded-proto": "http" })),
}))

const AUTH_SECRET = "test-secret-12345678"

describe("FI sync — POST /api/fi/sync + GET /api/fi (fi-sync-bd)", () => {
  const comunidadA = "comunidad-a-fisync"
  const comunidadB = "comunidad-b-fisync"
  const adminEmailA = "fisync-admin-a@test.cl"
  const adminEmailB = "fisync-admin-b@test.cl"
  const sinMembresiaEmail = "fisync-sin-m@test.cl"

  beforeAll(async () => {
    process.env.AUTH_SECRET = AUTH_SECRET
    for (const c of [
      { id: comunidadA, nombre: "Comunidad A FiSync", slug: "comunidad-a-fisync" },
      { id: comunidadB, nombre: "Comunidad B FiSync", slug: "comunidad-b-fisync" },
    ]) {
      await prisma.comunidad.upsert({ where: { id: c.id }, update: {}, create: c }).catch(async () => {
        await prisma.comunidad.upsert({ where: { slug: c.slug }, update: {}, create: c }).catch(() => {})
      })
    }
    for (const u of [
      { id: "fisync-usuario-a", email: adminEmailA, activo: true },
      { id: "fisync-usuario-b", email: adminEmailB, activo: true },
      { id: "fisync-usuario-sin", email: sinMembresiaEmail, activo: true },
    ]) {
      await prisma.usuario.upsert({ where: { email: u.email }, update: { activo: true }, create: u })
    }
    const userA = await prisma.usuario.findUnique({ where: { email: adminEmailA } })
    const userB = await prisma.usuario.findUnique({ where: { email: adminEmailB } })
    const userSin = await prisma.usuario.findUnique({ where: { email: sinMembresiaEmail } })
    if (!userA || !userB || !userSin) throw new Error("seed usuarios fisync falló")
    await prisma.membresia.deleteMany({ where: { usuarioId: { in: [userA.id, userB.id, userSin.id] } } })
    await prisma.membresia.create({ data: { usuarioId: userA.id, comunidadId: comunidadA, rol: "administrador" } })
    await prisma.membresia.create({ data: { usuarioId: userB.id, comunidadId: comunidadB, rol: "administrador" } })
    await prisma.ingresoFI.deleteMany({ where: { comunidadId: { in: [comunidadA, comunidadB] } } })
    await prisma.egresoFI.deleteMany({ where: { comunidadId: { in: [comunidadA, comunidadB] } } })
    await prisma.fondoFI.deleteMany({ where: { comunidadId: { in: [comunidadA, comunidadB] } } })
    // Los cobros acreditan saldo por sus líneas: una corrida anterior a medias
    // dejaría pesos fantasma en los saldos de estos tests.
    await prisma.cobroFI.deleteMany({ where: { comunidadId: { in: [comunidadA, comunidadB] } } })
  }, 30_000)

  afterAll(async () => {
    try {
      state.cookie = ""
      await prisma.cobroFI.deleteMany({ where: { comunidadId: { in: [comunidadA, comunidadB] } } })
      await prisma.ingresoFI.deleteMany({ where: { comunidadId: { in: [comunidadA, comunidadB] } } })
      await prisma.egresoFI.deleteMany({ where: { comunidadId: { in: [comunidadA, comunidadB] } } })
      await prisma.fondoFI.deleteMany({ where: { comunidadId: { in: [comunidadA, comunidadB] } } })
      const userA = await prisma.usuario.findUnique({ where: { email: adminEmailA } })
      const userB = await prisma.usuario.findUnique({ where: { email: adminEmailB } })
      const userSin = await prisma.usuario.findUnique({ where: { email: sinMembresiaEmail } })
      const ids = [userA?.id, userB?.id, userSin?.id].filter(Boolean) as string[]
      if (ids.length) await prisma.membresia.deleteMany({ where: { usuarioId: { in: ids } } })
      if (userA) await prisma.usuario.delete({ where: { id: userA.id } }).catch(() => {})
      if (userB) await prisma.usuario.delete({ where: { id: userB.id } }).catch(() => {})
      if (userSin) await prisma.usuario.delete({ where: { id: userSin.id } }).catch(() => {})
      await prisma.comunidad.delete({ where: { id: comunidadA } }).catch(() => {})
      await prisma.comunidad.delete({ where: { id: comunidadB } }).catch(() => {})
    } catch {
      // intencional: vacío por diseño
    }
  })

  async function sesionCookie(email: string): Promise<string> {
    const user = await prisma.usuario.findUnique({ where: { email } })
    if (!user) throw new Error(`usuario no encontrado: ${email}`)
    const { cookieSesionAuthjs } = await import("./helpers/sesion-authjs")
    return cookieSesionAuthjs({ sub: user.id, email: user.email })
  }

  async function callPost({ email, body, comunidadId }: { email?: string; body?: unknown; comunidadId?: string }) {
    const { POST } = await import("@/app/api/fi/sync/route")
    const cookie = email ? await sesionCookie(email) : ""
    state.cookie = cookie
    const url = `http://localhost/api/fi/sync${comunidadId ? `?comunidadId=${comunidadId}` : ""}`
    const req = new NextRequest(url, {
      method: "POST",
      headers: {
        "x-forwarded-proto": "http",
        "content-type": "application/json",
        ...(cookie ? { cookie } : {}),
      },
      body: JSON.stringify(body ?? {}),
    })
    const res = await POST(req as unknown as Request)
    state.cookie = ""
    return res
  }

  async function callGet({ email, query, headers }: { email?: string; query?: string; headers?: Record<string, string> }) {
    const { GET } = await import("@/app/api/fi/route")
    const cookie = email ? await sesionCookie(email) : ""
    state.cookie = cookie
    const url = `http://localhost/api/fi${query ? `?${query}` : ""}`
    const req = new NextRequest(url, {
      headers: {
        "x-forwarded-proto": "http",
        ...(cookie ? { cookie } : {}),
        ...headers,
      },
    })
    const res = await GET(req as unknown as Request)
    state.cookie = ""
    return res
  }

  // Mini punto cero determinista: 1 fondo CC con saldoInicial + 3 egresos + 2 ingresos
  function puntoCeroMini() {
    return {
      fondos: [
        { id: "fondo-cc-fisync-test", nombre: "Cuenta Corriente TEST", tipo: "operacional", activo: true, saldoInicial: 17082694 },
      ],
      egresos: [
        { id: "fe-fisync-test-1", folio: "FE-T001", fecha: "2023-03-10", categoria: "servicios", descripcion: "Agua TEST", monto: 50000, fondoId: "fondo-cc-fisync-test", esRecurrente: false },
        { id: "fe-fisync-test-2", folio: "FE-T002", fecha: "2023-06-20", categoria: "mantencion", descripcion: "Jardinaje TEST", monto: 80000, fondoId: "fondo-cc-fisync-test", esRecurrente: true },
        { id: "fe-fisync-test-3", folio: "FE-T003", fecha: "2024-01-15", categoria: "uso_de_fondo", descripcion: "Reposición cerradura TEST", monto: 12000, fondoId: "fondo-cc-fisync-test", esRecurrente: false },
      ],
      ingresos: [
        { id: "fi-ing-fisync-test-1", fecha: "2023-02-05", monto: 100000, concepto: "Aporte consorcio TEST", fondoId: "fondo-cc-fisync-test" },
        { id: "fi-ing-fisync-test-2", fecha: "2024-05-05", monto: 250000, concepto: "Remanente 2023 TEST", fondoId: "fondo-cc-fisync-test", familia: "aporte" },
      ],
    }
  }

  it("POST 401 sin sesión", async () => {
    const res = await callPost({ body: puntoCeroMini() })
    expect(res.status).toBe(401)
  })

  it("GET 401 sin sesión", async () => {
    const res = await callGet({})
    expect(res.status).toBe(401)
  })

  it("POST 403 sin membresía", async () => {
    const res = await callPost({ email: sinMembresiaEmail, body: puntoCeroMini() })
    expect(res.status).toBe(403)
  })

  it("GET 403 sin membresía", async () => {
    const res = await callGet({ email: sinMembresiaEmail })
    expect(res.status).toBe(403)
  })

  it("POST batch vacío → ok con 0 recibidos", async () => {
    const res = await callPost({ email: adminEmailA, body: {} })
    expect(res.status).toBe(200)
    const j = await res.json()
    expect(j.ok).toBe(true)
    expect(j.recibidos).toBe(0)
  })

  it("POST idempotente: batch punto cero repetido → sin duplicados y saldoInicial preservado", async () => {
    const pc = puntoCeroMini()
    const res1 = await callPost({ email: adminEmailA, body: pc })
    expect(res1.status).toBe(200)
    const j1 = await res1.json()
    expect(j1.ok).toBe(true)
    expect(j1.recibidos).toBe(6)
    expect(j1.persistidos).toBe(6)
    expect(j1.porColeccion).toEqual({ fondos: 1, egresos: 3, ingresos: 2 })
    expect(j1.idsPersistidos).toHaveLength(6)

    // 2ª corrida idéntica
    const res2 = await callPost({ email: adminEmailA, body: pc })
    expect(res2.status).toBe(200)
    const j2 = await res2.json()
    expect(j2.persistidos).toBe(6)

    const nEgresos = await prisma.egresoFI.count({ where: { comunidadId: comunidadA } })
    const nIngresos = await prisma.ingresoFI.count({ where: { comunidadId: comunidadA } })
    const nFondos = await prisma.fondoFI.count({ where: { comunidadId: comunidadA } })
    expect(nEgresos).toBe(3)
    expect(nIngresos).toBe(2)
    expect(nFondos).toBe(1)

    const fondo = await prisma.fondoFI.findUnique({ where: { id: "fondo-cc-fisync-test" } })
    expect(fondo?.saldoInicial).toBe(17082694)
    expect(fondo?.comunidadId).toBe(comunidadA)
  })

  it("POST 400 batch >500 elementos", async () => {
    const egresos = Array.from({ length: 501 }, (_, i) => ({
      id: `fe-exceso-${i}`,
      fecha: "2024-01-01",
      categoria: "otro",
      descripcion: "exceso TEST",
      monto: 1000,
      fondoId: "fondo-cc-fisync-test",
    }))
    const res = await callPost({ email: adminEmailA, body: { egresos } })
    expect(res.status).toBe(400)
  })

  it("POST 400 sin elementos válidos", async () => {
    const res = await callPost({
      email: adminEmailA,
      body: { egresos: [{ id: "", monto: -5 }], ingresos: [{ foo: "bar" }] },
    })
    expect(res.status).toBe(400)
  })

  it("POST ignora elementos inválidos mezclados y persiste los válidos", async () => {
    const res = await callPost({
      email: adminEmailA,
      body: {
        ingresos: [
          { id: "fi-ing-fisync-valido", fecha: "2024-07-01", monto: 30000, concepto: "Válido TEST", fondoId: "fondo-cc-fisync-test" },
          { id: "fi-ing-fisync-invalido", fecha: "2024-07-01", monto: -1, concepto: "Monto negativo TEST", fondoId: "fondo-cc-fisync-test" },
        ],
      },
    })
    expect(res.status).toBe(200)
    const j = await res.json()
    expect(j.recibidos).toBe(2)
    expect(j.persistidos).toBe(1)
    const existe = await prisma.ingresoFI.findUnique({ where: { id: "fi-ing-fisync-valido" } })
    expect(existe).not.toBeNull()
    const invalido = await prisma.ingresoFI.findUnique({ where: { id: "fi-ing-fisync-invalido" } })
    expect(invalido).toBeNull()
  })

  it("GET retorna paginado, fondos y totales por fondo (saldo = inicial + ingresos - egresos)", async () => {
    const res = await callGet({ email: adminEmailA })
    expect(res.status).toBe(200)
    const j = await res.json()
    expect(j.egresos.total).toBe(3)
    expect(j.ingresos.total).toBe(3) // 2 del punto cero + 1 válido del test anterior
    expect(Array.isArray(j.fondos)).toBe(true)
    const cc = (j.totalesPorFondo as { fondoId: string; saldoInicial: number; egresos: number; montoEgresos: number; ingresos: number; montoIngresos: number; saldo: number }[]).find((t) => t.fondoId === "fondo-cc-fisync-test")
    expect(cc).toBeDefined()
    expect(cc!.saldoInicial).toBe(17082694)
    expect(cc!.egresos).toBe(3)
    expect(cc!.montoEgresos).toBe(142000)
    expect(cc!.ingresos).toBe(3)
    expect(cc!.montoIngresos).toBe(380000)
    expect(cc!.saldo).toBe(17082694 + 380000 - 142000)
    // items paginados presentes
    expect(j.egresos.items.some((e: { id: string }) => e.id === "fe-fisync-test-1")).toBe(true)
  })

  it("GET filtro fondoId y q", async () => {
    const resFondo = await callGet({ email: adminEmailA, query: "fondoId=fondo-cc-fisync-test" })
    const jFondo = await resFondo.json()
    expect(jFondo.egresos.total).toBe(3)

    const resQ = await callGet({ email: adminEmailA, query: `q=Jardinaje` })
    const jQ = await resQ.json()
    expect(jQ.egresos.items.some((e: { id: string }) => e.id === "fe-fisync-test-2")).toBe(true)
  })

  it("GET paginación page/pageSize", async () => {
    const res1 = await callGet({ email: adminEmailA, query: "page=1&pageSize=2" })
    const j1 = await res1.json()
    expect(j1.page).toBe(1)
    expect(j1.pageSize).toBe(2)
    expect(j1.egresos.items.length).toBe(2)
    const res2 = await callGet({ email: adminEmailA, query: "page=2&pageSize=2" })
    const j2 = await res2.json()
    expect(j2.egresos.items.length).toBe(1)
  })

  it("scoping A/B: dato de B no visible en A", async () => {
    const pcB = puntoCeroMini()
    pcB.egresos = pcB.egresos.map((e) => ({ ...e, id: `${e.id}-b`, folio: `${e.folio}-B`, descripcion: `${e.descripcion} SOLO-B` }))
    pcB.fondos = pcB.fondos.map((f) => ({ ...f, id: `${f.id}-b`, nombre: `${f.nombre} B` }))
    pcB.ingresos = pcB.ingresos.map((i) => ({ ...i, id: `${i.id}-b` }))
    const resB = await callPost({ email: adminEmailB, body: pcB })
    expect(resB.status).toBe(200)

    const resA = await callGet({ email: adminEmailA, query: "q=SOLO-B" })
    const jA = await resA.json()
    expect(jA.egresos.total).toBe(0)

    const resBGet = await callGet({ email: adminEmailB, query: "q=SOLO-B" })
    const jB = await resBGet.json()
    expect(jB.egresos.total).toBe(3)
  })

  /**
   * S5 / T5 corte 3 — el saldo de un fondo cuenta lo que las unidades PAGARON.
   *
   * `totalesPorFondo.saldo` se armaba con `saldoInicial + ingresos manuales −
   * egresos` y nunca miraba los cobros: desde que el recargo al fondo de reserva
   * es una línea real del cobro, un fondo que sólo recibe dinero por esas líneas
   * informaba menos caja de la que tiene. Estos casos fijan la suma contra el
   * endpoint público (no contra un helper), con los tres patrones del cobro:
   * líneas con fondo propio, línea de reserva dentro de un cobro de gasto común
   * (que NO debe acreditar al fondo del cobro) y cobro legacy sin detalle.
   */
  describe("GET /api/fi — el saldo por fondo cuenta lo recaudado por líneas (S5)", () => {
    const fondoGC = "fondo-gc-saldo-fisync"
    const fondoReserva = "fondo-reserva-saldo-fisync"
    const fondoLegacy = "fondo-legacy-saldo-fisync"

    type FilaTotales = {
      fondoId: string
      nombre: string
      saldoInicial: number
      egresos: number
      montoEgresos: number
      ingresos: number
      montoIngresos: number
      saldo: number
    }

    async function totales(): Promise<Map<string, FilaTotales>> {
      const res = await callGet({ email: adminEmailA })
      expect(res.status).toBe(200)
      const j = (await res.json()) as { totalesPorFondo: FilaTotales[] }
      return new Map(j.totalesPorFondo.map((t) => [t.fondoId, t]))
    }

    function cobro(datos: {
      id: string
      fondoId: string
      montoBase: number
      pagado: number
      lineas?: { concepto: "gasto_comun"; monto: number; fondoId?: string }[]
    }) {
      return {
        id: datos.id,
        comunidadId: comunidadA,
        unidadId: "u-saldo-fisync",
        periodo: "2026-03",
        concepto: "gasto_comun" as const,
        origenModulo: "FI" as const,
        fondoId: datos.fondoId,
        descripcion: `Gasto común 2026-03 (${datos.id})`,
        montoBase: datos.montoBase,
        ...(datos.lineas ? { lineas: datos.lineas } : {}),
        fechaCargo: "2026-03-01",
        fechaVencimiento: "2026-03-10",
        moras: [],
        pagos: [{ id: `pago-${datos.id}`, monto: datos.pagado, fecha: "2026-03-05", medio: "transferencia" }],
        diferencias: [],
      }
    }

    beforeAll(async () => {
      await prisma.fondoFI.createMany({
        data: [
          { id: fondoGC, comunidadId: comunidadA, nombre: "A Gasto Común SALDO", tipo: "gasto_comun", activo: true, saldoInicial: 100_000 },
          { id: fondoReserva, comunidadId: comunidadA, nombre: "B Reserva SALDO", tipo: "reserva", activo: true, saldoInicial: 0 },
          { id: fondoLegacy, comunidadId: comunidadA, nombre: "C Legacy SALDO", tipo: "gasto_comun", activo: true, saldoInicial: 0 },
        ],
      })
      await prisma.egresoFI.create({
        data: {
          id: "fe-saldo-fisync-1",
          comunidadId: comunidadA,
          folio: "FE-S001",
          fecha: "2026-03-12",
          categoria: "servicios",
          descripcion: "Agua SALDO",
          monto: 30_000,
          fondoId: fondoGC,
          esRecurrente: false,
        },
      })
      await prisma.ingresoFI.create({
        data: { id: "fi-ing-saldo-fisync-1", comunidadId: comunidadA, fecha: "2026-03-15", monto: 20_000, concepto: "Aporte manual SALDO", fondoId: fondoGC },
      })
      const montoBaseConReserva = 110_000
      await prisma.cobroFI.create({
        data: cobro({
          id: "cobro-saldo-lineas-fisync",
          fondoId: fondoGC,
          montoBase: montoBaseConReserva,
          pagado: montoBaseConReserva,
          // Presupuesto al fondo de gasto común + recargo imputado al de reserva.
          lineas: [
            { concepto: "gasto_comun", monto: 100_000, fondoId: fondoGC },
            { concepto: "gasto_comun", monto: 10_000, fondoId: fondoReserva },
          ],
        }),
      })
      await prisma.cobroFI.create({
        // Legacy: sin `lineas`, `lineasDeCobro` lo lee como una línea a su fondo.
        data: cobro({ id: "cobro-saldo-legacy-fisync", fondoId: fondoLegacy, montoBase: 50_000, pagado: 50_000 }),
      })
    })

    it("un fondo cuya única entrada es una línea pagada informa ese dinero", async () => {
      const t = await totales()
      const reserva = t.get(fondoReserva)
      expect(reserva).toBeDefined()
      // Antes del arreglo: 0 (el endpoint no miraba los cobros).
      expect(reserva!.saldo, "la línea de reserva pagada acredita al fondo de reserva").toBe(10_000)
      // Y no es ingreso manual: los contadores del envelope no cambian de forma.
      expect(reserva!.ingresos).toBe(0)
      expect(reserva!.montoIngresos).toBe(0)
      expect(reserva!.egresos).toBe(0)
      expect(reserva!.montoEgresos).toBe(0)
      expect(reserva!.saldoInicial).toBe(0)
    })

    it("la línea de reserva acredita al fondo de reserva y no al de gasto común", async () => {
      const t = await totales()
      const gc = t.get(fondoGC)
      expect(gc).toBeDefined()
      // 100.000 de apertura + 20.000 manuales + 100.000 de la línea de gasto
      // común − 30.000 de egresos. Los 10.000 de reserva NO caen acá.
      expect(gc!.saldo, "el fondo del cobro no se lleva la línea de otro fondo").toBe(190_000)
      expect(t.get(fondoReserva)!.saldo).toBe(10_000)
      // Sin el detalle, el cobro completo se habría acreditado al fondo del cobro.
      expect(gc!.saldo).not.toBe(200_000)
    })

    it("un cobro legacy sin líneas sigue acreditando su propio fondo", async () => {
      const t = await totales()
      const legacy = t.get(fondoLegacy)
      expect(legacy).toBeDefined()
      expect(legacy!.saldo, "el cobro sin detalle es una línea a su propio fondo").toBe(50_000)
      expect(t.get(fondoGC)!.saldo).toBe(190_000)
    })

    it("saldoInicial e ingresos manuales suman y los egresos restan como antes", async () => {
      const t = await totales()
      const gc = t.get(fondoGC)!
      expect(gc.saldoInicial).toBe(100_000)
      expect(gc.ingresos).toBe(1)
      expect(gc.montoIngresos).toBe(20_000)
      expect(gc.egresos).toBe(1)
      expect(gc.montoEgresos).toBe(30_000)
      expect(gc.saldo).toBe(100_000 + 20_000 + 100_000 - 30_000)
    })
  })
})
