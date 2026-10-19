/**
 * @vitest-environment node
 *
 * api-cobertura-fase4 (SERIE-DEUDA-1 P4) — /api/cobros-fi (74.43% → medido).
 *
 * route.ts (GET paginado con filtros y ABAC residente + POST factory),
 * [id]/route.ts (GET_ONE con ABAC de unidades propias, PUT, DELETE con guard
 * 409 de pagos y Decisión 8 de cobros test), [id]/pagar y [id]/mora (reglas de
 * negocio de pago/mora). Prisma real, único mock `next/headers`.
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

const comunidadA = "cfi4-com-a"
const comunidadB = "cfi4-com-b"
const emailAdmin = "cfi4-admin@test.cl"
const emailComite = "cfi4-comite@test.cl"
const emailConserjeria = "cfi4-conserjeria@test.cl"
const emailResidente = "cfi4-residente@test.cl"
const emailResidenteSin = "cfi4-residente-sin@test.cl"

const fondoA = "cfi4-fondo-a"
const cobUno = "cfi4-cob-1"
const cobDos = "cfi4-cob-2"
const cobPagado = "cfi4-cob-pagado"
const cobSinVenc = "cfi4-cob-sinvenc"
const cobFuturo = "cfi4-cob-futuro"
const cobConPagos = "cfi4-cob-con-pagos"
const cobBorrable = "cfi4-cob-borrable"
const cobMora = "cfi4-cob-mora"
const cobTest = "test-cfi4-cob-test"
const cobAjeno = "cfi4-cob-ajeno"

type CobroSeed = {
  id: string
  comunidadId?: string
  unidadId: string
  montoBase: number
  pagos?: { id: string; monto: number; fecha: string; medio: string }[]
  fechaVencimiento?: string | null
  periodo?: string
}

function cobroSeed(c: CobroSeed) {
  return {
    id: c.id,
    comunidadId: c.comunidadId ?? comunidadA,
    unidadId: c.unidadId,
    periodo: c.periodo ?? "2026-01",
    concepto: "gasto_comun",
    origenModulo: "FI",
    fondoId: fondoA,
    descripcion: `Cobro ${c.id}`,
    montoBase: c.montoBase,
    fechaCargo: "2026-01-05",
    fechaVencimiento: c.fechaVencimiento === undefined ? "2026-01-31" : c.fechaVencimiento,
    moras: [],
    pagos: c.pagos ?? [],
    diferencias: [],
  }
}

const pago = (id: string, monto: number) => ({ id, monto, fecha: "2026-01-20", medio: "Transferencia" })

describe("/api/cobros-fi — cobros FI con BD real", () => {
  beforeAll(async () => {
    process.env.AUTH_SECRET = AUTH_SECRET
    process.env.NEXT_PUBLIC_APP_ENV = "development"
    for (const c of [
      { id: comunidadA, nombre: "Comunidad Cobros A", slug: "cfi4-a" },
      { id: comunidadB, nombre: "Comunidad Cobros B", slug: "cfi4-b" },
    ]) {
      await prisma.comunidad.upsert({ where: { id: c.id }, update: {}, create: c })
    }
    for (const u of [
      { id: "cfi4-user-admin", email: emailAdmin },
      { id: "cfi4-user-comite", email: emailComite },
      { id: "cfi4-user-conserjeria", email: emailConserjeria },
      { id: "cfi4-user-residente", email: emailResidente },
      { id: "cfi4-user-residente-sin", email: emailResidenteSin },
    ]) {
      await prisma.usuario.upsert({
        where: { email: u.email },
        update: { activo: true },
        create: { ...u, activo: true },
      })
    }
    const membresias = [
      { usuarioId: "cfi4-user-admin", comunidadId: comunidadA, rol: "administrador" },
      { usuarioId: "cfi4-user-comite", comunidadId: comunidadA, rol: "comite" },
      { usuarioId: "cfi4-user-conserjeria", comunidadId: comunidadA, rol: "conserjeria" },
      { usuarioId: "cfi4-user-residente", comunidadId: comunidadA, rol: "residente" },
      { usuarioId: "cfi4-user-residente-sin", comunidadId: comunidadA, rol: "residente" },
    ]
    await prisma.membresia.deleteMany({
      where: { usuarioId: { in: membresias.map((m) => m.usuarioId) } },
    })
    for (const m of membresias) await prisma.membresia.create({ data: m })

    await limpiar()
    await prisma.fondoFI.create({
      data: { id: fondoA, comunidadId: comunidadA, nombre: "Fondo Cobros A", tipo: "gasto_comun", activo: true, saldoInicial: 0 },
    })
    await prisma.persona.create({
      data: {
        id: "cfi4-p-1",
        comunidadId: comunidadA,
        rut: "12345678-5",
        nombreCompleto: "Residente CFI4",
        nombres: "Residente",
        apellidos: "CFI4",
        email: "cfi4-p1@test.cl",
        telefonoMovil: "+56911110000",
        estadoCuenta: "activa",
        condicionesEspecialesIds: [],
        roles: [],
      },
    })
    await prisma.unidad.create({
      data: {
        id: "cfi4-u-1",
        comunidadId: comunidadA,
        microSectorId: "cfi4-ms",
        numero: "101",
        etiqueta: "Depto 101",
        tipoUnidadId: "cfi4-tu",
        metraje: 60,
        prorrateo: 1,
        rolSii: "9000-01",
        estadoId: "cfi4-est",
        servicios: {},
      },
    })
    await prisma.unidad.create({
      data: {
        id: "cfi4-u-2",
        comunidadId: comunidadA,
        microSectorId: "cfi4-ms",
        numero: "102",
        etiqueta: "Depto 102",
        tipoUnidadId: "cfi4-tu",
        metraje: 60,
        prorrateo: 1,
        rolSii: "9000-02",
        estadoId: "cfi4-est",
        servicios: {},
      },
    })
    await prisma.vinculoUnidad.create({
      data: {
        id: "cfi4-v-1",
        comunidadId: comunidadA,
        personaId: "cfi4-p-1",
        unidadId: "cfi4-u-1",
        rol: "propietario",
        fechaInicio: "2025-01-01",
        permiteVerFinanzas: true,
      },
    })
    await prisma.usuario.update({
      where: { id: "cfi4-user-residente" },
      data: { personaId: "cfi4-p-1" },
    })

    await prisma.cobroFI.create({ data: cobroSeed({ id: cobUno, unidadId: "cfi4-u-1", montoBase: 100000 }) })
    await prisma.cobroFI.create({ data: cobroSeed({ id: cobDos, unidadId: "cfi4-u-2", montoBase: 60000 }) })
    await prisma.cobroFI.create({
      data: cobroSeed({ id: cobPagado, unidadId: "cfi4-u-2", montoBase: 50000, pagos: [pago("cfi4-pag-1", 50000)] }),
    })
    await prisma.cobroFI.create({
      data: cobroSeed({ id: cobSinVenc, unidadId: "cfi4-u-1", montoBase: 30000, fechaVencimiento: null }),
    })
    await prisma.cobroFI.create({
      data: cobroSeed({ id: cobFuturo, unidadId: "cfi4-u-1", montoBase: 30000, fechaVencimiento: "2099-01-01" }),
    })
    await prisma.cobroFI.create({
      data: cobroSeed({ id: cobConPagos, unidadId: "cfi4-u-1", montoBase: 20000, pagos: [pago("cfi4-pag-2", 5000)] }),
    })
    await prisma.cobroFI.create({ data: cobroSeed({ id: cobBorrable, unidadId: "cfi4-u-1", montoBase: 15000 }) })
    await prisma.cobroFI.create({
      data: cobroSeed({ id: cobMora, unidadId: "cfi4-u-1", montoBase: 70000, fechaVencimiento: "2026-01-01" }),
    })
    await prisma.cobroFI.create({
      data: cobroSeed({ id: cobTest, unidadId: "test-cfi4-u", montoBase: 25000, pagos: [pago("cfi4-pag-3", 25000)] }),
    })
    await prisma.cobroFI.create({
      data: {
        ...cobroSeed({ id: cobAjeno, unidadId: "cfi4-u-ajena", montoBase: 40000 }),
        comunidadId: comunidadB,
      },
    })
  }, 30_000)

  afterAll(async () => {
    state.cookie = ""
    delete process.env.NEXT_PUBLIC_APP_ENV
    await limpiar()
    await prisma.usuario.update({
      where: { id: "cfi4-user-residente" },
      data: { personaId: null },
    }).catch(() => {})
    await prisma.membresia.deleteMany({ where: { usuarioId: { startsWith: "cfi4-user-" } } })
    await prisma.usuario.deleteMany({ where: { email: { startsWith: "cfi4-" } } })
    await prisma.comunidad.deleteMany({ where: { id: { in: [comunidadA, comunidadB] } } })
  })

  async function limpiar(): Promise<void> {
    const enComunidades = { in: [comunidadA, comunidadB] }
    await prisma.eventoAuditoria.deleteMany({ where: { comunidadId: enComunidades } })
    await prisma.cobroFI.deleteMany({ where: { comunidadId: enComunidades } })
    await prisma.vinculoUnidad.deleteMany({ where: { comunidadId: enComunidades } })
    await prisma.persona.deleteMany({ where: { comunidadId: enComunidades } })
    await prisma.unidad.deleteMany({ where: { comunidadId: enComunidades } })
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

  async function coleccion(
    metodo: "GET" | "POST",
    query = "",
    body?: unknown
  ): Promise<Response> {
    const ruta = await import("@/app/api/cobros-fi/route")
    const req = new NextRequest(`http://localhost/api/cobros-fi${query}`, {
      method: metodo,
      ...(metodo === "GET"
        ? {}
        : {
            body: typeof body === "string" ? body : JSON.stringify(body ?? {}),
            headers: { "content-type": "application/json" },
          }),
    })
    return ruta[metodo](req)
  }

  async function item(
    metodo: "GET" | "PUT" | "DELETE",
    id: string,
    body?: unknown
  ): Promise<Response> {
    const ruta = await import("@/app/api/cobros-fi/[id]/route")
    const req = new NextRequest(`http://localhost/api/cobros-fi/${id}`, {
      method: metodo,
      ...(metodo === "GET" || metodo === "DELETE"
        ? {}
        : {
            body: typeof body === "string" ? body : JSON.stringify(body ?? {}),
            headers: { "content-type": "application/json" },
          }),
    })
    const handler = (ruta as unknown as Record<string, (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => Promise<Response>>)[metodo]
    if (!handler) throw new Error(`método no soportado: ${metodo}`)
    return handler(req, { params: Promise.resolve({ id }) })
  }

  async function accion(
    sufijo: "pagar" | "mora",
    id: string,
    body: unknown
  ): Promise<Response> {
    const ruta = await import(
      sufijo === "pagar" ? "@/app/api/cobros-fi/[id]/pagar/route" : "@/app/api/cobros-fi/[id]/mora/route"
    )
    const req = new NextRequest(`http://localhost/api/cobros-fi/${id}/${sufijo}`, {
      method: "POST",
      body: typeof body === "string" ? body : JSON.stringify(body ?? {}),
      headers: { "content-type": "application/json" },
    })
    return ruta.POST(req, { params: Promise.resolve({ id }) })
  }

  it("guardia de sesión: 401 sin cookie en GET, POST, GET_ONE, PUT y DELETE", async () => {
    state.cookie = ""
    expect((await coleccion("GET")).status).toBe(401)
    expect((await coleccion("POST", "", {})).status).toBe(401)
    expect((await item("GET", cobUno)).status).toBe(401)
    expect((await item("PUT", cobUno, { descripcion: "x" })).status).toBe(401)
    expect((await item("DELETE", cobUno)).status).toBe(401)
  })

  it("conserjería (sin permiso FI): GET colección → 403 y GET_ONE → 403", async () => {
    await conSesion(emailConserjeria, async () => {
      expect((await coleccion("GET")).status).toBe(403)
      expect((await item("GET", cobUno)).status).toBe(403)
    })
  })

  it("GET con URL inválida → 400", async () => {
    await conSesion(emailAdmin, async () => {
      const { GET } = await import("@/app/api/cobros-fi/route")
      const res = await GET({ url: "::" } as unknown as Request)
      expect(res.status).toBe(400)
      expect(((await res.json()) as { error: string }).error).toBe("URL de solicitud inválida.")
    })
  })

  it("residente sin ficha asociada → lista vacía", async () => {
    await conSesion(emailResidenteSin, async () => {
      const res = await coleccion("GET")
      expect(res.status).toBe(200)
      const j = (await res.json()) as { data: unknown[]; total: number }
      expect(j.data).toEqual([])
      expect(j.total).toBe(0)
    })
  })

  it("residente con vínculo activo → solo los cobros de sus unidades", async () => {
    await conSesion(emailResidente, async () => {
      const res = await coleccion("GET")
      expect(res.status).toBe(200)
      const j = (await res.json()) as { data: { id: string; unidadId: string }[]; total: number }
      expect(j.data.every((c) => c.unidadId === "cfi4-u-1")).toBe(true)
      expect(j.data.map((c) => c.id)).not.toContain(cobDos)
    })
  })

  it("GET admin con filtros ?periodo= y ?unidadId=", async () => {
    await conSesion(emailAdmin, async () => {
      const porUnidad = await coleccion("GET", "?unidadId=cfi4-u-2")
      const jUnidad = (await porUnidad.json()) as { data: { unidadId: string }[] }
      expect(jUnidad.data.every((c) => c.unidadId === "cfi4-u-2")).toBe(true)

      const porPeriodo = await coleccion("GET", "?periodo=2026-01")
      const jPeriodo = (await porPeriodo.json()) as { data: { periodo: string }[] }
      expect(jPeriodo.data.every((c) => c.periodo === "2026-01")).toBe(true)
    })
  })

  it("POST factory: comité → 403; schema inválido → 400; alta → 201", async () => {
    await conSesion(emailComite, async () => {
      const res = await coleccion("POST", "", cobroSeed({ id: "cfi4-cob-comite", unidadId: "cfi4-u-1", montoBase: 1000 }))
      expect(res.status).toBe(403)
    })
    await conSesion(emailAdmin, async () => {
      const malo = await coleccion("POST", "", { id: "cfi4-cob-malo" })
      expect(malo.status).toBe(400)
      const alta = await coleccion("POST", "", cobroSeed({ id: "cfi4-cob-nuevo", unidadId: "cfi4-u-1", montoBase: 12345 }))
      expect(alta.status).toBe(201)
      expect(await prisma.cobroFI.findUnique({ where: { id: "cfi4-cob-nuevo" } })).not.toBeNull()
      await prisma.cobroFI.delete({ where: { id: "cfi4-cob-nuevo" } })
    })
  })

  it("GET_ONE: propio → 200; ajeno/inexistente → 404; PUT parcial → 200", async () => {
    await conSesion(emailAdmin, async () => {
      expect((await item("GET", cobUno)).status).toBe(200)
      expect((await item("GET", cobAjeno)).status).toBe(404)
      expect((await item("GET", "cfi4-no-existe")).status).toBe(404)
      const put = await item("PUT", cobUno, { descripcion: "Descripción actualizada CFI4" })
      expect(put.status).toBe(200)
      expect((await prisma.cobroFI.findUnique({ where: { id: cobUno } }))?.descripcion).toBe(
        "Descripción actualizada CFI4"
      )
    })
  })

  it("GET_ONE residente: solo sus unidades (propia → 200, ajena → 403)", async () => {
    await conSesion(emailResidente, async () => {
      expect((await item("GET", cobUno)).status).toBe(200)
      const ajena = await item("GET", cobDos)
      expect(ajena.status).toBe(403)
      expect(((await ajena.json()) as { error: string }).error).toMatch(/propios cobros/)
    })
  })

  it("DELETE: comité → 403; inexistente → 404; con pagos reales → 409; sin pagos → 200", async () => {
    await conSesion(emailComite, async () => {
      expect((await item("DELETE", cobBorrable)).status).toBe(403)
    })
    await conSesion(emailAdmin, async () => {
      expect((await item("DELETE", "cfi4-no-existe")).status).toBe(404)
      const conPagos = await item("DELETE", cobConPagos)
      expect(conPagos.status).toBe(409)
      expect(((await conPagos.json()) as { error: string }).error).toMatch(/pagos/)
      expect(await prisma.cobroFI.findUnique({ where: { id: cobConPagos } })).not.toBeNull()

      const ok = await item("DELETE", cobBorrable)
      expect(ok.status).toBe(200)
      expect(await prisma.cobroFI.findUnique({ where: { id: cobBorrable } })).toBeNull()
    })
  })

  it("DELETE de un cobro test con pagos en desarrollo → 200 (Decisión 8)", async () => {
    await conSesion(emailAdmin, async () => {
      const res = await item("DELETE", cobTest)
      expect(res.status).toBe(200)
      expect(await prisma.cobroFI.findUnique({ where: { id: cobTest } })).toBeNull()
    })
  })

  // --- /api/cobros-fi/[id]/pagar ---

  it("pagar: 401, 403 comité, JSON inválido, 404 ajeno", async () => {
    state.cookie = ""
    expect((await accion("pagar", cobUno, { monto: 1000, medio: "Efectivo" })).status).toBe(401)
    await conSesion(emailComite, async () => {
      expect((await accion("pagar", cobUno, { monto: 1000, medio: "Efectivo" })).status).toBe(403)
    })
    await conSesion(emailAdmin, async () => {
      expect((await accion("pagar", cobUno, "{no-json")).status).toBe(400)
      expect((await accion("pagar", cobAjeno, { monto: 1000, medio: "Efectivo" })).status).toBe(404)
    })
  })

  it("pagar: monto inválido, medio vacío y cobro ya pagado → 400", async () => {
    await conSesion(emailAdmin, async () => {
      const sinMonto = await accion("pagar", cobDos, { monto: 0, medio: "Efectivo" })
      expect(sinMonto.status).toBe(400)
      expect(((await sinMonto.json()) as { error: string }).error).toMatch(/monto/)

      const sinMedio = await accion("pagar", cobDos, { monto: 1000, medio: "  " })
      expect(sinMedio.status).toBe(400)
      expect(((await sinMedio.json()) as { error: string }).error).toMatch(/medio de pago/)

      const yaPagado = await accion("pagar", cobPagado, { monto: 1000, medio: "Efectivo" })
      expect(yaPagado.status).toBe(400)
      expect(((await yaPagado.json()) as { error: string }).error).toMatch(/completamente pagado/)
    })
  })

  it("pagar: ajuste sin justificación y con justificación corta → 400", async () => {
    await conSesion(emailAdmin, async () => {
      const sinJust = await accion("pagar", cobDos, { monto: 55000, medio: "Efectivo" })
      expect(sinJust.status).toBe(400)
      expect(((await sinJust.json()) as { error: string }).error).toMatch(/justificación obligatoria/)

      const corta = await accion("pagar", cobDos, { monto: 55000, medio: "Efectivo", ajusteJustificacion: "corto" })
      expect(corta.status).toBe(400)
      expect(((await corta.json()) as { error: string }).error).toMatch(/10 caracteres/)
    })
  })

  it("pagar: monto exacto → 200 con pago y evento; ajuste justificado → 200 con diferencia", async () => {
    await conSesion(emailAdmin, async () => {
      const exacto = await accion("pagar", cobUno, { monto: 100000, medio: "Transferencia" })
      expect(exacto.status).toBe(200)
      const enBd = await prisma.cobroFI.findUnique({ where: { id: cobUno } })
      expect((enBd?.pagos as unknown[] | null)?.length).toBe(1)
      expect(
        await prisma.eventoAuditoria.count({ where: { referenciaId: cobUno, tipoAccion: "FI_RECEIVE_PAYMENT" } })
      ).toBe(1)

      const ajuste = await accion("pagar", cobDos, {
        monto: 55000,
        medio: "Efectivo",
        ajusteJustificacion: "Pago parcial acordado con el residente",
      })
      expect(ajuste.status).toBe(200)
      const conDif = await prisma.cobroFI.findUnique({ where: { id: cobDos } })
      expect((conDif?.diferencias as unknown[] | null)?.length).toBe(1)
    })
  })

  // --- /api/cobros-fi/[id]/mora ---

  it("mora: 401, 403 comité, JSON inválido, 404 ajeno, sin vencimiento → 400", async () => {
    state.cookie = ""
    expect((await accion("mora", cobUno, {})).status).toBe(401)
    await conSesion(emailComite, async () => {
      expect((await accion("mora", cobUno, {})).status).toBe(403)
    })
    await conSesion(emailAdmin, async () => {
      expect((await accion("mora", cobUno, "{no-json")).status).toBe(400)
      expect((await accion("mora", cobAjeno, {})).status).toBe(404)

      const sinVenc = await accion("mora", cobSinVenc, {})
      expect(sinVenc.status).toBe(400)
      expect(((await sinVenc.json()) as { error: string }).error).toMatch(/fecha de vencimiento/)
    })
  })

  it("mora: tasa inválida, cobro no vencido y cobro pagado → 400", async () => {
    await conSesion(emailAdmin, async () => {
      const tasa = await accion("mora", cobMora, { tasaMensualPct: 0 })
      expect(tasa.status).toBe(400)
      expect(((await tasa.json()) as { error: string }).error).toMatch(/tasa de mora/)

      const noVencido = await accion("mora", cobFuturo, {})
      expect(noVencido.status).toBe(400)
      expect(((await noVencido.json()) as { error: string }).error).toMatch(/no está vencido/)

      const pagado = await accion("mora", cobPagado, {})
      expect(pagado.status).toBe(400)
      expect(((await pagado.json()) as { error: string }).error).toMatch(/completamente pagado/)
    })
  })

  it("mora: aplica una vez al día (idempotente) y emite FI_MORA_APPLIED", async () => {
    await conSesion(emailAdmin, async () => {
      const primera = await accion("mora", cobMora, { tasaMensualPct: 1 })
      expect(primera.status).toBe(200)

      const repetida = await accion("mora", cobMora, { tasaMensualPct: 1 })
      expect(repetida.status).toBe(200)

      const enBd = await prisma.cobroFI.findUnique({ where: { id: cobMora } })
      expect((enBd?.moras as unknown[] | null)?.length).toBe(1)
      expect(
        await prisma.eventoAuditoria.count({ where: { referenciaId: cobMora, tipoAccion: "FI_MORA_APPLIED" } })
      ).toBe(1)
    })
  })
})
