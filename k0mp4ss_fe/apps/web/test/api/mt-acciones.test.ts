/**
 * @vitest-environment node
 *
 * Acciones MT sobre trabajos y proyectos (Fase 1.5, conexiones cross-módulo).
 * Paridad server-side con la máquina de estados de `lib/store.ts`:
 * `iniciarTrabajoMT` / `finalizarTrabajoMT` (incluida la generación automática
 * de la mantención preventiva), `verificarGarantiasMT` (evento
 * `MT_GUARANTEE_EXPIRED`) y el guard `saldoFondo` de `saveProyectoMT`.
 *
 * Fixture determinista: el saldo del fondo GC se compone de montos fijos
 * (pago de cobro $1.000.000 − egreso $200.000 = $800.000 disponible), sin
 * depender del mes corriente. Un presupuesto enorme ($12M) siempre falla y uno
 * chico ($500.000) siempre pasa.
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

const comunidad = "mt-acc-comunidad-a"
const comunidadB = "mt-acc-comunidad-b"
const emailAdmin = "mt-acc-admin@test.cl"
const usuarioAdmin = "mt-acc-usuario-admin"

const fondoGC = "mt-acc-fondo-gc"
const fondoInactivo = "mt-acc-fondo-inactivo"
/** Saldo determinista del fondo GC: $1.000.000 pagado − $200.000 egresado. */
const SALDO_GC = 800_000

