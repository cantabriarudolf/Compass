/**
 * @vitest-environment node
 *
 * Reservas RA + acciones de ciclo de vida (cancelar / retener garantía).
 * Paridad server-side con `saveReservaRA` / `cancelarReservaRA` /
 * `retenerGarantiaRA` legacy (lib/store.ts): folio `RA-####` correlativo por
 * comunidad, snapshot tarifario del elemento, materialización del cargo al
 * Fondo de Amenities (`reserva_ra`, `penalizacion_ra`, `garantia_ra`) y UN
 * evento de auditoría por acción.
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

const comunidad = "ra-acc-comunidad-a"
const comunidadB = "ra-acc-comunidad-b"
const emailAdmin = "ra-acc-admin@test.cl"
const usuarioAdmin = "ra-acc-usuario-admin"
const emailResidente = "ra-acc-residente@test.cl"
const usuarioResidente = "ra-acc-usuario-residente"
const unidad = "ra-acc-u-1"
const persona = "ra-acc-p-1"
const fondoAmenities = "ra-acc-fondo-amenities"
const fondoGC = "ra-acc-fondo-gc"

/** Fecha ISO a N días de hoy (mismo criterio que `hoyISO()` del store). */
function enDias(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

/** Import perezoso por ruta: un módulo ausente sólo rompe sus propias pruebas. */
const rutaReservas = () => import("@/app/api/ra/reservas/route")
const rutaCancelar = () => import("@/app/api/ra/reservas/[id]/cancelar/route")
const rutaRetener = () => import("@/app/api/ra/reservas/[id]/retener/route")

type Handler = (
  req: NextRequest,
  ctx?: { params: Promise<{ id: string }> }
) => Promise<Response>

type Ctx = { params: Promise<{ id: string }> }

function pedir(path: string, body?: unknown): NextRequest {
  return new NextRequest(`http://localhost/api/${path}`, {
    method: "POST",
    ...(body !== undefined
      ? { body: JSON.stringify(body), headers: { "content-type": "application/json" } }
      : {}),
  })
}

function ctx(id: string): Ctx {
  return { params: Promise.resolve({ id }) }
}

/** Payload de reserva SIN folio ni montos: el servidor los deriva (espejo store). */
function reserva(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "ra-acc-rs-1",
    elementoId: "ra-acc-quincho",
    solicitantePersonaId: persona,
    unidadId: unidad,
    fecha: enDias(1),
    horaInicio: "19:00",
    horaFin: "22:00",
    estado: "confirmada",
    ...overrides,
  }
}

async function postReserva(body: Record<string, unknown>): Promise<Response> {
  const reservas = await rutaReservas()
  // SAFETY: POST de colección; el cast sólo adapta el import dinámico.
  const fn = (reservas as unknown as Record<string, Handler>).POST!
  return fn(pedir("ra/reservas", body))
}

function cobrosDe(origenRef: string, concepto: string) {
  return prisma.cobroFI.findMany({
    where: { comunidadId: comunidad, origenModulo: "RA", origenRef, concepto },
  })
}

function contarEventos(referenciaId: string, tipoAccion: string): Promise<number> {
  return prisma.eventoAuditoria.count({
    where: { comunidadId: { in: [comunidad, comunidadB] }, referenciaId, tipoAccion },
  })
}

async function nuevoElemento(opts: {
  id: string
  comunidadId?: string
  nombre?: string
  tarifaUso?: number
  garantiaRequerida?: number
  stock?: number
  cancelacionTardiaDias?: number
  penalizacionTardiaMonto?: number
  activo?: boolean
}): Promise<void> {
  await prisma.elementoRA.create({
    data: {
      id: opts.id,
      comunidadId: opts.comunidadId ?? comunidad,
      nombre: opts.nombre ?? `Elemento ${opts.id}`,
      tipo: "espacio_fisico",
      franja: "dia_completo",
      tarifaUso: opts.tarifaUso ?? 0,
      garantiaRequerida: opts.garantiaRequerida ?? 0,
      ...(opts.stock !== undefined ? { stock: opts.stock } : {}),
      ...(opts.cancelacionTardiaDias !== undefined
        ? { cancelacionTardiaDias: opts.cancelacionTardiaDias }
        : {}),
      ...(opts.penalizacionTardiaMonto !== undefined
        ? { penalizacionTardiaMonto: opts.penalizacionTardiaMonto }
        : {}),
      activo: opts.activo ?? true,
    },
  })
}

