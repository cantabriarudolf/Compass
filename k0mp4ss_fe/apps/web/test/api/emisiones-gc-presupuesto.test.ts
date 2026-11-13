/**
 * @vitest-environment node
 *
 * F31 · V1 corregido (S6) — el presupuesto es ESTIMATIVO y la emisión se cobra
 * por el gasto DEVENGADO (Ley 21.442 art. 22).
 *
 * Contrato medido acá, contra Prisma real y la ruta real:
 *   1. sin presupuesto aprobado del año → 201, `presupuestoId` null y la
 *      advertencia literal en la respuesta y en la bitácora;
 *   2. con presupuesto vigente y un total BAJO su doceavo mensual → 201 sin
 *      exceso declarado;
 *   3. con presupuesto y un total SOBRE el doceavo → 201 (la emisión NO se
 *      bloquea) con el exceso y los DOS números en la respuesta y en la bitácora;
 *   4. el monto emitido es el gasto devengado del período, nunca el total del
 *      presupuesto: con un presupuesto de $12.000.000, emitir $900.000 deja una
 *      emisión de $900.000;
 *   5. el presupuesto de otro año nunca se usa para el contraste;
 *   6. la traza al presupuesto usado no se reescribe con un parche de la emisión.
 *
 * El presupuesto no reemplaza el monto a cobrar: el art. 22 lo declara
 * estimativo y el cobro es por los gastos efectivamente devengados. Un gasto
 * urgente o imprevisto que supere el doceavo es lícito, así que la ruta lo
 * declara y sigue; y sin presupuesto aprobado la administración no puede quedar
 * impedida de cobrar.
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

const COMUNIDAD = "egp5-com-a"
const NOMBRE_COMUNIDAD = "Comunidad Presupuesto A"
const EMAIL_ADMIN = "egp5-admin@test.cl"
const USUARIO_ADMIN = "egp5-user-admin"
const FONDO_GC = "egp5-fondo-gc"
const ACUERDO_2026 = "egp5-acuerdo-2026"
const ACUERDO_2027 = "egp5-acuerdo-2027"

/** Presupuesto de 2026: $12.000.000 anuales ⇒ doceavo mensual de $1.000.000. */
const PARTIDAS_2026 = [4000000, 4000000, 4000000]
/** Presupuesto vigente de 2027: $1.200.000 anuales ⇒ doceavo de $100.000. */
const PARTIDAS_2027 = [700000, 500000]
/** Versión reemplazada de 2027: si se usara, el doceavo sería $66.666,67. */
const PARTIDAS_2027_REEMPLAZADAS = [800000]

const TOTAL_2026 = 12000000
const TOTAL_2027 = 1200000

/** Advertencia literal cuando no hay presupuesto con qué contrastar. */
const ADVERTENCIA_SIN_PRESUPUESTO =
  "no hay presupuesto aprobado para el año, la emisión no puede contrastarse"

async function crearPresupuesto(datos: {
  id: string
  periodo: string
  version: number
  estado: "vigente" | "reemplazado"
  acuerdoId: string
  partidas: readonly number[]
}): Promise<string> {
  await prisma.presupuesto.create({
    data: {
      id: datos.id,
      comunidadId: COMUNIDAD,
      periodo: datos.periodo,
      cuerpo: "asamblea",
      acuerdoId: datos.acuerdoId,
      version: datos.version,
      estado: datos.estado,
      // El snapshot que persiste el alta de F31: la suma exacta de las partidas.
      total: datos.partidas.reduce((total, monto) => total + monto, 0),
      creadoPor: USUARIO_ADMIN,
    },
  })
  await prisma.partidaPresupuesto.createMany({
    data: datos.partidas.map((monto, indice) => ({
      id: `${datos.id}-p${indice + 1}`,
      comunidadId: COMUNIDAD,
      presupuestoId: datos.id,
      nombre: `Partida ${indice + 1}`,
      categoria: "otro",
      monto,
      orden: indice + 1,
    })),
  })
  return datos.id
}

