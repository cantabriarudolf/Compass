/**
 * @vitest-environment node
 *
 * F29 — cuotas del convenio de pago de deuda de gastos comunes (Ley 21.442 art. 6).
 *
 * Lo que se fija acá es la REGLA PURA que arma la deuda del convenio, sin base ni
 * reloj: la primera cuota se paga al suscribir y no se genera como deuda, el saldo
 * se reparte en cuotas mensuales iguales y el residuo del redondeo cae en la
 * última para que la suma cierre exacta al centavo.
 *
 * Todo se mide desde la función pública: no se inspecciona ninguna estructura
 * interna ni se toca la base.
 */
import { describe, expect, it, vi } from "vitest"

import { cuotasDelConvenio } from "./convenios"

/** Centavos enteros: la comparación de dinero se hace sin floats sueltos. */
const centavos = (monto: number): number => Math.round(monto * 100)

/** `AAAA-MM-DD` de una fecha, en UTC (la regla no depende de la zona del host). */
const dia = (fecha: Date): string => fecha.toISOString().slice(0, 10)

const SUSCRIPCION = new Date("2026-03-15T12:00:00.000Z")

describe("cuotasDelConvenio — la primera cuota se paga al suscribir", () => {
  it("no genera la primera cuota como deuda y reparte sólo el saldo", () => {
    const cuotas = cuotasDelConvenio({
      montoTotal: 1_000_000,
      numeroCuotas: 4,
      primeraCuota: 200_000,
      fechaSuscripcion: SUSCRIPCION,
    })

    // La cuota 0 es el pago al suscribir: la registra la ruta como pagada, así que
    // la deuda del convenio empieza en la cuota 1.
    expect(cuotas.map((cuota) => cuota.numero)).toEqual([1, 2, 3, 4])
    expect(cuotas.map((cuota) => cuota.monto)).toEqual([
      200_000, 200_000, 200_000, 200_000,
    ])

    // El saldo financiado es montoTotal − primeraCuota, al centavo.
    const financiado = cuotas.reduce((suma, cuota) => suma + centavos(cuota.monto), 0)
    expect(financiado).toBe(centavos(1_000_000 - 200_000))
  })

  it("una primera cuota que cubre el total no deja deuda que repartir", () => {
    const cuotas = cuotasDelConvenio({
      montoTotal: 150_000,
      numeroCuotas: 3,
      primeraCuota: 150_000,
      fechaSuscripcion: SUSCRIPCION,
    })

    expect(cuotas).toEqual([])
  })
})

describe("cuotasDelConvenio — el residuo del redondeo va a la última cuota", () => {
  it("la suma de las cuotas cierra exacta al centavo cuando el saldo no divide", () => {
    const cuotas = cuotasDelConvenio({
      // Saldo $666.667 en 3 cuotas: 222.222, 222.222 y 222.223.
      montoTotal: 1_000_000,
      numeroCuotas: 3,
      primeraCuota: 333_333,
      fechaSuscripcion: SUSCRIPCION,
    })

    expect(cuotas.map((cuota) => centavos(cuota.monto))).toEqual([
      22_222_233, 22_222_233, 22_222_234,
    ])
    const financiado = cuotas.reduce((suma, cuota) => suma + centavos(cuota.monto), 0)
    expect(financiado).toBe(centavos(666_667))
    // El residuo no queda en las primeras: la última es la que lo absorbe.
    expect(centavos(cuotas[0]!.monto)).toBe(centavos(cuotas[1]!.monto))
    expect(centavos(cuotas[2]!.monto)).toBeGreaterThan(centavos(cuotas[1]!.monto))
  })

  it("un saldo con centavos sueltos también cierra exacto", () => {
    const cuotas = cuotasDelConvenio({
      // Saldo $100,01 en 3 cuotas: 33,33 + 33,33 + 33,35 sería 100,01 si el residuo
      // se quedara en la primera; acá el reparto es 33,33 / 33,33 / 33,35.
      montoTotal: 200.01,
      numeroCuotas: 3,
      primeraCuota: 100,
      fechaSuscripcion: SUSCRIPCION,
    })

    expect(cuotas.map((cuota) => centavos(cuota.monto))).toEqual([3333, 3333, 3335])
    const financiado = cuotas.reduce((suma, cuota) => suma + centavos(cuota.monto), 0)
    expect(financiado).toBe(centavos(200.01) - centavos(100))
  })
})

