/**
 * @vitest-environment node
 *
 * Los CARGADORES del aviso, contra la base real (frontera de los totales del
 * art. 31).
 *
 * `lib/resumen-mensual.ts` y `lib/aviso-cobro.ts` estaban fuera del `include` de
 * cobertura porque sus cargadores Prisma no tenían prueba: la regla pura estaba
 * probada y la traducción comunidad → filas no. Este archivo cubre los dos
 * cargadores:
 *
 *   `cargarResumenMensual(comunidadId, periodo)` — trae cobros (con sus pagos en
 *   el Json), egresos, ingresos manuales y fondos de UNA comunidad y los pasa a
 *   `resumenMensual`; el recorte por fecha lo hace la función pura.
 *
 *   `totalesDelPeriodo(comunidadId, periodo)` — el cargador del aviso: los
 *   totales del período o el motivo por el que no se computan (sin fondos de
 *   caja, período inválido). Es lo que `POST /api/avisos-cobro` consulta antes
 *   de foliar el papel.
 *
 * Lo que se fija, todo observable por el resultado:
 *
 *   1. la traducción es fiel: los tres números de la ley (ingresos del mes,
 *      egresos del mes, saldo de caja al cierre) con su detalle y su orden;
 *   2. el alcance es la comunidad: los movimientos de otra comunidad no entran;
 *   3. el corte es el último día REAL del mes (bisiesto incluido) y las fechas
 *      fuera de la ventana no cuentan;
 *   4. un período inválido no se calcula (no se inventan ceros);
 *   5. el aviso no se emite sin fondos de caja (`sin_fondos`), que es la misma
 *      guarda que la ruta ya prueba de punta a punta.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest"
import { prisma } from "@/lib/prisma"
import { cargarResumenMensual, resumenMensual } from "@/lib/resumen-mensual"
import { totalesDelPeriodo } from "@/lib/aviso-cobro"

/** Comunidad con movimientos antes, dentro y después del período medido. */
const COM_A = "cav-com-a"
/** Otra comunidad: el alcance no se mezcla, y su febrero es bisiesto. */
const COM_B = "cav-com-b"
/** Comunidad sin fondos de caja: sus totales no son computables. */
const COM_C = "cav-com-c"

const PERIODO = "2026-09"

const FONDO_A_GC = "cav-a-fondo-gc"
const FONDO_A_RESERVA = "cav-a-fondo-reserva"
const FONDO_B = "cav-b-fondo"

type Pago = { id: string; fecha: string; monto: number; metodo: string }

function pago(id: string, fecha: string, monto: number): Pago {
  return { id, fecha, monto, metodo: "transferencia" }
}

function cargo(opciones: {
  id: string
  comunidadId: string
  fondoId: string
  unidadId: string
  pagos: Pago[]
}): Parameters<typeof prisma.cobroFI.create>[0]["data"] {
  return {
    id: opciones.id,
    comunidadId: opciones.comunidadId,
    unidadId: opciones.unidadId,
    periodo: PERIODO,
    concepto: "gasto_comun",
    origenModulo: "FI",
    fondoId: opciones.fondoId,
    descripcion: `Gasto Común ${PERIODO}`,
    montoBase: 60_000,
    lineas: [{ concepto: "gasto_comun", monto: 60_000, fondoId: opciones.fondoId }],
    fechaCargo: `${PERIODO}-01`,
    moras: [],
    // SAFETY: el Json de pagos es el shape PagoCobroFI[] (esquema FI).
    pagos: opciones.pagos as never,
    diferencias: [],
  }
}

async function limpiar(): Promise<void> {
  const enComunidades = { in: [COM_A, COM_B, COM_C] }
  await prisma.avisoCobro.deleteMany({ where: { comunidadId: enComunidades } })
  await prisma.cobroFI.deleteMany({ where: { comunidadId: enComunidades } })
  await prisma.ingresoFI.deleteMany({ where: { comunidadId: enComunidades } })
  await prisma.egresoFI.deleteMany({ where: { comunidadId: enComunidades } })
  await prisma.fondoFI.deleteMany({ where: { comunidadId: enComunidades } })
}