describe("/api/emisiones-gc — contraste con el presupuesto estimativo (S6)", () => {
  beforeAll(async () => {
    process.env.AUTH_SECRET = AUTH_SECRET
    process.env.NEXT_PUBLIC_APP_ENV = "development"
    await limpiarEntidades()
    await prisma.comunidad.upsert({
      where: { id: COMUNIDAD },
      update: {},
      create: { id: COMUNIDAD, nombre: NOMBRE_COMUNIDAD, slug: "egp5-a" },
    })
    await prisma.usuario.upsert({
      where: { email: EMAIL_ADMIN },
      update: { activo: true },
      create: { id: USUARIO_ADMIN, email: EMAIL_ADMIN, activo: true },
    })
    await prisma.membresia.deleteMany({ where: { usuarioId: USUARIO_ADMIN } })
    await prisma.membresia.create({
      data: { usuarioId: USUARIO_ADMIN, comunidadId: COMUNIDAD, rol: "administrador" },
    })

    // El acuerdo foliado que respalda el presupuesto (F31): el cuerpo que aprueba
    // lo define el reglamento y se COPIA al presupuesto.
    for (const acuerdo of [
      { id: ACUERDO_2026, folio: "AD-2026-7" },
      { id: ACUERDO_2027, folio: "AD-2027-2" },
    ]) {
      await prisma.acuerdo.create({
        data: {
          id: acuerdo.id,
          comunidadId: COMUNIDAD,
          cuerpo: "asamblea",
          materia: "Presupuesto anual de partidas",
          folio: acuerdo.folio,
          estado: "aprobado",
          quorumRequerido: "mayoria_absoluta_presentes",
          creadoPor: USUARIO_ADMIN,
        },
      })
    }

    await prisma.tipoUnidad.create({
      data: {
        id: "egp5-tu-1",
        comunidadId: COMUNIDAD,
        nombre: "Departamento 50m2",
        categoria: "departamento",
        metraje: 50,
        montoBaseGc: 50000,
        activo: true,
        historialTarifas: [],
      },
    })
    for (const u of [
      { id: "egp5-u-1", numero: "101", prorrateo: 0.5 },
      { id: "egp5-u-2", numero: "102", prorrateo: 0.5 },
    ]) {
      await prisma.unidad.create({
        data: {
          id: u.id,
          comunidadId: COMUNIDAD,
          microSectorId: "egp5-ms-1",
          numero: u.numero,
          etiqueta: `Depto ${u.numero}`,
          tipoUnidadId: "egp5-tu-1",
          metraje: 50,
          prorrateo: u.prorrateo,
          rolSii: `9000-${u.numero}`,
          estadoId: "egp5-est-1",
          servicios: {},
        },
      })
    }
    for (const [indice, unidadId] of ["egp5-u-1", "egp5-u-2"].entries()) {
      const personaId = `egp5-p-${indice + 1}`
      await prisma.persona.create({
        data: {
          id: personaId,
          comunidadId: COMUNIDAD,
          rut: `3333333${indice + 1}-${indice + 1}`,
          nombreCompleto: `Propietario ${indice + 1}`,
          nombres: "Propietario",
          apellidos: `${indice + 1}`,
          email: `${personaId}@test.cl`,
          telefonoMovil: "+56900000000",
          estadoCuenta: "activa",
          condicionesEspecialesIds: [],
          roles: [],
        },
      })
      await prisma.vinculoUnidad.create({
        data: {
          id: `egp5-v-${indice + 1}`,
          comunidadId: COMUNIDAD,
          personaId,
          unidadId,
          rol: "propietario",
          fechaInicio: "2025-01-01",
          permiteVerFinanzas: true,
        },
      })
    }
    await prisma.fondoFI.create({
      data: {
        id: FONDO_GC,
        comunidadId: COMUNIDAD,
        nombre: "Fondo Gasto Común EGP5",
        tipo: "gasto_comun",
        activo: true,
      },
    })
    // Sin recargo de reserva: el monto de la unidad es el prorrateo pelado y así
    // el total de la emisión se mide contra el doceavo sin ruido.
    await prisma.versionReglamento.create({
      data: {
        id: "egp5-vreg-1",
        comunidadId: COMUNIDAD,
        version: 1,
        vigenteDesde: "2025-01",
        fuenteInstrumento: "reglamento_copropiedad",
        formaContribucion: "monto_por_tipo",
        parametros: {
          porcentajeReserva: 0,
          diasPagoGc: 10,
          tasaMoraMensualPct: 1,
          topeMoraPct: 50,
          cuotasCorte: 3,
          diasPreavisoCorte: 5,
          ipcActivo: false,
        },
      } as never,
    })
  }, 30_000)

  afterAll(async () => {
    state.cookie = ""
    delete process.env.NEXT_PUBLIC_APP_ENV
    await limpiarEntidades()
    await prisma.membresia.deleteMany({ where: { usuarioId: USUARIO_ADMIN } })
    await prisma.usuario.deleteMany({ where: { email: EMAIL_ADMIN } })
    await prisma.comunidad.deleteMany({ where: { id: COMUNIDAD } })
  })

  async function limpiarEntidades(): Promise<void> {
    await prisma.cobroFI.deleteMany({ where: { comunidadId: COMUNIDAD } })
    await prisma.emisionGC.deleteMany({ where: { comunidadId: COMUNIDAD } })
    await prisma.partidaPresupuesto.deleteMany({ where: { comunidadId: COMUNIDAD } })
    await prisma.presupuesto.deleteMany({ where: { comunidadId: COMUNIDAD } })
    await prisma.acuerdo.deleteMany({ where: { comunidadId: COMUNIDAD } })
    await prisma.versionReglamento.deleteMany({ where: { comunidadId: COMUNIDAD } })
    await prisma.vinculoUnidad.deleteMany({ where: { comunidadId: COMUNIDAD } })
    await prisma.persona.deleteMany({ where: { comunidadId: COMUNIDAD } })
    await prisma.unidad.deleteMany({ where: { comunidadId: COMUNIDAD } })
    await prisma.tipoUnidad.deleteMany({ where: { comunidadId: COMUNIDAD } })
    await prisma.fondoFI.deleteMany({ where: { comunidadId: COMUNIDAD } })
  }

  async function conSesion(fn: () => Promise<void>): Promise<void> {
    const { cookieSesionAuthjs } = await import("../helpers/sesion-authjs")
    state.cookie = await cookieSesionAuthjs({ sub: USUARIO_ADMIN, email: EMAIL_ADMIN })
    try {
      await fn()
    } finally {
      state.cookie = ""
    }
  }

  async function emitir(body: unknown): Promise<Response> {
    const ruta = await import("@/app/api/emisiones-gc/route")
    const req = new NextRequest("http://localhost/api/emisiones-gc", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    })
    return ruta.POST(req)
  }

  type EmisionJson = {
    emision: {
      id: string
      periodo: string
      modo: string
      gastoTotal: number
      lineas: { unidadId: string; monto: number }[]
      presupuestoId?: string | null
    }
    cobros: { unidadId: string; montoBase: number }[]
    advertencia?: string | null
    exceso?: {
      montoEmitido: number
      referenciaMensual: number
      diferencia: number
      descripcion: string
    } | null
  }

  async function eventoDe(emisionId: string): Promise<{ descripcion: string }> {
    return prisma.eventoAuditoria.findFirstOrThrow({
      where: {
        comunidadId: COMUNIDAD,
        tipoAccion: "FI_EMISION_GC_CREADA",
        referenciaId: emisionId,
      },
      select: { descripcion: true },
    })
  }

  async function contarDelPeriodo(periodo: string): Promise<{
    emisiones: number
    cobros: number
  }> {
    const emisiones = await prisma.emisionGC.count({
      where: { comunidadId: COMUNIDAD, periodo },
    })
    const cobros = await prisma.cobroFI.count({
      where: { comunidadId: COMUNIDAD, periodo },
    })
    return { emisiones, cobros }
  }

  // ── 1. Sin presupuesto aprobado la emisión corre, con su advertencia ───────
  // Corre PRIMERO: este caso mide la ausencia de presupuesto de cualquier año.
  it("sin presupuesto aprobado del año → 201, presupuestoId null y la advertencia en respuesta y bitácora", async () => {
    let emisionId = ""
    await conSesion(async () => {
      const res = await emitir({
        periodo: "2029-01",
        modo: "variable",
        gastoTotal: 150000,
      })
      // El comité no aprobar un presupuesto no impide cobrar: la emisión corre.
      expect(res.status).toBe(201)
      const j = (await res.json()) as EmisionJson
      emisionId = j.emision.id
      expect(j.emision.gastoTotal).toBe(150000)
      expect(j.emision.presupuestoId).toBeNull()
      expect(j.advertencia).toContain(ADVERTENCIA_SIN_PRESUPUESTO)
      expect(j.exceso).toBeNull()
      // 150.000 repartido 50/50 entre las dos unidades.
      expect(j.cobros.map((c) => c.montoBase).sort((a, b) => a - b)).toEqual([
        75000, 75000,
      ])
      const guardada = await prisma.emisionGC.findUniqueOrThrow({
        where: { id: j.emision.id },
      })
      expect(guardada.presupuestoId).toBeNull()
    })
    const evento = await eventoDe(emisionId)
    expect(evento.descripcion).toContain(ADVERTENCIA_SIN_PRESUPUESTO)
  })

  // ── 2. Bajo el doceavo mensual: se emite y no hay exceso que declarar ──────
  it("con presupuesto y un total bajo el doceavo → 201 sin exceso", async () => {
    await crearPresupuesto({
      id: "egp5-pre-2026",
      periodo: "2026",
      version: 1,
      estado: "vigente",
      acuerdoId: ACUERDO_2026,
      partidas: PARTIDAS_2026,
    })
    await conSesion(async () => {
      const res = await emitir({
        periodo: "2026-01",
        modo: "variable",
        gastoTotal: 500000,
      })
      expect(res.status).toBe(201)
      const j = (await res.json()) as EmisionJson
      // El monto cobrado es el devengado del mes, no el presupuesto anual.
      expect(j.emision.gastoTotal).toBe(500000)
      expect(j.emision.presupuestoId).toBe("egp5-pre-2026")
      // 500.000 < 1.000.000 de doceavo: no hay exceso ni advertencia.
      expect(j.exceso).toBeNull()
      expect(j.advertencia).toBeNull()
      const evento = await eventoDe(j.emision.id)
      // La bitácora nombra el documento usado: período, versión y folio.
      expect(evento.descripcion).toContain("2026")
      expect(evento.descripcion).toContain("versión 1")
      expect(evento.descripcion).toContain("AD-2026-7")
      expect(evento.descripcion).toContain("12.000.000")
    })
  })

  // ── 3. Sobre el doceavo: se declara el exceso y NO se bloquea ──────────────
  it("con presupuesto y un total sobre el doceavo → 201, exceso con los dos números y sin bloqueo", async () => {
    await crearPresupuesto({
      id: "egp5-pre-2027-v1",
      periodo: "2027",
      version: 1,
      estado: "reemplazado",
      acuerdoId: ACUERDO_2027,
      partidas: PARTIDAS_2027_REEMPLAZADAS,
    })
    await crearPresupuesto({
      id: "egp5-pre-2027-v2",
      periodo: "2027",
      version: 2,
      estado: "vigente",
      acuerdoId: ACUERDO_2027,
      partidas: PARTIDAS_2027,
    })
    let emisionId = ""
    await conSesion(async () => {
      // 250.000 sobre un doceavo de 100.000: es un gasto que la ley admite.
      const res = await emitir({
        periodo: "2027-01",
        modo: "variable",
        gastoTotal: 250000,
      })
      expect(res.status).toBe(201)
      const j = (await res.json()) as EmisionJson
      emisionId = j.emision.id
      // La emisión se cobra por lo devengado, no por el presupuesto.
      expect(j.emision.gastoTotal).toBe(250000)
      // Con dos versiones, la que contrasta es la VIGENTE (v2), no la reemplazada.
      expect(j.emision.presupuestoId).toBe("egp5-pre-2027-v2")
      expect(j.exceso).not.toBeNull()
      // Los DOS números: lo emitido y la referencia mensual del presupuesto.
      expect(j.exceso?.montoEmitido).toBe(250000)
      expect(j.exceso?.referenciaMensual).toBe(100000)
      expect(j.exceso?.diferencia).toBe(150000)
      expect(j.exceso?.descripcion).toContain("$250.000")
      expect(j.exceso?.descripcion).toContain("$100.000")
      expect(j.exceso?.descripcion).toContain("no se bloquea")
      // El bloqueo no existe: la emisión y sus cobros quedaron escritos.
      expect(await contarDelPeriodo("2027-01")).toEqual({ emisiones: 1, cobros: 2 })
    })
    const evento = await eventoDe(emisionId)
    // El mismo exceso, con los dos números, queda en la bitácora.
    expect(evento.descripcion).toContain("$250.000")
    expect(evento.descripcion).toContain("$100.000")
    expect(evento.descripcion).toContain("no se bloquea")
    expect(evento.descripcion).toContain("AD-2027-2")
  })

  // ── 4. El monto emitido es el gasto devengado, nunca el presupuesto ────────
  it("el total tipeado es el que se emite: presupuesto de $12.000.000 y emisión de $900.000", async () => {
    await conSesion(async () => {
      const res = await emitir({
        periodo: "2026-02",
        modo: "variable",
        gastoTotal: 900000,
      })
      expect(res.status).toBe(201)
      const j = (await res.json()) as EmisionJson
      // La emisión cobra el gasto del mes: 900.000, jamás los 12.000.000 del
      // presupuesto anual.
      expect(j.emision.gastoTotal).toBe(900000)
      expect(
        j.emision.lineas.reduce((total, linea) => total + linea.monto, 0)
      ).toBe(900000)
      // 900.000 repartido 50/50 entre las dos unidades.
      expect(j.cobros.map((c) => c.montoBase).sort((a, b) => a - b)).toEqual([
        450000, 450000,
      ])
      // El total no coincide con el presupuesto y la emisión NO se rechaza: el
      // presupuesto es estimativo y el monto es el devengado.
      expect(j.emision.presupuestoId).toBe("egp5-pre-2026")
      // 900.000 no supera el doceavo de 1.000.000: no hay exceso.
      expect(j.exceso).toBeNull()
    })
  })

  // ── 5. El presupuesto de otro año nunca se usa para el contraste ───────────
  it("un presupuesto de otro año no se usa: sin presupuesto del año, advertencia y ningún exceso", async () => {
    // Hay presupuestos de 2026 y 2027 con doceavos muy distintos; usarlos para
    // 2028-01 declararía un exceso que no corresponde a ningún presupuesto.
    let emisionId = ""
    await conSesion(async () => {
      const res = await emitir({
        periodo: "2028-01",
        modo: "variable",
        gastoTotal: 250000,
      })
      expect(res.status).toBe(201)
      const j = (await res.json()) as EmisionJson
      emisionId = j.emision.id
      expect(j.emision.gastoTotal).toBe(250000)
      expect(j.emision.presupuestoId).toBeNull()
      expect(j.advertencia).toContain(ADVERTENCIA_SIN_PRESUPUESTO)
      expect(j.exceso).toBeNull()
    })
    const evento = await eventoDe(emisionId)
    expect(evento.descripcion).toContain(ADVERTENCIA_SIN_PRESUPUESTO)
  })

  // ── 6. La traza al presupuesto no se reescribe con un parche ───────────────
  it("un parche de la emisión no reescribe la traza al presupuesto", async () => {
    // Fila propia con `fondoReservaAporte` declarado: el PUT revalida la entidad
    // mergeada y este Json opcional no admite `null` al leer.
    await prisma.emisionGC.create({
      data: {
        id: "egp5-egc-parche",
        comunidadId: COMUNIDAD,
        periodo: "2026-06",
        modo: "variable",
        gastoTotal: 500000,
        presupuestoId: "egp5-pre-2026",
        lineas: [
          {
            unidadId: "egp5-u-1",
            responsablePersonaId: "egp5-p-1",
            monto: 500000,
            cobroId: "egp5-cob-parche",
          },
        ],
        fondoReservaAporte: { fondoId: FONDO_GC, monto: 1 },
        fechaEmision: "2026-06-05",
      },
    })
    await conSesion(async () => {
      const ruta = await import("@/app/api/emisiones-gc/[id]/route")
      const req = new NextRequest(
        "http://localhost/api/emisiones-gc/egp5-egc-parche",
        {
          method: "PUT",
          body: JSON.stringify({ presupuestoId: "egp5-pre-2027-v2" }),
          headers: { "content-type": "application/json" },
        }
      )
      const res = await ruta.PUT(req, {
        params: Promise.resolve({ id: "egp5-egc-parche" }),
      })
      expect(res.status).toBe(200)
    })
    expect(
      (
        await prisma.emisionGC.findUniqueOrThrow({
          where: { id: "egp5-egc-parche" },
        })
      ).presupuestoId
    ).toBe("egp5-pre-2026")
  })
})
