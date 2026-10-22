/**
 * @vitest-environment node
 *
 * Adelantos PL — anticipo vs préstamo (SERIE-FASE2 §V4). Doctrina DT ORD 2676/140
 * ya verificada por el owner; acá se prueba contra BD real que la implementación
 * la respeta:
 *
 * - `anticipo_regular`: se descuenta 100% en la liquidación siguiente, SIN tope 15%.
 * - `prestamo`: exige acuerdo escrito (400 si falta), topa 15% de la remuneración
 *   bruta y no puede hacer que el total de deducciones pase del 45% conjunto.
 * - Si el líquido no alcanza, el saldo ARRASTRA al período siguiente con alerta
 *   (función pura `calcularDeduccionAdelantos`).
 * - Authz: admin crea/gestiona; comité solo `ver`; 401 sin sesión; 404 cross-comunidad.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest"
import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import {
  adelantoImputableAlPeriodo,
  calcularDeduccionAdelantos,
  saldoVivoAdelanto,
  topeConjuntoDelPeriodo,
  topePrestamoDelPeriodo,
  validarTopeAdelanto,
} from "@/app/api/liquidaciones/adelantos/_calculo"

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

const comunidad = "ade-comunidad"
const otraComunidad = "ade-otra-comunidad"
const emailAdmin = "ade-admin@test.cl"
const emailComite = "ade-comite@test.cl"
const emailAdminOtra = "ade-admin-otra@test.cl"

const emailToId = (email: string): string => email.split("@")[0] ?? email

/** Ficha PE del trabajador de prueba (sueldo base 500.000). */
const ficha = {
  id: "lab-ade-1",
  cargo: "Conserje Turno Día",
  afp: "AFP Habitat",
  prevision: "FONASA",
  fechaIngreso: "2021-06-15",
  tipoContrato: "indefinido",
  afpId: "ade-afp-1",
  saludId: "ade-fonasa-1",
  asignacionFamiliarId: "ade-asf-1",
  cargas: 1,
  jornadaBaseHoras: 44,
  sueldoBase: 500000,
}

const cargaModulos = async () => ({
  col: await import("@/app/api/liquidaciones/adelantos/route"),
  desestimar: await import("@/app/api/liquidaciones/adelantos/[id]/desestimar/route"),
  liquidaciones: await import("@/app/api/liquidaciones/route"),
  confirmar: await import("@/app/api/liquidaciones/[id]/confirmar/route"),
})

const postJson = async (
  modulo: unknown,
  url: string,
  body?: unknown,
  params?: Record<string, string>
): Promise<Response> => {
  const { POST } = modulo as {
    POST: (
      req: Request,
      ctx?: { params: Promise<Record<string, string>> }
    ) => Promise<Response>
  }
  return POST(
    new NextRequest(`http://localhost${url}`, {
      method: "POST",
      body: JSON.stringify(body ?? {}),
      headers: { "content-type": "application/json" },
    }),
    params ? { params: Promise.resolve(params) } : undefined
  )
}

const crearAdelanto = async (body: unknown): Promise<Response> =>
  postJson((await cargaModulos()).col, "/api/liquidaciones/adelantos", body)

const listarAdelantos = async (): Promise<Response> => {
  const { col } = await cargaModulos()
  return col.GET(
    new NextRequest("http://localhost/api/liquidaciones/adelantos?pageSize=50")
  )
}

const desestimarAdelanto = async (id: string): Promise<Response> =>
  postJson(
    (await cargaModulos()).desestimar,
    `/api/liquidaciones/adelantos/${id}/desestimar`,
    {},
    { id }
  )

const generarLiquidacion = async (body: unknown): Promise<Response> =>
  postJson((await cargaModulos()).liquidaciones, "/api/liquidaciones", body)

const confirmarLiquidacion = async (id: string): Promise<Response> =>
  postJson(
    (await cargaModulos()).confirmar,
    `/api/liquidaciones/${id}/confirmar`,
    {},
    { id }
  )

