/**
 * @vitest-environment node
 *
 * `/api/mt/garantias/verificar` — alertas de garantías MT.
 *
 * La verificación corre tanto desde este POST como al leer `GET /api/mt/trabajos`
 * (decisión del owner 2026-10-22). Lo que se fija acá:
 * - Authz `mt` editar (conserjería no tiene `mt`: 403).
 * - Solo trabajos `finalizado` con `garantiaFin` vencida o por vencer (30 días).
 * - Candado exactly-once: dos POST seguidos emiten alerta una sola vez.
 * - Scoping: un trabajo vencido de otra comunidad no se alerta desde acá.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest"
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

const comunidad = "mtgar-comunidad-a"
const otraComunidad = "mtgar-comunidad-b"
const emailAdmin = "mtgar-admin@test.cl"
const emailMantencion = "mtgar-mantencion@test.cl"
const emailConserje = "mtgar-conserje@test.cl"
const emailResidente = "mtgar-residente@test.cl"

const idDe = (email: string): string => email.split("@")[0] ?? email

const dia = (offset: number): string =>
  new Date(Date.now() + offset * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

async function conSesion(email: string, fn: () => Promise<void>): Promise<void> {
  const usuario = await prisma.usuario.findUnique({ where: { email } })
  if (!usuario) throw new Error(`usuario no encontrado: ${email}`)
  const { cookieSesionAuthjs } = await import("../helpers/sesion-authjs")
  state.cookie = await cookieSesionAuthjs({ sub: usuario.id, email: usuario.email })
  try {
    await fn()
  } finally {
    state.cookie = ""
  }
}

async function verificar(): Promise<Response> {
  const { POST } = await import("@/app/api/mt/garantias/verificar/route")
  return POST()
}

const trabajo = (
  id: string,
  comunidadId: string,
  garantiaFin: string | null,
  estado = "finalizado"
): Promise<unknown> =>
  prisma.trabajoMT.create({
    data: {
      id,
      comunidadId,
      folio: `MT-${id}`,
      titulo: `Trabajo ${id}`,
      descripcion: "Reparación con garantía del proveedor",
      prioridad: "media",
      estado,
      costoTotal: 100_000,
      origenFondos: "gasto_comun",
      estadoPago: "pagado",
      garantiaFin,
      alertaGarantiaEnviada: false,
      evidencias: [],
    },
  })

describe("POST /api/mt/garantias/verificar — alertas de garantía scoped", () => {
  beforeAll(async () => {
    process.env.AUTH_SECRET = AUTH_SECRET
    for (const [id, slug] of [
      [comunidad, "mtgar-a"],
      [otraComunidad, "mtgar-b"],
    ] as const) {
      await prisma.comunidad.upsert({
        where: { id },
        update: {},
        create: { id, nombre: `Comunidad ${id}`, slug },
      })
    }
    const usuarios: Array<[string, string, string]> = [
      [emailAdmin, "administrador", comunidad],
      [emailMantencion, "mantencion", comunidad],
      [emailConserje, "conserjeria", comunidad],
      [emailResidente, "residente", comunidad],
    ]
    for (const [email, rol, comunidadId] of usuarios) {
      await prisma.usuario.upsert({
        where: { email },
        update: {},
        create: { id: idDe(email), email, activo: true },
      })
      await prisma.membresia.deleteMany({ where: { usuarioId: idDe(email) } })
      await prisma.membresia.create({
        data: { usuarioId: idDe(email), comunidadId, rol },
      })
    }
  }, 30_000)

  beforeEach(async () => {
    state.cookie = ""
    await prisma.trabajoMT.deleteMany({
      where: { comunidadId: { in: [comunidad, otraComunidad] } },
    })
    await prisma.eventoAuditoria.deleteMany({
      where: { comunidadId: { in: [comunidad, otraComunidad] }, categoria: "MT" },
    })
    await trabajo("mtgar-vencida", comunidad, dia(-3))
    await trabajo("mtgar-por-vencer", comunidad, dia(10))
    await trabajo("mtgar-lejana", comunidad, dia(100))
    await trabajo("mtgar-no-finalizada", comunidad, dia(-3), "planificado")
    await trabajo("mtgar-b-vencida", otraComunidad, dia(-3))
  })

  afterAll(async () => {
    try {
      state.cookie = ""
      await prisma.trabajoMT.deleteMany({
        where: { comunidadId: { in: [comunidad, otraComunidad] } },
      })
      await prisma.eventoAuditoria.deleteMany({
        where: { comunidadId: { in: [comunidad, otraComunidad] }, categoria: "MT" },
      })
      for (const email of [emailAdmin, emailMantencion, emailConserje, emailResidente]) {
        await prisma.membresia.deleteMany({ where: { usuarioId: idDe(email) } })
        await prisma.usuario.delete({ where: { id: idDe(email) } }).catch(() => {})
      }
      await prisma.comunidad.delete({ where: { id: otraComunidad } }).catch(() => {})
      await prisma.comunidad.delete({ where: { id: comunidad } }).catch(() => {})
    } catch {
      // limpieza best-effort
    }
  })

  it("sin sesión → 401", async () => {
    state.cookie = ""
    const res = await verificar()
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: "No autenticado." })
  })

  it("conserjería no tiene mt → 403", async () => {
    await conSesion(emailConserje, async () => {
      const res = await verificar()
      expect(res.status).toBe(403)
      expect(await res.json()).toEqual({ error: "Permiso denegado." })
    })
  })

  it("residente no tiene mt → 403", async () => {
    await conSesion(emailResidente, async () => {
      expect((await verificar()).status).toBe(403)
    })
  })

  it("admin alerta la vencida y la por vencer (2), no las demás → { ok, alertadas: 2 }", async () => {
    await conSesion(emailAdmin, async () => {
      const res = await verificar()
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ ok: true, alertadas: 2 })

      const eventos = await prisma.eventoAuditoria.findMany({
        where: { comunidadId: comunidad, tipoAccion: "MT_GUARANTEE_EXPIRED" },
        orderBy: { referenciaId: "asc" },
      })
      expect(eventos.map((e) => e.referenciaId)).toEqual([
        "mtgar-por-vencer",
        "mtgar-vencida",
      ])
      expect(eventos.map((e) => e.categoria)).toEqual(["MT", "MT"])
      const porVencer = eventos.find((e) => e.referenciaId === "mtgar-por-vencer")
      const vencida = eventos.find((e) => e.referenciaId === "mtgar-vencida")
      expect(porVencer?.descripcion).toContain("por expirar")
      expect(vencida?.descripcion).toContain("VENCIDA")

      const marcas = await prisma.trabajoMT.findMany({
        where: { id: { in: ["mtgar-vencida", "mtgar-por-vencer", "mtgar-lejana", "mtgar-no-finalizada"] } },
        select: { id: true, alertaGarantiaEnviada: true },
      })
      const marcado = Object.fromEntries(marcas.map((t) => [t.id, t.alertaGarantiaEnviada]))
      expect(marcado).toEqual({
        "mtgar-vencida": true,
        "mtgar-por-vencer": true,
        "mtgar-lejana": false,
        "mtgar-no-finalizada": false,
      })
    })
  })

  it("segunda verificación no duplica la alerta (candado exactly-once) → alertadas 0", async () => {
    await conSesion(emailAdmin, async () => {
      expect(await (await verificar()).json()).toEqual({ ok: true, alertadas: 2 })
      expect(await (await verificar()).json()).toEqual({ ok: true, alertadas: 0 })
      const total = await prisma.eventoAuditoria.count({
        where: { comunidadId: comunidad, tipoAccion: "MT_GUARANTEE_EXPIRED" },
      })
      expect(total).toBe(2)
    })
  })

  it("mantención tiene mt editar → puede verificar y alertar las pendientes", async () => {
    await conSesion(emailMantencion, async () => {
      await trabajo("mtgar-mant-nueva", comunidad, dia(-1))
      const res = await verificar()
      expect(res.status).toBe(200)
      // Las dos del `beforeEach` (vencida y por vencer) más esta nueva.
      expect(await res.json()).toEqual({ ok: true, alertadas: 3 })
      const alertada = await prisma.eventoAuditoria.count({
        where: { comunidadId: comunidad, referenciaId: "mtgar-mant-nueva" },
      })
      expect(alertada).toBe(1)
    })
  })

  it("no alerta la garantía vencida de otra comunidad", async () => {
    await conSesion(emailAdmin, async () => {
      await verificar()
      const ajena = await prisma.trabajoMT.findUnique({
        where: { id: "mtgar-b-vencida" },
        select: { alertaGarantiaEnviada: true },
      })
      expect(ajena?.alertaGarantiaEnviada).toBe(false)
      const eventosAjenos = await prisma.eventoAuditoria.count({
        where: { comunidadId: otraComunidad, tipoAccion: "MT_GUARANTEE_EXPIRED" },
      })
      expect(eventosAjenos).toBe(0)
    })
  })
})
