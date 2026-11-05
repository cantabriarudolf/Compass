/**
 * @vitest-environment node
 *
 * T3, aviso-de-cobro (S1) — los totales de comunidad del mes que el aviso tiene
 * que declarar (Ley 21.442 art. 31): ingresos, egresos y saldo de caja al
 * cierre del período.
 *
 * Hoy el sistema solo sabe el egreso del mes (`reportes-re/_acciones.ts` filtra
 * `fecha: { startsWith: periodo }`) y el saldo ACUMULADO de fondos
 * (`saldoFondo`, sin corte por fecha), así que dos de los tres números que la
 * ley exige no eran computables. Este corte los calcula en un módulo puro: las
 * filas entran en memoria y las reglas se prueban con fixtures, sin base.
 *
 * El invariante que protege la serie es el reconciliado: cuando el período es
 * el corriente, el saldo al cierre tiene que ser exactamente la suma de
 * `saldoFondo` de todos los fondos de la comunidad — la misma fórmula, solo con
 * ventana de fechas. Si divergen, el papel que se cobra y la pantalla de fondos
 * contarían dos historias distintas.
 */
import { describe, expect, it } from "vitest"
import type { CobroFI, EgresoFI, FondoFI, IngresoFI } from "@/lib/schemas"
import { saldoFondo } from "@/lib/finanzas-utils"
import { resumenMensual, type FilasResumenMensual } from "@/lib/resumen-mensual"

const FONDO_GC = "fondo-gc-t3"
const FONDO_RESERVA = "fondo-res-t3"

type CobroFixture = Pick<
  CobroFI,
  | "id"
  | "unidadId"
  | "fondoId"
  | "concepto"
  | "montoBase"
  | "lineas"
  | "pagos"
>

type EgresoFixture = Pick<
  EgresoFI,
  "id" | "fecha" | "monto" | "fondoId" | "categoria" | "descripcion"
>

type IngresoFixture = Pick<IngresoFI, "id" | "fecha" | "monto" | "fondoId" | "concepto">

type FondoFixture = Pick<FondoFI, "id" | "nombre" | "saldoInicial">

function pago(id: string, monto: number, fecha: string) {
  return { id, monto, fecha, medio: "transferencia" }
}

/** Cobro con detalle: gasto común 60.000 + recargo de reserva 6.000. */
function cobroConDetalle(
  pagos: CobroFixture["pagos"],
  id = "cobro-t3-detalle"
): CobroFixture {
  return {
    id,
    unidadId: "unidad-a-101",
    fondoId: FONDO_GC,
    concepto: "gasto_comun",
    montoBase: 66_000,
    lineas: [
      { concepto: "gasto_comun", monto: 60_000, fondoId: FONDO_GC },
      { concepto: "gasto_comun", monto: 6_000, fondoId: FONDO_RESERVA },
    ],
    pagos,
  }
}

/** Cobro emitido antes del detalle: `lineas` NULL es un cobro de una línea. */
function cobroLegacy(
  pagos: CobroFixture["pagos"],
  id = "cobro-t3-legacy"
): CobroFixture {
  return {
    id,
    unidadId: "unidad-a-102",
    fondoId: FONDO_RESERVA,
    concepto: "cuota_extraordinaria",
    montoBase: 50_000,
    lineas: null,
    pagos,
  }
}

function egreso(
  id: string,
  fecha: string,
  monto: number,
  fondoId = FONDO_GC
): EgresoFixture {
  return {
    id,
    fecha,
    monto,
    fondoId,
    categoria: "mantencion",
    descripcion: "Mantención de ascensor",
  }
}

function ingreso(
  id: string,
  fecha: string,
  monto: number,
  fondoId = FONDO_GC
): IngresoFixture {
  return {
    id,
    fecha,
    monto,
    fondoId,
    concepto: "Arriendo de quincho",
  }
}

const FONDOS: FondoFixture[] = [
  { id: FONDO_GC, nombre: "Gasto común", saldoInicial: 100_000 },
  { id: FONDO_RESERVA, nombre: "Fondo de reserva", saldoInicial: 20_000 },
]

function filas(parcial: Partial<FilasResumenMensual>): FilasResumenMensual {
  return {
    cobros: [],
    egresos: [],
    ingresos: [],
    fondos: FONDOS,
    ...parcial,
  }
}