describe("cargadores del aviso — resumen mensual y totales del período (BD real)", () => {
  beforeAll(async () => {
    await prisma.comunidad.deleteMany({ where: { id: { in: [COM_A, COM_B, COM_C] } } })
    await limpiar()
    for (const c of [
      { id: COM_A, nombre: "Comunidad Cargadores A", slug: "cav-a" },
      { id: COM_B, nombre: "Comunidad Cargadores B", slug: "cav-b" },
      { id: COM_C, nombre: "Comunidad Cargadores C", slug: "cav-c" },
    ]) {
      await prisma.comunidad.create({ data: c })
    }

    // Caja de la comunidad A: apertura de los dos fondos.
    await prisma.fondoFI.create({
      data: {
        id: FONDO_A_GC,
        comunidadId: COM_A,
        nombre: "Fondo Gasto Común",
        tipo: "gasto_comun",
        activo: true,
        saldoInicial: 100_000,
      },
    })
    await prisma.fondoFI.create({
      data: {
        id: FONDO_A_RESERVA,
        comunidadId: COM_A,
        nombre: "Fondo de Reserva",
        tipo: "reserva",
        activo: true,
        saldoInicial: 50_000,
      },
    })
    // Un fondo sin apertura declarada: aporta 0 a la caja, no un agujero.
    await prisma.fondoFI.create({
      data: {
        id: "cav-a-fondo-sin-apertura",
        comunidadId: COM_A,
        nombre: "Fondo sin apertura",
        tipo: "otro",
        activo: true,
        saldoInicial: null,
      },
    })

    // Pagos: uno el primer día, uno antes del período (solo acumulado), uno
    // después (ni mes ni acumulado) y dos el último día (para el orden estable).
    await prisma.cobroFI.create({
      data: cargo({
        id: "cav-a-cob-1",
        comunidadId: COM_A,
        fondoId: FONDO_A_GC,
        unidadId: "cav-a-u-1",
        pagos: [
          pago("cav-p-1", `${PERIODO}-01`, 30_000),
          pago("cav-p-2", "2026-08-31", 5_000),
          pago("cav-p-3", "2026-10-01", 7_000),
        ],
      }),
    })
    await prisma.cobroFI.create({
      data: cargo({
        id: "cav-a-cob-2",
        comunidadId: COM_A,
        fondoId: FONDO_A_RESERVA,
        unidadId: "cav-a-u-2",
        pagos: [
          pago("cav-p-4", `${PERIODO}-30`, 20_000),
          pago("cav-p-5", `${PERIODO}-30`, 10_000),
        ],
      }),
    })

    await prisma.ingresoFI.create({
      data: {
        id: "cav-a-ing-1",
        comunidadId: COM_A,
        fondoId: FONDO_A_GC,
        fecha: `${PERIODO}-15`,
        monto: 8_000,
        concepto: "Arriendo de quincho",
      },
    })
    // Ingreso anterior al período: no es "del mes", pero sí está en la caja.
    await prisma.ingresoFI.create({
      data: {
        id: "cav-a-ing-2",
        comunidadId: COM_A,
        fondoId: FONDO_A_GC,
        fecha: "2026-07-15",
        monto: 3_000,
        concepto: "Venta de chatarra",
      },
    })

    for (const e of [
      { id: "cav-a-egr-1", fondoId: FONDO_A_GC, fecha: `${PERIODO}-20`, monto: 12_000 },
      { id: "cav-a-egr-2", fondoId: FONDO_A_RESERVA, fecha: "2026-06-30", monto: 4_000 },
      { id: "cav-a-egr-3", fondoId: FONDO_A_RESERVA, fecha: "2026-10-02", monto: 1_000 },
    ]) {
      await prisma.egresoFI.create({
        data: {
          id: e.id,
          comunidadId: COM_A,
          fecha: e.fecha,
          categoria: "mantencion",
          descripcion: `Egreso ${e.id}`,
          monto: e.monto,
          fondoId: e.fondoId,
          esRecurrente: false,
        },
      })
    }

    // Comunidad B: apertura propia, un pago en su período corriente (que no
    // debe aparecer en A) y el par que separa febrero bisiesto.
    await prisma.fondoFI.create({
      data: {
        id: FONDO_B,
        comunidadId: COM_B,
        nombre: "Fondo Gasto Común B",
        tipo: "gasto_comun",
        activo: true,
        saldoInicial: 90_000,
      },
    })
    await prisma.cobroFI.create({
      data: cargo({
        id: "cav-b-cob-1",
        comunidadId: COM_B,
        fondoId: FONDO_B,
        unidadId: "cav-b-u-1",
        pagos: [
          pago("cav-p-b1", `${PERIODO}-30`, 99_999),
          pago("cav-p-b2", "2028-02-29", 1_000),
          pago("cav-p-b3", "2028-03-01", 2_000),
        ],
      }),
    })

    // Comunidad C no tiene fondos: sus totales no son computables.
  })

  afterAll(async () => {
    await limpiar()
    await prisma.comunidad.deleteMany({ where: { id: { in: [COM_A, COM_B, COM_C] } } })
  })

  it("traduce la comunidad a los tres números de la ley, con detalle y con corte", async () => {
    const resumen = await cargarResumenMensual(COM_A, PERIODO)

    expect(resumen.periodo).toBe(PERIODO)
    expect(resumen.desde).toBe(`${PERIODO}-01`)
    expect(resumen.hasta).toBe(`${PERIODO}-30`)

    // Ingresos del mes: pagos de cobros + ingresos manuales, recortados al mes.
    expect(resumen.ingresos.deCobros).toBe(60_000)
    expect(resumen.ingresos.manuales).toBe(8_000)
    expect(resumen.ingresos.total).toBe(68_000)
    expect(resumen.ingresos.cantidad).toBe(4)
    // El detalle es cronológico y estable: dos pagos el mismo día conservan su
    // orden, y cada movimiento dice de dónde salió el peso.
    expect(resumen.ingresos.detalle.map((m) => m.id)).toEqual([
      "cav-p-1",
      "cav-a-ing-1",
      "cav-p-4",
      "cav-p-5",
    ])
    expect(resumen.ingresos.detalle[0]).toEqual({
      origen: "cobro",
      id: "cav-p-1",
      fecha: `${PERIODO}-01`,
      monto: 30_000,
      fondoId: FONDO_A_GC,
      detalle: "Pago de cobro",
      unidadId: "cav-a-u-1",
    })
    expect(resumen.ingresos.detalle[1]).toEqual({
      origen: "ingreso_manual",
      id: "cav-a-ing-1",
      fecha: `${PERIODO}-15`,
      monto: 8_000,
      fondoId: FONDO_A_GC,
      detalle: "Arriendo de quincho",
    })

    // Egresos del mes: solo el que cae dentro de la ventana.
    expect(resumen.egresos.total).toBe(12_000)
    expect(resumen.egresos.cantidad).toBe(1)
    expect(resumen.egresos.detalle[0]!.origen).toBe("egreso")
    expect(resumen.egresos.detalle[0]!.detalle).toBe("Egreso cav-a-egr-1")

    // Saldo de caja al cierre: apertura de los dos fondos + todo lo que entró
    // hasta el corte (incluidos los movimientos de meses anteriores) − lo que
    // salió hasta el corte. Lo posterior al cierre no entra.
    expect(resumen.saldoCaja).toEqual({
      inicial: 150_000,
      ingresosAcumulados: 76_000,
      egresosAcumulados: 16_000,
      alCierre: 210_000,
    })
  })

  it("el alcance es la comunidad: los movimientos ajenos no entran", async () => {
    const resumen = await cargarResumenMensual(COM_B, PERIODO)
    expect(resumen.ingresos.deCobros).toBe(99_999)
    expect(resumen.ingresos.total).toBe(99_999)
    expect(resumen.saldoCaja.inicial).toBe(90_000)

    // Y la comunidad A sigue con sus propios números.
    const deA = await cargarResumenMensual(COM_A, PERIODO)
    expect(deA.ingresos.total).toBe(68_000)
    expect(deA.saldoCaja.inicial).toBe(150_000)
  })

  it("el corte del mes es el último día real (29 de febrero en año bisiesto)", async () => {
    const resumen = await cargarResumenMensual(COM_B, "2028-02")
    expect(resumen.desde).toBe("2028-02-01")
    expect(resumen.hasta).toBe("2028-02-29")
    // El pago del 29 entra; el del 1 de marzo no.
    expect(resumen.ingresos.deCobros).toBe(1_000)
    expect(resumen.ingresos.cantidad).toBe(1)
    expect(resumen.saldoCaja).toEqual({
      inicial: 90_000,
      ingresosAcumulados: 100_999,
      egresosAcumulados: 0,
      alCierre: 190_999,
    })
  })

  it("un período inválido no se calcula en vez de devolver ceros", async () => {
    await expect(cargarResumenMensual(COM_A, "2026-9")).rejects.toThrow(
      "El período debe tener formato AAAA-MM."
    )
  })

  it("un fondo sin saldo inicial declarado abre la caja en cero, no en un hueco", () => {
    // El cargador ya normaliza la ausencia de apertura a 0; la función pura
    // también tiene que hacerlo, porque un `undefined` en un `reduce` de sumas
    // da `NaN` y no un cero.
    const resumen = resumenMensual(PERIODO, {
      cobros: [],
      egresos: [],
      ingresos: [],
      fondos: [
        { id: "cav-f-nulo", nombre: "Caja sin apertura", saldoInicial: undefined },
      ],
    })
    expect(resumen.saldoCaja.inicial).toBe(0)
    expect(resumen.ingresos.total).toBe(0)
    expect(resumen.egresos.total).toBe(0)
  })

  it("totalesDelPeriodo devuelve el mismo resumen que carga el módulo", async () => {
    const totales = await totalesDelPeriodo(COM_A, PERIODO)
    expect(totales.ok).toBe(true)
    if (!totales.ok) return
    expect(totales.resumen).toEqual(await cargarResumenMensual(COM_A, PERIODO))
  })

  it("sin fondos de caja el aviso no tiene totales que declarar", async () => {
    const totales = await totalesDelPeriodo(COM_C, PERIODO)
    expect(totales).toEqual({
      ok: false,
      motivo: "sin_fondos",
      error: `No se puede emitir el aviso: la comunidad no tiene fondos de caja registrados, así que el saldo de caja al cierre del período ${PERIODO} no es computable.`,
    })
  })

  it("con fondos pero con un período inválido, el motivo es el período", async () => {
    const totales = await totalesDelPeriodo(COM_A, "2026-13")
    expect(totales).toEqual({
      ok: false,
      motivo: "periodo_invalido",
      error: "El período debe tener formato AAAA-MM.",
    })
  })

  it("un error inesperado del cargador no se disfraza de período inválido", async () => {
    const spy = vi
      .spyOn(prisma.cobroFI, "findMany")
      .mockRejectedValueOnce(new Error("la base no responde") as never)
    try {
      await expect(totalesDelPeriodo(COM_A, PERIODO)).rejects.toThrow(
        "la base no responde"
      )
    } finally {
      spy.mockRestore()
    }
  })
})