describe("cuotasDelConvenio — vencimientos mensuales desde la suscripción", () => {
  it("cada cuota vence el mismo día del mes, un mes después de la anterior", () => {
    const cuotas = cuotasDelConvenio({
      montoTotal: 400_000,
      numeroCuotas: 3,
      primeraCuota: 100_000,
      fechaSuscripcion: SUSCRIPCION,
    })

    expect(cuotas.map((cuota) => dia(cuota.venceEn))).toEqual([
      "2026-04-15",
      "2026-05-15",
      "2026-06-15",
    ])
    // La hora de la suscripción se conserva: el vencimiento se deriva de ella.
    expect(cuotas.every((cuota) => cuota.venceEn.getUTCHours() === 12)).toBe(true)
  })

  it("un mes corto no arrastra el día: enero 31 no vuelve a marzo 28", () => {
    const cuotas = cuotasDelConvenio({
      montoTotal: 400_000,
      numeroCuotas: 3,
      primeraCuota: 100_000,
      fechaSuscripcion: new Date("2026-01-31T08:00:00.000Z"),
    })

    expect(cuotas.map((cuota) => dia(cuota.venceEn))).toEqual([
      "2026-02-28",
      // Vuelve al 31 porque el mes de origen manda, no el vencimiento anterior.
      "2026-03-31",
      "2026-04-30",
    ])
  })

  it("el paso de año también es mensual", () => {
    const cuotas = cuotasDelConvenio({
      montoTotal: 300_000,
      numeroCuotas: 2,
      primeraCuota: 100_000,
      fechaSuscripcion: new Date("2026-12-10T00:00:00.000Z"),
    })

    expect(cuotas.map((cuota) => dia(cuota.venceEn))).toEqual([
      "2027-01-10",
      "2027-02-10",
    ])
  })
})

describe("cuotasDelConvenio — entradas fuera del contrato", () => {
  it("numeroCuotas menor a uno se rechaza", () => {
    expect(() =>
      cuotasDelConvenio({
        montoTotal: 100_000,
        numeroCuotas: 0,
        primeraCuota: 10_000,
        fechaSuscripcion: SUSCRIPCION,
      })
    ).toThrow(/al menos una cuota/i)
  })

  it("una primera cuota no positiva se rechaza", () => {
    expect(() =>
      cuotasDelConvenio({
        montoTotal: 100_000,
        numeroCuotas: 3,
        primeraCuota: 0,
        fechaSuscripcion: SUSCRIPCION,
      })
    ).toThrow(/primera cuota/i)
  })

  it("una primera cuota mayor al total se rechaza", () => {
    expect(() =>
      cuotasDelConvenio({
        montoTotal: 100_000,
        numeroCuotas: 3,
        primeraCuota: 120_000,
        fechaSuscripcion: SUSCRIPCION,
      })
    ).toThrow(/primera cuota/i)
  })

  it("un saldo que no alcanza para cuotas de un centavo se rechaza", () => {
    expect(() =>
      cuotasDelConvenio({
        // Saldo $0,02 en 5 cuotas: dos cuotas quedarían en cero.
        montoTotal: 100,
        numeroCuotas: 5,
        primeraCuota: 99.98,
        fechaSuscripcion: SUSCRIPCION,
      })
    ).toThrow(/centavo/i)
  })
})

describe("cuotasDelConvenio — función pura", () => {
  it("el mismo convenio da siempre el mismo reparto, sin importar el reloj", () => {
    const entrada = {
      montoTotal: 900_000,
      numeroCuotas: 6,
      primeraCuota: 150_000,
      fechaSuscripcion: SUSCRIPCION,
    } as const

    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date("2020-01-01T00:00:00.000Z"))
      const antes = cuotasDelConvenio(entrada)
      vi.setSystemTime(new Date("2030-12-31T23:59:59.000Z"))
      const despues = cuotasDelConvenio(entrada)

      expect(despues).toEqual(antes)
      // Y ninguna fecha depende del reloj: todas salen de la suscripción.
      expect(antes[0]!.venceEn.getUTCFullYear()).toBe(2026)
    } finally {
      vi.useRealTimers()
    }
  })
})