/** Import perezoso por ruta: un módulo ausente sólo rompe sus propias pruebas. */
const cargaModulos = async () => ({
  trabajos: await import("@/app/api/mt/trabajos/route"),
  iniciar: await import("@/app/api/mt/trabajos/[id]/iniciar/route"),
  finalizar: await import("@/app/api/mt/trabajos/[id]/finalizar/route"),
  garantias: await import("@/app/api/mt/garantias/verificar/route"),
  proyectos: await import("@/app/api/mt/proyectos/route"),
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

/** Trabajo MT mínimo válido para la ruta de colección (folio vacío → derivado). */
function trabajoValido(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "mt-acc-tr-nuevo",
    folio: "",
    titulo: "Reparación bomba TEST",
    descripcion: "Cambio de sello mecánico y revisión del tablero de control de la bomba.",
    prioridad: "alta",
    costoTotal: 350_000,
    origenFondos: "gasto_comun",
    proveedor: { nombre: "AquaServicio TEST" },
    evidencias: [],
    ...overrides,
  }
}

/** Inserta un trabajo directo en BD (aislado de la ruta de creación). */
async function crearTrabajoBD(opts: {
  id: string
  estado?: string
  titulo?: string
  folio?: string
  preventivo?: { periodicidadMeses: number } | null
  garantiaFin?: string | null
  alertaGarantiaEnviada?: boolean
  comunidadId?: string
}): Promise<void> {
  await prisma.trabajoMT.create({
    data: {
      id: opts.id,
      comunidadId: opts.comunidadId ?? comunidad,
      folio: opts.folio ?? `MT-${opts.id}`,
      titulo: opts.titulo ?? `Trabajo TEST ${opts.id}`,
      descripcion: "Descripción técnica suficientemente larga para el trabajo TEST de MT.",
      prioridad: "alta",
      estado: opts.estado ?? "planificado",
      costoTotal: 180_000,
      origenFondos: "gasto_comun",
      estadoPago: "pendiente",
      alertaGarantiaEnviada: opts.alertaGarantiaEnviada ?? false,
      evidencias: [],
      preventivo: (opts.preventivo ?? null) as never,
      garantiaFin: opts.garantiaFin ?? null,
    },
  })
}

function contarEventos(referenciaId: string, tipoAccion: string): Promise<number> {
  return prisma.eventoAuditoria.count({
    where: { comunidadId: { in: [comunidad, comunidadB] }, referenciaId, tipoAccion },
  })
}

describe("/api/mt — acciones de trabajos y proyectos (BD real)", () => {
  beforeAll(async () => {
    process.env.AUTH_SECRET = AUTH_SECRET
    for (const [id, nombre, slug] of [
      [comunidad, "Comunidad A Acciones MT", "mt-acc-comunidad-a"],
      [comunidadB, "Comunidad B Acciones MT", "mt-acc-comunidad-b"],
    ] as const) {
      await prisma.comunidad.upsert({ where: { id }, update: {}, create: { id, nombre, slug } })
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

    await prisma.eventoAuditoria.deleteMany({
      where: { comunidadId: { in: [comunidad, comunidadB] } },
    })
    await prisma.trabajoMT.deleteMany({ where: { comunidadId: { in: [comunidad, comunidadB] } } })
    await prisma.proyectoMT.deleteMany({ where: { comunidadId: { in: [comunidad, comunidadB] } } })
    await prisma.cobroFI.deleteMany({ where: { comunidadId: { in: [comunidad, comunidadB] } } })
    await prisma.egresoFI.deleteMany({ where: { comunidadId: { in: [comunidad, comunidadB] } } })
    await prisma.fondoFI.deleteMany({ where: { comunidadId: { in: [comunidad, comunidadB] } } })

    // Fixture determinista del saldo GC: cobro con un pago de $1.000.000 y un
    // egreso de $200.000 ⇒ $800.000 disponibles bajo la fórmula del store
    // (`saldoFondo`: Σ pagos − Σ egresos + aportes; sin saldoInicial).
    await prisma.fondoFI.create({
      data: {
        id: fondoGC,
        comunidadId: comunidad,
        nombre: "Fondo Gasto Común MT",
        tipo: "gasto_comun",
        activo: true,
        saldoInicial: 0,
      },
    })
    await prisma.fondoFI.create({
      data: {
        id: fondoInactivo,
        comunidadId: comunidad,
        nombre: "Fondo Inactivo MT",
        tipo: "especial",
        activo: false,
        saldoInicial: 0,
      },
    })
    await prisma.cobroFI.create({
      data: {
        id: "mt-acc-cobro-gc",
        comunidadId: comunidad,
        unidadId: "mt-acc-u-1",
        periodo: "2026-01",
        concepto: "gasto_comun",
        origenModulo: "FI",
        fondoId: fondoGC,
        descripcion: "Gasto común base del fixture MT.",
        montoBase: 1_000_000,
        fechaCargo: "2026-01-01",
        moras: [],
        pagos: [{ id: "mt-acc-pago-1", monto: 1_000_000, fecha: "2026-01-10", medio: "transferencia" }],
        diferencias: [],
      },
    })
    await prisma.egresoFI.create({
      data: {
        id: "mt-acc-egr-1",
        comunidadId: comunidad,
        folio: "FE-9001",
        fecha: "2026-01-15",
        categoria: "mantencion",
        descripcion: "Egreso de prueba del fixture MT.",
        monto: 200_000,
        fondoId: fondoGC,
        esRecurrente: false,
      },
    })
  }, 30_000)

  afterAll(async () => {
    try {
      state.cookie = ""
      await prisma.eventoAuditoria.deleteMany({
        where: { comunidadId: { in: [comunidad, comunidadB] } },
      })
      await prisma.trabajoMT.deleteMany({ where: { comunidadId: { in: [comunidad, comunidadB] } } })
      await prisma.proyectoMT.deleteMany({ where: { comunidadId: { in: [comunidad, comunidadB] } } })
      await prisma.cobroFI.deleteMany({ where: { comunidadId: { in: [comunidad, comunidadB] } } })
      await prisma.egresoFI.deleteMany({ where: { comunidadId: { in: [comunidad, comunidadB] } } })
      await prisma.fondoFI.deleteMany({ where: { comunidadId: { in: [comunidad, comunidadB] } } })
      await prisma.membresia.deleteMany({ where: { usuarioId: usuarioAdmin } })
      await prisma.usuario.delete({ where: { id: usuarioAdmin } }).catch(() => {})
      for (const id of [comunidadB, comunidad]) {
        await prisma.comunidad.delete({ where: { id } }).catch(() => {})
      }
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

  describe("alta de trabajo", () => {
    it("folio vacío se deriva MT-#### y emite UN evento MT_WORK_CREATED (idempotente al re-POST)", async () => {
      const { trabajos } = await cargaModulos()
      await conSesion(async () => {
        const res = await trabajos.POST(pedir("mt/trabajos", trabajoValido()))
        expect(res.status).toBe(201)
        const creado = (await res.json()) as { id: string; folio: string; estado: string }
        expect(creado.folio).toMatch(/^MT-\d{4}$/)
        expect(creado.estado).toBe("planificado")
        expect(await contarEventos("mt-acc-tr-nuevo", "MT_WORK_CREATED")).toBe(1)

        const res2 = await trabajos.POST(
          pedir("mt/trabajos", trabajoValido({ folio: "" }))
        )
        expect(res2.status).toBe(200)
        const bis = (await res2.json()) as { folio: string }
        expect(bis.folio).toBe(creado.folio)
        expect(await contarEventos("mt-acc-tr-nuevo", "MT_WORK_CREATED")).toBe(1)
      })
    })
  })

  describe("iniciar", () => {
    it("planificado → en_curso con fechaInicio y UN evento MT_WORK_STARTED", async () => {
      const { iniciar } = await cargaModulos()
      await crearTrabajoBD({ id: "mt-acc-ini-ok" })
      await conSesion(async () => {
        const res = await iniciar.POST(pedir("mt/trabajos/mt-acc-ini-ok/iniciar", {}), ctx("mt-acc-ini-ok"))
        expect(res.status).toBe(200)
        const tr = await prisma.trabajoMT.findUnique({ where: { id: "mt-acc-ini-ok" } })
        expect(tr?.estado).toBe("en_curso")
        expect(tr?.fechaInicio).toMatch(/^\d{4}-\d{2}-\d{2}$/)
        expect(await contarEventos("mt-acc-ini-ok", "MT_WORK_STARTED")).toBe(1)
      })
    })

    it("en_curso → 400 'Solo un trabajo Planificado puede iniciarse.' sin evento nuevo", async () => {
      const { iniciar } = await cargaModulos()
      await crearTrabajoBD({ id: "mt-acc-ini-no", estado: "en_curso" })
      await conSesion(async () => {
        const res = await iniciar.POST(pedir("mt/trabajos/mt-acc-ini-no/iniciar", {}), ctx("mt-acc-ini-no"))
        expect(res.status).toBe(400)
        expect((await res.json()) as { error: string }).toEqual({
          error: "Solo un trabajo Planificado puede iniciarse.",
        })
        expect(await contarEventos("mt-acc-ini-no", "MT_WORK_STARTED")).toBe(0)
      })
    })

    it("trabajo de otra comunidad → 404 sin evento", async () => {
      const { iniciar } = await cargaModulos()
      await crearTrabajoBD({ id: "mt-acc-ini-otra", comunidadId: comunidadB })
      await conSesion(async () => {
        const res = await iniciar.POST(
          pedir("mt/trabajos/mt-acc-ini-otra/iniciar", {}),
          ctx("mt-acc-ini-otra")
        )
        expect(res.status).toBe(404)
        expect(await contarEventos("mt-acc-ini-otra", "MT_WORK_STARTED")).toBe(0)
      })
    })
  })

  describe("finalizar", () => {
    it("en_curso → finalizado con cierre y UN evento MT_WORK_FINISHED", async () => {
      const { finalizar } = await cargaModulos()
      await crearTrabajoBD({ id: "mt-acc-fin-ok", estado: "en_curso" })
      await conSesion(async () => {
        const res = await finalizar.POST(
          pedir("mt/trabajos/mt-acc-fin-ok/finalizar", {
            fechaTermino: "2026-06-30",
            costoFinal: 195_000,
          }),
          ctx("mt-acc-fin-ok")
        )
        expect(res.status).toBe(200)
        const tr = await prisma.trabajoMT.findUnique({ where: { id: "mt-acc-fin-ok" } })
        expect(tr?.estado).toBe("finalizado")
        expect(tr?.fechaTermino).toBe("2026-06-30")
        expect(tr?.costoTotal).toBe(195_000)
        expect(await contarEventos("mt-acc-fin-ok", "MT_WORK_FINISHED")).toBe(1)
      })
    })

    it("ya finalizado → 400 'El trabajo ya está finalizado.' sin segundo evento", async () => {
      const { finalizar } = await cargaModulos()
      await crearTrabajoBD({ id: "mt-acc-fin-dup", estado: "finalizado" })
      await conSesion(async () => {
        const res = await finalizar.POST(pedir("mt/trabajos/mt-acc-fin-dup/finalizar", {}), ctx("mt-acc-fin-dup"))
        expect(res.status).toBe(400)
        expect((await res.json()) as { error: string }).toEqual({
          error: "El trabajo ya está finalizado.",
        })
        expect(await contarEventos("mt-acc-fin-dup", "MT_WORK_FINISHED")).toBe(0)
      })
    })

    it("cancelado → 400 'Un trabajo cancelado no puede finalizarse.' sin evento", async () => {
      const { finalizar } = await cargaModulos()
      await crearTrabajoBD({ id: "mt-acc-fin-canc", estado: "cancelado" })
      await conSesion(async () => {
        const res = await finalizar.POST(
          pedir("mt/trabajos/mt-acc-fin-canc/finalizar", {}),
          ctx("mt-acc-fin-canc")
        )
        expect(res.status).toBe(400)
        expect((await res.json()) as { error: string }).toEqual({
          error: "Un trabajo cancelado no puede finalizarse.",
        })
        expect(await contarEventos("mt-acc-fin-canc", "MT_WORK_FINISHED")).toBe(0)
      })
    })
  })

  describe("preventivo automático al finalizar", () => {
    it("crea el próximo preventivo (+periodicidad) UNA vez, idempotente por procedencia", async () => {
      const { finalizar } = await cargaModulos()
      const titulo = "Mantención preventiva TEST mensual"
      await crearTrabajoBD({
        id: "mt-acc-prevent-1",
        estado: "en_curso",
        titulo,
        preventivo: { periodicidadMeses: 1 },
      })
      await conSesion(async () => {
        const res = await finalizar.POST(
          pedir("mt/trabajos/mt-acc-prevent-1/finalizar", {
            fechaTermino: "2026-08-25",
            costoFinal: 185_000,
          }),
          ctx("mt-acc-prevent-1")
        )
        expect(res.status).toBe(200)

        const hijos = await prisma.trabajoMT.findMany({
          where: { comunidadId: comunidad, id: { not: "mt-acc-prevent-1" }, titulo },
        })
        expect(hijos).toHaveLength(1)
        const hijo = hijos[0]!
        expect(hijo.estado).toBe("planificado")
        expect(hijo.fechaProgramada).toBe("2026-09-25")
        expect(hijo.folio).toMatch(/^MT-\d{4}$/)
        expect(await contarEventos(hijo.id, "MT_PREVENTIVE_GENERATED")).toBe(1)

        // Segundo intento sobre un padre ya finalizado: rechazo, sin clon nuevo.
        const dup = await finalizar.POST(
          pedir("mt/trabajos/mt-acc-prevent-1/finalizar", { fechaTermino: "2026-08-25" }),
          ctx("mt-acc-prevent-1")
        )
        expect(dup.status).toBe(400)

        // Re-finalización tras reabrir el padre: la procedencia reutiliza el hijo.
        await prisma.trabajoMT.update({
          where: { id: "mt-acc-prevent-1" },
          data: { estado: "en_curso" },
        })
        const again = await finalizar.POST(
          pedir("mt/trabajos/mt-acc-prevent-1/finalizar", { fechaTermino: "2026-08-25" }),
          ctx("mt-acc-prevent-1")
        )
        expect(again.status).toBe(200)
        const hijosTras = await prisma.trabajoMT.findMany({
          where: { comunidadId: comunidad, id: { not: "mt-acc-prevent-1" }, titulo },
        })
        expect(hijosTras).toHaveLength(1)
        expect(await contarEventos(hijo.id, "MT_PREVENTIVE_GENERATED")).toBe(1)
      })
    })
  })

  describe("verificar garantías", () => {
    it("marca la garantía vencida y emite MT_GUARANTEE_EXPIRED una sola vez", async () => {
      const { garantias } = await cargaModulos()
      await crearTrabajoBD({
        id: "mt-acc-gar-venc",
        estado: "finalizado",
        garantiaFin: "2020-01-01",
      })
      await crearTrabajoBD({
        id: "mt-acc-gar-vigente",
        estado: "finalizado",
        garantiaFin: "2099-12-31",
      })
      await crearTrabajoBD({
        id: "mt-acc-gar-nofin",
        estado: "en_curso",
        garantiaFin: "2020-01-01",
      })
      await conSesion(async () => {
        const res = await garantias.POST()
        expect(res.status).toBe(200)

        const vencida = await prisma.trabajoMT.findUnique({ where: { id: "mt-acc-gar-venc" } })
        expect(vencida?.alertaGarantiaEnviada).toBe(true)
        expect(await contarEventos("mt-acc-gar-venc", "MT_GUARANTEE_EXPIRED")).toBe(1)

        const vigente = await prisma.trabajoMT.findUnique({ where: { id: "mt-acc-gar-vigente" } })
        expect(vigente?.alertaGarantiaEnviada).toBe(false)
        expect(await contarEventos("mt-acc-gar-vigente", "MT_GUARANTEE_EXPIRED")).toBe(0)

        const noFin = await prisma.trabajoMT.findUnique({ where: { id: "mt-acc-gar-nofin" } })
        expect(noFin?.alertaGarantiaEnviada).toBe(false)
        expect(await contarEventos("mt-acc-gar-nofin", "MT_GUARANTEE_EXPIRED")).toBe(0)

        const bis = await garantias.POST()
        expect(bis.status).toBe(200)
        expect(await contarEventos("mt-acc-gar-venc", "MT_GUARANTEE_EXPIRED")).toBe(1)
      })
    })
  })

  describe("guard saldoFondo en proyectos", () => {
    const proyecto = (overrides: Record<string, unknown> = {}) => ({
      id: "mt-acc-py-1",
      nombre: "Techos TEST",
      presupuestoEstimado: 12_000_000,
      plazoMeses: 120,
      estado: "planificado",
      fondoFinanciamientoId: fondoGC,
      ...overrides,
    })

    it("presupuesto mayor al saldo del fondo → 409 'Saldo insuficiente'", async () => {
      const { proyectos } = await cargaModulos()
      await conSesion(async () => {
        const res = await proyectos.POST(pedir("mt/proyectos", proyecto()))
        expect(res.status).toBe(409)
        const cuerpo = (await res.json()) as { error: string }
        expect(cuerpo.error).toContain("Saldo insuficiente")
        expect(cuerpo.error).toContain(SALDO_GC.toLocaleString("es-CL"))
        expect(await prisma.proyectoMT.findUnique({ where: { id: "mt-acc-py-1" } })).toBeNull()
      })
    })

    it("presupuesto dentro del saldo → se crea", async () => {
      const { proyectos } = await cargaModulos()
      await conSesion(async () => {
        const res = await proyectos.POST(
          pedir("mt/proyectos", proyecto({ id: "mt-acc-py-2", presupuestoEstimado: 500_000 }))
        )
        expect(res.status).toBe(201)
        const enBd = await prisma.proyectoMT.findUnique({ where: { id: "mt-acc-py-2" } })
        expect(enBd?.presupuestoEstimado).toBe(500_000)
      })
    })

    it("sin fondo de financiamiento → se crea (guard no aplica)", async () => {
      const { proyectos } = await cargaModulos()
      await conSesion(async () => {
        const res = await proyectos.POST(
          pedir(
            "mt/proyectos",
            proyecto({ id: "mt-acc-py-3", presupuestoEstimado: 12_000_000, fondoFinanciamientoId: undefined })
          )
        )
        expect(res.status).toBe(201)
      })
    })

    it("fondo inactivo → 400 sin crear", async () => {
      const { proyectos } = await cargaModulos()
      await conSesion(async () => {
        const res = await proyectos.POST(
          pedir("mt/proyectos", proyecto({ id: "mt-acc-py-4", presupuestoEstimado: 100_000, fondoFinanciamientoId: fondoInactivo }))
        )
        expect(res.status).toBe(400)
        expect((await res.json()) as { error: string }).toMatchObject({
          error: expect.stringContaining("inactivo"),
        })
      })
    })
  })
})
