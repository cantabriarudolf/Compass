/**
 * @vitest-environment node
 *
 * Purga bulk TEST del QA-Lab (change qlab-purga-bulk, SERIE-NOCHE-2 P1).
 *
 * Contratos ejercitados contra `POST /api/qa-lab/purga-test` con BD real:
 * - 404 con el guard de entorno apagado (corta ANTES que la sesión).
 * - 401 sin sesión; 403 sin membresía; 403 con rol sin permiso de administración.
 * - 200 con `{ borrados, bloqueos }`: borra solo TEST (prefijo `test-` y
 *   procedencia TEST documentada: cobros FI por unidadId/origenRef, emisiones
 *   de periodos TEST, notificaciones PI con marca TEST) y NUNCA datos reales.
 * - Liquidaciones confirmadas (inmutables) no se borran ni se reportan como
 *   bloqueo; su egreso espejo SÍ se borra (misma semántica que el bucle viejo).
 * - Idempotencia: segunda corrida = `borrados` y `bloqueos` vacíos.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest"
import type { Prisma } from "@prisma/client"
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
const COMUNIDAD = "purga-comunidad"
const EMAIL_ADMIN = "purga-admin@test.cl"
const EMAIL_RESIDENTE = "purga-residente@test.cl"
const EMAIL_SIN_COMUNIDAD = "purga-sincomunidad@test.cl"
const USUARIO_ADMIN = "purga-usuario-admin"
const USUARIO_RESIDENTE = "purga-usuario-residente"
const USUARIO_SIN_COMUNIDAD = "purga-usuario-sincomunidad"

async function cargar() {
  return import("@/app/api/qa-lab/purga-test/route")
}

async function POST(): Promise<Response> {
  const ruta = await cargar()
  return ruta.POST()
}

type PersonaSeed = Prisma.PersonaUncheckedCreateInput

function persona(overrides: Partial<PersonaSeed>): PersonaSeed {
  return {
    comunidadId: COMUNIDAD,
    rut: "11.111.111-1",
    nombreCompleto: "Persona Purga",
    nombres: "Persona",
    apellidos: "Purga",
    email: "purga@correo.test",
    telefonoMovil: "+56911111111",
    estadoCuenta: "activa",
    condicionesEspecialesIds: [],
    roles: [],
    ...overrides,
  } as PersonaSeed
}

type LiquidacionSeed = Prisma.LiquidacionPLUncheckedCreateInput

function liquidacion(overrides: Partial<LiquidacionSeed>): LiquidacionSeed {
  return {
    comunidadId: COMUNIDAD,
    folio: "LIQ-PURGA-1",
    periodo: "2027-01",
    fechaGeneracion: "2027-01-31",
    diasTrabajados: 30,
    sueldoBaseContrato: 600000,
    diasMesComercial: 30,
    jornadaSemanal: 45,
    sueldoBaseProporcional: 600000,
    horasExtrasHoras: 0,
    valorHoraOrdinaria: 0,
    montoHorasExtras: 0,
    bonos: [],
    gratificacionLegal: 0,
    totalImponible: 600000,
    asignacionMovilizacion: 0,
    asignacionColacion: 0,
    cargas: 0,
    montoAsignacionFamiliar: 0,
    totalHaberes: 600000,
    nombreAfp: "AFP TEST",
    tasaAFP: 10,
    montoAFP: 60000,
    nombreSalud: "Salud TEST",
    saludTipo: "porcentaje",
    saludValorUF: null,
    ufAplicada: null,
    montoSalud: 60000,
    tasaSIS: 0.6,
    montoSIS: 0,
    montoSeguroCesantia: 0,
    montoAPV: 0,
    totalDescuentos: 60000,
    descuentoAnticipos: 0,
    adelantosIds: [],
    alcanceLiquido: 540000,
    liquidoAPagar: 540000,
    ...overrides,
  } as LiquidacionSeed
}

describe("/api/qa-lab/purga-test — purga bulk TEST con BD real (qlab-purga-bulk)", () => {
  // Los ids `test-*` del lab YA existen en dev.db bajo otras comunidades
  // (poblamiento local del owner sobre comunidad-a): el arranque los limpia por
  // id explícito además de por comunidad, para que el seed no choque con filas ajenas.
  // SAFETY: los delegates Prisma de modelos distintos exponen deleteMany con
  // firma estructuralmente compatible (where id-in / comunidadId); el cast
  // (patrón `delegado()` de lib/api/crud-factory) solo borra genéricos.
  type DelegateLimpieza = {
    deleteMany(args: {
      where: { OR: Array<Record<string, unknown>> }
    }): Promise<{ count: number }>
  }
  const RESIDUO_POR_MODELO: Array<[DelegateLimpieza, string[]]> = [
    [prisma.cobroFI as unknown as DelegateLimpieza, ["test-cobro-gc", "purga-cob-multain", "purga-cob-real"]],
    [prisma.emisionGC as unknown as DelegateLimpieza, ["test-em-gc", "purga-em-real"]],
    [prisma.fondoFI as unknown as DelegateLimpieza, ["test-fondo-pintura", "purga-fondo-real"]],
    [prisma.egresoFI as unknown as DelegateLimpieza, ["test-egr-1", "egr-espejo-qa", "egr-conf-qa", "purga-egr-real"]],
    [prisma.reservaRA as unknown as DelegateLimpieza, ["test-ra-rs-1", "purga-ra-rs-real"]],
    [prisma.elementoRA as unknown as DelegateLimpieza, ["test-ra-quincho", "purga-ra-el-real"]],
    [prisma.trabajoMT as unknown as DelegateLimpieza, ["test-mt-1", "purga-mt-real"]],
    [prisma.proyectoMT as unknown as DelegateLimpieza, ["test-py-techos", "purga-mt-py-real"]],
    [prisma.publicacionPortal as unknown as DelegateLimpieza, ["test-pub-pi-qa", "purga-pub-real"]],
    [prisma.leadPortal as unknown as DelegateLimpieza, ["test-lead-pi-qa", "purga-lead-real"]],
    [prisma.notificacion as unknown as DelegateLimpieza, ["purga-notif-lead", "purga-notif-real"]],
    [prisma.vinculoUnidad as unknown as DelegateLimpieza, ["test-v-999", "purga-v-real"]],
    [prisma.unidad as unknown as DelegateLimpieza, ["test-u-999", "purga-u-real"]],
    [prisma.microSector as unknown as DelegateLimpieza, ["test-micro-piso99", "purga-ms-real"]],
    [prisma.macroSector as unknown as DelegateLimpieza, ["test-macro-sectortest", "purga-msect-real"]],
    [prisma.persona as unknown as DelegateLimpieza, ["test-p-99", "test-qa-pl-trab", "purga-p-real"]],
    [prisma.tipoUnidad as unknown as DelegateLimpieza, ["test-tu-loftqa", "purga-tu-real"]],
    [prisma.banco as unknown as DelegateLimpieza, ["test-banco-bancoqa", "purga-banco-real"]],
  ]

  async function limpiarResiduo(): Promise<void> {
    await prisma.liquidacionPL.deleteMany({
      where: { OR: [{ comunidadId: COMUNIDAD }, { id: { in: ["test-liq-pl-qa-1", "test-liq-conf-qa"] } }] },
    })
    for (const [modelo, ids] of RESIDUO_POR_MODELO) {
      await modelo.deleteMany({ where: { OR: [{ comunidadId: COMUNIDAD }, { id: { in: ids } }] } })
    }
  }

  beforeAll(async () => {
    process.env.AUTH_SECRET = AUTH_SECRET
    await prisma.comunidad.upsert({
      where: { id: COMUNIDAD },
      update: {},
      create: { id: COMUNIDAD, nombre: "Comunidad Purga", slug: "purga-comunidad" },
    })
    for (const [id, email] of [
      [USUARIO_ADMIN, EMAIL_ADMIN],
      [USUARIO_RESIDENTE, EMAIL_RESIDENTE],
      [USUARIO_SIN_COMUNIDAD, EMAIL_SIN_COMUNIDAD],
    ] as const) {
      await prisma.usuario.upsert({
        where: { email },
        update: {},
        create: { id, email, activo: true },
      })
    }
    await prisma.membresia.deleteMany({ where: { usuarioId: { in: [USUARIO_ADMIN, USUARIO_RESIDENTE, USUARIO_SIN_COMUNIDAD] } } })
    // Higiene del propio test: una corrida roja previa puede dejar seed a medias.
    await limpiarResiduo()
    await prisma.membresia.create({
      data: { usuarioId: USUARIO_ADMIN, comunidadId: COMUNIDAD, rol: "administrador" },
    })
    await prisma.membresia.create({
      data: { usuarioId: USUARIO_RESIDENTE, comunidadId: COMUNIDAD, rol: "residente" },
    })

    // Orden hijos→padres del seed irrelevante: no hay FKs de dominio.
    await prisma.cobroFI.createMany({
      data: [
        // Cobros TEST: por id y por procedencia (unidad/origen test-*).
        {
          id: "test-cobro-gc",
          comunidadId: COMUNIDAD,
          unidadId: "test-u-999",
          periodo: "2019-03",
          concepto: "gasto_comun",
          origenModulo: "GC",
          origenRef: null,
          fondoId: "test-fondo-pintura",
          descripcion: "TEST gasto comun",
          montoBase: 50000,
          fechaCargo: "2019-03-05",
          moras: [],
          pagos: [],
          diferencias: [],
        },
        {
          // Multa IN: id de servidor (`cob-*`) con origenRef TEST → borrable por procedencia.
          id: "purga-cob-multain",
          comunidadId: COMUNIDAD,
          unidadId: "test-u-999",
          periodo: "2026-10",
          concepto: "multa_in",
          origenModulo: "IN",
          origenRef: "test-in-grave",
          fondoId: "test-fondo-pintura",
          descripcion: "Multa TEST",
          montoBase: 10000,
          fechaCargo: "2026-10-01",
          moras: [],
          pagos: [],
          diferencias: [],
        },
        // Cobro REAL: sobrevive.
        {
          id: "purga-cob-real",
          comunidadId: COMUNIDAD,
          unidadId: "purga-u-real",
          periodo: "2026-10",
          concepto: "gasto_comun",
          origenModulo: "GC",
          origenRef: null,
          fondoId: "purga-fondo-real",
          descripcion: "Real",
          montoBase: 70000,
          fechaCargo: "2026-10-05",
          moras: [],
          pagos: [],
          diferencias: [],
        },
      ],
    })
    await prisma.emisionGC.createMany({
      data: [
        { id: "test-em-gc", comunidadId: COMUNIDAD, periodo: "2019-03", modo: "proporcional", gastoTotal: 100000, lineas: [], fechaEmision: "2019-03-01" },
        { id: "purga-em-real", comunidadId: COMUNIDAD, periodo: "2026-10", modo: "proporcional", gastoTotal: 200000, lineas: [], fechaEmision: "2026-10-01" },
      ],
    })
    await prisma.fondoFI.createMany({
      data: [
        { id: "test-fondo-pintura", comunidadId: COMUNIDAD, nombre: "Pintura TEST", tipo: "mantencion", descripcion: "TEST", activo: true },
        { id: "purga-fondo-real", comunidadId: COMUNIDAD, nombre: "Fondo real", tipo: "mantencion", descripcion: "Real", activo: true },
      ],
    })
    await prisma.egresoFI.createMany({
      data: [
        { id: "test-egr-1", comunidadId: COMUNIDAD, fecha: "2019-03-10", categoria: "mantencion", descripcion: "TEST", monto: 10000, fondoId: "test-fondo-pintura", esRecurrente: false },
        // Espejo de borradores y de confirmadas: borrable por referencia (id sin prefijo test-).
        { id: "egr-espejo-qa", comunidadId: COMUNIDAD, fecha: "2027-01-31", categoria: "sueldos", descripcion: "Espejo borrador", monto: 1000, fondoId: "purga-fondo-real", esRecurrente: false },
        { id: "egr-conf-qa", comunidadId: COMUNIDAD, fecha: "2027-02-28", categoria: "sueldos", descripcion: "Espejo confirmada", monto: 2000, fondoId: "purga-fondo-real", esRecurrente: false },
        { id: "purga-egr-real", comunidadId: COMUNIDAD, fecha: "2026-10-10", categoria: "mantencion", descripcion: "Real", monto: 30000, fondoId: "purga-fondo-real", esRecurrente: false },
      ],
    })
    await prisma.liquidacionPL.create({
      data: liquidacion({
        id: "test-liq-pl-qa-1",
        trabajadorPersonaId: "test-qa-pl-trab",
        estado: "borrador",
        egresoFIReferencia: "egr-espejo-qa",
      }),
    })
    await prisma.liquidacionPL.create({
      data: liquidacion({
        id: "test-liq-conf-qa",
        folio: "LIQ-PURGA-CONF",
        periodo: "2027-02",
        trabajadorPersonaId: "test-qa-pl-trab",
        estado: "confirmada",
        egresoFIReferencia: "egr-conf-qa",
      }),
    })
    await prisma.elementoRA.createMany({
      data: [
        { id: "test-ra-quincho", comunidadId: COMUNIDAD, nombre: "Quincho TEST", tipo: "quincho", franja: "10:00-12:00", tarifaUso: 0, garantiaRequerida: 0, activo: true },
        { id: "purga-ra-el-real", comunidadId: COMUNIDAD, nombre: "Piscina real", tipo: "piscina", franja: "10:00-12:00", tarifaUso: 0, garantiaRequerida: 0, activo: true },
      ],
    })
    await prisma.reservaRA.createMany({
      data: [
        { id: "test-ra-rs-1", comunidadId: COMUNIDAD, folio: "RS-TEST-1", elementoId: "test-ra-quincho", solicitantePersonaId: "test-p-99", unidadId: "test-u-999", fecha: "2026-11-01", horaInicio: "10:00", horaFin: "12:00", estado: "confirmada", montoTarifa: 0, montoGarantia: 0 },
        { id: "purga-ra-rs-real", comunidadId: COMUNIDAD, folio: "RS-REAL-1", elementoId: "purga-ra-el-real", solicitantePersonaId: "purga-p-real", unidadId: "purga-u-real", fecha: "2026-11-02", horaInicio: "10:00", horaFin: "12:00", estado: "confirmada", montoTarifa: 0, montoGarantia: 0 },
      ],
    })
    await prisma.proyectoMT.createMany({
      data: [
        { id: "test-py-techos", comunidadId: COMUNIDAD, nombre: "Techos TEST", presupuestoEstimado: 0, plazoMeses: 1, estado: "planificacion" },
        { id: "purga-mt-py-real", comunidadId: COMUNIDAD, nombre: "Jardines real", presupuestoEstimado: 0, plazoMeses: 1, estado: "planificacion" },
      ],
    })
    await prisma.trabajoMT.createMany({
      data: [
        { id: "test-mt-1", comunidadId: COMUNIDAD, folio: "MT-TEST-1", titulo: "TEST gotera", descripcion: "TEST", prioridad: "media", estado: "pendiente", costoTotal: 0, origenFondos: "fondo_mantenimiento", estadoPago: "pendiente", alertaGarantiaEnviada: false, evidencias: [] },
        { id: "purga-mt-real", comunidadId: COMUNIDAD, folio: "MT-REAL-1", titulo: "Real gotera", descripcion: "Real", prioridad: "media", estado: "pendiente", costoTotal: 0, origenFondos: "fondo_mantenimiento", estadoPago: "pendiente", alertaGarantiaEnviada: false, evidencias: [] },
      ],
    })
    await prisma.publicacionPortal.createMany({
      data: [
        { id: "test-pub-pi-qa", comunidadId: COMUNIDAD, unidadId: "test-u-999", operacion: "arriendo", precio: 1000, imagenes: [], activa: true, fechaPublicacion: "2026-10-01" },
        { id: "purga-pub-real", comunidadId: COMUNIDAD, unidadId: "purga-u-real", operacion: "arriendo", precio: 500000, imagenes: [], activa: true, fechaPublicacion: "2026-10-01" },
      ],
    })
    await prisma.leadPortal.createMany({
      data: [
        { id: "test-lead-pi-qa", comunidadId: COMUNIDAD, publicacionId: "test-pub-pi-qa", nombreContacto: "Lead TEST", contacto: "lead@test.cl", fecha: "2026-10-01", atendido: false },
        { id: "purga-lead-real", comunidadId: COMUNIDAD, publicacionId: "purga-pub-real", nombreContacto: "Lead real", contacto: "real@correo.test", fecha: "2026-10-02", atendido: false },
      ],
    })
    await prisma.notificacion.createMany({
      data: [
        // La que genera el lead QA: id de servidor, marca TEST en el texto → borrable.
        { id: "purga-notif-lead", comunidadId: COMUNIDAD, destinatarioRol: "administrador", asunto: "Nuevo lead TEST", cuerpo: "Lead de publicación TEST", moduloOrigen: "PI", fecha: "2026-10-01" },
        { id: "purga-notif-real", comunidadId: COMUNIDAD, destinatarioRol: "administrador", asunto: "Nuevo lead", cuerpo: "Lead de publicación", moduloOrigen: "PI", fecha: "2026-10-02" },
      ],
    })
    await prisma.vinculoUnidad.createMany({
      data: [
        { id: "test-v-999", comunidadId: COMUNIDAD, personaId: "test-p-99", unidadId: "test-u-999", rol: "propietario", fechaInicio: "2026-01-01", permiteVerFinanzas: true },
        { id: "purga-v-real", comunidadId: COMUNIDAD, personaId: "purga-p-real", unidadId: "purga-u-real", rol: "propietario", fechaInicio: "2026-01-01", permiteVerFinanzas: true },
      ],
    })
    await prisma.unidad.createMany({
      data: [
        { id: "test-u-999", comunidadId: COMUNIDAD, microSectorId: "test-micro-piso99", numero: "999", etiqueta: "TEST 999", tipoUnidadId: "test-tu-loftqa", metraje: 50, prorrateo: 1, rolSii: "9999-9", estadoId: "ocu-1", servicios: {} },
        { id: "purga-u-real", comunidadId: COMUNIDAD, microSectorId: "purga-ms-real", numero: "1", etiqueta: "Real 1", tipoUnidadId: "purga-tu-real", metraje: 60, prorrateo: 1, rolSii: "1111-1", estadoId: "ocu-1", servicios: {} },
      ],
    })
    await prisma.microSector.createMany({
      data: [
        { id: "test-micro-piso99", comunidadId: COMUNIDAD, macroSectorId: "test-macro-sectortest", nombre: "Piso 99 TEST", etiqueta: "P99" },
        { id: "purga-ms-real", comunidadId: COMUNIDAD, macroSectorId: "purga-msect-real", nombre: "Piso real", etiqueta: "P1" },
      ],
    })
    await prisma.macroSector.createMany({
      data: [
        { id: "test-macro-sectortest", comunidadId: COMUNIDAD, nombre: "Torre TEST", etiqueta: "T-T" },
        { id: "purga-msect-real", comunidadId: COMUNIDAD, nombre: "Torre real", etiqueta: "T-R" },
      ],
    })
    await prisma.persona.createMany({
      data: [
        persona({ id: "test-p-99", rut: "99.999.999-9", nombreCompleto: " TEST Uno", nombres: "Test", apellidos: "Uno", email: "test99@test.cl" }),
        persona({ id: "test-qa-pl-trab", rut: "77.777.777-7", nombreCompleto: "Trab TEST", nombres: "Trab", apellidos: "TEST", email: "trab@test.cl" }),
        persona({ id: "purga-p-real", rut: "22.222.222-2", nombreCompleto: "Persona Real", nombres: "Real", apellidos: "Persona", email: "real@correo.test" }),
      ],
    })
    await prisma.tipoUnidad.createMany({
      data: [
        { id: "test-tu-loftqa", comunidadId: COMUNIDAD, nombre: "Loft TEST", categoria: "loft", metraje: 50, montoBaseGc: 1, activo: true, historialTarifas: [] },
        { id: "purga-tu-real", comunidadId: COMUNIDAD, nombre: "Departamento", categoria: "depto", metraje: 60, montoBaseGc: 1, activo: true, historialTarifas: [] },
      ],
    })
    await prisma.banco.createMany({
      data: [
        { id: "test-banco-bancoqa", comunidadId: COMUNIDAD, nombre: "Banco TEST" },
        { id: "purga-banco-real", comunidadId: COMUNIDAD, nombre: "Banco real" },
      ],
    })
  }, 60_000)

  afterAll(async () => {
    try {
      state.cookie = ""
      await limpiarResiduo()
      await prisma.membresia.deleteMany({ where: { usuarioId: { in: [USUARIO_ADMIN, USUARIO_RESIDENTE, USUARIO_SIN_COMUNIDAD] } } })
      for (const id of [USUARIO_ADMIN, USUARIO_RESIDENTE, USUARIO_SIN_COMUNIDAD]) {
        await prisma.usuario.delete({ where: { id } }).catch(() => {})
      }
      await prisma.comunidad.delete({ where: { id: COMUNIDAD } }).catch(() => {})
    } catch {
      // limpieza best-effort del teardown
    }
  })

  async function conSesion(email: string, fn: () => Promise<void>): Promise<void> {
    const user = await prisma.usuario.findUnique({ where: { email } })
    if (!user) throw new Error(`usuario ${email} no encontrado`)
    const { cookieSesionAuthjs } = await import("../helpers/sesion-authjs")
    state.cookie = await cookieSesionAuthjs({ sub: user.id, email: user.email })
    try {
      await fn()
    } finally {
      state.cookie = ""
    }
  }

  it("404 con el guard de entorno apagado (corta antes que la sesión)", async () => {
    const prev = process.env.NEXT_PUBLIC_APP_ENV
    process.env.NEXT_PUBLIC_APP_ENV = "production"
    try {
      state.cookie = ""
      const res = await POST()
      expect(res.status).toBe(404)
    } finally {
      if (prev === undefined) delete process.env.NEXT_PUBLIC_APP_ENV
      else process.env.NEXT_PUBLIC_APP_ENV = prev
    }
  })

  it("401 sin sesión", async () => {
    state.cookie = ""
    const res = await POST()
    expect(res.status).toBe(401)
  })

  it("403 sin membresía (sin comunidad asignada)", async () => {
    await conSesion(EMAIL_SIN_COMUNIDAD, async () => {
      const res = await POST()
      expect(res.status).toBe(403)
      const cuerpo = await res.json()
      expect(cuerpo.error).toMatch(/comunidad/i)
    })
  })

  it("403 con rol sin permiso de administración de la comunidad", async () => {
    await conSesion(EMAIL_RESIDENTE, async () => {
      const res = await POST()
      expect(res.status).toBe(403)
      const cuerpo = await res.json()
      expect(cuerpo.error).toMatch(/permiso/i)
      // Nada se borró: los TEST siguen en BD.
      expect(await prisma.cobroFI.findUnique({ where: { id: "test-cobro-gc" } })).not.toBeNull()
    })
  })

  it("200 con conteos correctos: borra TEST (prefijo y procedencia) sin tocar los reales", async () => {
    await conSesion(EMAIL_ADMIN, async () => {
      const res = await POST()
      expect(res.status).toBe(200)
      const cuerpo = (await res.json()) as {
        borrados: Record<string, number>
        bloqueos: string[]
      }
      expect(cuerpo.bloqueos).toEqual([])
      expect(cuerpo.borrados).toEqual({
        "cobros-fi": 2, // test-cobro-gc (id) + purga-cob-multain (origenRef test-in-grave)
        "emisiones-gc": 1, // periodo TEST 2019-03
        liquidaciones: 1, // solo borrador; la confirmada es inmutable
        "egresos-fi": 3, // test-egr-1 + espejo borrador + espejo confirmada
        "fondos-fi": 1,
        "reservas-ra": 1,
        "elementos-ra": 1,
        "trabajos-mt": 1,
        "proyectos-mt": 1,
        "leads-portal": 1,
        "publicaciones-portal": 1,
        notificaciones: 1, // PI con marca TEST
        vinculos: 1,
        unidades: 1,
        "micro-sectores": 1,
        "macro-sectores": 1,
        personas: 2, // test-p-99 + test-qa-pl-trab
        "tipos-unidad": 1,
        bancos: 1,
      })

      // TEST borrados.
      expect(await prisma.cobroFI.findUnique({ where: { id: "test-cobro-gc" } })).toBeNull()
      expect(await prisma.cobroFI.findUnique({ where: { id: "purga-cob-multain" } })).toBeNull()
      expect(await prisma.unidad.findUnique({ where: { id: "test-u-999" } })).toBeNull()
      expect(await prisma.liquidacionPL.findUnique({ where: { id: "test-liq-pl-qa-1" } })).toBeNull()
      // Inmutable: la confirmada persiste (residuo honesto, sin bloqueo).
      expect(await prisma.liquidacionPL.findUnique({ where: { id: "test-liq-conf-qa" } })).not.toBeNull()
      expect(await prisma.egresoFI.findUnique({ where: { id: "egr-conf-qa" } })).toBeNull()
      expect(await prisma.notificacion.findUnique({ where: { id: "purga-notif-lead" } })).toBeNull()

      // Reales intactos.
      expect(await prisma.cobroFI.findUnique({ where: { id: "purga-cob-real" } })).not.toBeNull()
      expect(await prisma.unidad.findUnique({ where: { id: "purga-u-real" } })).not.toBeNull()
      expect(await prisma.persona.findUnique({ where: { id: "purga-p-real" } })).not.toBeNull()
      expect(await prisma.emisionGC.findUnique({ where: { id: "purga-em-real" } })).not.toBeNull()
      expect(await prisma.fondoFI.findUnique({ where: { id: "purga-fondo-real" } })).not.toBeNull()
      expect(await prisma.egresoFI.findUnique({ where: { id: "purga-egr-real" } })).not.toBeNull()
      expect(await prisma.reservaRA.findUnique({ where: { id: "purga-ra-rs-real" } })).not.toBeNull()
      expect(await prisma.trabajoMT.findUnique({ where: { id: "purga-mt-real" } })).not.toBeNull()
      expect(await prisma.publicacionPortal.findUnique({ where: { id: "purga-pub-real" } })).not.toBeNull()
      expect(await prisma.leadPortal.findUnique({ where: { id: "purga-lead-real" } })).not.toBeNull()
      expect(await prisma.notificacion.findUnique({ where: { id: "purga-notif-real" } })).not.toBeNull()
      expect(await prisma.vinculoUnidad.findUnique({ where: { id: "purga-v-real" } })).not.toBeNull()
      expect(await prisma.banco.findUnique({ where: { id: "purga-banco-real" } })).not.toBeNull()
    })
  })

  it("idempotencia: segunda corrida = 0 borrados y 0 bloqueos", async () => {
    await conSesion(EMAIL_ADMIN, async () => {
      const res = await POST()
      expect(res.status).toBe(200)
      const cuerpo = (await res.json()) as {
        borrados: Record<string, number>
        bloqueos: string[]
      }
      expect(cuerpo.borrados).toEqual({})
      expect(cuerpo.bloqueos).toEqual([])
    })
  })
})
