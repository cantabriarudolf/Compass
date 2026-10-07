/**
 * @vitest-environment node
 *
 * Acciones FI sobre un cobro: registrar pago y aplicar mora.
 * Paridad server-side con `registrarPagoFI` / `aplicarMoraFI` legacy.
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

const comunidad = "fi-acc-comunidad-a"
const comunidadB = "fi-acc-comunidad-b"
const emailAdmin = "fi-acc-admin@test.cl"
const usuarioAdmin = "fi-acc-usuario-admin"

const cargaModulos = async () => ({
  pagar: await import("@/app/api/cobros-fi/[id]/pagar/route"),
  mora: await import("@/app/api/cobros-fi/[id]/mora/route"),
})

type Ctx = { params: Promise<{ id: string }> }

function pedir(
  path: string,
  body?: unknown
): NextRequest {
  return new NextRequest(`http://localhost/api/${path}`, {
    method: "POST",
    ...(body !== undefined
      ? { body: JSON.stringify(body), headers: { "content-type": "application/json" } }
      : {}),
  })
}

async function nuevoCobro(opts: {
  id: string
  comunidadId?: string
  montoBase?: number
  fechaVencimiento?: string | null
  pagos?: unknown[]
  moras?: unknown[]
}): Promise<void> {
  await prisma.cobroFI.create({
    data: {
      id: opts.id,
      comunidadId: opts.comunidadId ?? comunidad,
      unidadId: "fi-acc-u-1",
      periodo: "2026-03",
      concepto: "gasto_comun",
      origenModulo: "manual",
      fondoId: "fi-acc-fondo",
      descripcion: "Cobro de prueba",
      montoBase: opts.montoBase ?? 100_000,
      fechaCargo: "2026-03-01",
      fechaVencimiento:
        opts.fechaVencimiento === undefined ? "2026-03-10" : opts.fechaVencimiento,
      moras: (opts.moras ?? []) as never,
      pagos: (opts.pagos ?? []) as never,
      diferencias: [],
    },
  })
}

describe("/api/cobros-fi/[id] acciones — pagar y mora (BD real)", () => {
  beforeAll(async () => {
    process.env.AUTH_SECRET = AUTH_SECRET
    for (const [id, nombre, slug] of [
      [comunidad, "Comunidad A Acciones FI", "fi-acc-comunidad-a"],
      [comunidadB, "Comunidad B Acciones FI", "fi-acc-comunidad-b"],
    ] as const) {
      await prisma.comunidad.upsert({
        where: { id },
        update: {},
        create: { id, nombre, slug },
      })
    }
    await prisma.usuario.upsert({
      where: { email: emailAdmin },
      update: {},
      create: { id: usuarioAdmin, email: emailAdmin, activo: true },
    })
    await prisma.membresia.deleteMany({ where: { usuarioId: usuarioAdmin } })
    await prisma.membresia.create({
      data: { usuarioId: usuarioAdmin, comunidadId: comunidad, rol: "administrador" },
    })
    await prisma.cobroFI.deleteMany({ where: { comunidadId: { in: [comunidad, comunidadB] } } })
    await prisma.eventoAuditoria.deleteMany({
      where: { comunidadId: { in: [comunidad, comunidadB] } },
    })
  }, 30_000)

  afterAll(async () => {
    try {
      state.cookie = ""
      await prisma.cobroFI.deleteMany({ where: { comunidadId: { in: [comunidad, comunidadB] } } })
      await prisma.eventoAuditoria.deleteMany({
        where: { comunidadId: { in: [comunidad, comunidadB] } },
      })
      await prisma.membresia.deleteMany({ where: { usuarioId: usuarioAdmin } })
      await prisma.usuario.delete({ where: { id: usuarioAdmin } }).catch(() => {})
      await prisma.comunidad.delete({ where: { id: comunidadB } }).catch(() => {})
      await prisma.comunidad.delete({ where: { id: comunidad } }).catch(() => {})
    } catch {
      // limpieza best-effort
    }
  })

  async function conSesion(fn: () => Promise<void>): Promise<void> {
    const user = await prisma.usuario.findUnique({ where: { email: emailAdmin } })
    if (!user) throw new Error("usuario admin no encontrado")
    const { cookieSesionAuthjs } = await import("../helpers/sesion-authjs")
    state.cookie = await cookieSesionAuthjs({ sub: user.id, email: user.email })
    try {
      await fn()
    } finally {
      state.cookie = ""
    }
  }

  function contarEventos(referenciaId: string, tipoAccion: string): Promise<number> {
    return prisma.eventoAuditoria.count({
      where: { comunidadId: comunidad, referenciaId, tipoAccion },
    })
  }

  it("pago por el total: registra pago y UN evento FI_RECEIVE_PAYMENT", async () => {
    const { pagar } = await cargaModulos()
    await nuevoCobro({ id: "fi-acc-cobro-pago", montoBase: 100_000 })
    await conSesion(async () => {
      const res = await pagar.POST(
        pedir("cobros-fi/fi-acc-cobro-pago/pagar", {
          monto: 100_000,
          medio: "transferencia",
        }),
        { params: Promise.resolve({ id: "fi-acc-cobro-pago" }) } as Ctx
      )
      expect(res.status).toBe(200)
      expect((await res.json()) as { ok: boolean }).toEqual({ ok: true })

      const cobro = await prisma.cobroFI.findUnique({ where: { id: "fi-acc-cobro-pago" } })
      const pagos = (cobro?.pagos ?? []) as unknown as { monto: number; medio: string }[]
      expect(pagos).toHaveLength(1)
      expect(pagos[0]?.monto).toBe(100_000)
      expect(pagos[0]?.medio).toBe("transferencia")
      expect(await contarEventos("fi-acc-cobro-pago", "FI_RECEIVE_PAYMENT")).toBe(1)
    })
  }, 20_000)

  it("pago con monto distinto al pendiente sin justificación → 400 y sin efecto", async () => {
    const { pagar } = await cargaModulos()
    await nuevoCobro({ id: "fi-acc-cobro-ajuste-malo", montoBase: 100_000 })
    await conSesion(async () => {
      const res = await pagar.POST(
        pedir("cobros-fi/fi-acc-cobro-ajuste-malo/pagar", {
          monto: 50_000,
          medio: "efectivo",
        }),
        { params: Promise.resolve({ id: "fi-acc-cobro-ajuste-malo" }) } as Ctx
      )
      expect(res.status).toBe(400)
      const cobro = await prisma.cobroFI.findUnique({ where: { id: "fi-acc-cobro-ajuste-malo" } })
      expect((cobro?.pagos as unknown as unknown[]).length).toBe(0)
      expect(await contarEventos("fi-acc-cobro-ajuste-malo", "FI_RECEIVE_PAYMENT")).toBe(0)
    })
  })

  it("pago con ajuste justificado: registra diferencia y un solo evento", async () => {
    const { pagar } = await cargaModulos()
    await nuevoCobro({ id: "fi-acc-cobro-ajuste-ok", montoBase: 100_000 })
    await conSesion(async () => {
      const res = await pagar.POST(
        pedir("cobros-fi/fi-acc-cobro-ajuste-ok/pagar", {
          monto: 90_000,
          medio: "transferencia",
          ajusteJustificacion: "Convenio de pago aprobado por la directiva",
        }),
        { params: Promise.resolve({ id: "fi-acc-cobro-ajuste-ok" }) } as Ctx
      )
      expect(res.status).toBe(200)
      const cobro = await prisma.cobroFI.findUnique({ where: { id: "fi-acc-cobro-ajuste-ok" } })
      const difs = (cobro?.diferencias ?? []) as unknown as { tipo: string; diferencia: number }[]
      expect(difs).toHaveLength(1)
      expect(difs[0]?.tipo).toBe("descuento")
      expect(difs[0]?.diferencia).toBe(10_000)
      expect(await contarEventos("fi-acc-cobro-ajuste-ok", "FI_RECEIVE_PAYMENT")).toBe(1)
    })
  })

  it("mora sobre cobro vencido: aplica mora y UN evento FI_MORA_APPLIED", async () => {
    const { mora } = await cargaModulos()
    await nuevoCobro({ id: "fi-acc-cobro-mora", montoBase: 100_000, fechaVencimiento: "2020-01-01" })
    await conSesion(async () => {
      const res = await mora.POST(
        pedir("cobros-fi/fi-acc-cobro-mora/mora", { tasaMensualPct: 1 }),
        { params: Promise.resolve({ id: "fi-acc-cobro-mora" }) } as Ctx
      )
      expect(res.status).toBe(200)
      const cobro = await prisma.cobroFI.findUnique({ where: { id: "fi-acc-cobro-mora" } })
      const moras = (cobro?.moras ?? []) as unknown as { monto: number; tasaMensualPct: number }[]
      expect(moras).toHaveLength(1)
      expect(moras[0]?.monto).toBeGreaterThan(0)
      expect(moras[0]?.tasaMensualPct).toBe(1)
      expect(await contarEventos("fi-acc-cobro-mora", "FI_MORA_APPLIED")).toBe(1)
    })
  })

  it("mora idempotente: dos llamadas dejan 1 mora y 1 evento", async () => {
    const { mora } = await cargaModulos()
    await nuevoCobro({ id: "fi-acc-cobro-mora-idem", montoBase: 80_000, fechaVencimiento: "2020-01-01" })
    await conSesion(async () => {
      const ctx = { params: Promise.resolve({ id: "fi-acc-cobro-mora-idem" }) } as Ctx
      const r1 = await mora.POST(pedir("cobros-fi/fi-acc-cobro-mora-idem/mora", { tasaMensualPct: 2 }), ctx)
      const r2 = await mora.POST(pedir("cobros-fi/fi-acc-cobro-mora-idem/mora", { tasaMensualPct: 2 }), ctx)
      expect(r1.status).toBe(200)
      expect(r2.status).toBe(200)
      const cobro = await prisma.cobroFI.findUnique({ where: { id: "fi-acc-cobro-mora-idem" } })
      expect((cobro?.moras as unknown as unknown[]).length).toBe(1)
      expect(await contarEventos("fi-acc-cobro-mora-idem", "FI_MORA_APPLIED")).toBe(1)
    })
  })

  it("cobro de otra comunidad → 404 en pagar y mora", async () => {
    const { pagar, mora } = await cargaModulos()
    await nuevoCobro({
      id: "fi-acc-cobro-otra",
      comunidadId: comunidadB,
      montoBase: 100_000,
      fechaVencimiento: "2020-01-01",
    })
    await conSesion(async () => {
      const ctx = { params: Promise.resolve({ id: "fi-acc-cobro-otra" }) } as Ctx
      const rPago = await pagar.POST(
        pedir("cobros-fi/fi-acc-cobro-otra/pagar", { monto: 100_000, medio: "transferencia" }),
        ctx
      )
      const rMora = await mora.POST(
        pedir("cobros-fi/fi-acc-cobro-otra/mora", { tasaMensualPct: 1 }),
        ctx
      )
      expect(rPago.status).toBe(404)
      expect(rMora.status).toBe(404)
      const cobro = await prisma.cobroFI.findUnique({ where: { id: "fi-acc-cobro-otra" } })
      expect((cobro?.pagos as unknown as unknown[]).length).toBe(0)
      expect((cobro?.moras as unknown as unknown[]).length).toBe(0)
    })
  })
})