/** Total de la pantalla de fondos: la suma de `saldoFondo` de cada fondo. */
function totalPantallaFondos(ctx: {
  cobros: CobroFixture[]
  egresos: EgresoFixture[]
  ingresos: IngresoFixture[]
  fondos: FondoFixture[]
}): number {
  return ctx.fondos.reduce(
    (acc, fondo) =>
      acc +
      saldoFondo(fondo.id, {
        cobros: ctx.cobros,
        egresos: ctx.egresos,
        ingresosFI: ctx.ingresos,
        saldoInicialPorFondo: { [fondo.id]: fondo.saldoInicial ?? 0 },
      }),
    0
  )
}

describe("resumenMensual — ingresos del mes", () => {
  it("suma los pagos de cobros cuya fecha cae en el período y descarta los de fuera", () => {
    const resumen = resumenMensual(
      "2026-03",
      filas({
        cobros: [
          cobroConDetalle([
            pago("p-antes", 5_000, "2026-02-28"),
            pago("p-dentro", 30_000, "2026-03-05"),
            pago("p-despues", 7_000, "2026-04-01"),
          ]),
        ],
      })
    )

    expect(resumen.ingresos.deCobros).toBe(30_000)
    expect(resumen.ingresos.total).toBe(30_000)
    expect(resumen.ingresos.cantidad).toBe(1)
    expect(resumen.ingresos.detalle.map((m) => m.id)).toEqual(["p-dentro"])
  })

  it("suma también el ingreso manual registrado en el mes", () => {
    const resumen = resumenMensual(
      "2026-03",
      filas({
        cobros: [cobroConDetalle([pago("p-dentro", 30_000, "2026-03-05")])],
        ingresos: [
          ingreso("i-antes", "2026-02-28", 4_000),
          ingreso("i-dentro", "2026-03-10", 12_000),
          ingreso("i-despues", "2026-04-01", 900),
        ],
      })
    )

    expect(resumen.ingresos.deCobros).toBe(30_000)
    expect(resumen.ingresos.manuales).toBe(12_000)
    // La ley habla de "ingresos": plata que entra, de cualquiera de las dos fuentes.
    expect(resumen.ingresos.total).toBe(42_000)
    expect(resumen.ingresos.cantidad).toBe(2)
    expect(resumen.ingresos.detalle.map((m) => m.id)).toEqual([
      "p-dentro",
      "i-dentro",
    ])
  })

  it("un cobro legacy sin lineas sigue aportando sus pagos", () => {
    const resumen = resumenMensual(
      "2026-03",
      filas({
        cobros: [cobroLegacy([pago("p-legacy", 50_000, "2026-03-20")])],
      })
    )

    expect(resumen.ingresos.deCobros).toBe(50_000)
    expect(resumen.ingresos.total).toBe(50_000)
    expect(resumen.ingresos.detalle[0]).toMatchObject({
      origen: "cobro",
      id: "p-legacy",
      unidadId: "unidad-a-102",
    })
  })
})

describe("resumenMensual — egresos del mes", () => {
  it("acota los egresos al período, incluidos sus extremos", () => {
    const resumen = resumenMensual(
      "2026-03",
      filas({
        egresos: [
          egreso("e-antes", "2026-02-28", 9_000),
          egreso("e-primer-dia", "2026-03-01", 10_000),
          egreso("e-ultimo-dia", "2026-03-31", 20_000),
          egreso("e-despues", "2026-04-01", 11_000),
        ],
      })
    )

    expect(resumen.egresos.total).toBe(30_000)
    expect(resumen.egresos.cantidad).toBe(2)
    expect(resumen.egresos.detalle.map((m) => m.id)).toEqual([
      "e-primer-dia",
      "e-ultimo-dia",
    ])
  })

  it("el detalle de egresos conserva concepto y fondo, no solo el total", () => {
    const resumen = resumenMensual(
      "2026-03",
      filas({ egresos: [egreso("e-1", "2026-03-04", 10_000, FONDO_RESERVA)] })
    )

    expect(resumen.egresos.detalle[0]).toMatchObject({
      origen: "egreso",
      id: "e-1",
      monto: 10_000,
      fondoId: FONDO_RESERVA,
      detalle: "Mantención de ascensor",
    })
  })
})

