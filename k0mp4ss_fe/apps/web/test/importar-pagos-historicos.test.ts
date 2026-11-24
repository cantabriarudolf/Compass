/**
 * @vitest-environment node
 *
 * T4/S4 — importar el detalle de los pagos históricos (unidad, fecha, monto,
 * medio).
 *
 * Contra la base descartable real (nada de mocks de Prisma) y con cookies de
 * sesión Auth.js mintadas, igual que `test/importar-saldos-apertura.test.ts`.
 * Toda la data creada lleva el prefijo `imp-pgh-` y la limpieza queda acotada a
 * esos ids.
 *
 * Contratos cubiertos (odd/tasks/saldar-f45-f48.md, S4):
 *   · la vista previa (`dryRun`) no escribe: los `pagos` del `CobroFI` quedan
 *     intactos y no se crea ningún cobro.
 *   · un archivo con filas inválidas bloquea la importación real: 400 con el
 *     reporte fila por fila y nada escrito.
 *   · un archivo válido anexa un pago por fila a la entrada `pagos` del
 *     `CobroFI` de esa unidad y ese período (el mes de la fecha), sin crear
 *     cobro ni asiento nuevo.
 *   · reimportar el mismo archivo no duplica: se reporta «sin cambios».
 *   · una fila cuya unidad no tiene `CobroFI` en su período falla con el
 *     motivo literal y nada se escribe.
 *   · una fila con unidad inexistente falla con el motivo literal.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import type { PagoCobroFI } from "@/lib/schemas"

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

const COMUNIDAD = "imp-pgh-comunidad"
const FONDO = "imp-pgh-fondo"

const ROL_A = "8843-1101"
const ROL_B = "8843-1102"
/** Unidad que existe pero NO tiene cobro para 2024-03. */
const ROL_SIN_COBRO = "8843-2101"
const ROL_FANTASMA = "8843-9999"

const UNIDAD_A = "imp-pgh-unidad-a"
const UNIDAD_B = "imp-pgh-unidad-b"
const UNIDAD_SIN_COBRO = "imp-pgh-unidad-sin-cobro"

const COBRO_A = "imp-pgh-cobro-a"
const COBRO_B = "imp-pgh-cobro-b"
/** Cobro de otro período de la unidad A: prueba que un archivo bloqueado no escribe. */
const COBRO_A_MAYO = "imp-pgh-cobro-a-mayo"

const CUENTAS = {
  administrador: {
    id: "imp-pgh-user-admin",
    email: "imp-pgh-admin@test.cl",
    rol: "administrador",
  },
  residente: {
    id: "imp-pgh-user-residente",
    email: "imp-pgh-residente@test.cl",
    rol: "residente",
  },
} as const

const cookies: Record<keyof typeof CUENTAS, string> = {
  administrador: "",
  residente: "",
}

/** Encabezado canónico del formato declarado (S4). */
const ENCABEZADOS = "unidad,fecha,monto,medio"

const FILA_A = `${ROL_A},2024-03-08,45000.50,Transferencia`
const FILA_B = `${ROL_B},2024-03-12,45000,Efectivo`
const FILA_SIN_MEDIO = `${ROL_A},2024-03-11,5000,`
const FILA_MONTO_CERO = `${ROL_A},2024-03-10,0,Transferencia`
const FILA_FECHA_INVALIDA = `${ROL_B},2024-02-30,10000,Efectivo`

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

/** Cuerpo de la importación bloqueada: mensaje literal + reporte en el extra. */
interface RespuestaBloqueada {
  error: string
  reporte?: Reporte
}

/** Motivos literales del módulo (el archivo citado en el mensaje es el real). */
const MOTIVO_SIN_COBRO =
  `fecha: no existe un cobro del período "2024-03" para la unidad con rol SII "${ROL_SIN_COBRO}"; ` +
  "el pago histórico se registra sobre el cobro del período, que debe estar emitido antes de importar. (línea 3)"
const MOTIVO_UNIDAD_FANTASMA =
  `unidad: no existe la unidad con rol SII "${ROL_FANTASMA}" en la comunidad; ` +
  "debe estar creada antes de importar los pagos históricos. (línea 2)"

