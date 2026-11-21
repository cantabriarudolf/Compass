/**
 * @vitest-environment node
 *
 * T4/S1-S5 — importar la deuda a la fecha de corte (saldos de apertura).
 *
 * Contra la base descartable real (nada de mocks de Prisma) y con cookies de
 * sesión Auth.js mintadas, igual que `test/importar-finanzas.test.ts`. Toda la
 * data creada lleva el prefijo `imp-sal-` y la limpieza queda acotada a esos ids.
 *
 * Contratos cubiertos (odd/tasks/saldos-de-apertura.md):
 *   · S1: cada fila crea un `CobroFI` de concepto `saldo_apertura` imputado al
 *     fondo de gasto común ACTIVO, con `montoBase` = la deuda, sin pagos ni
 *     moras, y sin ninguna rama especial para leerlo.
 *   · S2: formato `unidad,fecha_corte,monto`; unidad = rol SII existente; monto
 *     > 0; fecha real no futura; idempotencia por (unidad, período del corte).
 *   · S3: si la comunidad ya emitió gasto común para el período del corte o uno
 *     anterior, la importación se rechaza ENTERA (también en `dryRun`).
 *   · S5(a): archivo válido de 2 unidades → 2 `CobroFI`.
 *   · S5(b): reimportado → no duplica.
 *   · S5(c): unidad inexistente → error de fila con el rol literal y 0 escrituras.
 *   · S5(d): emisión del mismo período del corte o de uno anterior → rechazo con
 *     el mensaje literal y 0 escrituras.
 *   · S5(e): sin fondo de gasto común activo → rechazo literal.
 *   · S5(f): el saldo aparece en `morosidadPorUnidad` de esa unidad.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import { hoyISO, morosidadPorUnidad } from "@/lib/finanzas-utils"
import type { CobroFI } from "@/lib/schemas"

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

const COMUNIDAD = "imp-sal-comunidad"
/** Comunidad SIN fondo de gasto común activo: el caso de S5(e). */
const COMUNIDAD_SIN_FONDO = "imp-sal-sin-fondo"
const FONDO_GC = "imp-sal-fondo-gc"

const ROL_A = "8842-1101"
const ROL_B = "8842-1102"
const UNIDAD_A = "imp-sal-unidad-a"
const UNIDAD_B = "imp-sal-unidad-b"
const UNIDAD_SIN_FONDO = "imp-sal-unidad-sin-fondo"

const CUENTAS = {
  administrador: {
    id: "imp-sal-user-admin",
    email: "imp-sal-admin@test.cl",
    rol: "administrador",
    comunidadId: COMUNIDAD,
  },
  residente: {
    id: "imp-sal-user-residente",
    email: "imp-sal-residente@test.cl",
    rol: "residente",
    comunidadId: COMUNIDAD,
  },
  sinFondo: {
    id: "imp-sal-user-sin-fondo",
    email: "imp-sal-sin-fondo@test.cl",
    rol: "administrador",
    comunidadId: COMUNIDAD_SIN_FONDO,
  },
} as const

type ClaveCuenta = keyof typeof CUENTAS

const cookies: Record<ClaveCuenta, string> = {
  administrador: "",
  residente: "",
  sinFondo: "",
}

/** Encabezado canónico del formato declarado (S2). */
const ENCABEZADOS = "unidad,fecha_corte,monto"

const FILA_A = `${ROL_A},2024-03-31,125000.50`
const FILA_B = `${ROL_B},2024-03-31,48000`
const FILA_UNIDAD_FANTASMA = "8842-9999,2024-03-31,10000"

function csv(...filas: string[]): string {
  return [ENCABEZADOS, ...filas].join("\n")
}

interface ReporteFila {
  linea: number
  accion: "crear" | "actualizar" | "sin-cambios"
  errores: string[]
}

interface Reporte {
  filas: ReporteFila[]
  resumen: {
    total: number
    validas: number
    conError: number
    crear: number
    actualizar: number
    sinCambios: number
  }
}

/** Cuerpo del rechazo: mensaje literal + detalle con el período ya cobrado. */
interface RespuestaRechazo {
  error: string
  detalle?: string
  reporte?: Reporte
}