describe("/api/ra — reservas: folio, cobro amenities y ciclo de vida (BD real)", () => {
  beforeAll(async () => {
    process.env.AUTH_SECRET = AUTH_SECRET
    for (const [id, nombre, slug] of [
      [comunidad, "Comunidad A Acciones RA", "ra-acc-comunidad-a"],
      [comunidadB, "Comunidad B Acciones RA", "ra-acc-comunidad-b"],
    ] as const) {
      await prisma.comunidad.upsert({
        where: { id },
        update: {},
        create: { id, nombre, slug },
      })
    }
    for (const u of [
      { id: usuarioAdmin, email: emailAdmin, activo: true },
      { id: usuarioResidente, email: emailResidente, activo: true },
    ]) {
      await prisma.usuario.upsert({ where: { email: u.email }, update: {}, create: u })
    }
    await prisma.membresia.deleteMany({
      where: { usuarioId: { in: [usuarioAdmin, usuarioResidente] } },
    })
    await prisma.membresia.create({
      data: { usuarioId: usuarioAdmin, comunidadId: comunidad, rol: "administrador" },
    })
    await prisma.membresia.create({
      data: { usuarioId: usuarioResidente, comunidadId: comunidad, rol: "residente" },
    })
    await prisma.cobroFI.deleteMany({ where: { comunidadId: { in: [comunidad, comunidadB] } } })
    await prisma.eventoAuditoria.deleteMany({
      where: { comunidadId: { in: [comunidad, comunidadB] } },
    })
    await prisma.reservaRA.deleteMany({ where: { comunidadId: { in: [comunidad, comunidadB] } } })
    await prisma.elementoRA.deleteMany({ where: { comunidadId: { in: [comunidad, comunidadB] } } })
    await prisma.fondoFI.deleteMany({ where: { comunidadId: { in: [comunidad, comunidadB] } } })
    await prisma.vinculoUnidad.deleteMany({ where: { comunidadId: { in: [comunidad, comunidadB] } } })
    await prisma.persona.deleteMany({ where: { comunidadId: { in: [comunidad, comunidadB] } } })

    await prisma.persona.create({
      data: {
        id: persona,
        comunidadId: comunidad,
        rut: "11.111.111-1",
        nombreCompleto: "Solicitante Test",
        nombres: "Solicitante",
        apellidos: "Test",
        email: "ra-acc-solicitante@test.cl",
        telefonoMovil: "+56 9 1111 1111",
        estadoCuenta: "activa",
        condicionesEspecialesIds: [],
        roles: ["propietario"],
      },
    })

    // Fondo de amenities activo (destino de los cobros RA) junto a un GC para
    // probar que la resolución del fondo no toma el primero que aparezca.
    await prisma.fondoFI.create({
      data: {
        id: fondoGC,
        comunidadId: comunidad,
        nombre: "Fondo de Gasto Común",
        tipo: "gasto_comun",
        activo: true,
        saldoInicial: 0,
      },
    })
    await prisma.fondoFI.create({
      data: {
        id: fondoAmenities,
        comunidadId: comunidad,
        nombre: "Fondo de Amenities",
        tipo: "amenities",
        activo: true,
        saldoInicial: 0,
      },
    })

    await nuevoElemento({
      id: "ra-acc-quincho",
      nombre: "Quincho test",
      tarifaUso: 15_000,
      garantiaRequerida: 20_000,
      cancelacionTardiaDias: 1,
      penalizacionTardiaMonto: 5_000,
    })
    await nuevoElemento({
      id: "ra-acc-hidro",
      nombre: "Hidrolavadora test",
      tarifaUso: 5_000,
      garantiaRequerida: 30_000,
      stock: 2,
    })
    await nuevoElemento({
      id: "ra-acc-salon",
      nombre: "Salón con cancelación tardía test",
      tarifaUso: 8_000,
      garantiaRequerida: 0,
      cancelacionTardiaDias: 1,
      penalizacionTardiaMonto: 5_000,
    })
    await nuevoElemento({
      id: "ra-acc-sala",
      nombre: "Sala sin tarifa test",
      tarifaUso: 0,
      garantiaRequerida: 0,
    })
    await nuevoElemento({
      id: "ra-acc-off",
      nombre: "Bodega inactiva test",
      activo: false,
    })
  }, 30_000)

  afterAll(async () => {
    try {
      state.cookie = ""
      await prisma.cobroFI.deleteMany({ where: { comunidadId: { in: [comunidad, comunidadB] } } })
      await prisma.eventoAuditoria.deleteMany({
        where: { comunidadId: { in: [comunidad, comunidadB] } },
      })
      await prisma.reservaRA.deleteMany({
        where: { comunidadId: { in: [comunidad, comunidadB] } },
      })
      await prisma.elementoRA.deleteMany({
        where: { comunidadId: { in: [comunidad, comunidadB] } },
      })
      await prisma.fondoFI.deleteMany({ where: { comunidadId: { in: [comunidad, comunidadB] } } })
      await prisma.vinculoUnidad.deleteMany({ where: { comunidadId: { in: [comunidad, comunidadB] } } })
      await prisma.persona.deleteMany({ where: { comunidadId: { in: [comunidad, comunidadB] } } })
      await prisma.membresia.deleteMany({
        where: { usuarioId: { in: [usuarioAdmin, usuarioResidente] } },
      })
      await prisma.usuario.delete({ where: { id: usuarioAdmin } }).catch(() => {})
      await prisma.usuario.delete({ where: { id: usuarioResidente } }).catch(() => {})
      await prisma.comunidad.delete({ where: { id: comunidadB } }).catch(() => {})
      await prisma.comunidad.delete({ where: { id: comunidad } }).catch(() => {})
    } catch {
      // limpieza best-effort
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

  /** Folio correlativo esperado: max(RA-#### de la comunidad) + 1. */
  async function siguienteFolioEsperado(): Promise<string> {
    const filas = await prisma.reservaRA.findMany({
      where: { comunidadId: comunidad },
      select: { folio: true },
    })
    const numeros = filas
      .map((f) => Number.parseInt(f.folio.replace(/^RA-/, ""), 10))
      .filter((n) => Number.isFinite(n))
    const n = (numeros.length > 0 ? Math.max(...numeros) : 0) + 1
    return `RA-${String(n).padStart(4, "0")}`
  }

  describe("alta de reserva: folio y cobro", () => {
    it("sin folio: genera RA-####, snapshotea tarifa/garantía del elemento y materializa UN cobro reserva_ra", async () => {
      const esperado = await siguienteFolioEsperado()
      await conSesion(emailAdmin, async () => {
        const res = await postReserva(reserva())
        expect(res.status).toBe(201)
        const cuerpo = (await res.json()) as { folio?: string; id?: string }
        expect(cuerpo.folio).toBe(esperado)
        expect(cuerpo.folio).toMatch(/^RA-\d{4}$/)

        const enBd = await prisma.reservaRA.findUnique({ where: { id: "ra-acc-rs-1" } })
        expect(enBd?.comunidadId).toBe(comunidad)
        expect(enBd?.folio).toBe(esperado)
        // Snapshot tarifario del elemento (el cliente no envía montos).
        expect(enBd?.montoTarifa).toBe(15_000)
        expect(enBd?.montoGarantia).toBe(20_000)

        const cobros = await cobrosDe("ra-acc-rs-1", "reserva_ra")
        expect(cobros).toHaveLength(1)
        expect(cobros[0]?.fondoId).toBe(fondoAmenities)
        expect(cobros[0]?.montoBase).toBe(15_000)
        expect(cobros[0]?.unidadId).toBe(unidad)
        expect(cobros[0]?.descripcion).toContain("Quincho test")
        expect(cobros[0]?.fechaVencimiento).toBe(enDias(1))
        expect(enBd?.cargoFIReferencia).toBe(cobros[0]?.id)

        expect(await contarEventos("ra-acc-rs-1", "RA_BOOKING_CREATED")).toBe(1)
      })
    })

    it("segundo alta: folio correlativo y UN cobro por reserva", async () => {
      const esperado = await siguienteFolioEsperado()
      await conSesion(emailAdmin, async () => {
        const res = await postReserva(
          reserva({
            id: "ra-acc-rs-2",
            elementoId: "ra-acc-hidro",
            solicitantePersonaId: persona,
            fecha: enDias(3),
            horaInicio: "00:00",
            horaFin: "23:59",
          })
        )
        expect(res.status).toBe(201)
        expect(((await res.json()) as { folio?: string }).folio).toBe(esperado)
        const cobros = await cobrosDe("ra-acc-rs-2", "reserva_ra")
        expect(cobros).toHaveLength(1)
        expect(cobros[0]?.montoBase).toBe(5_000)
        expect(cobros[0]?.fondoId).toBe(fondoAmenities)
        expect(await contarEventos("ra-acc-rs-2", "RA_BOOKING_CREATED")).toBe(1)
      })
    })

    it("elemento sin tarifa: reserva confirmada SIN cobro (la tarifa en 0 no carga el fondo)", async () => {
      await conSesion(emailAdmin, async () => {
        const res = await postReserva(
          reserva({
            id: "ra-acc-rs-gratis",
            elementoId: "ra-acc-sala",
            fecha: enDias(4),
          })
        )
        expect(res.status).toBe(201)
        expect(await cobrosDe("ra-acc-rs-gratis", "reserva_ra")).toHaveLength(0)
        const enBd = await prisma.reservaRA.findUnique({
          where: { id: "ra-acc-rs-gratis" },
        })
        expect(enBd?.cargoFIReferencia).toBeNull()
        expect(enBd?.montoTarifa).toBe(0)
      })
    })
  })

  describe("guarda de concurrencia y stock", () => {
    it("solape mismo elemento/fecha → 409, sin fila ni cobro", async () => {
      await conSesion(emailAdmin, async () => {
        const res = await postReserva(
          reserva({ id: "ra-acc-rs-choque", horaInicio: "20:00", horaFin: "23:00" })
        )
        expect(res.status).toBe(409)
        expect(await prisma.reservaRA.findUnique({ where: { id: "ra-acc-rs-choque" } })).toBeNull()
        expect(await cobrosDe("ra-acc-rs-choque", "reserva_ra")).toHaveLength(0)
        expect(await contarEventos("ra-acc-rs-choque", "RA_BOOKING_CREATED")).toBe(0)
      })
    })

    it("elemento inactivo → 409 (guard intacto)", async () => {
      await conSesion(emailAdmin, async () => {
        const res = await postReserva(
          reserva({ id: "ra-acc-rs-off", elementoId: "ra-acc-off", fecha: enDias(6) })
        )
        expect(res.status).toBe(409)
      })
    })

    it("stock 2: dos reservas paralelas OK y la tercera 409 (cupo agotado)", async () => {
      const fecha = enDias(8)
      const tramo = { horaInicio: "00:00", horaFin: "23:59", elementoId: "ra-acc-hidro", fecha }
      await conSesion(emailAdmin, async () => {
        const a = await postReserva(reserva({ id: "ra-acc-rs-st1", ...tramo }))
        expect(a.status).toBe(201)
        const b = await postReserva(reserva({ id: "ra-acc-rs-st2", ...tramo }))
        expect(b.status).toBe(201)
        const c = await postReserva(reserva({ id: "ra-acc-rs-st3", ...tramo }))
        expect(c.status).toBe(409)
        expect(((await c.json()) as { error?: string }).error).toContain("Conflicto horario")
        expect(await prisma.reservaRA.findUnique({ where: { id: "ra-acc-rs-st3" } })).toBeNull()
      })
    })
  })

  describe("cancelar reserva", () => {
    it("fuera de plazo: registra penalización, UN cobro penalizacion_ra y libera el cupo", async () => {
      const cancelar = await rutaCancelar()
      await conSesion(emailAdmin, async () => {
        const alta = await postReserva(
          reserva({
            id: "ra-acc-rs-c1",
            elementoId: "ra-acc-salon",
            fecha: enDias(1),
            horaInicio: "10:00",
            horaFin: "12:00",
          })
        )
        expect(alta.status).toBe(201)

        const res = await cancelar.POST(pedir("ra/reservas/ra-acc-rs-c1"), ctx("ra-acc-rs-c1"))
        expect(res.status).toBe(200)

        const enBd = await prisma.reservaRA.findUnique({ where: { id: "ra-acc-rs-c1" } })
        expect(enBd?.estado).toBe("cancelada")
        const cancelacion = enBd?.cancelacion as
          | { tardia?: boolean; penalizacion?: number; fecha?: string }
          | null
        expect(cancelacion?.tardia).toBe(true)
        expect(cancelacion?.penalizacion).toBe(5_000)

        const penales = await cobrosDe("ra-acc-rs-c1", "penalizacion_ra")
        expect(penales).toHaveLength(1)
        expect(penales[0]?.montoBase).toBe(5_000)
        expect(penales[0]?.fondoId).toBe(fondoAmenities)
        expect(penales[0]?.descripcion).toContain("cancelación tardía")
        expect(enBd?.cargoFIReferencia).toBe(penales[0]?.id)
        expect(await contarEventos("ra-acc-rs-c1", "RA_BOOKING_CANCELLED")).toBe(1)

        // Re-cancelar no duplica penalización ni evento.
        const otra = await cancelar.POST(pedir("ra/reservas/ra-acc-rs-c1"), ctx("ra-acc-rs-c1"))
        expect(otra.status).toBe(400)
        expect(await cobrosDe("ra-acc-rs-c1", "penalizacion_ra")).toHaveLength(1)
        expect(await contarEventos("ra-acc-rs-c1", "RA_BOOKING_CANCELLED")).toBe(1)

        // El cupo queda libre: el mismo tramo se puede volver a reservar.
        const libre = await postReserva(
          reserva({
            id: "ra-acc-rs-c1-libre",
            elementoId: "ra-acc-salon",
            fecha: enDias(1),
            horaInicio: "00:00",
            horaFin: "23:59",
          })
        )
        expect(libre.status).toBe(201)
      })
    })

    it("en plazo: sin penalización ni cobro penalizacion_ra", async () => {
      const cancelar = await rutaCancelar()
      await conSesion(emailAdmin, async () => {
        const alta = await postReserva(
          reserva({ id: "ra-acc-rs-c2", fecha: enDias(9) })
        )
        expect(alta.status).toBe(201)
        const res = await cancelar.POST(pedir("ra/reservas/ra-acc-rs-c2"), ctx("ra-acc-rs-c2"))
        expect(res.status).toBe(200)
        const enBd = await prisma.reservaRA.findUnique({ where: { id: "ra-acc-rs-c2" } })
        const cancelacion = enBd?.cancelacion as
          | { tardia?: boolean; penalizacion?: number }
          | null
        expect(cancelacion?.tardia).toBe(false)
        expect(cancelacion?.penalizacion).toBeUndefined()
        expect(await cobrosDe("ra-acc-rs-c2", "penalizacion_ra")).toHaveLength(0)
        expect(await contarEventos("ra-acc-rs-c2", "RA_BOOKING_CANCELLED")).toBe(1)
      })
    })

    it("reserva inexistente en la comunidad → 404 y residente → 403", async () => {
      const cancelar = await rutaCancelar()
      await prisma.reservaRA.create({
        data: {
          id: "ra-acc-rs-otra",
          comunidadId: comunidadB,
          folio: "RA-0001",
          elementoId: "ra-acc-quincho",
          solicitantePersonaId: persona,
          unidadId: unidad,
          fecha: enDias(1),
          horaInicio: "19:00",
          horaFin: "22:00",
          estado: "confirmada",
          montoTarifa: 0,
          montoGarantia: 0,
        },
      })
      await conSesion(emailAdmin, async () => {
        const res = await cancelar.POST(
          pedir("ra/reservas/ra-acc-rs-otra"),
          ctx("ra-acc-rs-otra")
        )
        expect(res.status).toBe(404)
      })
      await conSesion(emailResidente, async () => {
        const res = await cancelar.POST(
          pedir("ra/reservas/ra-acc-rs-c1-libre"),
          ctx("ra-acc-rs-c1-libre")
        )
        expect(res.status).toBe(403)
        const enBd = await prisma.reservaRA.findUnique({
          where: { id: "ra-acc-rs-c1-libre" },
        })
        expect(enBd?.estado).toBe("confirmada")
      })
    })
  })

  describe("retener garantía", () => {
    it("retiene el monto de la reserva y materializa UN cobro garantia_ra (idempotente por procedencia)", async () => {
      const retener = await rutaRetener()
      await conSesion(emailAdmin, async () => {
        const alta = await postReserva(
          reserva({
            id: "ra-acc-rs-g1",
            elementoId: "ra-acc-hidro",
            fecha: enDias(11),
          })
        )
        expect(alta.status).toBe(201)

        const res = await retener.POST(
          pedir("ra/reservas/ra-acc-rs-g1", {
            monto: 30_000,
            motivo: "Manguera fracturada al devolver el equipo TEST.",
          }),
          ctx("ra-acc-rs-g1")
        )
        expect(res.status).toBe(200)

        const enBd = await prisma.reservaRA.findUnique({ where: { id: "ra-acc-rs-g1" } })
        const retenida = enBd?.garantiaRetenida as
          | { monto?: number; motivo?: string }
          | null
        expect(retenida?.monto).toBe(30_000)
        expect(retenida?.motivo).toContain("Manguera fracturada")

        const cobros = await cobrosDe("ra-acc-rs-g1", "garantia_ra")
        expect(cobros).toHaveLength(1)
        expect(cobros[0]?.montoBase).toBe(30_000)
        expect(cobros[0]?.fondoId).toBe(fondoAmenities)
        expect(cobros[0]?.descripcion).toContain(enBd?.folio ?? "")
        expect(enBd?.cargoFIReferencia).toBe(cobros[0]?.id)

        // Segunda retención: rechazada sin duplicar el cobro.
        const otra = await retener.POST(
          pedir("ra/reservas/ra-acc-rs-g1", { motivo: "Otro daño TEST." }),
          ctx("ra-acc-rs-g1")
        )
        expect(otra.status).toBe(400)
        expect(await cobrosDe("ra-acc-rs-g1", "garantia_ra")).toHaveLength(1)
        expect(await contarEventos("ra-acc-rs-g1", "RA_WARRANTY_RETAINED")).toBe(1)
      })
    })

    it("motivo vacío → 400 sin cobro; reserva sin garantía → 400", async () => {
      const retener = await rutaRetener()
      await conSesion(emailAdmin, async () => {
        const alta = await postReserva(
          reserva({
            id: "ra-acc-rs-g2",
            elementoId: "ra-acc-hidro",
            fecha: enDias(13),
          })
        )
        expect(alta.status).toBe(201)
        const vacio = await retener.POST(
          pedir("ra/reservas/ra-acc-rs-g2", { motivo: "   " }),
          ctx("ra-acc-rs-g2")
        )
        expect(vacio.status).toBe(400)
        expect(await cobrosDe("ra-acc-rs-g2", "garantia_ra")).toHaveLength(0)

        const bajo = await retener.POST(
          pedir("ra/reservas/ra-acc-rs-g2", { monto: 1_000, motivo: "Daño parcial TEST." }),
          ctx("ra-acc-rs-g2")
        )
        expect(bajo.status).toBe(400)
        expect(await cobrosDe("ra-acc-rs-g2", "garantia_ra")).toHaveLength(0)

        const sinGarantia = await retener.POST(
          pedir("ra/reservas/ra-acc-rs-gratis", { motivo: "Daño en sala TEST." }),
          ctx("ra-acc-rs-gratis")
        )
        expect(sinGarantia.status).toBe(400)
        expect(((await sinGarantia.json()) as { error?: string }).error).toContain(
          "no exige garantía"
        )
        expect(await contarEventos("ra-acc-rs-gratis", "RA_WARRANTY_RETAINED")).toBe(0)
      })
    })

    it("cancelada no se puede retener (solo Confirmada) → 400", async () => {
      const retener = await rutaRetener()
      await conSesion(emailAdmin, async () => {
        const res = await retener.POST(
          pedir("ra/reservas/ra-acc-rs-c2", { motivo: "Daño posterior al uso TEST." }),
          ctx("ra-acc-rs-c2")
        )
        expect(res.status).toBe(400)
        expect(await cobrosDe("ra-acc-rs-c2", "garantia_ra")).toHaveLength(0)
      })
    })
  })

  it("cada acción emite UN evento de auditoría de categoría RA, sin duplicados", async () => {
    const eventos = await prisma.eventoAuditoria.findMany({
      where: {
        comunidadId: comunidad,
        categoria: "RA",
        referenciaId: { startsWith: "ra-acc-rs-" },
      },
      select: { tipoAccion: true, referenciaId: true },
    })
    const porTipo = eventos.reduce<Record<string, number>>((acc, e) => {
      acc[e.tipoAccion] = (acc[e.tipoAccion] ?? 0) + 1
      return acc
    }, {})
    // 10 altas efectivas + 2 cancelaciones + 1 retención: ninguna acción
    // duplicó su evento (las altas rechazadas por 409 no emiten).
    expect(porTipo["RA_BOOKING_CREATED"]).toBe(10)
    expect(porTipo["RA_BOOKING_CANCELLED"]).toBe(2)
    expect(porTipo["RA_WARRANTY_RETAINED"]).toBe(1)
    const porAccion = new Map<string, number>()
    for (const e of eventos) {
      const clave = `${e.referenciaId}:${e.tipoAccion}`
      porAccion.set(clave, (porAccion.get(clave) ?? 0) + 1)
    }
    expect([...porAccion.values()].filter((n) => n !== 1)).toEqual([])
  })
})
