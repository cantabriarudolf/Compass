/**
 * @vitest-environment node
 *
 * Acciones IN sobre infracciones: apelar, respaldar, aplicar y desestimar.
 * Paridad server-side con `apelarInfraccionIN` / `respaldarInfraccionIN` /
 * `aplicarInfraccionIN` / `desestimarInfraccionIN` legacy, incluyendo la
 * materialización transaccional del cobro FI (`concepto: "multa_in"`).
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

const comunidad = "in-acc-comunidad-a"
const comunidadB = "in-acc-comunidad-b"
const emailAdmin = "in-acc-admin@test.cl"
const usuarioAdmin = "in-acc-usuario-admin"
const unidad = "in-acc-u-1"
const directivo = "in-acc-directivo"
const vecino = "in-acc-vecino"

const cargaModulos = async () => ({
  apelar: await import("@/app/api/in/infracciones/[id]/apelar/route"),
  respaldar: await import("@/app/api/in/infracciones/[id]/respaldar/route"),
  aplicar: await import("@/app/api/in/infracciones/[id]/aplicar/route"),
  desestimar: await import("@/app/api/in/infracciones/[id]/desestimar/route"),
})

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

async function nuevaInfraccion(opts: {
  id: string
  tipoInfraccionId?: string | null
  estado?: string
  respaldosDirectiva?: string[]
  unidadId?: string
  comunidadId?: string
  danoDirecto?: { descripcionDaño: string; costoReparacion: number }
}): Promise<void> {
  await prisma.infraccionIN.create({
    data: {
      id: opts.id,
      comunidadId: opts.comunidadId ?? comunidad,
      folio: `IN-${opts.id}`,
      tipoInfraccionId:
        opts.tipoInfraccionId === null
          ? null
          : opts.tipoInfraccionId ?? "in-acc-tipo-leve",
      danoDirecto: (opts.danoDirecto ?? null) as never,
      unidadId: opts.unidadId ?? unidad,
      fechaSuceso: "2026-08-24",
      horaSuceso: "21:30",
      antecedentes: "Basura depositada fuera de horario en contenedor central TEST.",
      evidencias: [],
      estado: opts.estado ?? "en_revision",
      fechaRegistro: "2026-08-25",
      comentariosDirectiva: [],
      respaldosDirectiva: (opts.respaldosDirectiva ?? []) as never,
    },
  })
}

describe("/api/in/infracciones acciones — apelar, respaldar, aplicar y desestimar (BD real)", () => {
  beforeAll(async () => {
    process.env.AUTH_SECRET = AUTH_SECRET
    for (const [id, nombre, slug] of [
      [comunidad, "Comunidad A Acciones IN", "in-acc-comunidad-a"],
      [comunidadB, "Comunidad B Acciones IN", "in-acc-comunidad-b"],
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
    await prisma.infraccionIN.deleteMany({ where: { comunidadId: { in: [comunidad, comunidadB] } } })
    await prisma.tipoInfraccionIN.deleteMany({
      where: { comunidadId: { in: [comunidad, comunidadB] } },
    })
    await prisma.fondoFI.deleteMany({ where: { comunidadId: { in: [comunidad, comunidadB] } } })
    await prisma.persona.deleteMany({ where: { comunidadId: { in: [comunidad, comunidadB] } } })

    for (const [id, gobernanza] of [
      [directivo, { id: "gob-in-acc", cargoDirectiva: "presidente", fechaAsuncion: "2026-08-01" }],
      [vecino, null],
    ] as const) {
      await prisma.persona.create({
        data: {
          id,
          comunidadId: comunidad,
          rut: `11.111.111-${id === directivo ? "1" : "2"}`,
          nombreCompleto: id === directivo ? "Directiva Test" : "Vecino Test",
          nombres: id === directivo ? "Directiva" : "Vecino",
          apellidos: "Test",
          email: `${id}@test.cl`,
          telefonoMovil: "+56 9 1111 1111",
          estadoCuenta: "activa",
          condicionesEspecialesIds: [],
          roles: gobernanza ? ["directiva"] : ["propietario"],
          datosGobernanza: (gobernanza ?? null) as never,
        },
      })
    }

    // Fondo GC activo para imputar la multa y cobro GC base para el cálculo % GC.
    await prisma.fondoFI.create({
      data: {
        id: "in-acc-fondo-gc",
        comunidadId: comunidad,
        nombre: "Fondo Gasto Común",
        tipo: "gasto_comun",
        activo: true,
        saldoInicial: 0,
      },
    })
    await prisma.cobroFI.create({
      data: {
        id: "in-acc-gc-base",
        comunidadId: comunidad,
        unidadId: unidad,
        periodo: "2026-08",
        concepto: "gasto_comun",
        origenModulo: "FI",
        fondoId: "in-acc-fondo-gc",
        descripcion: "Gasto Común 2026-08",
        montoBase: 200_000,
        fechaCargo: "2026-08-01",
        fechaVencimiento: "2026-08-05",
        moras: [],
        pagos: [],
        diferencias: [],
      },
    })

    for (const [id, categoria, tipoSancion, valor] of [
      ["in-acc-tipo-leve", "leve", "monto_fijo", 15_000],
      ["in-acc-tipo-grave", "grave", "porcentaje_gc", 5],
      ["in-acc-tipo-gravisima", "gravisima", "porcentaje_gc", 10],
    ] as const) {
      await prisma.tipoInfraccionIN.create({
        data: { id, comunidadId: comunidad, nombre: `Tipo ${id}`, categoria, tipoSancion, valor },
      })
    }
  }, 30_000)

  afterAll(async () => {
    try {
      state.cookie = ""
      await prisma.cobroFI.deleteMany({ where: { comunidadId: { in: [comunidad, comunidadB] } } })
      await prisma.eventoAuditoria.deleteMany({
        where: { comunidadId: { in: [comunidad, comunidadB] } },
      })
      await prisma.infraccionIN.deleteMany({
        where: { comunidadId: { in: [comunidad, comunidadB] } },
      })
      await prisma.tipoInfraccionIN.deleteMany({
        where: { comunidadId: { in: [comunidad, comunidadB] } },
      })
      await prisma.fondoFI.deleteMany({ where: { comunidadId: { in: [comunidad, comunidadB] } } })
      await prisma.persona.deleteMany({ where: { comunidadId: { in: [comunidad, comunidadB] } } })
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

  describe("apelar", () => {
    it("En Revisión con descargos válidos: 200, estado apelada y UN evento IN_APELACION", async () => {
      const { apelar } = await cargaModulos()
      await nuevaInfraccion({ id: "in-acc-ap-ok" })
      await conSesion(async () => {
        const res = await apelar.POST(
          pedir("in/infracciones/in-acc-ap-ok/apelar", {
            descargos: "Los desechos eran del servicio de mudanza contratado por el vecino.",
          }),
          ctx("in-acc-ap-ok")
        )
        expect(res.status).toBe(200)
        expect((await res.json()) as { ok: boolean }).toEqual({ ok: true })
        const inf = await prisma.infraccionIN.findUnique({ where: { id: "in-acc-ap-ok" } })
        expect(inf?.estado).toBe("apelada")
        expect((inf?.apelacion as { descargos?: string } | null)?.descargos).toContain("mudanza")
        expect(await contarEventos("in-acc-ap-ok", "IN_APELACION")).toBe(1)
      })
    })

    it("descargos cortos sin efecto → 400 y sin evento", async () => {
      const { apelar } = await cargaModulos()
      await nuevaInfraccion({ id: "in-acc-ap-corto" })
      await conSesion(async () => {
        const res = await apelar.POST(
          pedir("in/infracciones/in-acc-ap-corto/apelar", { descargos: "no fue" }),
          ctx("in-acc-ap-corto")
        )
        expect(res.status).toBe(400)
        const inf = await prisma.infraccionIN.findUnique({ where: { id: "in-acc-ap-corto" } })
        expect(inf?.estado).toBe("en_revision")
        expect(await contarEventos("in-acc-ap-corto", "IN_APELACION")).toBe(0)
      })
    })

    it("infracción ya aplicada → 400 sin evento", async () => {
      const { apelar } = await cargaModulos()
      await nuevaInfraccion({ id: "in-acc-ap-aplicada", estado: "aplicada" })
      await conSesion(async () => {
        const res = await apelar.POST(
          pedir("in/infracciones/in-acc-ap-aplicada/apelar", {
            descargos: "Descargos presentados de forma tardía por el vecino.",
          }),
          ctx("in-acc-ap-aplicada")
        )
        expect(res.status).toBe(400)
        expect(await contarEventos("in-acc-ap-aplicada", "IN_APELACION")).toBe(0)
      })
    })
  })

  describe("respaldar", () => {
    it("directiva vigente: 200, respaldo agregado y UN evento IN_RESPALDO_DIRECTIVA", async () => {
      const { respaldar } = await cargaModulos()
      await nuevaInfraccion({ id: "in-acc-res-ok" })
      await conSesion(async () => {
        const res = await respaldar.POST(
          pedir("in/infracciones/in-acc-res-ok/respaldar", { personaId: directivo }),
          ctx("in-acc-res-ok")
        )
        expect(res.status).toBe(200)
        const inf = await prisma.infraccionIN.findUnique({ where: { id: "in-acc-res-ok" } })
        expect(inf?.respaldosDirectiva as unknown as string[]).toEqual([directivo])
        expect(await contarEventos("in-acc-res-ok", "IN_RESPALDO_DIRECTIVA")).toBe(1)
      })
    })

    it("persona sin datos de gobernanza → 400 sin respaldo", async () => {
      const { respaldar } = await cargaModulos()
      await nuevaInfraccion({ id: "in-acc-res-vecino" })
      await conSesion(async () => {
        const res = await respaldar.POST(
          pedir("in/infracciones/in-acc-res-vecino/respaldar", { personaId: vecino }),
          ctx("in-acc-res-vecino")
        )
        expect(res.status).toBe(400)
        const inf = await prisma.infraccionIN.findUnique({ where: { id: "in-acc-res-vecino" } })
        expect(inf?.respaldosDirectiva as unknown as string[]).toEqual([])
        expect(await contarEventos("in-acc-res-vecino", "IN_RESPALDO_DIRECTIVA")).toBe(0)
      })
    })

    it("doble respaldo del mismo directivo → 400 y un solo evento", async () => {
      const { respaldar } = await cargaModulos()
      await nuevaInfraccion({ id: "in-acc-res-doble", respaldosDirectiva: [directivo] })
      await conSesion(async () => {
        const res = await respaldar.POST(
          pedir("in/infracciones/in-acc-res-doble/respaldar", { personaId: directivo }),
          ctx("in-acc-res-doble")
        )
        expect(res.status).toBe(400)
        const inf = await prisma.infraccionIN.findUnique({ where: { id: "in-acc-res-doble" } })
        expect((inf?.respaldosDirectiva as unknown as string[]).length).toBe(1)
        expect(await contarEventos("in-acc-res-doble", "IN_RESPALDO_DIRECTIVA")).toBe(0)
      })
    })

    it("infracción con resolución final → 400", async () => {
      const { respaldar } = await cargaModulos()
      await nuevaInfraccion({ id: "in-acc-res-final", estado: "desestimada" })
      await conSesion(async () => {
        const res = await respaldar.POST(
          pedir("in/infracciones/in-acc-res-final/respaldar", { personaId: directivo }),
          ctx("in-acc-res-final")
        )
        expect(res.status).toBe(400)
      })
    })
  })

  describe("aplicar", () => {
    it("leve monto fijo: 200, aplicada y cobro multa_in creado UNA sola vez", async () => {
      const { aplicar } = await cargaModulos()
      await nuevaInfraccion({ id: "in-acc-ap-leve" })
      await conSesion(async () => {
        const res = await aplicar.POST(
          pedir("in/infracciones/in-acc-ap-leve/aplicar"),
          ctx("in-acc-ap-leve")
        )
        expect(res.status).toBe(200)
        const inf = await prisma.infraccionIN.findUnique({ where: { id: "in-acc-ap-leve" } })
        expect(inf?.estado).toBe("aplicada")
        expect(inf?.montoAplicado).toBe(15_000)
        expect(inf?.cargoFIReferencia).toBeTruthy()

        const cobros = await prisma.cobroFI.findMany({
          where: { comunidadId: comunidad, origenModulo: "IN", origenRef: "in-acc-ap-leve" },
        })
        expect(cobros).toHaveLength(1)
        expect(cobros[0]?.concepto).toBe("multa_in")
        expect(cobros[0]?.montoBase).toBe(15_000)
        expect(cobros[0]?.id).toBe(inf?.cargoFIReferencia)
        expect(await contarEventos("in-acc-ap-leve", "IN_APPLY_FINE")).toBe(1)
      })
    })

    it("re-aplicar: 400 y el cobro sigue existiendo exactamente una vez", async () => {
      const { aplicar } = await cargaModulos()
      await nuevaInfraccion({ id: "in-acc-ap-idem" })
      await conSesion(async () => {
        const c = ctx("in-acc-ap-idem")
        const r1 = await aplicar.POST(pedir("in/infracciones/in-acc-ap-idem/aplicar"), c)
        const r2 = await aplicar.POST(pedir("in/infracciones/in-acc-ap-idem/aplicar"), c)
        expect(r1.status).toBe(200)
        expect(r2.status).toBe(400)
        const cobros = await prisma.cobroFI.count({
          where: { comunidadId: comunidad, origenRef: "in-acc-ap-idem" },
        })
        expect(cobros).toBe(1)
        expect(await contarEventos("in-acc-ap-idem", "IN_APPLY_FINE")).toBe(1)
      })
    })

    it("infracción re-creada (POST upsert la resetea) y re-aplicada → UN solo cobro multa_in", async () => {
      const { aplicar } = await cargaModulos()
      const id = "in-acc-ap-recreada"
      await nuevaInfraccion({ id })
      await conSesion(async () => {
        const c = ctx(id)
        const r1 = await aplicar.POST(pedir(`in/infracciones/${id}/aplicar`), c)
        expect(r1.status).toBe(200)
        const primerCobro = await prisma.cobroFI.findFirst({
          where: { comunidadId: comunidad, origenModulo: "IN", origenRef: id, concepto: "multa_in" },
        })
        expect(primerCobro).toBeTruthy()

        // La población e2e corre dos veces: el POST upsert recrea la infracción
        // con el mismo id y la devuelve a `en_revision`, así que el guard por
        // estado ya no bloquea una segunda aplicación.
        await prisma.infraccionIN.delete({ where: { id } })
        await nuevaInfraccion({ id })

        const r2 = await aplicar.POST(pedir(`in/infracciones/${id}/aplicar`), c)
        expect(r2.status).toBe(200)
        const cobros = await prisma.cobroFI.findMany({
          where: { comunidadId: comunidad, origenModulo: "IN", origenRef: id, concepto: "multa_in" },
        })
        expect(cobros).toHaveLength(1)
        expect(cobros[0]?.id).toBe(primerCobro?.id)
        const inf = await prisma.infraccionIN.findUnique({ where: { id } })
        expect(inf?.estado).toBe("aplicada")
        expect(inf?.cargoFIReferencia).toBe(primerCobro?.id)
        // La auditoría conserva un evento por aplicación efectiva (una por
        // transacción): la idempotencia es del cobro, no del log.
        expect(await contarEventos(id, "IN_APPLY_FINE")).toBe(2)
      })
    })

    it("grave sin respaldo de directiva → 400 y sin cobro", async () => {
      const { aplicar } = await cargaModulos()
      await nuevaInfraccion({ id: "in-acc-ap-sin-respaldo", tipoInfraccionId: "in-acc-tipo-grave" })
      await conSesion(async () => {
        const res = await aplicar.POST(
          pedir("in/infracciones/in-acc-ap-sin-respaldo/aplicar"),
          ctx("in-acc-ap-sin-respaldo")
        )
        expect(res.status).toBe(400)
        const inf = await prisma.infraccionIN.findUnique({ where: { id: "in-acc-ap-sin-respaldo" } })
        expect(inf?.estado).toBe("en_revision")
        expect(
          await prisma.cobroFI.count({ where: { comunidadId: comunidad, origenRef: "in-acc-ap-sin-respaldo" } })
        ).toBe(0)
        expect(await contarEventos("in-acc-ap-sin-respaldo", "IN_APPLY_FINE")).toBe(0)
      })
    })

    it("grave con respaldo y % GC: montoAplicado = % del último cobro GC de la unidad en BD", async () => {
      const { aplicar } = await cargaModulos()
      await nuevaInfraccion({
        id: "in-acc-ap-porcentaje",
        tipoInfraccionId: "in-acc-tipo-grave",
        respaldosDirectiva: [directivo],
      })
      await conSesion(async () => {
        const res = await aplicar.POST(
          pedir("in/infracciones/in-acc-ap-porcentaje/aplicar"),
          ctx("in-acc-ap-porcentaje")
        )
        expect(res.status).toBe(200)
        const inf = await prisma.infraccionIN.findUnique({ where: { id: "in-acc-ap-porcentaje" } })
        // 5% del cobro GC base 2026-08 ($200.000) = $10.000
        expect(inf?.montoAplicado).toBe(10_000)
        const cobro = await prisma.cobroFI.findFirst({
          where: { comunidadId: comunidad, origenRef: "in-acc-ap-porcentaje" },
        })
        expect(cobro?.concepto).toBe("multa_in")
        expect(cobro?.montoBase).toBe(10_000)
        expect(cobro?.origenModulo).toBe("IN")
      })
    })

    it("tipo inexistente en el catálogo → 400 sin cobro", async () => {
      const { aplicar } = await cargaModulos()
      await nuevaInfraccion({ id: "in-acc-ap-sin-tipo", tipoInfraccionId: "in-acc-tipo-fantasma" })
      await conSesion(async () => {
        const res = await aplicar.POST(
          pedir("in/infracciones/in-acc-ap-sin-tipo/aplicar"),
          ctx("in-acc-ap-sin-tipo")
        )
        expect(res.status).toBe(400)
        expect(
          await prisma.cobroFI.count({ where: { comunidadId: comunidad, origenRef: "in-acc-ap-sin-tipo" } })
        ).toBe(0)
      })
    })

    it("infracción de otra comunidad → 404 sin cobro", async () => {
      const { aplicar } = await cargaModulos()
      await nuevaInfraccion({ id: "in-acc-ap-otra", comunidadId: comunidadB })
      await conSesion(async () => {
        const res = await aplicar.POST(
          pedir("in/infracciones/in-acc-ap-otra/aplicar"),
          ctx("in-acc-ap-otra")
        )
        expect(res.status).toBe(404)
        expect(await prisma.cobroFI.count({ where: { comunidadId: comunidadB } })).toBe(0)
      })
    })
  })

  describe("desestimar", () => {
    it("con justificación: 200, desestimada y UN evento IN_DESESTIMADA", async () => {
      const { desestimar } = await cargaModulos()
      await nuevaInfraccion({ id: "in-acc-des-ok" })
      await conSesion(async () => {
        const res = await desestimar.POST(
          pedir("in/infracciones/in-acc-des-ok/desestimar", {
            justificacion: "Evidencia insuficiente tras revisión de cámaras.",
          }),
          ctx("in-acc-des-ok")
        )
        expect(res.status).toBe(200)
        const inf = await prisma.infraccionIN.findUnique({ where: { id: "in-acc-des-ok" } })
        expect(inf?.estado).toBe("desestimada")
        expect(inf?.desestimacionJustificacion).toContain("insuficiente")
        expect(await contarEventos("in-acc-des-ok", "IN_DESESTIMADA")).toBe(1)
      })
    })

    it("justificación vacía → 400 sin evento", async () => {
      const { desestimar } = await cargaModulos()
      await nuevaInfraccion({ id: "in-acc-des-vacia" })
      await conSesion(async () => {
        const res = await desestimar.POST(
          pedir("in/infracciones/in-acc-des-vacia/desestimar", { justificacion: "   " }),
          ctx("in-acc-des-vacia")
        )
        expect(res.status).toBe(400)
        expect(await contarEventos("in-acc-des-vacia", "IN_DESESTIMADA")).toBe(0)
      })
    })

    it("ya aplicada → 400 sin segunda resolución", async () => {
      const { desestimar } = await cargaModulos()
      await nuevaInfraccion({ id: "in-acc-des-final", estado: "aplicada" })
      await conSesion(async () => {
        const res = await desestimar.POST(
          pedir("in/infracciones/in-acc-des-final/desestimar", {
            justificacion: "Intento de desestimar una multa ya aplicada.",
          }),
          ctx("in-acc-des-final")
        )
        expect(res.status).toBe(400)
        const inf = await prisma.infraccionIN.findUnique({ where: { id: "in-acc-des-final" } })
        expect(inf?.estado).toBe("aplicada")
      })
    })
  })

  it("sin sesión → 401", async () => {
    const { aplicar } = await cargaModulos()
    await nuevaInfraccion({ id: "in-acc-sin-sesion" })
    const res = await aplicar.POST(
      pedir("in/infracciones/in-acc-sin-sesion/aplicar"),
      ctx("in-acc-sin-sesion")
    )
    expect(res.status).toBe(401)
  })
})