let POST_SALDOS: (req: Request) => Promise<Response>
let GET_PLANTILLA: () => Promise<Response>

afterAll(async () => {
  state.cookie = ""
  const comunidades = [COMUNIDAD, COMUNIDAD_SIN_FONDO]
  try {
    await prisma.cobroFI.deleteMany({ where: { comunidadId: { in: comunidades } } })
    await prisma.emisionGC.deleteMany({ where: { comunidadId: { in: comunidades } } })
    await prisma.unidad.deleteMany({ where: { comunidadId: { in: comunidades } } })
    await prisma.fondoFI.deleteMany({ where: { comunidadId: { in: comunidades } } })
    const ids = Object.values(CUENTAS).map((c) => c.id)
    await prisma.membresia.deleteMany({ where: { usuarioId: { in: ids } } })
    await prisma.usuario.deleteMany({ where: { id: { in: ids } } })
    await prisma.comunidad.deleteMany({ where: { id: { in: comunidades } } })
  } catch {
    // intencional: limpieza best-effort (la base descartable se recrea igual)
  }
})

beforeAll(async () => {
  process.env.AUTH_SECRET = AUTH_SECRET

  for (const id of [COMUNIDAD, COMUNIDAD_SIN_FONDO]) {
    await prisma.comunidad.upsert({
      where: { id },
      update: {},
      create: { id, nombre: `Comunidad ${id}`, slug: id },
    })
  }

  const { cookieSesionAuthjs } = await import("./helpers/sesion-authjs")
  for (const [clave, cuenta] of Object.entries(CUENTAS)) {
    await prisma.usuario.upsert({
      where: { email: cuenta.email },
      update: {},
      create: { id: cuenta.id, email: cuenta.email, activo: true },
    })
    await prisma.membresia.deleteMany({ where: { usuarioId: cuenta.id } })
    await prisma.membresia.create({
      data: {
        usuarioId: cuenta.id,
        comunidadId: cuenta.comunidadId,
        rol: cuenta.rol,
      },
    })
    cookies[clave as ClaveCuenta] = await cookieSesionAuthjs({
      sub: cuenta.id,
      email: cuenta.email,
    })
  }

  // El fondo de gasto común ACTIVO existe antes de importar: el importador no
  // crea fondos (S1). La comunidad sin fondo no tiene ninguno (S5(e)).
  await prisma.fondoFI.deleteMany({ where: { comunidadId: { in: [COMUNIDAD, COMUNIDAD_SIN_FONDO] } } })
  await prisma.fondoFI.create({
    data: {
      id: FONDO_GC,
      comunidadId: COMUNIDAD,
      nombre: "Fondo Gastos Comunes",
      tipo: "gasto_comun",
      activo: true,
    },
  })

  // Unidades por rol SII (la clave que usa la estructura y que el CSV declara).
  for (const [id, rol, numero] of [
    [UNIDAD_A, ROL_A, "1101"],
    [UNIDAD_B, ROL_B, "1102"],
  ] as const) {
    await prisma.unidad.create({
      data: {
        id,
        comunidadId: COMUNIDAD,
        microSectorId: "imp-sal-micro",
        numero,
        etiqueta: "Depto",
        tipoUnidadId: "imp-sal-tipo",
        metraje: 60,
        prorrateo: 0.01,
        rolSii: rol,
        estadoId: "imp-sal-estado",
        servicios: {},
      },
    })
  }
  await prisma.unidad.create({
    data: {
      id: UNIDAD_SIN_FONDO,
      comunidadId: COMUNIDAD_SIN_FONDO,
      microSectorId: "imp-sal-micro",
      numero: "2101",
      etiqueta: "Depto",
      tipoUnidadId: "imp-sal-tipo",
      metraje: 60,
      prorrateo: 0.01,
      rolSii: "8842-2101",
      estadoId: "imp-sal-estado",
      servicios: {},
    },
  })

  const saldos = await import("@/app/api/importar/saldos/route")
  POST_SALDOS = saldos.POST
  const plantilla = await import("@/app/api/importar/saldos/plantilla/route")
  GET_PLANTILLA = plantilla.GET
}, 30_000)