const adelantoEnBd = (id: string) => prisma.adelantoPL.findUnique({ where: { id } })

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

/** Alta mínima de un adelanto; el pacto y el resto los decide cada test. */
const alta = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  trabajadorPersonaId: "ade-trab-1",
  monto: 100000,
  glosa: "Anticipo de quincena solicitado por el trabajador",
  pacto: "anticipo_regular",
  periodoImputacion: "2026-06",
  ...overrides,
})

beforeAll(async () => {
  process.env.AUTH_SECRET = AUTH_SECRET
  for (const [cid, nombre, slug] of [
    [comunidad, "Comunidad Adelantos", "ade-comunidad"],
    [otraComunidad, "Comunidad Adelantos Otra", "ade-otra"],
  ] as const) {
    await prisma.comunidad.upsert({
      where: { id: cid },
      update: {},
      create: { id: cid, nombre, slug },
    })
  }
  const usuarios: Array<[string, string, string]> = [
    [emailAdmin, "administrador", comunidad],
    [emailComite, "comite", comunidad],
    [emailAdminOtra, "administrador", otraComunidad],
  ]
  for (const [email, rol, comunidadId] of usuarios) {
    await prisma.usuario.upsert({
      where: { email },
      update: {},
      create: { id: emailToId(email), email, activo: true },
    })
    await prisma.membresia.deleteMany({ where: { usuarioId: emailToId(email) } })
    await prisma.membresia.create({
      data: { usuarioId: emailToId(email), comunidadId, rol },
    })
  }
  await prisma.afp.upsert({
    where: { id: "ade-afp-1" },
    update: {},
    create: {
      id: "ade-afp-1",
      comunidadId: comunidad,
      nombre: "AFP Habitat",
      tasaCotizacion: 10.58,
    },
  })
  await prisma.previsionSalud.upsert({
    where: { id: "ade-fonasa-1" },
    update: {},
    create: {
      id: "ade-fonasa-1",
      comunidadId: comunidad,
      nombre: "FONASA",
      tipo: "fonasa",
    },
  })
  await prisma.asignacionFamiliar.upsert({
    where: { id: "ade-asf-1" },
    update: {},
    create: {
      id: "ade-asf-1",
      comunidadId: comunidad,
      nombre: "Tramo A",
      monto: 20622,
    },
  })
  await prisma.configuracionGlobal.upsert({
    where: { comunidadId: comunidad },
    update: {
      ufMensual: 39000,
      ingresoMinimoMensual: 500000,
      topeGratificacionLegal: 4.75,
      tasaSIS: 1.48,
    },
    create: {
      id: "ade-cfg",
      comunidadId: comunidad,
      nombreComunidad: "Comunidad Adelantos",
      rutComunidad: "11.111.111-1",
      direccionOficial: "Calle TEST 123",
      administradorResponsable: "Admin TEST",
      rutAdministrador: "12.345.678-5",
      telefonoAdmin: "+56900000001",
      modoCalculoGC: "prorrateo",
      diaCortePago: 5,
      limiteMesesAvisoCorte: 3,
      smtpHost: "localhost",
      smtpPort: 25,
      smtpUser: "test",
      smtpSecurity: "none",
      smtpFrom: "test@test.cl",
      smtpFromName: "TEST",
      notificarEmisionGC: false,
      notificarRegistroVisitas: false,
      notificarEncomiendas: false,
      notificarReservas: false,
      notificarAvisosSistema: false,
      notificarSugerenciasReclamos: false,
      diasMesComercial: 30,
      diasVacacionesMes: 1.25,
      jornadaSemanalEstandar: 45,
      ufMensual: 39000,
      ingresoMinimoMensual: 500000,
      topeGratificacionLegal: 4.75,
      tasaSIS: 1.48,
    },
  })
  await prisma.fondoFI.upsert({
    where: { id: "ade-fondo-gc" },
    update: { activo: true },
    create: {
      id: "ade-fondo-gc",
      comunidadId: comunidad,
      nombre: "Fondo GC TEST",
      tipo: "gasto_comun",
      activo: true,
    },
  })
  await cargaModulos()
}, 60_000)