afterAll(async () => {
  state.cookie = ""
  try {
    await prisma.cobroFI.deleteMany({ where: { comunidadId: COMUNIDAD } })
    await prisma.unidad.deleteMany({ where: { comunidadId: COMUNIDAD } })
    await prisma.fondoFI.deleteMany({ where: { comunidadId: COMUNIDAD } })
    const ids = Object.values(CUENTAS).map((c) => c.id)
    await prisma.membresia.deleteMany({ where: { usuarioId: { in: ids } } })
    await prisma.usuario.deleteMany({ where: { id: { in: ids } } })
    await prisma.comunidad.deleteMany({ where: { id: COMUNIDAD } })
  } catch {
    // intencional: limpieza best-effort (la base descartable se recrea igual)
  }
})

let POST_PAGOS: (req: Request) => Promise<Response>

beforeAll(async () => {
  process.env.AUTH_SECRET = AUTH_SECRET

  await prisma.comunidad.upsert({
    where: { id: COMUNIDAD },
    update: {},
    create: { id: COMUNIDAD, nombre: `Comunidad ${COMUNIDAD}`, slug: COMUNIDAD },
  })

  const { cookieSesionAuthjs } = await import("./helpers/sesion-authjs")
  for (const [clave, cuenta] of Object.entries(CUENTAS)) {
    await prisma.usuario.upsert({
      where: { email: cuenta.email },
      update: {},
      create: { id: cuenta.id, email: cuenta.email, activo: true },
    })
    await prisma.membresia.deleteMany({ where: { usuarioId: cuenta.id } })
    await prisma.membresia.create({
      data: { usuarioId: cuenta.id, comunidadId: COMUNIDAD, rol: cuenta.rol },
    })
    cookies[clave as keyof typeof CUENTAS] = await cookieSesionAuthjs({
      sub: cuenta.id,
      email: cuenta.email,
    })
  }

  await prisma.fondoFI.deleteMany({ where: { comunidadId: COMUNIDAD } })
  await prisma.fondoFI.create({
    data: {
      id: FONDO,
      comunidadId: COMUNIDAD,
      nombre: "Fondo Gastos Comunes",
      tipo: "gasto_comun",
      activo: true,
    },
  })

  // Unidades por rol SII (la clave que declara el CSV y que usa la estructura).
  for (const [id, rol, numero] of [
    [UNIDAD_A, ROL_A, "1101"],
    [UNIDAD_B, ROL_B, "1102"],
    [UNIDAD_SIN_COBRO, ROL_SIN_COBRO, "2101"],
  ] as const) {
    await prisma.unidad.create({
      data: {
        id,
        comunidadId: COMUNIDAD,
        microSectorId: "imp-pgh-micro",
        numero,
        etiqueta: "Depto",
        tipoUnidadId: "imp-pgh-tipo",
        metraje: 60,
        prorrateo: 0.01,
        rolSii: rol,
        estadoId: "imp-pgh-estado",
        servicios: {},
      },
    })
  }

  // Los cobros existen ANTES de importar: el bloque no los crea (S4).
  for (const [id, unidadId, periodo] of [
    [COBRO_A, UNIDAD_A, "2024-03"],
    [COBRO_B, UNIDAD_B, "2024-03"],
    [COBRO_A_MAYO, UNIDAD_A, "2024-05"],
  ] as const) {
    await prisma.cobroFI.create({
      data: {
        id,
        comunidadId: COMUNIDAD,
        unidadId,
        periodo,
        concepto: "gasto_comun",
        origenModulo: "FI",
        origenRef: null,
        fondoId: FONDO,
        descripcion: `Gasto común ${periodo}`,
        montoBase: 45000,
        fechaCargo: `${periodo}-01`,
        moras: [],
        pagos: [],
        diferencias: [],
      },
    })
  }

  const pagos = await import("@/app/api/importar/pagos-historicos/route")
  POST_PAGOS = pagos.POST
}, 30_000)