/** POST al importador: la vista previa es el MISMO handler con `?dryRun=1`. */
function pedirImport(
  rol: ClaveCuenta | "sin-sesion",
  cuerpo: string,
  seco = false
): Promise<Response> {
  state.cookie = rol === "sin-sesion" ? "" : cookies[rol]
  return POST_SALDOS(
    new NextRequest(`http://localhost/api/importar/saldos${seco ? "?dryRun=1" : ""}`, {
      method: "POST",
      body: cuerpo,
      headers: {
        "content-type": "text/csv",
        ...(state.cookie ? { cookie: state.cookie } : {}),
      },
    })
  )
}

function pedirPlantilla(rol: ClaveCuenta | "sin-sesion"): Promise<Response> {
  state.cookie = rol === "sin-sesion" ? "" : cookies[rol]
  return GET_PLANTILLA()
}

async function contarSaldos(comunidadId = COMUNIDAD): Promise<number> {
  return prisma.cobroFI.count({
    where: { comunidadId, concepto: "saldo_apertura" },
  })
}

/** Emisión de gasto común de la comunidad para el período indicado. */
async function crearEmision(periodo: string, id = `imp-sal-emision-${periodo}`): Promise<void> {
  await prisma.emisionGC.create({
    data: {
      id,
      comunidadId: COMUNIDAD,
      periodo,
      modo: "prorrateo",
      gastoTotal: 1000,
      lineas: [],
      fechaEmision: `${periodo}-15`,
    },
  })
}

