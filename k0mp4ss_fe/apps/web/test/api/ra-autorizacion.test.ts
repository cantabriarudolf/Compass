/**
 * @vitest-environment node
 *
 * Alerta de reservas RA: la cola de autorización del administrador
 * (`GET /api/ra/reservas/solicitadas`) y las dos decisiones que la cierran
 * (`POST .../[id]/autorizar` y `POST .../[id]/rechazar`).
 *
 * Qué se fija acá:
 * - la solicitud NO es deuda: el alta no materializa el cargo, autorizarla sí
 *   (un cobro `reserva_ra` al Fondo de Amenities, idempotente por procedencia) y
 *   rechazarla deja el fondo como estaba;
 * - estado y cargo cambian exactly-once: repetir la decisión no duplica ni el
 *   cobro ni el evento de auditoría;
 * - la cola solo muestra lo que está en `solicitada` de la comunidad del
 *   administrador, con los rótulos resueltos (elemento, solicitante, unidad).
 *
 * El cobro de RA lo construye `app/api/ra/_acciones.ts` con
 * `CobroFIEscrituraCompletaSchema` (contrato de escritura del cobro separado del
 * de lectura, S5); estas rutas son su único consumidor y sin ellas esa
 * validación no se ejercita.
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

const comunidad = "ra-aut-comunidad-a"
const comunidadB = "ra-aut-comunidad-b"
const emailAdmin = "ra-aut-admin@test.cl"
const usuarioAdmin = "ra-aut-usuario-admin"
const emailResidente = "ra-aut-residente@test.cl"
const usuarioResidente = "ra-aut-usuario-residente"
const unidad = "ra-aut-u-1"
const unidadVinculo = "ra-aut-u-2"
const persona = "ra-aut-p-solicitante"
const personaSinUnidad = "ra-aut-p-sin-unidad"
const fondoAmenities = "ra-aut-fondo-amenities"
const fondoGC = "ra-aut-fondo-gc"
const elemento = "ra-aut-quincho"

const rutaSolicitadas = () => import("@/app/api/ra/reservas/solicitadas/route")
const rutaAutorizar = () => import("@/app/api/ra/reservas/[id]/autorizar/route")
const rutaRechazar = () => import("@/app/api/ra/reservas/[id]/rechazar/route")

type Handler = (
  req: NextRequest,
  ctx?: { params: Promise<{ id: string }> }
) => Promise<Response>

type Ctx = { params: Promise<{ id: string }> }

function ctx(id: string): Ctx {
  return { params: Promise.resolve({ id }) }
}

function pedir(path: string, body?: unknown): NextRequest {
  return new NextRequest(`http://localhost/api/${path}`, {
    method: "POST",
    ...(body === undefined
      ? {}
      : {
          body: typeof body === "string" ? body : JSON.stringify(body),
          headers: { "content-type": "application/json" },
        }),
  })
}

function pedirGet(path: string): NextRequest {
  return new NextRequest(`http://localhost/api/${path}`)
}

async function post(ruta: () => Promise<unknown>, path: string, id: string, body?: unknown) {
  const mod = (await ruta()) as Record<string, Handler>
  return mod.POST!(pedir(path, body), ctx(id))
}

async function getSolicitadas(query = ""): Promise<Response> {
  const mod = (await rutaSolicitadas()) as Record<string, Handler>
  return mod.GET!(pedirGet(`ra/reservas/solicitadas${query}`))
}

async function nuevaSolicitud(opts: {
  id: string
  estado?: string
  elementoId?: string
  solicitantePersonaId?: string
  unidadId?: string | null
  montoTarifa?: number
  comunidadId?: string
  folio?: string
  fecha?: string
}): Promise<void> {
  await prisma.reservaRA.create({
    data: {
      id: opts.id,
      comunidadId: opts.comunidadId ?? comunidad,
      folio: opts.folio ?? `RA-${opts.id}`,
      elementoId: opts.elementoId ?? elemento,
      solicitantePersonaId: opts.solicitantePersonaId ?? persona,
      unidadId: opts.unidadId === undefined ? unidad : opts.unidadId,
      fecha: opts.fecha ?? "2026-12-24",
      horaInicio: "19:00",
      horaFin: "22:00",
      estado: opts.estado ?? "solicitada",
      montoTarifa: opts.montoTarifa ?? 15_000,
      montoGarantia: 0,
    },
  })
}

function cobrosDe(origenRef: string, concepto = "reserva_ra") {
  return prisma.cobroFI.findMany({
    where: { comunidadId: comunidad, origenModulo: "RA", origenRef, concepto },
  })
}

function contarEventos(referenciaId: string, tipoAccion: string): Promise<number> {
  return prisma.eventoAuditoria.count({
    where: {
      comunidadId: { in: [comunidad, comunidadB] },
      referenciaId,
      tipoAccion,
    },
  })
}

describe("/api/ra — cola de autorización de reservas (BD real)", () => {
  beforeAll(async () => {
    process.env.AUTH_SECRET = AUTH_SECRET
    for (const [id, nombre, slug] of [
      [comunidad, "Comunidad A Autorización RA", "ra-aut-comunidad-a"],
      [comunidadB, "Comunidad B Autorización RA", "ra-aut-comunidad-b"],
    ] as const) {
      await prisma.comunidad.upsert({ where: { id }, update: {}, create: { id, nombre, slug } })
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

    for (const [id, nombres, apellidos] of [
      [persona, "Solicitante", "Autorizable"],
      [personaSinUnidad, "Solicitante", "Sin Unidad"],
    ] as const) {
      await prisma.persona.create({
        data: {
          id,
          comunidadId: comunidad,
          rut: `22.222.222-${id === persona ? "1" : "2"}`,
          nombreCompleto: `${nombres} ${apellidos}`,
          nombres,
          apellidos,
          email: `${id}@test.cl`,
          telefonoMovil: "+56 9 2222 2222",
          estadoCuenta: "activa",
          condicionesEspecialesIds: [],
          roles: ["propietario"],
        },
      })
    }

    await prisma.unidad.create({
      data: {
        id: unidad,
        comunidadId: comunidad,
        microSectorId: "ra-aut-ms",
        numero: "101",
        etiqueta: "Depto",
        tipoUnidadId: "ra-aut-tu",
        metraje: 60,
        prorrateo: 1,
        rolSii: "rol-ra-aut-1",
        estadoId: "ra-aut-eo",
        servicios: {},
      },
    })
    await prisma.unidad.create({
      data: {
        id: unidadVinculo,
        comunidadId: comunidad,
        microSectorId: "ra-aut-ms",
        numero: "102",
        etiqueta: "Depto",
        tipoUnidadId: "ra-aut-tu",
        metraje: 55,
        prorrateo: 1,
        rolSii: "",
        estadoId: "ra-aut-eo",
        servicios: {},
      },
    })

    // Fondo de amenities activo (destino del cargo) junto a un GC, para que la
    // resolución del fondo no tome el primero que aparezca.
    await prisma.fondoFI.create({
      data: {
        id: fondoGC,
        comunidadId: comunidad,
        nombre: "Fondo Gasto Común",
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

    await prisma.elementoRA.create({
      data: {
        id: elemento,
        comunidadId: comunidad,
        nombre: "Quincho autorizable",
        tipo: "espacio_fisico",
        franja: "dia_completo",
        tarifaUso: 15_000,
        garantiaRequerida: 0,
        activo: true,
        requiereAutorizacion: true,
      },
    })
  }, 30_000)

  afterAll(async () => {
    try {
      state.cookie = ""
      await prisma.cobroFI.deleteMany({ where: { comunidadId: { in: [comunidad, comunidadB] } } })
      await prisma.eventoAuditoria.deleteMany({
        where: { comunidadId: { in: [comunidad, comunidadB] } },
      })
      await prisma.reservaRA.deleteMany({ where: { comunidadId: { in: [comunidad, comunidadB] } } })
      await prisma.elementoRA.deleteMany({ where: { comunidadId: { in: [comunidad, comunidadB] } } })
      await prisma.fondoFI.deleteMany({ where: { comunidadId: { in: [comunidad, comunidadB] } } })
      await prisma.vinculoUnidad.deleteMany({
        where: { comunidadId: { in: [comunidad, comunidadB] } },
      })
      await prisma.unidad.deleteMany({ where: { comunidadId: { in: [comunidad, comunidadB] } } })
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

  describe("GET /api/ra/reservas/solicitadas — la cola del administrador", () => {
    it("solo trae las solicitudes de la comunidad, con los rótulos resueltos en el servidor", async () => {
      await nuevaSolicitud({ id: "ra-aut-cola-pendiente", fecha: "2026-12-20" })
      await nuevaSolicitud({ id: "ra-aut-cola-confirmada", estado: "confirmada" })
      await nuevaSolicitud({ id: "ra-aut-cola-otra-comunidad", comunidadId: comunidadB })

      await conSesion(emailAdmin, async () => {
        const res = await getSolicitadas()
        expect(res.status).toBe(200)
        const j = (await res.json()) as {
          data: {
            id: string
            folio: string
            elementoNombre: string
            solicitanteNombre: string
            unidadEtiqueta: string
            montoTarifa: number
          }[]
          page: number
          pageSize: number
          total: number
        }
        const ids = j.data.map((f) => f.id)
        expect(ids).toContain("ra-aut-cola-pendiente")
        // Ni la que ya está confirmada ni la de otra comunidad entran a la cola.
        expect(ids).not.toContain("ra-aut-cola-confirmada")
        expect(ids).not.toContain("ra-aut-cola-otra-comunidad")
        expect(j.total).toBe(ids.length)

        const fila = j.data.find((f) => f.id === "ra-aut-cola-pendiente")!
        expect(fila.elementoNombre).toBe("Quincho autorizable")
        expect(fila.solicitanteNombre).toBe("Solicitante Autorizable")
        expect(fila.unidadEtiqueta).toBe("Depto 101 · rol-ra-aut-1")
        expect(fila.montoTarifa).toBe(15_000)
        expect(j.page).toBe(1)
        expect(j.pageSize).toBe(10)
      })
    })

    it("filtra por solicitante y por unidad, y deja fuera al resto", async () => {
      await nuevaSolicitud({ id: "ra-aut-cola-otra-persona", solicitantePersonaId: personaSinUnidad })
      await nuevaSolicitud({ id: "ra-aut-cola-otra-unidad", unidadId: unidadVinculo })

      await conSesion(emailAdmin, async () => {
        const porPersona = await getSolicitadas(`?solicitanteId=${personaSinUnidad}`)
        const jp = (await porPersona.json()) as { data: { id: string }[]; total: number }
        expect(jp.data.map((f) => f.id)).toEqual(["ra-aut-cola-otra-persona"])
        expect(jp.total).toBe(1)

        const porUnidad = await getSolicitadas(`?unidadId=${unidadVinculo}`)
        const ju = (await porUnidad.json()) as { data: { id: string }[]; total: number }
        expect(ju.data.map((f) => f.id)).toEqual(["ra-aut-cola-otra-unidad"])
        expect(ju.total).toBe(1)

        const todo = await getSolicitadas()
        const jt = (await todo.json()) as { total: number }
        expect(jt.total).toBeGreaterThanOrEqual(3)
      })
    })

    it("una fila sin persona ni unidad en el padrón no se cae: muestra el id y «Sin unidad asignada»", async () => {
      await nuevaSolicitud({
        id: "ra-aut-cola-huerfana",
        solicitantePersonaId: "ra-aut-p-fantasma",
        unidadId: null,
      })
      await conSesion(emailAdmin, async () => {
        const res = await getSolicitadas("?solicitanteId=ra-aut-p-fantasma")
        expect(res.status).toBe(200)
        const j = (await res.json()) as {
          data: { solicitanteNombre: string; unidadEtiqueta: string }[]
        }
        expect(j.data).toHaveLength(1)
        expect(j.data[0]?.solicitanteNombre).toBe("ra-aut-p-fantasma")
        expect(j.data[0]?.unidadEtiqueta).toBe("Sin unidad asignada")
      })
    })

    it("pageSize se acota al tope de la ruta (no se puede pedir la comunidad entera)", async () => {
      await conSesion(emailAdmin, async () => {
        const res = await getSolicitadas("?pageSize=999")
        expect(res.status).toBe(200)
        const j = (await res.json()) as { pageSize: number }
        expect(j.pageSize).toBe(50)
      })
    })

    it("residente (sin `editar ra`) → 403 y sin filas; sin sesión → 401", async () => {
      await conSesion(emailResidente, async () => {
        const res = await getSolicitadas()
        expect(res.status).toBe(403)
        expect(((await res.json()) as { error: string }).error).toBe("Permiso denegado.")
      })
      state.cookie = ""
      expect((await getSolicitadas()).status).toBe(401)
    })
  })

  describe("POST /api/ra/reservas/[id]/autorizar — la solicitud pasa a deuda", () => {
    it("200: confirma, materializa UN cobro reserva_ra al Fondo de Amenities y audita", async () => {
      await nuevaSolicitud({ id: "ra-aut-aut-ok" })
      await conSesion(emailAdmin, async () => {
        const res = await post(rutaAutorizar, "ra/reservas/ra-aut-aut-ok/autorizar", "ra-aut-aut-ok")
        expect(res.status).toBe(200)
        const j = (await res.json()) as { ok: boolean; reserva: { estado: string } }
        expect(j.ok).toBe(true)
        expect(j.reserva.estado).toBe("confirmada")

        const reserva = await prisma.reservaRA.findUnique({ where: { id: "ra-aut-aut-ok" } })
        expect(reserva?.estado).toBe("confirmada")

        const cobros = await cobrosDe("ra-aut-aut-ok")
        expect(cobros).toHaveLength(1)
        expect(cobros[0]?.fondoId).toBe(fondoAmenities)
        expect(cobros[0]?.montoBase).toBe(15_000)
        expect(cobros[0]?.unidadId).toBe(unidad)
        expect(cobros[0]?.descripcion).toContain("Quincho autorizable")
        expect(reserva?.cargoFIReferencia).toBe(cobros[0]?.id)
        expect(await contarEventos("ra-aut-aut-ok", "RA_BOOKING_AUTHORIZED")).toBe(1)
      })
    })

    it("autorizar dos veces → 400 y el cobro sigue existiendo exactamente una vez", async () => {
      await nuevaSolicitud({ id: "ra-aut-aut-idem" })
      await conSesion(emailAdmin, async () => {
        const r1 = await post(rutaAutorizar, "ra/reservas/ra-aut-aut-idem/autorizar", "ra-aut-aut-idem")
        const r2 = await post(rutaAutorizar, "ra/reservas/ra-aut-aut-idem/autorizar", "ra-aut-aut-idem")
        expect(r1.status).toBe(200)
        expect(r2.status).toBe(400)
        expect(((await r2.json()) as { error: string }).error).toBe(
          "Solo una reserva pendiente de autorización puede autorizarse."
        )
        expect(await cobrosDe("ra-aut-aut-idem")).toHaveLength(1)
        expect(await contarEventos("ra-aut-aut-idem", "RA_BOOKING_AUTHORIZED")).toBe(1)
      })
    })

    it("un cargo ya materializado se REUTILIZA: no se crea el segundo cobro", async () => {
      await nuevaSolicitud({ id: "ra-aut-aut-reusa" })
      // Procedencia ya cobrada (por ejemplo, un reintento tras un corte).
      await prisma.cobroFI.create({
        data: {
          id: "ra-aut-cobro-previo",
          comunidadId: comunidad,
          unidadId: unidad,
          periodo: "2026-12",
          concepto: "reserva_ra",
          origenModulo: "RA",
          origenRef: "ra-aut-aut-reusa",
          fondoId: fondoAmenities,
          descripcion: "Cargo previo de la misma reserva",
          montoBase: 15_000,
          fechaCargo: "2026-12-01",
          moras: [],
          pagos: [],
          diferencias: [],
        },
      })
      await conSesion(emailAdmin, async () => {
        const res = await post(rutaAutorizar, "ra/reservas/ra-aut-aut-reusa/autorizar", "ra-aut-aut-reusa")
        expect(res.status).toBe(200)
        const cobros = await cobrosDe("ra-aut-aut-reusa")
        expect(cobros).toHaveLength(1)
        expect(cobros[0]?.id).toBe("ra-aut-cobro-previo")
        const reserva = await prisma.reservaRA.findUnique({ where: { id: "ra-aut-aut-reusa" } })
        expect(reserva?.cargoFIReferencia).toBe("ra-aut-cobro-previo")
        const evento = await prisma.eventoAuditoria.findFirst({
          where: { comunidadId: comunidad, referenciaId: "ra-aut-aut-reusa" },
        })
        expect(evento?.descripcion).toContain("existente reutilizado")
      })
    })

    it("sin unidad en la reserva, imputa a la unidad del vínculo vigente del solicitante", async () => {
      await nuevaSolicitud({
        id: "ra-aut-aut-vinculo",
        solicitantePersonaId: personaSinUnidad,
        unidadId: null,
      })
      await prisma.vinculoUnidad.create({
        data: {
          id: "ra-aut-vinculo",
          comunidadId: comunidad,
          personaId: personaSinUnidad,
          unidadId: unidadVinculo,
          rol: "propietario",
          fechaInicio: "2026-01-01",
          fechaFin: null,
          permiteVerFinanzas: false,
        },
      })
      try {
        await conSesion(emailAdmin, async () => {
          const res = await post(
            rutaAutorizar,
            "ra/reservas/ra-aut-aut-vinculo/autorizar",
            "ra-aut-aut-vinculo"
          )
          expect(res.status).toBe(200)
          const cobros = await cobrosDe("ra-aut-aut-vinculo")
          expect(cobros).toHaveLength(1)
          expect(cobros[0]?.unidadId).toBe(unidadVinculo)
        })
      } finally {
        await prisma.vinculoUnidad.deleteMany({ where: { id: "ra-aut-vinculo" } })
      }
    })

    it("reserva sin tarifa (monto 0) → 200 sin cargo: no hay deuda que cobrar", async () => {
      await nuevaSolicitud({ id: "ra-aut-aut-gratis", montoTarifa: 0 })
      await conSesion(emailAdmin, async () => {
        const res = await post(
          rutaAutorizar,
          "ra/reservas/ra-aut-aut-gratis/autorizar",
          "ra-aut-aut-gratis"
        )
        expect(res.status).toBe(200)
        expect(await cobrosDe("ra-aut-aut-gratis")).toHaveLength(0)
        const reserva = await prisma.reservaRA.findUnique({ where: { id: "ra-aut-aut-gratis" } })
        expect(reserva?.estado).toBe("confirmada")
        expect(reserva?.cargoFIReferencia).toBeNull()
      })
    })

    it("reserva de otra comunidad → 404 sin cobro; elemento inexistente → 404", async () => {
      await nuevaSolicitud({ id: "ra-aut-aut-ajena", comunidadId: comunidadB })
      await nuevaSolicitud({ id: "ra-aut-aut-sin-elemento", elementoId: "ra-aut-elemento-fantasma" })
      await conSesion(emailAdmin, async () => {
        const ajena = await post(
          rutaAutorizar,
          "ra/reservas/ra-aut-aut-ajena/autorizar",
          "ra-aut-aut-ajena"
        )
        expect(ajena.status).toBe(404)
        expect((await prisma.reservaRA.findUnique({ where: { id: "ra-aut-aut-ajena" } }))?.estado).toBe(
          "solicitada"
        )

        const sinElemento = await post(
          rutaAutorizar,
          "ra/reservas/ra-aut-aut-sin-elemento/autorizar",
          "ra-aut-aut-sin-elemento"
        )
        expect(sinElemento.status).toBe(404)
        expect(((await sinElemento.json()) as { error: string }).error).toBe(
          "Elemento no encontrado."
        )
        expect(await cobrosDe("ra-aut-aut-sin-elemento")).toHaveLength(0)
      })
    })

    it("residente → 403 y la reserva sigue pendiente; sin sesión → 401", async () => {
      await nuevaSolicitud({ id: "ra-aut-aut-residente" })
      await conSesion(emailResidente, async () => {
        const res = await post(
          rutaAutorizar,
          "ra/reservas/ra-aut-aut-residente/autorizar",
          "ra-aut-aut-residente"
        )
        expect(res.status).toBe(403)
      })
      state.cookie = ""
      expect(
        (await post(rutaAutorizar, "ra/reservas/ra-aut-aut-residente/autorizar", "ra-aut-aut-residente"))
          .status
      ).toBe(401)
      const reserva = await prisma.reservaRA.findUnique({ where: { id: "ra-aut-aut-residente" } })
      expect(reserva?.estado).toBe("solicitada")
      expect(await cobrosDe("ra-aut-aut-residente")).toHaveLength(0)
    })
  })

  describe("POST /api/ra/reservas/[id]/rechazar — el rechazo no cobra", () => {
    it("200: cancela con el motivo, sin cargo, y con UN evento RA_BOOKING_REJECTED", async () => {
      await nuevaSolicitud({ id: "ra-aut-rec-ok" })
      await conSesion(emailAdmin, async () => {
        const res = await post(rutaRechazar, "ra/reservas/ra-aut-rec-ok/rechazar", "ra-aut-rec-ok", {
          motivo: "El quincho está reservado para la asamblea de esa noche.",
        })
        expect(res.status).toBe(200)
        const reserva = await prisma.reservaRA.findUnique({ where: { id: "ra-aut-rec-ok" } })
        expect(reserva?.estado).toBe("cancelada")
        expect(reserva?.cancelacion).toEqual(
          expect.objectContaining({
            tardia: false,
            motivo: "El quincho está reservado para la asamblea de esa noche.",
          })
        )
        expect(await cobrosDe("ra-aut-rec-ok")).toHaveLength(0)
        expect(await contarEventos("ra-aut-rec-ok", "RA_BOOKING_REJECTED")).toBe(1)
      })
    })

    it("sin motivo o con motivo demasiado corto → 400 «Datos inválidos.» y la reserva sigue pendiente", async () => {
      await nuevaSolicitud({ id: "ra-aut-rec-corto" })
      await conSesion(emailAdmin, async () => {
        for (const body of [{}, { motivo: "no" }, { motivo: "   " }]) {
          const res = await post(
            rutaRechazar,
            "ra/reservas/ra-aut-rec-corto/rechazar",
            "ra-aut-rec-corto",
            body
          )
          expect(res.status).toBe(400)
          expect(((await res.json()) as { error: string }).error).toBe("Datos inválidos.")
        }
        const reserva = await prisma.reservaRA.findUnique({ where: { id: "ra-aut-rec-corto" } })
        expect(reserva?.estado).toBe("solicitada")
        expect(await contarEventos("ra-aut-rec-corto", "RA_BOOKING_REJECTED")).toBe(0)
      })
    })

    it("cuerpo que no es JSON → 400 «Cuerpo JSON inválido.»", async () => {
      await nuevaSolicitud({ id: "ra-aut-rec-json" })
      await conSesion(emailAdmin, async () => {
        const res = await post(
          rutaRechazar,
          "ra/reservas/ra-aut-rec-json/rechazar",
          "ra-aut-rec-json",
          "{no-json"
        )
        expect(res.status).toBe(400)
        expect(((await res.json()) as { error: string }).error).toBe("Cuerpo JSON inválido.")
      })
    })

    it("rechazar dos veces → 400: no hay segunda transición ni segundo evento", async () => {
      await nuevaSolicitud({ id: "ra-aut-rec-doble" })
      await conSesion(emailAdmin, async () => {
        const r1 = await post(
          rutaRechazar,
          "ra/reservas/ra-aut-rec-doble/rechazar",
          "ra-aut-rec-doble",
          { motivo: "Solicitud duplicada del mismo vecino." }
        )
        const r2 = await post(
          rutaRechazar,
          "ra/reservas/ra-aut-rec-doble/rechazar",
          "ra-aut-rec-doble",
          { motivo: "Solicitud duplicada del mismo vecino." }
        )
        expect(r1.status).toBe(200)
        expect(r2.status).toBe(400)
        expect(((await r2.json()) as { error: string }).error).toBe(
          "Solo una reserva pendiente de autorización puede rechazarse."
        )
        expect(await contarEventos("ra-aut-rec-doble", "RA_BOOKING_REJECTED")).toBe(1)
      })
    })

    it("reserva de otra comunidad → 404 y no se toca; residente → 403", async () => {
      await nuevaSolicitud({ id: "ra-aut-rec-ajena", comunidadId: comunidadB })
      await conSesion(emailAdmin, async () => {
        const res = await post(
          rutaRechazar,
          "ra/reservas/ra-aut-rec-ajena/rechazar",
          "ra-aut-rec-ajena",
          { motivo: "No corresponde a mi comunidad." }
        )
        expect(res.status).toBe(404)
        expect(
          (await prisma.reservaRA.findUnique({ where: { id: "ra-aut-rec-ajena" } }))?.estado
        ).toBe("solicitada")
      })
      await conSesion(emailResidente, async () => {
        const res = await post(
          rutaRechazar,
          "ra/reservas/ra-aut-rec-ajena/rechazar",
          "ra-aut-rec-ajena",
          { motivo: "No corresponde a mi comunidad." }
        )
        expect(res.status).toBe(403)
      })
    })
  })
})