/** POST al importador: la vista previa es el MISMO handler con `?dryRun=1`. */
function pedirImport(
  rol: keyof typeof CUENTAS | "sin-sesion",
  cuerpo: string,
  seco = false
): Promise<Response> {
  state.cookie = rol === "sin-sesion" ? "" : cookies[rol]
  return POST_PAGOS(
    new NextRequest(
      `http://localhost/api/importar/pagos-historicos${seco ? "?dryRun=1" : ""}`,
      {
        method: "POST",
        body: cuerpo,
        headers: {
          "content-type": "text/csv",
          ...(state.cookie ? { cookie: state.cookie } : {}),
        },
      }
    )
  )
}

async function contarCobros(): Promise<number> {
  return prisma.cobroFI.count({ where: { comunidadId: COMUNIDAD } })
}

/** Los pagos guardados en la entrada `pagos` del cobro, leídos de la base. */
async function pagosDe(cobroId: string): Promise<PagoCobroFI[]> {
  const cobro = await prisma.cobroFI.findUnique({
    where: { id: cobroId },
    select: { pagos: true },
  })
  // SAFETY: pagos es Json con shape PagoCobroFI[] (validado por CobroFISchema).
  return (cobro?.pagos ?? []) as unknown as PagoCobroFI[]
}

describe("POST /api/importar/pagos-historicos — S4 contra la base real", () => {
  it("la vista previa no escribe: los pagos de cada cobro quedan intactos y no se crea ningún cobro", async () => {
    expect(await contarCobros()).toBe(3)

    const previa = await pedirImport("administrador", csv(FILA_A, FILA_B), true)
    expect(previa.status).toBe(200)
    expect((await previa.json()) as Reporte).toEqual({
      filas: [
        { linea: 2, accion: "actualizar", errores: [] },
        { linea: 3, accion: "actualizar", errores: [] },
      ],
      resumen: {
        total: 2,
        validas: 2,
        conError: 0,
        crear: 0,
        actualizar: 2,
        sinCambios: 0,
      },
    })

    // La vista previa no escribió nada (S4).
    expect(await pagosDe(COBRO_A)).toEqual([])
    expect(await pagosDe(COBRO_B)).toEqual([])
    expect(await contarCobros()).toBe(3)
  })

  it("un archivo con filas inválidas no se importa: 400 con el reporte, motivos literales y nada escrito", async () => {
    const res = await pedirImport(
      "administrador",
      csv(FILA_A, FILA_MONTO_CERO, FILA_FECHA_INVALIDA, FILA_SIN_MEDIO)
    )
    expect(res.status).toBe(400)
    const cuerpo = (await res.json()) as RespuestaBloqueada

    expect(cuerpo.error).toMatch(/filas con error/i)
    expect(cuerpo.error).toMatch(/no se escribió nada/i)
    expect(cuerpo.reporte?.filas).toHaveLength(4)
    expect(cuerpo.reporte?.resumen).toEqual({
      total: 4,
      validas: 1,
      conError: 3,
      crear: 0,
      actualizar: 1,
      sinCambios: 0,
    })
    // Cada fila inválida viaja con la columna y el motivo exacto del esquema.
    expect(cuerpo.reporte?.filas[1]).toEqual({
      linea: 3,
      accion: "sin-cambios",
      errores: ["monto: debe ser mayor a cero. (línea 3)"],
    })
    expect(cuerpo.reporte?.filas[2]).toEqual({
      linea: 4,
      accion: "sin-cambios",
      errores: ["fecha: no es una fecha real del calendario. (línea 4)"],
    })
    expect(cuerpo.reporte?.filas[3]).toEqual({
      linea: 5,
      accion: "sin-cambios",
      errores: ["medio: es obligatorio. (línea 5)"],
    })

    // La fila válida del mismo archivo tampoco se escribió: la importación se
    // rechaza ENTERA, no «las filas que se puedan».
    expect(await pagosDe(COBRO_A)).toEqual([])
    expect(await pagosDe(COBRO_B)).toEqual([])
    expect(await contarCobros()).toBe(3)
  })

  it("importado en serio anexa un pago por fila al cobro del período, sin crear cobro ni asiento", async () => {
    const res = await pedirImport("administrador", csv(FILA_A, FILA_B))
    expect(res.status).toBe(200)
    const reporte = (await res.json()) as Reporte
    expect(reporte.resumen).toEqual({
      total: 2,
      validas: 2,
      conError: 0,
      crear: 0,
      actualizar: 2,
      sinCambios: 0,
    })

    const pagosA = await pagosDe(COBRO_A)
    expect(pagosA).toHaveLength(1)
    expect(pagosA[0]).toMatchObject({
      monto: 45000.5,
      fecha: "2024-03-08",
      medio: "Transferencia",
    })
    // El id del pago es determinista por la clave de idempotencia.
    expect(pagosA[0]?.id.startsWith("imp-pag-")).toBe(true)

    const pagosB = await pagosDe(COBRO_B)
    expect(pagosB).toHaveLength(1)
    expect(pagosB[0]).toMatchObject({
      monto: 45000,
      fecha: "2024-03-12",
      medio: "Efectivo",
    })

    // Un pago histórico NO crea asiento: no hay cobro nuevo ni movimiento FI.
    expect(await contarCobros()).toBe(3)
    expect(
      await prisma.ingresoFI.count({ where: { comunidadId: COMUNIDAD } })
    ).toBe(0)
    expect(
      await prisma.egresoFI.count({ where: { comunidadId: COMUNIDAD } })
    ).toBe(0)
    // El cobro conserva su monto base: el pago sólo se anexa a `pagos`.
    const cobroA = await prisma.cobroFI.findUnique({
      where: { id: COBRO_A },
      select: { montoBase: true, periodo: true },
    })
    expect(cobroA?.montoBase).toBeCloseTo(45000)
    expect(cobroA?.periodo).toBe("2024-03")
  })

  it("reimportar el mismo archivo no duplica y lo reporta «sin cambios»", async () => {
    const pagosA = await pagosDe(COBRO_A)
    const idA = pagosA[0]?.id

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
    expect(reporte.filas.map((f) => f.accion)).toEqual([
      "sin-cambios",
      "sin-cambios",
    ])

    // Un solo pago por cobro, con el mismo id: la clave unidad + fecha + monto
    // + medio ya existía en la comunidad.
    expect(await pagosDe(COBRO_A)).toHaveLength(1)
    expect((await pagosDe(COBRO_A))[0]?.id).toBe(idA)
    expect(await pagosDe(COBRO_B)).toHaveLength(1)
    expect(await contarCobros()).toBe(3)
  })

  it("una fila sin cobro para su período falla con el motivo literal y la importación no escribe", async () => {
    const res = await pedirImport(
      "administrador",
      csv(`${ROL_A},2024-05-06,12000,Transferencia`, `${ROL_SIN_COBRO},2024-03-15,30000,Transferencia`)
    )
    expect(res.status).toBe(400)
    const cuerpo = (await res.json()) as RespuestaBloqueada

    expect(cuerpo.reporte?.resumen).toEqual({
      total: 2,
      validas: 1,
      conError: 1,
      crear: 0,
      actualizar: 1,
      sinCambios: 0,
    })
    expect(cuerpo.reporte?.filas[1]).toEqual({
      linea: 3,
      accion: "sin-cambios",
      errores: [MOTIVO_SIN_COBRO],
    })

    // La fila válida del mismo archivo no se escribió (importación bloqueada).
    expect(await pagosDe(COBRO_A_MAYO)).toEqual([])
    // Los pagos ya importados siguen intactos.
    expect(await pagosDe(COBRO_A)).toHaveLength(1)
    expect(await contarCobros()).toBe(3)
  })

  it("una fila con unidad inexistente falla con el motivo literal y no escribe nada", async () => {
    const res = await pedirImport(
      "administrador",
      csv(`${ROL_FANTASMA},2024-03-15,30000,Transferencia`)
    )
    expect(res.status).toBe(400)
    const cuerpo = (await res.json()) as RespuestaBloqueada

    expect(cuerpo.reporte?.resumen).toEqual({
      total: 1,
      validas: 0,
      conError: 1,
      crear: 0,
      actualizar: 0,
      sinCambios: 0,
    })
    expect(cuerpo.reporte?.filas[0]).toEqual({
      linea: 2,
      accion: "sin-cambios",
      errores: [MOTIVO_UNIDAD_FANTASMA],
    })
    expect(await contarCobros()).toBe(3)
    expect(await pagosDe(COBRO_A)).toHaveLength(1)
    expect(await pagosDe(COBRO_B)).toHaveLength(1)
  })
})