beforeEach(async () => {
  state.cookie = ""
  await prisma.adelantoPL.deleteMany({
    where: { comunidadId: { in: [comunidad, otraComunidad] } },
  })
  await prisma.liquidacionPL.deleteMany({
    where: { comunidadId: { in: [comunidad, otraComunidad] } },
  })
  await prisma.egresoFI.deleteMany({
    where: { comunidadId: { in: [comunidad, otraComunidad] } },
  })
  await prisma.notificacion.deleteMany({
    where: { comunidadId: { in: [comunidad, otraComunidad] }, moduloOrigen: "PL" },
  })
  await prisma.eventoAuditoria.deleteMany({
    where: { comunidadId: { in: [comunidad, otraComunidad] }, categoria: "PL" },
  })
  await prisma.persona.deleteMany({
    where: { comunidadId: { in: [comunidad, otraComunidad] } },
  })
  // El trabajador de la comunidad A se recrea para cada test.
  await prisma.persona.create({
    data: {
      id: "ade-trab-1",
      comunidadId: comunidad,
      rut: "13111111-1",
      nombreCompleto: "Trabajador Adelantos TEST",
      nombres: "Trabajador Adelantos",
      apellidos: "TEST",
      email: "ade-trab@test.cl",
      telefonoMovil: "+56900000009",
      estadoCuenta: "activa",
      condicionesEspecialesIds: [],
      roles: ["personal"],
      datosLaborales: ficha,
    } as never,
  })
  await prisma.persona.create({
    data: {
      id: "ade-trab-otra",
      comunidadId: otraComunidad,
      rut: "13222222-2",
      nombreCompleto: "Trabajador Otra TEST",
      nombres: "Trabajador Otra",
      apellidos: "TEST",
      email: "ade-trab-otra@test.cl",
      telefonoMovil: "+56900000010",
      estadoCuenta: "activa",
      condicionesEspecialesIds: [],
      roles: ["personal"],
      datosLaborales: ficha,
    } as never,
  })
})

afterAll(async () => {
  try {
    state.cookie = ""
    await prisma.adelantoPL.deleteMany({
      where: { comunidadId: { in: [comunidad, otraComunidad] } },
    })
    await prisma.liquidacionPL.deleteMany({
      where: { comunidadId: { in: [comunidad, otraComunidad] } },
    })
    await prisma.egresoFI.deleteMany({
      where: { comunidadId: { in: [comunidad, otraComunidad] } },
    })
    await prisma.notificacion.deleteMany({
      where: { comunidadId: { in: [comunidad, otraComunidad] } },
    })
    await prisma.eventoAuditoria.deleteMany({
      where: { comunidadId: { in: [comunidad, otraComunidad] } },
    })
    await prisma.persona.deleteMany({
      where: { comunidadId: { in: [comunidad, otraComunidad] } },
    })
    await prisma.configuracionGlobal.deleteMany({ where: { comunidadId: comunidad } })
    await prisma.afp.delete({ where: { id: "ade-afp-1" } }).catch(() => {})
    await prisma.previsionSalud.delete({ where: { id: "ade-fonasa-1" } }).catch(() => {})
    await prisma.asignacionFamiliar.delete({ where: { id: "ade-asf-1" } }).catch(() => {})
    await prisma.fondoFI.delete({ where: { id: "ade-fondo-gc" } }).catch(() => {})
    for (const email of [emailAdmin, emailComite, emailAdminOtra]) {
      await prisma.membresia.deleteMany({ where: { usuarioId: emailToId(email) } })
      await prisma.usuario.delete({ where: { id: emailToId(email) } }).catch(() => {})
    }
    await prisma.comunidad.delete({ where: { id: otraComunidad } }).catch(() => {})
    await prisma.comunidad.delete({ where: { id: comunidad } }).catch(() => {})
  } catch {
    // limpieza best-effort
  }
})

