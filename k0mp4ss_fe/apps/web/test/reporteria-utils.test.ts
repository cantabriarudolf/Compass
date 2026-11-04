/**
 * @vitest-environment node
 *
 * T5 corte 2, cobro-gastos-comunes-parametrico (S5) — `saludCajaFI` reparte lo
 * emitido y lo recaudado por las LÍNEAS del cobro, no por el `fondoId` del
 * cobro. Con el recargo de reserva como línea real, imputar todo al fondo del
 * cobro infla el gasto común un 10% y deja el fondo de reserva en cero
 * recaudado aunque las unidades hayan pagado su recargo.
 *
 * El reparto es proporcional al monto de cada línea y no se redondea por fondo:
 * redondear cada parte rompería la suma.
 */
import { describe, it, expect } from "vitest"
import { saludCajaFI, type SaludCajaRE } from "@/lib/reporteria-utils"

const FONDO_GC = "re-fondo-gc"
const FONDO_RESERVA = "re-fondo-res"
const FONDOS = [
  { id: FONDO_GC, nombre: "Gasto Común" },
  { id: FONDO_RESERVA, nombre: "Reserva" },
]

const pago = (id: string, monto: number) => ({
  id,
  monto,
  fecha: "2026-11-05",
  medio: "transferencia",
})

/** Cobro del corte 2: gasto común 60.000 + recargo de reserva 6.000. */
function cobroConRecargo(pagado: number) {
  return {
    fondoId: FONDO_GC,
    concepto: "gasto_comun" as const,
    montoBase: 66_000,
    lineas: [
      { concepto: "gasto_comun" as const, monto: 60_000, fondoId: FONDO_GC },
      { concepto: "gasto_comun" as const, monto: 6_000, fondoId: FONDO_RESERVA },
    ],
    moras: [],
    diferencias: [],
    pagos: pagado > 0 ? [pago("re-pago-1", pagado)] : [],
  }
}

/** Cobro legacy: una sola línea implícita, sin `lineas`. */
function cobroLegacy(pagado: number) {
  return {
    fondoId: FONDO_GC,
    concepto: "cuota_extraordinaria" as const,
    montoBase: 50_000,
    lineas: null,
    moras: [],
    diferencias: [],
    pagos: pagado > 0 ? [pago("re-pago-legacy", pagado)] : [],
  }
}

function filaDe(caja: SaludCajaRE, fondoId: string) {
  const fila = caja.recaudacionPorFondo.find(f => f.fondoId === fondoId)
  if (!fila) throw new Error(`El reporte no incluye el fondo ${fondoId}`)
  return fila
}

describe("saludCajaFI — emitido y recaudado por las líneas del cobro", () => {
  it("un cobro con recargo reparte emitido y recaudado entre los dos fondos", () => {
    const caja = saludCajaFI({
      cobrosFI: [cobroConRecargo(66_000)],
      egresosFI: [],
      fondos: FONDOS,
    })
    expect(filaDe(caja, FONDO_GC)).toMatchObject({ emitido: 60_000, recaudado: 60_000 })
    expect(filaDe(caja, FONDO_RESERVA)).toMatchObject({ emitido: 6_000, recaudado: 6_000 })
  })

  it("un pago parcial se reparte en proporción y las partes suman lo pagado", () => {
    const caja = saludCajaFI({
      cobrosFI: [cobroConRecargo(33_000)],
      egresosFI: [],
      fondos: FONDOS,
    })
    const gc = filaDe(caja, FONDO_GC)
    const reserva = filaDe(caja, FONDO_RESERVA)
    expect(gc.recaudado).toBe(30_000)
    expect(reserva.recaudado).toBe(3_000)
    expect(gc.recaudado + reserva.recaudado).toBe(33_000)
    // Lo emitido no depende de lo pagado.
    expect(gc.emitido).toBe(60_000)
    expect(reserva.emitido).toBe(6_000)
  })

  it("no redondea por fondo: el reparto suma el pago exacto", () => {
    // Presupuesto con la reserva incluida: 90.909 + 9.091 = 100.000.
    const caja = saludCajaFI({
      cobrosFI: [
        {
          fondoId: FONDO_GC,
          concepto: "gasto_comun" as const,
          montoBase: 100_000,
          lineas: [
            { concepto: "gasto_comun" as const, monto: 90_909, fondoId: FONDO_GC },
            { concepto: "gasto_comun" as const, monto: 9_091, fondoId: FONDO_RESERVA },
          ],
          moras: [],
          diferencias: [],
          pagos: [pago("re-pago-3", 33_333)],
        },
      ],
      egresosFI: [],
      fondos: FONDOS,
    })
    const gc = filaDe(caja, FONDO_GC).recaudado
    const reserva = filaDe(caja, FONDO_RESERVA).recaudado
    expect(gc).toBeCloseTo((33_333 * 90_909) / 100_000, 6)
    expect(reserva).toBeCloseTo((33_333 * 9_091) / 100_000, 6)
    expect(gc + reserva).toBeCloseTo(33_333, 6)
  })

  it("un cobro legacy sin líneas se reporta igual que hoy, en su propio fondo", () => {
    const caja = saludCajaFI({
      cobrosFI: [cobroLegacy(50_000)],
      egresosFI: [],
      fondos: FONDOS,
    })
    expect(filaDe(caja, FONDO_GC)).toMatchObject({ emitido: 50_000, recaudado: 50_000 })
    expect(filaDe(caja, FONDO_RESERVA)).toMatchObject({ emitido: 0, recaudado: 0 })
  })

  it("mantiene los totales globales y el termómetro de caja", () => {
    const caja = saludCajaFI({
      cobrosFI: [cobroConRecargo(66_000)],
      egresosFI: [{ monto: 1_000, esRecurrente: true }],
      fondos: FONDOS,
    })
    expect(caja.ingresosNetos).toBe(66_000)
    expect(caja.egresosTotales).toBe(1_000)
    expect(caja.diferenciaCaja).toBe(65_000)
    expect(caja.gastosFijosRecurrentes).toBe(1_000)
    expect(caja.termometroVerde).toBe(true)
  })
})