describe("POST /api/importar/saldos — S5 contra la base real", () => {
  it("(a) un archivo válido de 2 unidades: la vista previa no escribe y la importación crea 2 CobroFI de saldo_apertura", async () => {
    expect(await contarSaldos()).toBe(0)

    const previa = await pedirImport("administrador", csv(FILA_A, FILA_B), true)
    expect(previa.status).toBe(200)
    expect((await previa.json()) as Reporte).toEqual({
      filas: [
        { linea: 2, accion: "crear", errores: [] },
        { linea: 3, accion: "crear", errores: [] },
      ],
      resumen: {
        total: 2,
        validas: 2,
        conError: 0,
        crear: 2,
        actualizar: 0,
        sinCambios: 0,
      },
    })
    // La vista previa no escribió nada (S4).
    expect(await contarSaldos()).toBe(0)

    const res = await pedirImport("administrador", csv(FILA_A, FILA_B))
    expect(res.status).toBe(200)
    const reporte = (await res.json()) as Reporte
    expect(reporte.resumen).toEqual({
      total: 2,
      validas: 2,
      conError: 0,
      crear: 2,
      actualizar: 0,
      sinCambios: 0,
    })
    expect(await contarSaldos()).toBe(2)

    // S1: el saldo es un cargo FI cobrable, imputado al fondo de gasto común
    // activo, con el monto de la deuda y SIN pagos ni moras.
    const saldoA = await prisma.cobroFI.findFirst({
      where: { comunidadId: COMUNIDAD, unidadId: UNIDAD_A, concepto: "saldo_apertura" },
    })
    // El id es determinista por (comunidad, unidad, período): se comprueba en (b).
    expect(saldoA?.id.startsWith("imp-sal-")).toBe(true)
    expect(saldoA?.periodo).toBe("2024-03")
    expect(saldoA?.fondoId).toBe(FONDO_GC)
    expect(saldoA?.montoBase).toBeCloseTo(125000.5)
    expect(saldoA?.descripcion).toBe("Saldo de apertura al corte 2024-03-31")
    expect(saldoA?.fechaCargo).toBe("2024-03-31")
    // Vencido a la fecha de corte: es deuda que ya existía y ya venció.
    expect(saldoA?.fechaVencimiento).toBe("2024-03-31")
    expect(saldoA?.pagos).toEqual([])
    expect(saldoA?.moras).toEqual([])
    expect(saldoA?.diferencias).toEqual([])

    const saldoB = await prisma.cobroFI.findFirst({
      where: { comunidadId: COMUNIDAD, unidadId: UNIDAD_B, concepto: "saldo_apertura" },
    })
    expect(saldoB?.montoBase).toBeCloseTo(48000)
    expect(saldoB?.periodo).toBe("2024-03")
  })

  it("(b) reimportar el mismo archivo no duplica, y un monto distinto de la misma unidad y período actualiza el cargo", async () => {
    const ids = await prisma.cobroFI.findMany({
      where: { comunidadId: COMUNIDAD, concepto: "saldo_apertura" },
      select: { id: true, unidadId: true },
    })
    const idA = ids.find((c) => c.unidadId === UNIDAD_A)?.id

    const res = await pedirImport("administrador", csv(FILA_A, FILA_B))
    expect(res.status).toBe(200)
    const reporte = (await res.json()) as Reporte
    expect(reporte.resumen).toEqual({
      total: 2,
      validas: 2,
      conError: 0,
      crear: 0,
      actualizar: 0,
      sinCambios: 2,
    })
    expect(await contarSaldos()).toBe(2)

    // Misma (unidad, período) con otro monto: es el MISMO cargo, actualizado.
    const cambiado = await pedirImport(
      "administrador",
      csv(FILA_A, `${ROL_B},2024-03-31,50000`)
    )
    expect(cambiado.status).toBe(200)
    const segundoReporte = (await cambiado.json()) as Reporte
    expect(segundoReporte.resumen).toEqual({
      total: 2,
      validas: 2,
      conError: 0,
      crear: 0,
      actualizar: 1,
      sinCambios: 1,
    })
    expect(await contarSaldos()).toBe(2)
    const saldoB = await prisma.cobroFI.findFirst({
      where: { comunidadId: COMUNIDAD, unidadId: UNIDAD_B, concepto: "saldo_apertura" },
    })
    expect(saldoB?.montoBase).toBeCloseTo(50000)
    // La fila sin cambios conserva su id determinista: reimportar no duplica.
    const saldoA = await prisma.cobroFI.findFirst({
      where: { comunidadId: COMUNIDAD, unidadId: UNIDAD_A, concepto: "saldo_apertura" },
    })
    expect(saldoA?.id).toBe(idA)
  })

  it("(c) una unidad inexistente es error de fila con el rol literal y no escribe nada", async () => {
    const previa = await pedirImport(
      "administrador",
      csv(FILA_A, FILA_UNIDAD_FANTASMA),
      true
    )
    expect(previa.status).toBe(200)
    const reporte = (await previa.json()) as Reporte
    expect(reporte.filas).toHaveLength(2)
    expect(reporte.resumen.conError).toBe(1)
    expect(reporte.resumen.validas).toBe(1)
    const fantasma = reporte.filas[1]
    expect(fantasma?.accion).toBe("sin-cambios")
    expect(fantasma?.errores).toHaveLength(1)
    expect(fantasma?.errores[0]).toContain('no existe la unidad con rol SII "8842-9999"')
    expect(fantasma?.errores[0]).toContain("línea 3")
    expect(await contarSaldos()).toBe(2)

    // La importación real no corre con filas con error: 400 y nada escrito.
    const res = await pedirImport("administrador", csv(FILA_A, FILA_UNIDAD_FANTASMA))
    expect(res.status).toBe(400)
    const cuerpo = (await res.json()) as RespuestaRechazo
    expect(cuerpo.error).toMatch(/filas con error/i)
    expect(cuerpo.error).toMatch(/no se escribió nada/i)
    expect(cuerpo.reporte?.resumen.conError).toBe(1)
    expect(await contarSaldos()).toBe(2)
  })

  it("(d) con gasto común ya emitido para el período del corte o uno anterior el rechazo es entero; un período posterior no bloquea", async () => {
    const antes = await contarSaldos()

    // Mismo período del corte (2024-03) → rechazo, también en la vista previa.
    await crearEmision("2024-03")
    try {
      const previa = await pedirImport("administrador", csv(FILA_A, FILA_B), true)
      expect(previa.status).toBe(409)
      const rechazo = (await previa.json()) as RespuestaRechazo
      expect(rechazo.error).toMatch(/el período del corte ya está cobrado en el sistema/i)
      expect(rechazo.error).toMatch(/contaría dos veces/i)
      expect(rechazo.detalle).toContain("2024-03")

      const real = await pedirImport("administrador", csv(FILA_A, FILA_B))
      expect(real.status).toBe(409)
      expect(await contarSaldos()).toBe(antes)
    } finally {
      await prisma.emisionGC.deleteMany({ where: { comunidadId: COMUNIDAD } })
    }

    // Un período ANTERIOR al corte (S3) → el mismo rechazo, nombrando ese período.
    await crearEmision("2024-01")
    try {
      const previa = await pedirImport("administrador", csv(FILA_A, FILA_B), true)
      expect(previa.status).toBe(409)
      const rechazo = (await previa.json()) as RespuestaRechazo
      expect(rechazo.detalle).toContain("2024-01")
      expect(await contarSaldos()).toBe(antes)
    } finally {
      await prisma.emisionGC.deleteMany({ where: { comunidadId: COMUNIDAD } })
    }

    // Un período POSTERIOR al corte no se cobra dos veces (S3): no bloquea.
    await crearEmision("2025-06")
    try {
      const previa = await pedirImport("administrador", csv(FILA_A, FILA_B), true)
      expect(previa.status).toBe(200)
      expect(await contarSaldos()).toBe(antes)
    } finally {
      await prisma.emisionGC.deleteMany({ where: { comunidadId: COMUNIDAD } })
    }
  })

  it("(e) sin fondo de gasto común activo el rechazo es literal y no escribe nada", async () => {
    const previa = await pedirImport("sinFondo", csv("8842-2101,2024-03-31,70000"), true)
    expect(previa.status).toBe(409)
    const rechazo = (await previa.json()) as RespuestaRechazo
    expect(rechazo.error).toMatch(/fondo de gasto común activo/i)
    expect(await contarSaldos(COMUNIDAD_SIN_FONDO)).toBe(0)

    const real = await pedirImport("sinFondo", csv("8842-2101,2024-03-31,70000"))
    expect(real.status).toBe(409)
    expect(await contarSaldos(COMUNIDAD_SIN_FONDO)).toBe(0)
  })

  it("(f) el saldo de apertura aparece en morosidadPorUnidad de la unidad", async () => {
    const cobros = await prisma.cobroFI.findMany({
      where: { comunidadId: COMUNIDAD, unidadId: UNIDAD_A },
      select: {
        id: true,
        unidadId: true,
        periodo: true,
        montoBase: true,
        moras: true,
        pagos: true,
        fechaVencimiento: true,
      },
    })
    const morosidad = morosidadPorUnidad(
      UNIDAD_A,
      cobros as unknown as CobroFI[],
      hoyISO()
    )
    expect(morosidad.periodosVencidos).toBe(1)
    expect(morosidad.deudaVencida).toBeCloseTo(125000.5)
  })
})

describe("plantilla y permisos del bloque de saldos de apertura", () => {
  it("la plantilla sale por código con los encabezados canónicos y el importador rechaza sus filas de ejemplo", async () => {
    const res = await pedirPlantilla("administrador")
    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toContain("text/csv")
    expect(res.headers.get("content-disposition")).toContain(
      'filename="plantilla-saldos-apertura.csv"'
    )

    const texto = await res.text()
    const lineas = texto.replace(/^\ufeff/, "").trimEnd().split(/\r?\n/)
    expect(lineas[0]).toBe(ENCABEZADOS)
    expect(lineas.length).toBe(4)

    const reporte = (await (await pedirImport("administrador", texto, true)).json()) as Reporte
    expect(reporte.resumen.conError).toBe(3)
    expect(reporte.filas[0]?.errores[0]).toContain("Esta fila es del ejemplo de la plantilla")
  })

  it("un residente no puede importar saldos ni descargar la plantilla", async () => {
    const importacion = await pedirImport("residente", csv(FILA_A, FILA_B), true)
    expect(importacion.status).toBe(403)
    const plantilla = await pedirPlantilla("residente")
    expect(plantilla.status).toBe(403)
  })
})
