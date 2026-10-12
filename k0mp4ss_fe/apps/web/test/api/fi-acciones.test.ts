/**
 * @vitest-environment node
 *
 * Acciones FI sobre cobros y fondos: registrar pago, aplicar mora y retirar
 * fondo. Paridad server-side con `registrarPagoFI` / `aplicarMoraFI` /
 * `retirarFondoFI` legacy.
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
  retirar: await import("@/app/api/fondos-fi/[id]/retirar/route"),
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
  unidadId?: string
  montoBase?: number
  fechaVencimiento?: string | null
  pagos?: unknown[]
  moras?: unknown[]
}): Promise<void> {
  await prisma.cobroFI.create({
    data: {
      id: opts.id,
      comunidadId: opts.comunidadId ?? comunidad,
      unidadId: opts.unidadId ?? "fi-acc-u-1",
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

async function nuevoFondo(opts: {
  id: string
  comunidadId?: string
  tipo?: string
  nombre?: string
  activo?: boolean
  saldoInicial?: number
}): Promise<void> {
  await prisma.fondoFI.create({
    data: {
      id: opts.id,
      comunidadId: opts.comunidadId ?? comunidad,
      nombre: opts.nombre ?? `Fondo ${opts.id}`,
      tipo: opts.tipo ?? "gasto_comun",
      activo: opts.activo ?? true,
      saldoInicial: opts.saldoInicial ?? 0,
    },
  })
}

/** Saldo del fondo leído de BD: saldoInicial + ingresos manuales - egresos. */
async function saldoEnBd(fondoId: string): Promise<number> {
  const fondo = await prisma.fondoFI.findUnique({ where: { id: fondoId } })
  const ingresos = await prisma.ingresoFI.findMany({ where: { fondoId } })
  const egresos = await prisma.egresoFI.findMany({ where: { fondoId } })
  return (
    (fondo?.saldoInicial ?? 0) +
    ingresos.reduce((acc, i) => acc + i.monto, 0) -
    egresos.reduce((acc, e) => acc + e.monto, 0)
  )
}

async function nuevaActa(opts: {
  id: string
  estado: string
  comunidadId?: string
}): Promise<void> {
  await prisma.actaGD.create({
    data: {
      id: opts.id,
      comunidadId: opts.comunidadId ?? comunidad,
      fecha: "2026-03-05",
      hora: "19:00",
      lugar: "Sede comunitaria",
      tablaTemas: ["Retiro de fondo"],
      presentes: [],
      ausentes: [],
      invitados: [],
      minuta: "Se aprueba el retiro de fondos.",
      adjuntos: [],
      estado: opts.estado,
      aprobaciones: [],
    },
  })
}