// --- Función pura: topes y arrastre ----------------------------------------

describe("calcularDeduccionAdelantos — doctrina §V4", () => {
  it("el anticipo regular se descuenta 100% aunque supere el 15% de la bruta", () => {
    const plan = calcularDeduccionAdelantos({
      remuneracionBruta: 500_000,
      deduccionesLegales: 100_000,
      alcanceLiquido: 400_000,
      adelantos: [
        { id: "a1", pacto: "anticipo_regular", saldo: 150_000, periodoImputacion: "2026-06" },
      ],
    })
    // 150.000 > 15% (75.000): el anticipo NO está sujeto al tope del art. 58.
    expect(plan.descuentoAnticipo).toBe(150_000)
    expect(plan.descuentoPrestamo).toBe(0)
    expect(plan.deducciones[0]?.estado).toBe("saldado")
    expect(plan.arrastreTotal).toBe(0)
  })

  it("el préstamo topa 15% de la remuneración bruta y arrastra el resto", () => {
    const plan = calcularDeduccionAdelantos({
      remuneracionBruta: 500_000,
      deduccionesLegales: 100_000,
      alcanceLiquido: 400_000,
      adelantos: [
        { id: "p1", pacto: "prestamo", saldo: 200_000, periodoImputacion: "2026-06" },
      ],
    })
    expect(plan.topePrestamo).toBe(75_000)
    expect(plan.descuentoPrestamo).toBe(75_000)
    expect(plan.deducciones[0]?.saldoResultante).toBe(125_000)
    expect(plan.deducciones[0]?.estado).toBe("descontado_parcial")
    expect(plan.arrastreTotal).toBe(125_000)
    expect(plan.alertas.length).toBeGreaterThan(0)
  })

  it("saldo arrastrado: si el líquido no alcanza, descuenta hasta el líquido y arrastra", () => {
    const plan = calcularDeduccionAdelantos({
      remuneracionBruta: 500_000,
      deduccionesLegales: 100_000,
      alcanceLiquido: 400_000,
      adelantos: [
        { id: "a1", pacto: "anticipo_regular", saldo: 600_000, periodoImputacion: "2026-06" },
      ],
    })
    expect(plan.descuentoAnticipo).toBe(400_000)
    expect(plan.deducciones[0]?.monto).toBe(400_000)
    expect(plan.deducciones[0]?.saldoResultante).toBe(200_000)
    expect(plan.deducciones[0]?.estado).toBe("descontado_parcial")
    expect(plan.arrastreTotal).toBe(200_000)
    expect(plan.alertas.join(" ")).toContain("arrastra")
  })

  it("tope conjunto 45%: la deducción del préstamo se limita al margen que queda", () => {
    // 45% de 500.000 = 225.000; con 200.000 de descuentos legales quedan 25.000.
    const plan = calcularDeduccionAdelantos({
      remuneracionBruta: 500_000,
      deduccionesLegales: 200_000,
      alcanceLiquido: 300_000,
      adelantos: [{ id: "p1", pacto: "prestamo", saldo: 200_000 }],
    })
    expect(plan.topeConjunto).toBe(225_000)
    expect(plan.margenConjunto).toBe(25_000)
    expect(plan.descuentoPrestamo).toBe(25_000)
  })

  it("solo se imputan los adelantos cuyo período ya llegó (y el legado sin período)", () => {
    expect(adelantoImputableAlPeriodo({ periodoImputacion: "2026-06" }, "2026-06")).toBe(true)
    expect(adelantoImputableAlPeriodo({ periodoImputacion: "2026-07" }, "2026-06")).toBe(false)
    // Legado sin período: se imputa en la liquidación siguiente que se genere.
    expect(adelantoImputableAlPeriodo({ periodoImputacion: "" }, "2026-06")).toBe(true)
    // Saldo arrastrado de un mes anterior: sigue vigente.
    expect(adelantoImputableAlPeriodo({ periodoImputacion: "2026-04" }, "2026-06")).toBe(true)
    // Legado sin saldo explícito: vale su monto completo; liquidado, cero.
    expect(saldoVivoAdelanto({ monto: 50_000, saldo: 0, estado: "pendiente" })).toBe(50_000)
    expect(saldoVivoAdelanto({ monto: 50_000, saldo: 0, estado: "saldado" })).toBe(0)
  })

  it("validarTopeAdelanto: anticipo sin tope, préstamo con 15% y 45%", () => {
    const anticipo = validarTopeAdelanto({
      pacto: "anticipo_regular",
      monto: 900_000,
      remuneracionBruta: 500_000,
      deduccionesRegistradas: 0,
      cuotasPrestamoDelPeriodo: 0,
    })
    expect(anticipo.ok).toBe(true)

    const prestamoCaro = validarTopeAdelanto({
      pacto: "prestamo",
      monto: 100_000,
      remuneracionBruta: 500_000,
      deduccionesRegistradas: 0,
      cuotasPrestamoDelPeriodo: 0,
    })
    expect(prestamoCaro.ok).toBe(false)
    if (!prestamoCaro.ok) expect(prestamoCaro.error).toContain("15%")

    const conjunto = validarTopeAdelanto({
      pacto: "prestamo",
      monto: 70_000,
      remuneracionBruta: 500_000,
      deduccionesRegistradas: 160_000,
      cuotasPrestamoDelPeriodo: 0,
    })
    expect(conjunto.ok).toBe(false)
    if (!conjunto.ok) expect(conjunto.error).toContain("45%")

    expect(topePrestamoDelPeriodo(500_000)).toBe(75_000)
    expect(topeConjuntoDelPeriodo(500_000)).toBe(225_000)
  })
})