describe("resumenMensual — saldo de caja al cierre del mes", () => {
  it("corta en el último día del período: lo posterior no entra al saldo", () => {
    const resumen = resumenMensual(
      "2026-03",
      filas({
        cobros: [
          cobroConDetalle([
            pago("p-ene", 10_000, "2026-01-15"),
            pago("p-mar", 30_000, "2026-03-05"),
            pago("p-abr", 7_000, "2026-04-02"),
          ]),
        ],
        egresos: [
          egreso("e-mar", "2026-03-31", 5_000),
          egreso("e-abr", "2026-04-03", 3_000),
        ],
      })
    )

    // Acumulado hasta el cierre: enero + marzo entran, abril no.
    expect(resumen.saldoCaja.inicial).toBe(120_000)
    expect(resumen.saldoCaja.ingresosAcumulados).toBe(40_000)
    expect(resumen.saldoCaja.egresosAcumulados).toBe(5_000)
    expect(resumen.saldoCaja.alCierre).toBe(155_000)
    // El mes corriente es solo marzo: enero no es ingreso de este aviso.
    expect(resumen.ingresos.total).toBe(30_000)
  })

  it("reconcilia con la pantalla de fondos cuando el corte es el cierre del período", () => {
    const ctx = {
      cobros: [
        cobroConDetalle([
          pago("p-1", 66_000, "2026-03-06"),
          pago("p-2", 13_200, "2026-03-31"),
        ]),
        cobroLegacy([pago("p-3", 25_000, "2026-03-12")]),
      ],
      egresos: [egreso("e-1", "2026-03-09", 48_000), egreso("e-2", "2026-03-31", 6_000)],
      ingresos: [ingreso("i-1", "2026-03-02", 15_000, FONDO_RESERVA)],
      fondos: FONDOS,
    }

    const resumen = resumenMensual("2026-03", ctx)

    // Misma fórmula, distinta ventana: el aviso y la pantalla no pueden diferir.
    expect(resumen.saldoCaja.alCierre).toBe(totalPantallaFondos(ctx))
    // Y sigue cuadrando concepto por concepto: pagos 104.200 + manual 15.000 = 119.200,
    // egresos 54.000 y caja 120.000 + 119.200 − 54.000 = 185.200.
    expect(resumen.ingresos.total).toBe(119_200)
    expect(resumen.egresos.total).toBe(54_000)
    expect(resumen.saldoCaja.alCierre).toBe(185_200)
  })

  it("un mes sin movimientos devuelve ceros, nunca nulls", () => {
    const resumen = resumenMensual("2026-03", filas({ fondos: [{ id: FONDO_GC, nombre: "Gasto común", saldoInicial: 0 }] }))

    expect(resumen.ingresos.total).toBe(0)
    expect(resumen.ingresos.deCobros).toBe(0)
    expect(resumen.ingresos.manuales).toBe(0)
    expect(resumen.ingresos.cantidad).toBe(0)
    expect(resumen.ingresos.detalle).toEqual([])
    expect(resumen.egresos.total).toBe(0)
    expect(resumen.egresos.cantidad).toBe(0)
    expect(resumen.egresos.detalle).toEqual([])
    expect(resumen.saldoCaja.inicial).toBe(0)
    expect(resumen.saldoCaja.ingresosAcumulados).toBe(0)
    expect(resumen.saldoCaja.egresosAcumulados).toBe(0)
    expect(resumen.saldoCaja.alCierre).toBe(0)
  })
})

describe("resumenMensual — ventana del período", () => {
  it("usa el último día real del mes, con bisiesto", () => {
    const resumen = resumenMensual(
      "2024-02",
      filas({
        cobros: [
          cobroConDetalle([
            pago("p-29", 1_000, "2024-02-29"),
            pago("p-mar", 2_000, "2024-03-01"),
          ]),
        ],
      })
    )

    expect(resumen.desde).toBe("2024-02-01")
    expect(resumen.hasta).toBe("2024-02-29")
    expect(resumen.ingresos.total).toBe(1_000)
  })

  it("rechaza un período que no es AAAA-MM", () => {
    expect(() => resumenMensual("2026-3", filas({}))).toThrow(/AAAA-MM/)
    expect(() => resumenMensual("2026-13", filas({}))).toThrow(/AAAA-MM/)
  })
})