describe("/api/cobros-fi y /api/fondos-fi acciones — pagar, mora y retiro (BD real)", () => {
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
    await prisma.egresoFI.deleteMany({ where: { comunidadId: { in: [comunidad, comunidadB] } } })
    await prisma.ingresoFI.deleteMany({ where: { comunidadId: { in: [comunidad, comunidadB] } } })
    await prisma.fondoFI.deleteMany({ where: { comunidadId: { in: [comunidad, comunidadB] } } })
    await prisma.actaGD.deleteMany({ where: { comunidadId: { in: [comunidad, comunidadB] } } })
  }, 30_000)

  afterAll(async () => {
    try {
      state.cookie = ""
      await prisma.cobroFI.deleteMany({ where: { comunidadId: { in: [comunidad, comunidadB] } } })
      await prisma.eventoAuditoria.deleteMany({
        where: { comunidadId: { in: [comunidad, comunidadB] } },
      })
      await prisma.egresoFI.deleteMany({ where: { comunidadId: { in: [comunidad, comunidadB] } } })
      await prisma.ingresoFI.deleteMany({ where: { comunidadId: { in: [comunidad, comunidadB] } } })
      await prisma.fondoFI.deleteMany({ where: { comunidadId: { in: [comunidad, comunidadB] } } })
      await prisma.actaGD.deleteMany({ where: { comunidadId: { in: [comunidad, comunidadB] } } })
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

  describe("retiro de fondo FI", () => {
    it("retiro ok: crea egreso uso_de_fondo, UN evento y el saldo decrece", async () => {
      const { retirar } = await cargaModulos()
      await nuevoFondo({ id: "fi-acc-fondo-retiro", saldoInicial: 500_000 })
      await prisma.ingresoFI.create({
        data: {
          id: "fi-acc-ing-retiro",
          comunidadId: comunidad,
          fondoId: "fi-acc-fondo-retiro",
          fecha: "2026-03-02",
          monto: 50_000,
          concepto: "Aporte extraordinario",
        },
      })
      await conSesion(async () => {
        const res = await retirar.POST(
          pedir("fondos-fi/fi-acc-fondo-retiro/retirar", {
            monto: 120_000,
            descripcion: "Compra de ampolletas LED para pasillos",
          }),
          { params: Promise.resolve({ id: "fi-acc-fondo-retiro" }) } as Ctx
        )
        expect(res.status).toBe(200)
        const json = (await res.json()) as { ok: boolean; egresoId: string }
        expect(json.ok).toBe(true)

        const egreso = await prisma.egresoFI.findUnique({
          where: { id: json.egresoId },
        })
        expect(egreso?.categoria).toBe("uso_de_fondo")
        expect(egreso?.fondoId).toBe("fi-acc-fondo-retiro")
        expect(egreso?.monto).toBe(120_000)
        expect(egreso?.esRecurrente).toBe(false)
        expect(egreso?.folio).toMatch(/^FE-\d{4}$/)
        expect(await contarEventos(json.egresoId, "FI_FUND_WITHDRAWN")).toBe(1)
        expect(await saldoEnBd("fi-acc-fondo-retiro")).toBe(430_000)
      })
    }, 20_000)

    it("retiro con monto mayor al saldo → 400 sin efectos", async () => {
      const { retirar } = await cargaModulos()
      await nuevoFondo({ id: "fi-acc-fondo-sin-saldo", saldoInicial: 100_000 })
      const egresosAntes = await prisma.egresoFI.count({
        where: { comunidadId: comunidad },
      })
      const eventosAntes = await prisma.eventoAuditoria.count({
        where: { comunidadId: comunidad, tipoAccion: "FI_FUND_WITHDRAWN" },
      })
      await conSesion(async () => {
        const res = await retirar.POST(
          pedir("fondos-fi/fi-acc-fondo-sin-saldo/retirar", {
            monto: 150_000,
            descripcion: "Retiro por sobre el saldo disponible",
          }),
          { params: Promise.resolve({ id: "fi-acc-fondo-sin-saldo" }) } as Ctx
        )
        expect(res.status).toBe(400)
        expect(
          await prisma.egresoFI.count({ where: { fondoId: "fi-acc-fondo-sin-saldo" } })
        ).toBe(0)
        expect(
          await prisma.egresoFI.count({ where: { comunidadId: comunidad } })
        ).toBe(egresosAntes)
        expect(
          await prisma.eventoAuditoria.count({
            where: { comunidadId: comunidad, tipoAccion: "FI_FUND_WITHDRAWN" },
          })
        ).toBe(eventosAntes)
      })
    }, 20_000)

    it("retiro con descripción vacía o fondo inactivo → 400 sin egreso", async () => {
      const { retirar } = await cargaModulos()
      await nuevoFondo({ id: "fi-acc-fondo-desc-vacia", saldoInicial: 100_000 })
      await nuevoFondo({
        id: "fi-acc-fondo-inactivo",
        nombre: "Fondo Inactivo",
        activo: false,
        saldoInicial: 100_000,
      })
      await conSesion(async () => {
        const rVacia = await retirar.POST(
          pedir("fondos-fi/fi-acc-fondo-desc-vacia/retirar", {
            monto: 10_000,
            descripcion: "   ",
          }),
          { params: Promise.resolve({ id: "fi-acc-fondo-desc-vacia" }) } as Ctx
        )
        const rInactivo = await retirar.POST(
          pedir("fondos-fi/fi-acc-fondo-inactivo/retirar", {
            monto: 10_000,
            descripcion: "Retiro sobre fondo inactivo",
          }),
          { params: Promise.resolve({ id: "fi-acc-fondo-inactivo" }) } as Ctx
        )
        expect(rVacia.status).toBe(400)
        expect(rInactivo.status).toBe(400)
        expect(
          await prisma.egresoFI.count({
            where: {
              fondoId: { in: ["fi-acc-fondo-desc-vacia", "fi-acc-fondo-inactivo"] },
            },
          })
        ).toBe(0)
      })
    }, 20_000)

    it("retiro de fondo de reserva sin acta → 400 sin egreso", async () => {
      const { retirar } = await cargaModulos()
      await nuevoFondo({
        id: "fi-acc-fondo-reserva",
        tipo: "reserva",
        nombre: "Fondo de Reserva",
        saldoInicial: 400_000,
      })
      await conSesion(async () => {
        const res = await retirar.POST(
          pedir("fondos-fi/fi-acc-fondo-reserva/retirar", {
            monto: 50_000,
            descripcion: "Reparación de ascensor sin respaldo",
          }),
          { params: Promise.resolve({ id: "fi-acc-fondo-reserva" }) } as Ctx
        )
        expect(res.status).toBe(400)
        expect(
          await prisma.egresoFI.count({ where: { fondoId: "fi-acc-fondo-reserva" } })
        ).toBe(0)
      })
    }, 20_000)

    it("retiro de fondo de reserva con acta publicada → 200 y acta referenciada", async () => {
      const { retirar } = await cargaModulos()
      await nuevoFondo({
        id: "fi-acc-fondo-reserva-ok",
        tipo: "reserva",
        nombre: "Fondo de Reserva Aprobado",
        saldoInicial: 400_000,
      })
      await nuevaActa({ id: "fi-acc-acta-pub", estado: "publicada" })
      await conSesion(async () => {
        const res = await retirar.POST(
          pedir("fondos-fi/fi-acc-fondo-reserva-ok/retirar", {
            monto: 50_000,
            descripcion: "Reparación de ascensor aprobada en asamblea",
            aprobacionActaGDId: "fi-acc-acta-pub",
          }),
          { params: Promise.resolve({ id: "fi-acc-fondo-reserva-ok" }) } as Ctx
        )
        expect(res.status).toBe(200)
        const json = (await res.json()) as { egresoId: string }
        const egreso = await prisma.egresoFI.findUnique({ where: { id: json.egresoId } })
        expect(egreso?.aprobacionActaGDId).toBe("fi-acc-acta-pub")
        expect(await contarEventos(json.egresoId, "FI_FUND_WITHDRAWN")).toBe(1)
      })
    }, 20_000)

    it("retiro de fondo de reserva con acta en borrador → 400 sin egreso", async () => {
      const { retirar } = await cargaModulos()
      await nuevoFondo({
        id: "fi-acc-fondo-reserva-borrador",
        tipo: "reserva",
        nombre: "Fondo de Reserva Borrador",
        saldoInicial: 400_000,
      })
      await nuevaActa({ id: "fi-acc-acta-borrador", estado: "borrador" })
      await conSesion(async () => {
        const res = await retirar.POST(
          pedir("fondos-fi/fi-acc-fondo-reserva-borrador/retirar", {
            monto: 50_000,
            descripcion: "Retiro con acta no publicada",
            aprobacionActaGDId: "fi-acc-acta-borrador",
          }),
          { params: Promise.resolve({ id: "fi-acc-fondo-reserva-borrador" }) } as Ctx
        )
        expect(res.status).toBe(400)
        expect(
          await prisma.egresoFI.count({
            where: { fondoId: "fi-acc-fondo-reserva-borrador" },
          })
        ).toBe(0)
      })
    }, 20_000)

    it("fondo de otra comunidad → 404 sin egreso", async () => {
      const { retirar } = await cargaModulos()
      await nuevoFondo({
        id: "fi-acc-fondo-otra",
        comunidadId: comunidadB,
        saldoInicial: 300_000,
      })
      await conSesion(async () => {
        const res = await retirar.POST(
          pedir("fondos-fi/fi-acc-fondo-otra/retirar", {
            monto: 10_000,
            descripcion: "Retiro cross-comunidad",
          }),
          { params: Promise.resolve({ id: "fi-acc-fondo-otra" }) } as Ctx
        )
        expect(res.status).toBe(404)
        expect(
          await prisma.egresoFI.count({ where: { fondoId: "fi-acc-fondo-otra" } })
        ).toBe(0)
      })
    }, 20_000)
  })

  describe("DELETE /api/cobros-fi/[id] — Decisión 8 (bypass TEST sólo en desarrollo)", () => {
    const pagos = [
      { id: "fi-acc-pago-1", monto: 5_000, medio: "efectivo", fecha: "2026-03-01" },
    ]

    async function borrar(id: string): Promise<Response> {
      const { DELETE } = await import("@/app/api/cobros-fi/[id]/route")
      return DELETE(
        new NextRequest(`http://localhost/api/cobros-fi/${id}`, { method: "DELETE" }),
        { params: Promise.resolve({ id }) } as Ctx
      )
    }

    async function conAppEnv(env: string, fn: () => Promise<void>): Promise<void> {
      const original = process.env.NEXT_PUBLIC_APP_ENV
      process.env.NEXT_PUBLIC_APP_ENV = env
      try {
        await fn()
      } finally {
        if (original === undefined) delete process.env.NEXT_PUBLIC_APP_ENV
        else process.env.NEXT_PUBLIC_APP_ENV = original
      }
    }

    it("cobro TEST con pagos en desarrollo → 200 y se elimina", async () => {
      await nuevoCobro({ id: "fi-acc-cobro-test-del", unidadId: "test-u-999", pagos })
      await conAppEnv("development", async () => {
        await conSesion(async () => {
          const res = await borrar("fi-acc-cobro-test-del")
          expect(res.status).toBe(200)
          expect(
            await prisma.cobroFI.findUnique({ where: { id: "fi-acc-cobro-test-del" } })
          ).toBeNull()
        })
      })
    }, 20_000)

    it("cobro real con pagos → 409 y se conserva", async () => {
      await nuevoCobro({ id: "fi-acc-cobro-real-del", pagos })
      await conAppEnv("development", async () => {
        await conSesion(async () => {
          const res = await borrar("fi-acc-cobro-real-del")
          expect(res.status).toBe(409)
          expect(
            await prisma.cobroFI.findUnique({ where: { id: "fi-acc-cobro-real-del" } })
          ).not.toBeNull()
        })
      })
    }, 20_000)

    it("cobro TEST con pagos en producción → 409 y se conserva", async () => {
      await nuevoCobro({ id: "fi-acc-cobro-test-prod", unidadId: "test-u-999", pagos })
      await conAppEnv("production", async () => {
        await conSesion(async () => {
          const res = await borrar("fi-acc-cobro-test-prod")
          expect(res.status).toBe(409)
          expect(
            await prisma.cobroFI.findUnique({ where: { id: "fi-acc-cobro-test-prod" } })
          ).not.toBeNull()
        })
      })
    }, 20_000)
  })
})