// --- API: alta, listado y baja con historia --------------------------------

describe("POST /api/liquidaciones/adelantos — alta", () => {
  it("401 sin sesión (listado y alta)", async () => {
    state.cookie = ""
    expect((await listarAdelantos()).status).toBe(401)
    expect((await crearAdelanto(alta())).status).toBe(401)
  })

  it("403: el comité lee adelantos pero no los crea", async () => {
    await conSesion(emailComite, async () => {
      expect((await listarAdelantos()).status).toBe(200)
      const res = await crearAdelanto(alta())
      expect(res.status).toBe(403)
    })
  })

  it("anticipo regular SIN acuerdo escrito: se crea con folio ADE, saldo y estado", async () => {
    await conSesion(emailAdmin, async () => {
      const res = await crearAdelanto(alta({ monto: 150_000 }))
      expect(res.status).toBe(201)
      const creado = (await res.json()) as { id: string }
      const enBd = await adelantoEnBd(creado.id)
      expect(enBd).not.toBeNull()
      expect(enBd?.folio).toMatch(/^ADE-/)
      expect(enBd?.pacto).toBe("anticipo_regular")
      expect(enBd?.saldo).toBe(150_000)
      expect(enBd?.estado).toBe("pendiente")
      expect(enBd?.periodoImputacion).toBe("2026-06")
      const evento = await prisma.eventoAuditoria.findFirst({
        where: { comunidadId: comunidad, tipoAccion: "PL_ADD_ADVANCE" },
      })
      expect(evento).not.toBeNull()
    })
  })

  it("préstamo SIN acuerdo escrito → 400 y no se persiste", async () => {
    await conSesion(emailAdmin, async () => {
      const res = await crearAdelanto(alta({ pacto: "prestamo", monto: 50_000 }))
      expect(res.status).toBe(400)
      const cuerpo = (await res.json()) as { error: string }
      expect(cuerpo.error).toContain("acuerdo escrito")
      expect(
        await prisma.adelantoPL.count({ where: { comunidadId: comunidad } })
      ).toBe(0)
    })
  })

  it("préstamo que supera el 15% de la remuneración bruta → 400", async () => {
    await conSesion(emailAdmin, async () => {
      // Sin liquidación del período, la bruta de referencia es el sueldo base (500.000) → 15% = 75.000.
      const res = await crearAdelanto(
        alta({
          pacto: "prestamo",
          monto: 100_000,
          acuerdoEscritoRef: "Acuerdo de mutuo 2026-06 firmado",
        })
      )
      expect(res.status).toBe(400)
      const cuerpo = (await res.json()) as { error: string }
      expect(cuerpo.error).toContain("15%")
      expect(
        await prisma.adelantoPL.count({ where: { comunidadId: comunidad } })
      ).toBe(0)
    })
  })

  it("tope conjunto 45% superado con otro préstamo del período → 400", async () => {
    await conSesion(emailAdmin, async () => {
      // Liquidación del período: bruta 625.000 (15% = 93.750; 45% = 281.250) y
      // deducciones registradas ≈ 122.875.
      const liq = await generarLiquidacion({
        trabajadorPersonaId: "ade-trab-1",
        periodo: "2026-06",
        diasTrabajados: 30,
      })
      expect(liq.status).toBe(201)
      const primera = await crearAdelanto(
        alta({
          pacto: "prestamo",
          monto: 93_750,
          acuerdoEscritoRef: "Acuerdo de mutuo A 2026-06",
        })
      )
      expect(primera.status).toBe(201)
      // 122.875 (legales) + 93.750 (préstamo A) + 93.750 (B) = 310.375 > 281.250.
      const segunda = await crearAdelanto(
        alta({
          pacto: "prestamo",
          monto: 93_750,
          acuerdoEscritoRef: "Acuerdo de mutuo B 2026-06",
        })
      )
      expect(segunda.status).toBe(400)
      const cuerpo = (await segunda.json()) as { error: string }
      expect(cuerpo.error).toContain("45%")
    })
  })

  it("404 cross-comunidad: la administración de otra comunidad no ve ni crea", async () => {
    await conSesion(emailAdminOtra, async () => {
      const res = await crearAdelanto(alta())
      expect(res.status).toBe(404)
      const cuerpo = (await res.json()) as { error: string }
      expect(cuerpo.error).toContain("Maestro de Personas")
    })
  })
})

