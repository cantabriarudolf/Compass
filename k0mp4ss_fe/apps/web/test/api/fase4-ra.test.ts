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

const comunidad = "fase4-ra"
const emailAdmin = "f4-ra-admin@test.cl"
const emailResidente = "f4-ra-residente@test.cl"

const cargaModulos = async () => ({
  elementos: await import("@/app/api/ra/elementos/route"),
  reservas: await import("@/app/api/ra/reservas/route"),
  reservaItem: await import("@/app/api/ra/reservas/[id]/route"),
})

type Handler = (
  req: NextRequest,
  ctx?: { params: Promise<{ id: string }> }
) => Promise<Response>

function reservaValida(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "ra-res-1",
    folio: "RA-0001",
    elementoId: "ra-elem-1",
    solicitantePersonaId: "ra-pers-1",
    fecha: "2026-04-10",
    horaInicio: "10:00",
    horaFin: "12:00",
    estado: "confirmada",
    montoTarifa: 20000,
    montoGarantia: 50000,
    ...overrides,
  }
}

describe("/api RA — reservas con guarda de concurrencia (Fase 4)", () => {
  beforeAll(async () => {
    process.env.AUTH_SECRET = AUTH_SECRET
    await prisma.comunidad.upsert({
      where: { id: comunidad },
      update: {},
      create: { id: comunidad, nombre: "Comunidad F4 RA", slug: "fase4-ra" },
    })
    for (const u of [
      { id: "f4-ra-admin", email: emailAdmin, activo: true },
      { id: "f4-ra-residente", email: emailResidente, activo: true },
    ]) {
      await prisma.usuario.upsert({ where: { email: u.email }, update: {}, create: u })
    }
    await prisma.membresia.deleteMany({
      where: { usuarioId: { in: ["f4-ra-admin", "f4-ra-residente"] } },
    })
    await prisma.membresia.create({
      data: { usuarioId: "f4-ra-admin", comunidadId: comunidad, rol: "administrador" },
    })
    await prisma.membresia.create({
      data: { usuarioId: "f4-ra-residente", comunidadId: comunidad, rol: "residente" },
    })
    await prisma.reservaRA.deleteMany({ where: { comunidadId: comunidad } })
    await prisma.elementoRA.deleteMany({ where: { comunidadId: comunidad } })
  }, 30_000)

  afterAll(async () => {
    try {
      state.cookie = ""
      await prisma.reservaRA.deleteMany({ where: { comunidadId: comunidad } })
      await prisma.elementoRA.deleteMany({ where: { comunidadId: comunidad } })
      await prisma.membresia.deleteMany({
        where: { usuarioId: { in: ["f4-ra-admin", "f4-ra-residente"] } },
      })
      for (const id of ["f4-ra-admin", "f4-ra-residente"]) {
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
    modulo: Promise<unknown>,
    metodo: "POST" | "GET" | "PUT" | "DELETE",
    path: string,
    body?: unknown
  ): Promise<Response> {
    // SAFETY: los módulos de route exportan handlers (req, ctx?) compatibles con Handler;
    // el cast solo adapta el tipo del import dinámico, nunca cambia valores.
    const m = (await modulo) as unknown as Record<string, Handler>
    // SAFETY: el path es interno del test (colección de 2 segmentos o ítem de 3, con query opcional).
    const limpio = path.split("?")[0] ?? path
    const partes = limpio.split("/")
    const id = partes[partes.length - 1] ?? ""
    const fn = m[metodo]
    if (!fn) throw new Error(`handler no encontrado: ${metodo} ${path}`)
    const esItem = metodo !== "POST" && partes.length > 2
    const req = new NextRequest(`http://localhost/api/${path}`, {
      method: metodo,
      ...(body !== undefined
        ? { body: JSON.stringify(body), headers: { "content-type": "application/json" } }
        : {}),
    })
    if (esItem) return fn(req, { params: Promise.resolve({ id }) })
    return fn(req)
  }

  it("401 sin sesión", async () => {
    const { elementos } = await cargaModulos()
    state.cookie = ""
    const get = await elementos.GET(new NextRequest("http://localhost/api/ra/elementos"))
    expect(get.status).toBe(401)
  })

  it("elemento por bloques exige duración (refine) y día completo no", async () => {
    const { elementos } = await cargaModulos()
    await conSesion(emailAdmin, async () => {
      const base = { nombre: "Quincho", tipo: "espacio_fisico", tarifaUso: 20000, garantiaRequerida: 50000, activo: true }
      const sinDuracion = await llamar(Promise.resolve(elementos), "POST", "ra/elementos", { id: "ra-elem-bad", franja: "bloques_horas", ...base })
      expect(sinDuracion.status).toBe(400)
      const ok = await llamar(Promise.resolve(elementos), "POST", "ra/elementos", { id: "ra-elem-1", franja: "bloques_horas", duracionBloqueHoras: 2, ...base })
      expect(ok.status).toBe(201)
      expect((await prisma.elementoRA.findUnique({ where: { id: "ra-elem-1" } }))?.comunidadId).toBe(comunidad)
      const dia = await llamar(Promise.resolve(elementos), "POST", "ra/elementos", { id: "ra-elem-2", nombre: "Piscina", tipo: "espacio_fisico", franja: "dia_completo", tarifaUso: 0, garantiaRequerida: 0, activo: true })
      expect(dia.status).toBe(201)
    })
  })

  it("residente crea reserva → 201 y queda en la BD", async () => {
    const { reservas } = await cargaModulos()
    await conSesion(emailResidente, async () => {
      const res = await llamar(Promise.resolve(reservas), "POST", "ra/reservas", reservaValida())
      expect(res.status).toBe(201)
      const enBd = await prisma.reservaRA.findUnique({ where: { id: "ra-res-1" } })
      expect(enBd?.comunidadId).toBe(comunidad)
      expect(enBd?.folio).toBe("RA-0001")
    })
  })

  it("reserva solapada mismo elemento/fecha → 409 (concurrencia)", async () => {
    const { reservas } = await cargaModulos()
    await conSesion(emailResidente, async () => {
      const choque = await llamar(Promise.resolve(reservas), "POST", "ra/reservas", reservaValida({ id: "ra-res-2", folio: "RA-0002", horaInicio: "11:00", horaFin: "13:00" }))
      expect(choque.status).toBe(409)
      expect(await prisma.reservaRA.findUnique({ where: { id: "ra-res-2" } })).toBeNull()
    })
  })

  it("reserva adyacente (fin == inicio) no solapa → 201", async () => {
    const { reservas } = await cargaModulos()
    await conSesion(emailResidente, async () => {
      const res = await llamar(Promise.resolve(reservas), "POST", "ra/reservas", reservaValida({ id: "ra-res-3", folio: "RA-0003", horaInicio: "12:00", horaFin: "14:00" }))
      expect(res.status).toBe(201)
    })
  })

  it("reserva solapada pero cancelada no bloquea → 201", async () => {
    const { reservas } = await cargaModulos()
    await conSesion(emailResidente, async () => {
      const res = await llamar(Promise.resolve(reservas), "POST", "ra/reservas", reservaValida({ id: "ra-res-4", folio: "RA-0004", horaInicio: "11:00", horaFin: "13:00", estado: "cancelada" }))
      expect(res.status).toBe(201)
    })
  })

  it("elemento inactivo → 409 y tramo inválido → 400", async () => {
    const { elementos, reservas } = await cargaModulos()
    await conSesion(emailAdmin, async () => {
      const off = await llamar(Promise.resolve(elementos), "POST", "ra/elementos", { id: "ra-elem-off", nombre: "Bodega", tipo: "espacio_fisico", franja: "dia_completo", tarifaUso: 0, garantiaRequerida: 0, activo: false })
      expect(off.status).toBe(201)
      const aOff = await llamar(Promise.resolve(reservas), "POST", "ra/reservas", reservaValida({ id: "ra-res-off", folio: "RA-OFF", elementoId: "ra-elem-off" }))
      expect(aOff.status).toBe(409)
      const malTramo = await llamar(Promise.resolve(reservas), "POST", "ra/reservas", reservaValida({ id: "ra-res-mal", folio: "RA-MAL", horaInicio: "14:00", horaFin: "12:00" }))
      expect(malTramo.status).toBe(400)
    })
  })

  it("upsert mismo id revalida excluyéndose → 200 (admin; residente solo crear)", async () => {
    const { reservas } = await cargaModulos()
    // El upsert sobre un id existente exige "editar" (contrato de la serie,
    // igual que la factory): residente (ra ver/crear) recibe 403.
    await conSesion(emailResidente, async () => {
      const denegado = await llamar(Promise.resolve(reservas), "POST", "ra/reservas", reservaValida({ montoTarifa: 25000 }))
      expect(denegado.status).toBe(403)
    })
    await conSesion(emailAdmin, async () => {
      const up = await llamar(Promise.resolve(reservas), "POST", "ra/reservas", reservaValida({ montoTarifa: 25000 }))
      expect(up.status).toBe(200)
      expect((await prisma.reservaRA.findUnique({ where: { id: "ra-res-1" } }))?.montoTarifa).toBe(25000)
    })
  })
})
