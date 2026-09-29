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

function generarValido(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "pl-liq-1",
    trabajadorPersonaId: "pl-trab-1",
    periodo: "2026-11",
    diasTrabajados: 30,
    ...overrides,
  }
}

describe("/api/liquidaciones — PL con BD real (SERIE-GATED-API-BD P3)", () => {
  const comunidadA = "pl-comunidad-a"
  const comunidadB = "pl-comunidad-b"
  const emailAdmin = "pl-admin@test.cl"
  const emailResidente = "pl-residente@test.cl"

  const cargaModulos = async () => ({
    col: await import("@/app/api/liquidaciones/route"),
    item: await import("@/app/api/liquidaciones/[id]/route"),
    confirmar: await import("@/app/api/liquidaciones/[id]/confirmar/route"),
  })

  const ficha = {
    id: "lab-pl-1",
    cargo: "Conserje Turno Día",
    afp: "AFP Habitat",
    prevision: "FONASA",
    fechaIngreso: "2021-06-15",
    tipoContrato: "indefinido",
    afpId: "pl-afp-1",
    saludId: "pl-fonasa-1",
    asignacionFamiliarId: "pl-asf-1",
    cargas: 1,
    jornadaBaseHoras: 44,
    sueldoBase: 650000,
  }

  beforeAll(async () => {
    process.env.AUTH_SECRET = AUTH_SECRET
    for (const [cid, nombre, slug] of [
      [comunidadA, "Comunidad A PL", "pl-comunidad-a"],
      [comunidadB, "Comunidad B PL", "pl-comunidad-b"],
    ] as const) {
      await prisma.comunidad.upsert({
        where: { id: cid },
        update: {},
        create: { id: cid, nombre, slug },
      })
    }
    await prisma.usuario.upsert({
      where: { email: emailAdmin },
      update: {},
      create: { id: "pl-usuario-admin", email: emailAdmin, activo: true },
    })
    await prisma.usuario.upsert({
      where: { email: emailResidente },
      update: {},
      create: { id: "pl-usuario-residente", email: emailResidente, activo: true },
    })
    await prisma.membresia.deleteMany({ where: { usuarioId: { in: ["pl-usuario-admin", "pl-usuario-residente"] } } })
    await prisma.membresia.create({
      data: { usuarioId: "pl-usuario-admin", comunidadId: comunidadA, rol: "administrador" },
    })
    await prisma.membresia.create({
      data: { usuarioId: "pl-usuario-residente", comunidadId: comunidadA, rol: "residente" },
    })
    // Maestros legales + CF con parámetros + fondo GC (todo scoped a A).
    await prisma.afp.upsert({
      where: { id: "pl-afp-1" },
      update: {},
      create: { id: "pl-afp-1", comunidadId: comunidadA, nombre: "AFP Habitat", tasaCotizacion: 10.58 },
    })
    await prisma.previsionSalud.upsert({
      where: { id: "pl-fonasa-1" },
      update: {},
      create: { id: "pl-fonasa-1", comunidadId: comunidadA, nombre: "FONASA", tipo: "fonasa" },
    })
    await prisma.asignacionFamiliar.upsert({
      where: { id: "pl-asf-1" },
      update: {},
      create: { id: "pl-asf-1", comunidadId: comunidadA, nombre: "Tramo A", monto: 20622 },
    })
    await prisma.configuracionGlobal.upsert({
      where: { comunidadId: comunidadA },
      update: {
        ufMensual: 39000,
        ingresoMinimoMensual: 500000,
        topeGratificacionLegal: 4.75,
        tasaSIS: 1.48,
      },
      create: {
        id: "pl-cfg-a",
        comunidadId: comunidadA,
        nombreComunidad: "Comunidad A PL",
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
      where: { id: "pl-fondo-gc" },
      update: { activo: true },
      create: { id: "pl-fondo-gc", comunidadId: comunidadA, nombre: "Fondo GC TEST", tipo: "gasto_comun", activo: true },
    })
    await prisma.persona.upsert({
      where: { id: "pl-trab-1" },
      update: {},
      create: {
        id: "pl-trab-1",
        comunidadId: comunidadA,
        rut: "11111111-1",
        nombreCompleto: "Trabajador Uno TEST",
        nombres: "Trabajador Uno",
        apellidos: "TEST",
        email: "trab1@test.cl",
        telefonoMovil: "+56900000002",
        estadoCuenta: "activa",
        condicionesEspecialesIds: [],
        roles: ["personal"],
        datosLaborales: ficha,
      } as never,
    })
    await prisma.liquidacionPL.deleteMany({ where: { comunidadId: { in: [comunidadA, comunidadB] } } })
    await prisma.egresoFI.deleteMany({ where: { comunidadId: comunidadA, categoria: "sueldos" } })
    await prisma.eventoAuditoria.deleteMany({
      where: { comunidadId: comunidadA, tipoAccion: { in: ["PL_GENERATE_PAYSLIP", "PL_EXPENSE_SYNC"] } },
    })
  }, 30_000)

  afterAll(async () => {
    try {
      state.cookie = ""
      await prisma.liquidacionPL.deleteMany({ where: { comunidadId: { in: [comunidadA, comunidadB] } } })
      await prisma.egresoFI.deleteMany({ where: { comunidadId: comunidadA, categoria: "sueldos" } })
      await prisma.eventoAuditoria.deleteMany({
        where: { comunidadId: comunidadA, tipoAccion: { in: ["PL_GENERATE_PAYSLIP", "PL_EXPENSE_SYNC"] } },
      })
      await prisma.persona.delete({ where: { id: "pl-trab-1" } }).catch(() => {})
      await prisma.fondoFI.delete({ where: { id: "pl-fondo-gc" } }).catch(() => {})
      await prisma.configuracionGlobal.deleteMany({ where: { comunidadId: comunidadA } })
      await prisma.afp.delete({ where: { id: "pl-afp-1" } }).catch(() => {})
      await prisma.previsionSalud.delete({ where: { id: "pl-fonasa-1" } }).catch(() => {})
      await prisma.asignacionFamiliar.delete({ where: { id: "pl-asf-1" } }).catch(() => {})
      await prisma.membresia.deleteMany({ where: { usuarioId: { in: ["pl-usuario-admin", "pl-usuario-residente"] } } })
      await prisma.usuario.delete({ where: { id: "pl-usuario-admin" } }).catch(() => {})
      await prisma.usuario.delete({ where: { id: "pl-usuario-residente" } }).catch(() => {})
      await prisma.comunidad.delete({ where: { id: comunidadA } }).catch(() => {})
      await prisma.comunidad.delete({ where: { id: comunidadB } }).catch(() => {})
    } catch { /* best-effort */ }
  })

  async function conSesion(email: string, fn: () => Promise<void>): Promise<void> {
    const user = await prisma.usuario.findUnique({ where: { email } })
    if (!user) throw new Error(`usuario no encontrado: ${email}`)
    const { cookieSesionAuthjs } = await import("../helpers/sesion-authjs")
    state.cookie = await cookieSesionAuthjs({ sub: user.id, email: user.email })
    try { await fn() } finally { state.cookie = "" }
  }

  async function postGenerar(body: unknown): Promise<Response> {
    const { col } = await cargaModulos()
    return col.POST(
      new NextRequest("http://localhost/api/liquidaciones", {
        method: "POST",
        body: JSON.stringify(body),
        headers: { "content-type": "application/json" },
      })
    )
  }

  async function postConfirmar(id: string): Promise<Response> {
    const { confirmar } = await cargaModulos()
    return confirmar.POST(
      new NextRequest(`http://localhost/api/liquidaciones/${id}/confirmar`, { method: "POST" }),
      { params: Promise.resolve({ id }) }
    )
  }

  async function del(id: string): Promise<Response> {
    const { item } = await cargaModulos()
    return item.DELETE(
      new NextRequest(`http://localhost/api/liquidaciones/${id}`, { method: "DELETE" }),
      { params: Promise.resolve({ id }) }
    )
  }

  it("401 sin sesión (generar y confirmar)", async () => {
    const { col } = await cargaModulos()
    state.cookie = ""
    expect((await postGenerar(generarValido())).status).toBe(401)
    expect(
      (
        await col.GET(
          new NextRequest("http://localhost/api/liquidaciones?pageSize=10")
        )
      ).status
    ).toBe(401)
    expect((await postConfirmar("pl-liq-1")).status).toBe(401)
  })

  it("residente no genera ni confirma (403, sueldos admin-only)", async () => {
    await conSesion(emailResidente, async () => {
      expect((await postGenerar(generarValido())).status).toBe(403)
      expect((await postConfirmar("pl-liq-1")).status).toBe(403)
    })
  })

  it("admin genera → 201 con folio LIQ- y snapshot en BD", async () => {
    const { col } = await cargaModulos()
    await conSesion(emailAdmin, async () => {
      const res = await postGenerar(generarValido())
      expect(res.status).toBe(201)
      const enBd = await prisma.liquidacionPL.findUnique({ where: { id: "pl-liq-1" } })
      expect(enBd).not.toBeNull()
      expect(enBd?.comunidadId).toBe(comunidadA)
      expect(enBd?.folio).toMatch(/^LIQ-/)
      expect(enBd?.estado).toBe("borrador")
      expect(enBd?.totalImponible).toBeGreaterThan(0)
      expect(enBd?.liquidoAPagar).toBeGreaterThan(0)
      const evento = await prisma.eventoAuditoria.findMany({
        where: { comunidadId: comunidadA, tipoAccion: "PL_GENERATE_PAYSLIP" },
      })
      expect(evento.length).toBeGreaterThanOrEqual(1)
      const get = await col.GET(
        new NextRequest("http://localhost/api/liquidaciones?pageSize=10")
      )
      expect(get.status).toBe(200)
    })
  })

  it("duplicado trabajador+periodo → 409 sin crear", async () => {
    await conSesion(emailAdmin, async () => {
      const res = await postGenerar(generarValido({ id: "pl-liq-dup" }))
      expect(res.status).toBe(409)
      expect(await prisma.liquidacionPL.findUnique({ where: { id: "pl-liq-dup" } })).toBeNull()
    })
  })

  it("trabajador sin ficha o sin sueldo → 400", async () => {
    await prisma.persona.upsert({
      where: { id: "pl-trab-sin-ficha" },
      update: {},
      create: {
        id: "pl-trab-sin-ficha",
        comunidadId: comunidadA,
        rut: "22222222-2",
        nombreCompleto: "Sin Ficha TEST",
        nombres: "Sin Ficha",
        apellidos: "TEST",
        email: "sinficha@test.cl",
        telefonoMovil: "+56900000003",
        estadoCuenta: "activa",
        condicionesEspecialesIds: [],
        roles: ["personal"],
      } as never,
    })
    await conSesion(emailAdmin, async () => {
      const r1 = await postGenerar(generarValido({ id: "pl-liq-x1", trabajadorPersonaId: "pl-trab-sin-ficha" }))
      expect(r1.status).toBe(400)
      const r2 = await postGenerar(generarValido({ id: "pl-liq-x2", trabajadorPersonaId: "pl-inexistente" }))
      expect(r2.status).toBe(404)
    })
    await prisma.persona.delete({ where: { id: "pl-trab-sin-ficha" } }).catch(() => {})
  })

  it("CF sin parámetros legales → 400 citando CF no cargado", async () => {
    // Comunidad B con trabajador pero sin fila de configuración.
    await prisma.persona.upsert({
      where: { id: "pl-trab-b" },
      update: {},
      create: {
        id: "pl-trab-b",
        comunidadId: comunidadB,
        rut: "33333333-3",
        nombreCompleto: "Trabajador B TEST",
        nombres: "Trabajador B",
        apellidos: "TEST",
        email: "trabb@test.cl",
        telefonoMovil: "+56900000004",
        estadoCuenta: "activa",
        condicionesEspecialesIds: [],
        roles: ["personal"],
        datosLaborales: { ...ficha, afpId: undefined, saludId: undefined, asignacionFamiliarId: undefined },
      } as never,
    })
    await prisma.membresia.deleteMany({ where: { usuarioId: "pl-usuario-admin" } })
    await prisma.membresia.create({
      data: { usuarioId: "pl-usuario-admin", comunidadId: comunidadB, rol: "administrador" },
    })
    // withComunidadScope toma la última membresía: admin queda en B para este test.
    await conSesion(emailAdmin, async () => {
      const res = await postGenerar(
        generarValido({ id: "pl-liq-b", trabajadorPersonaId: "pl-trab-b", periodo: "2026-10" })
      )
      expect(res.status).toBe(400)
      const cuerpo = (await res.json()) as { error?: string }
      expect(cuerpo.error ?? "").toContain("CF no cargado")
    })
    await prisma.membresia.deleteMany({ where: { usuarioId: "pl-usuario-admin" } })
    await prisma.membresia.create({
      data: { usuarioId: "pl-usuario-admin", comunidadId: comunidadA, rol: "administrador" },
    })
    await prisma.persona.delete({ where: { id: "pl-trab-b" } }).catch(() => {})
  })

  it("404 cross-comunidad (no filtra existencia)", async () => {
    const { item } = await cargaModulos()
    await prisma.liquidacionPL.create({
      data: {
        ...(generarValido({ id: "pl-liq-b2" }) as Record<string, unknown>),
        comunidadId: comunidadB,
        folio: "LIQ-9999",
        fechaGeneracion: "2026-09-29",
        sueldoBaseContrato: 650000,
        diasMesComercial: 30,
        jornadaSemanal: 44,
        sueldoBaseProporcional: 650000,
        horasExtrasHoras: 0,
        valorHoraOrdinaria: 0,
        montoHorasExtras: 0,
        bonos: [],
        gratificacionLegal: 0,
        totalImponible: 650000,
        asignacionMovilizacion: 0,
        asignacionColacion: 0,
        cargas: 0,
        montoAsignacionFamiliar: 0,
        totalHaberes: 650000,
        nombreAfp: "AFP Habitat",
        tasaAFP: 10.58,
        montoAFP: 0,
        nombreSalud: "FONASA",
        saludTipo: "fonasa",
        montoSalud: 0,
        tasaSIS: 1.48,
        montoSIS: 0,
        montoSeguroCesantia: 0,
        montoAPV: 0,
        totalDescuentos: 0,
        descuentoAnticipos: 0,
        adelantosIds: [],
        alcanceLiquido: 650000,
        liquidoAPagar: 650000,
        estado: "borrador",
      } as never,
    })
    await conSesion(emailAdmin, async () => {
      const get = await item.GET(
        new NextRequest("http://localhost/api/liquidaciones/pl-liq-b2"),
        { params: Promise.resolve({ id: "pl-liq-b2" }) }
      )
      expect(get.status).toBe(404)
    })
    await prisma.liquidacionPL.delete({ where: { id: "pl-liq-b2" } }).catch(() => {})
  })

  it("admin confirma borrador → 200 + egreso FI sueldos + evento", async () => {
    await conSesion(emailAdmin, async () => {
      const res = await postConfirmar("pl-liq-1")
      expect(res.status).toBe(200)
      const enBd = await prisma.liquidacionPL.findUnique({ where: { id: "pl-liq-1" } })
      expect(enBd?.estado).toBe("confirmada")
      expect(enBd?.egresoFIReferencia).toBeTruthy()
      const egreso = await prisma.egresoFI.findUnique({
        where: { id: enBd?.egresoFIReferencia ?? "x" },
      })
      expect(egreso).not.toBeNull()
      expect(egreso?.categoria).toBe("sueldos")
      expect(egreso?.fondoId).toBe("pl-fondo-gc")
      expect(egreso?.folio).toMatch(/^FE-/)
      const evento = await prisma.eventoAuditoria.findMany({
        where: { comunidadId: comunidadA, tipoAccion: "PL_EXPENSE_SYNC" },
      })
      expect(evento.length).toBeGreaterThanOrEqual(1)
    })
  })

  it("confirmar repetida → 400 sin segundo egreso", async () => {
    await conSesion(emailAdmin, async () => {
      const antes = await prisma.egresoFI.count({
        where: { comunidadId: comunidadA, categoria: "sueldos" },
      })
      expect((await postConfirmar("pl-liq-1")).status).toBe(400)
      const despues = await prisma.egresoFI.count({
        where: { comunidadId: comunidadA, categoria: "sueldos" },
      })
      expect(despues).toBe(antes)
    })
  })

  it("DELETE confirmada → 409; borrador → 200", async () => {
    await conSesion(emailAdmin, async () => {
      expect((await del("pl-liq-1")).status).toBe(409)
      expect(await prisma.liquidacionPL.findUnique({ where: { id: "pl-liq-1" } })).not.toBeNull()
      const gen = await postGenerar(generarValido({ id: "pl-liq-borrar", periodo: "2026-12" }))
      expect(gen.status).toBe(201)
      expect((await del("pl-liq-borrar")).status).toBe(200)
      expect(await prisma.liquidacionPL.findUnique({ where: { id: "pl-liq-borrar" } })).toBeNull()
    })
  })
})