describe("desestimar — baja con historia", () => {
  it("marca desestimado y anula el saldo sin borrar el registro", async () => {
    await conSesion(emailAdmin, async () => {
      const res = await crearAdelanto(alta({ monto: 120_000 }))
      const creado = (await res.json()) as { id: string }
      const baja = await desestimarAdelanto(creado.id)
      expect(baja.status).toBe(200)
      const enBd = await adelantoEnBd(creado.id)
      expect(enBd).not.toBeNull()
      expect(enBd?.estado).toBe("desestimado")
      expect(enBd?.saldo).toBe(0)
      // Idempotencia de la baja: ya desestimado → 409 (no se toca el registro).
      expect((await desestimarAdelanto(creado.id)).status).toBe(409)
    })
  })

  it("404 cross-comunidad al desestimar", async () => {
    await conSesion(emailAdmin, async () => {
      const res = await crearAdelanto(alta())
      const creado = (await res.json()) as { id: string }
      await conSesion(emailAdminOtra, async () => {
        expect((await desestimarAdelanto(creado.id)).status).toBe(404)
      })
    })
  })
})

// --- Aplicación en la liquidación ------------------------------------------

describe("liquidación — anticipo 100% y préstamo al 15% con saldo vivo", () => {
  it("el anticipo se descuenta completo en la liquidación y queda saldado al confirmar", async () => {
    await conSesion(emailAdmin, async () => {
      const altaRes = await crearAdelanto(alta({ monto: 400_000 }))
      const { id: adelantoId } = (await altaRes.json()) as { id: string }

      const liq = await generarLiquidacion({
        trabajadorPersonaId: "ade-trab-1",
        periodo: "2026-06",
        diasTrabajados: 30,
      })
      expect(liq.status).toBe(201)
      const liquidacion = (await liq.json()) as {
        id: string
        descuentoAnticipos: number
        adelantosIds: string[]
        liquidoAPagar: number
      }
      // 100% del anticipo, sin tope 15% (la bruta es 625.000 y el anticipo 400.000).
      expect(liquidacion.descuentoAnticipos).toBe(400_000)
      expect(liquidacion.adelantosIds).toEqual([adelantoId])
      expect(liquidacion.liquidoAPagar).toBeGreaterThan(0)

      const confirmacion = await confirmarLiquidacion(liquidacion.id)
      expect(confirmacion.status).toBe(200)
      const enBd = await adelantoEnBd(adelantoId)
      expect(enBd?.estado).toBe("saldado")
      expect(enBd?.saldo).toBe(0)
      expect(enBd?.liquidacionId).toBe(liquidacion.id)
      // La deducción queda ligada a su liquidación (auditoría documental).
      const deducciones = (enBd?.deducciones ?? []) as unknown as Array<{
        liquidacionId: string
        monto: number
      }>
      expect(deducciones).toHaveLength(1)
      expect(deducciones[0]?.liquidacionId).toBe(liquidacion.id)
      expect(deducciones[0]?.monto).toBe(400_000)
    })
  })

  it("el préstamo se descuenta hasta el 15% y deja saldo parcial tras confirmar", async () => {
    await conSesion(emailAdmin, async () => {
      const altaRes = await crearAdelanto(
        alta({
          pacto: "prestamo",
          monto: 70_000,
          acuerdoEscritoRef: "Acuerdo de mutuo 2026-06 firmado",
        })
      )
      // Sin liquidación del período, el tope se mide sobre el sueldo base
      // (500.000 → 15% = 75.000): 70.000 entra sin problemas.
      expect(altaRes.status).toBe(201)
      const { id: adelantoId } = (await altaRes.json()) as { id: string }

      const liq = await generarLiquidacion({
        trabajadorPersonaId: "ade-trab-1",
        periodo: "2026-06",
        diasTrabajados: 30,
      })
      expect(liq.status).toBe(201)
      const liquidacion = (await liq.json()) as {
        id: string
        descuentoAnticipos: number
        liquidoAPagar: number
      }
      // Bruta 625.000 → 15% = 93.750, así que el préstamo de 70.000 cabe completo.
      expect(liquidacion.descuentoAnticipos).toBe(70_000)

      // Para ver el tope actuando, el mismo préstamo se re-genera con saldo mayor.
      await prisma.adelantoPL.update({
        where: { id: adelantoId },
        data: { saldo: 200_000, monto: 200_000, periodoImputacion: "2026-08" },
      })
      await prisma.liquidacionPL.delete({ where: { id: liquidacion.id } })
      const liq2 = await generarLiquidacion({
        trabajadorPersonaId: "ade-trab-1",
        periodo: "2026-08",
        diasTrabajados: 30,
      })
      expect(liq2.status).toBe(201)
      const liquidacion2 = (await liq2.json()) as {
        id: string
        descuentoAnticipos: number
        totalHaberes: number
      }
      // La bruta del período incluye la asignación familiar (no imponible pero
      // remuneración): el tope del 15% se calcula sobre el total de haberes.
      expect(liquidacion2.descuentoAnticipos).toBe(
        Math.round(liquidacion2.totalHaberes * 0.15)
      )
      // Y nunca descuenta el saldo completo del préstamo (200.000) de una vez.
      expect(liquidacion2.descuentoAnticipos).toBeLessThan(200_000)

      expect((await confirmarLiquidacion(liquidacion2.id)).status).toBe(200)
      const enBd = await adelantoEnBd(adelantoId)
      expect(enBd?.estado).toBe("descontado_parcial")
      expect(enBd?.saldo).toBe(200_000 - liquidacion2.descuentoAnticipos)
    })
  })
})
