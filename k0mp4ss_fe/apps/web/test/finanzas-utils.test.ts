/**
 * @vitest-environment node
 *
 * T5 corte 2, cobro-gastos-comunes-parametrico (S5) — `saldoFondo` con el cobro
 * como lista de conceptos.
 *
 * Antes cada pago se acreditaba entero al `fondoId` del cobro y el aporte al
 * fondo de reserva se sumaba ADEMÁS desde la emisión, que era un asiento
 * interno sin caja: el fondo mostraba plata que nadie había pagado. Ahora el
 * recargo de reserva es una línea real del cobro, así que cada pago se reparte
 * entre los fondos que nombran las líneas, en proporción al monto de cada una,
 * y el cobro legacy (sin líneas) sigue acreditando todo a su propio fondo.
 */
import { describe, it, expect } from "vitest"
import { saldoFondo } from "@/lib/finanzas-utils"

const FONDO_GC = "fondo-gc-t5"
const FONDO_RESERVA = "fondo-res-t5"

const pago = (id: string, monto: number) => ({
  id,
  monto,
  fecha: "2026-11-05",
  medio: "transferencia",
})

/** Cobro típico del corte 2: gasto común 60.000 + recargo de reserva 6.000. */
function cobroConRecargo(pagado: number) {
  return {
    fondoId: FONDO_GC,
    concepto: "gasto_comun" as const,
    montoBase: 66_000,
    lineas: [
      { concepto: "gasto_comun" as const, monto: 60_000, fondoId: FONDO_GC },
      { concepto: "gasto_comun" as const, monto: 6_000, fondoId: FONDO_RESERVA },
    ],
    pagos: pagado > 0 ? [pago("pago-t5-1", pagado)] : [],
  }
}

/** La emisión sigue declarando el aporte esperado: no es caja hasta que se paga. */
const emisionConAporte = {
  fondoReservaAporte: { fondoId: FONDO_RESERVA, monto: 6_000 },
}

describe("saldoFondo — el pago se reparte por las líneas del cobro", () => {
  it("sin pagos, el fondo de reserva no muestra el aporte declarado: no hay caja", () => {
    const ctx = {
      cobros: [cobroConRecargo(0)],
      egresos: [],
      emisiones: [emisionConAporte],
    }
    expect(saldoFondo(FONDO_RESERVA, ctx)).toBe(0)
    expect(saldoFondo(FONDO_GC, ctx)).toBe(0)
  })

  it("un pago parcial se reparte en proporción al monto de cada línea", () => {
    const ctx = {
      cobros: [cobroConRecargo(33_000)],
      egresos: [],
      emisiones: [emisionConAporte],
    }
    // 33.000 · 60.000/66.000 = 30.000 y 33.000 · 6.000/66.000 = 3.000.
    expect(saldoFondo(FONDO_GC, ctx)).toBe(30_000)
    expect(saldoFondo(FONDO_RESERVA, ctx)).toBe(3_000)
  })

  it("el pago completo acredita el recargo una sola vez", () => {
    const ctx = {
      cobros: [cobroConRecargo(66_000)],
      egresos: [],
      emisiones: [emisionConAporte],
    }
    // Sin doble conteo: el fondo de reserva recibe su línea, no el aporte + el pago.
    expect(saldoFondo(FONDO_GC, ctx)).toBe(60_000)
    expect(saldoFondo(FONDO_RESERVA, ctx)).toBe(6_000)
  })

  it("el cobro legacy (sin líneas) acredita todo su pago a su propio fondo", () => {
    const ctx = {
      cobros: [
        {
          fondoId: FONDO_RESERVA,
          concepto: "cuota_extraordinaria" as const,
          montoBase: 50_000,
          lineas: null,
          pagos: [pago("pago-t5-legacy", 50_000)],
        },
      ],
      egresos: [],
      emisiones: [],
    }
    expect(saldoFondo(FONDO_RESERVA, ctx)).toBe(50_000)
    expect(saldoFondo(FONDO_GC, ctx)).toBe(0)
  })

  it("una línea sin fondoId se imputa al fondo del cobro", () => {
    const ctx = {
      cobros: [
        {
          fondoId: FONDO_GC,
          concepto: "gasto_comun" as const,
          montoBase: 50_000,
          lineas: [
            { concepto: "gasto_comun" as const, monto: 40_000 },
            {
              concepto: "gasto_comun" as const,
              monto: 10_000,
              fondoId: FONDO_RESERVA,
            },
          ],
          pagos: [pago("pago-t5-sin-fondo", 50_000)],
        },
      ],
      egresos: [],
    }
    expect(saldoFondo(FONDO_GC, ctx)).toBe(40_000)
    expect(saldoFondo(FONDO_RESERVA, ctx)).toBe(10_000)
  })

  it("mantiene el saldo inicial, los ingresos manuales y los egresos del fondo", () => {
    const ctx = {
      cobros: [],
      egresos: [{ fondoId: FONDO_GC, monto: 1_000 }],
      ingresosFI: [{ fondoId: FONDO_GC, monto: 500 }],
      saldoInicialPorFondo: { [FONDO_GC]: 2_000 },
    }
    expect(saldoFondo(FONDO_GC, ctx)).toBe(1_500)
  })
})
