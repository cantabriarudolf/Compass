/**
 * @vitest-environment node
 *
 * F32 — gasto por sector repartido en proporción al avalúo fiscal.
 *
 * Lo que se fija acá es la REGLA PURA (`lib/reparto-sector.ts`), sin base y sin
 * reloj: el monto se reparte entre las unidades del sector en proporción a su
 * avalúo fiscal, en centavos enteros, y la suma de las cuotas es EXACTAMENTE el
 * monto total (el residuo del redondeo va a la unidad de mayor avalúo). Una unidad
 * sin avalúo declarado NO entra al reparto: no se le asigna cero, no se la usa
 * para compensar y no se reparte en partes iguales. Si ninguna unidad del sector
 * tiene avalúo, no se reparte nada y la regla dice por qué.
 *
 * Las tres decisiones que la regla toma y que ninguna ruta debe re-resolver:
 *
 *   1. DINERO EN CENTAVOS ENTEROS. Repartir pesos como floats deja cuotas con
 *      fracciones de centavo y una suma que no cierra: la regla opera en centavos
 *      y devuelve pesos ya redondeados, así que la suma de las cuotas es exacta.
 *   2. LA UNIDAD SIN AVALÚO QUEDA FUERA. Repartir el total entre las que no
 *      tienen avalúo sería inventar un hecho catastral que nadie declaró, y
 *      asignarle $0 sería cobrarle nada por un gasto que sí la alcanza: la unidad
 *      queda pendiente de declarar su avalúo, y eso se ve en la respuesta (no
 *      aparece en las cuotas).
 *   3. EL RESIDUO VA AL MAYOR AVALÚO. Es el criterio escrito en la spec: cierra la
 *      suma en el monto exacto y es determinístico (empate de avalúo máximo: gana
 *      la primera unidad en el orden recibido).
 *
 * Todo se mide desde la función pública: no se inspecciona ninguna estructura
 * interna ni se toca la base.
 */
import { describe, expect, it } from "vitest"

import { avaluoTotalDeCuotas, repartirPorAvaluo } from "./reparto-sector"

/** Centavos enteros: la comparación de dinero se hace sin floats sueltos. */
const centavos = (monto: number): number => Math.round(monto * 100)

/** Suma de las cuotas en centavos enteros (la forma en que se compara el dinero). */
const sumaEnCentavos = (
  cuotas: readonly { readonly monto: number }[]
): number => cuotas.reduce((total, cuota) => total + centavos(cuota.monto), 0)

describe("repartirPorAvaluo — proporcional al avalúo", () => {
  it("reparte el monto en proporción al avalúo de cada unidad", () => {
    const dictamen = repartirPorAvaluo({
      montoTotal: 1_000_000,
      unidades: [
        { unidadId: "u-101", avaluo: 60_000_000 },
        { unidadId: "u-102", avaluo: 40_000_000 },
      ],
    })

    expect(dictamen.permitido).toBe(true)
    if (!dictamen.permitido) return
    expect(dictamen.cuotas).toEqual([
      { unidadId: "u-101", avaluoUsado: 60_000_000, monto: 600_000 },
      { unidadId: "u-102", avaluoUsado: 40_000_000, monto: 400_000 },
    ])
  })

  it("tres unidades desiguales se reparten el total sin sobras", () => {
    const dictamen = repartirPorAvaluo({
      montoTotal: 1_000_000,
      unidades: [
        { unidadId: "u-101", avaluo: 50_000_000 },
        { unidadId: "u-102", avaluo: 30_000_000 },
        { unidadId: "u-103", avaluo: 20_000_000 },
      ],
    })

    expect(dictamen.permitido).toBe(true)
    if (!dictamen.permitido) return
    expect(dictamen.cuotas.map((cuota) => cuota.monto)).toEqual([
      500_000, 300_000, 200_000,
    ])
    expect(sumaEnCentavos(dictamen.cuotas)).toBe(centavos(1_000_000))
  })

  it("la suma de las cuotas es EXACTAMENTE el monto total, con centavos que no dividen", () => {
    // Siete avalúos que no son múltiplos del total y un monto con centavos: es el
    // caso en que un reparto con floats dejaría de cerrar.
    const dictamen = repartirPorAvaluo({
      montoTotal: 1_234_567.89,
      unidades: [
        { unidadId: "u-101", avaluo: 31_234_567 },
        { unidadId: "u-102", avaluo: 27_111_111 },
        { unidadId: "u-103", avaluo: 19_876_543 },
        { unidadId: "u-104", avaluo: 11_111_111 },
        { unidadId: "u-105", avaluo: 7_654_321 },
        { unidadId: "u-106", avaluo: 3_333_333 },
        { unidadId: "u-107", avaluo: 1_000_001 },
      ],
    })

    expect(dictamen.permitido).toBe(true)
    if (!dictamen.permitido) return
    expect(sumaEnCentavos(dictamen.cuotas)).toBe(centavos(1_234_567.89))
    // Mayor avalúo, mayor cuota: el reparto es monótono con el avalúo (la lista
    // viene con los avalúos de mayor a menor, así que las cuotas no crecen).
    for (let i = 1; i < dictamen.cuotas.length; i++) {
      const anterior = dictamen.cuotas[i - 1]
      const actual = dictamen.cuotas[i]
      if (!anterior || !actual) continue
      expect(centavos(actual.monto)).toBeLessThanOrEqual(centavos(anterior.monto))
    }
  })

  it("una sola unidad con avalúo se lleva el monto completo, con sus centavos", () => {
    const dictamen = repartirPorAvaluo({
      montoTotal: 987_654.32,
      unidades: [{ unidadId: "u-101", avaluo: 41_500_000 }],
    })

    expect(dictamen.permitido).toBe(true)
    if (!dictamen.permitido) return
    expect(dictamen.cuotas).toEqual([
      { unidadId: "u-101", avaluoUsado: 41_500_000, monto: 987_654.32 },
    ])
  })

  it("el avalúo usado vuelve congelado, tal como se recibió", () => {
    const dictamen = repartirPorAvaluo({
      montoTotal: 500_000,
      unidades: [
        { unidadId: "u-101", avaluo: 12_345_678.9 },
        { unidadId: "u-102", avaluo: 87_654_321.1 },
      ],
    })

    expect(dictamen.permitido).toBe(true)
    if (!dictamen.permitido) return
    expect(dictamen.cuotas.map((cuota) => cuota.avaluoUsado)).toEqual([
      12_345_678.9, 87_654_321.1,
    ])
    expect(avaluoTotalDeCuotas(dictamen.cuotas)).toBe(100_000_000)
  })

  it("es determinística: dos llamadas con la misma entrada dan lo mismo", () => {
    const entrada = {
      montoTotal: 333_333.33,
      unidades: [
        { unidadId: "u-101", avaluo: 10_000_000 },
        { unidadId: "u-102", avaluo: 20_000_000 },
        { unidadId: "u-103", avaluo: 30_000_000 },
      ],
    } as const
    expect(repartirPorAvaluo(entrada)).toEqual(repartirPorAvaluo(entrada))
  })
})

describe("repartirPorAvaluo — la unidad sin avalúo queda FUERA", () => {
  it("la unidad sin avalúo no aparece en las cuotas ni recibe cero", () => {
    const dictamen = repartirPorAvaluo({
      montoTotal: 1_000_000,
      unidades: [
        { unidadId: "u-101", avaluo: 60_000_000 },
        { unidadId: "u-102", avaluo: 40_000_000 },
        { unidadId: "u-103", avaluo: null },
      ],
    })

    expect(dictamen.permitido).toBe(true)
    if (!dictamen.permitido) return
    expect(dictamen.cuotas.map((cuota) => cuota.unidadId)).toEqual(["u-101", "u-102"])
    // El total se reparte entre las que TIENEN avalúo: no se reserva nada para la
    // unidad sin declarar y tampoco se la compensa en partes iguales.
    expect(dictamen.cuotas.map((cuota) => cuota.monto)).toEqual([600_000, 400_000])
    expect(sumaEnCentavos(dictamen.cuotas)).toBe(centavos(1_000_000))
  })

  it("un avalúo no positivo o no finito tampoco entra al reparto", () => {
    const dictamen = repartirPorAvaluo({
      montoTotal: 1_000_000,
      unidades: [
        { unidadId: "u-101", avaluo: 60_000_000 },
        { unidadId: "u-102", avaluo: 0 },
        { unidadId: "u-103", avaluo: -1 },
        { unidadId: "u-104", avaluo: Number.NaN },
        { unidadId: "u-105", avaluo: 40_000_000 },
      ],
    })

    expect(dictamen.permitido).toBe(true)
    if (!dictamen.permitido) return
    expect(dictamen.cuotas.map((cuota) => cuota.unidadId)).toEqual(["u-101", "u-105"])
    expect(sumaEnCentavos(dictamen.cuotas)).toBe(centavos(1_000_000))
  })
})

describe("repartirPorAvaluo — sin avalúo no se reparte", () => {
  it("un sector sin ninguna unidad con avalúo no se permite y dice por qué", () => {
    const dictamen = repartirPorAvaluo({
      montoTotal: 1_000_000,
      unidades: [
        { unidadId: "u-101", avaluo: null },
        { unidadId: "u-102", avaluo: null },
      ],
    })

    expect(dictamen.permitido).toBe(false)
    if (dictamen.permitido) return
    expect(dictamen.motivo).toContain("avalúo fiscal")
  })

  it("avalúos declarados en cero o negativos tampoco habilitan el reparto", () => {
    const dictamen = repartirPorAvaluo({
      montoTotal: 1_000_000,
      unidades: [
        { unidadId: "u-101", avaluo: 0 },
        { unidadId: "u-102", avaluo: -5 },
      ],
    })

    expect(dictamen.permitido).toBe(false)
    if (dictamen.permitido) return
    expect(dictamen.motivo).toContain("avalúo fiscal")
  })

  it("un sector sin unidades no se permite: no hay entre quiénes repartir", () => {
    const dictamen = repartirPorAvaluo({ montoTotal: 1_000_000, unidades: [] })

    expect(dictamen.permitido).toBe(false)
    if (dictamen.permitido) return
    expect(dictamen.motivo).toContain("avalúo fiscal")
  })
})

describe("repartirPorAvaluo — monto inválido", () => {
  it("un monto total de cero o negativo no se reparte", () => {
    for (const montoTotal of [0, -1, -0.01]) {
      const dictamen = repartirPorAvaluo({
        montoTotal,
        unidades: [{ unidadId: "u-101", avaluo: 60_000_000 }],
      })
      expect(dictamen.permitido).toBe(false)
      if (!dictamen.permitido) expect(dictamen.motivo).toContain("monto total")
    }
  })

  it("un monto total no finito no se reparte", () => {
    for (const montoTotal of [Number.NaN, Number.POSITIVE_INFINITY]) {
      const dictamen = repartirPorAvaluo({
        montoTotal,
        unidades: [{ unidadId: "u-101", avaluo: 60_000_000 }],
      })
      expect(dictamen.permitido).toBe(false)
      if (!dictamen.permitido) expect(dictamen.motivo).toContain("monto total")
    }
  })
})

describe("repartirPorAvaluo — el residuo va a la unidad de MAYOR avalúo", () => {
  it("el centavo que sobra lo absorbe la unidad de mayor avalúo", () => {
    // 2/3 del monto son $666.666,6666…: el piso deja un centavo suelto y la regla
    // se lo suma a la unidad de mayor avalúo (no a la primera ni a la última).
    const dictamen = repartirPorAvaluo({
      montoTotal: 1_000_000,
      unidades: [
        { unidadId: "u-102", avaluo: 24_000_000 },
        { unidadId: "u-101", avaluo: 48_000_000 },
      ],
    })

    expect(dictamen.permitido).toBe(true)
    if (!dictamen.permitido) return
    expect(dictamen.cuotas).toEqual([
      { unidadId: "u-102", avaluoUsado: 24_000_000, monto: 333_333.33 },
      { unidadId: "u-101", avaluoUsado: 48_000_000, monto: 666_666.67 },
    ])
    expect(sumaEnCentavos(dictamen.cuotas)).toBe(centavos(1_000_000))
  })

  it("también cuando la de mayor avalúo viene al final del listado", () => {
    const dictamen = repartirPorAvaluo({
      montoTotal: 100,
      unidades: [
        { unidadId: "u-101", avaluo: 1_000_000 },
        { unidadId: "u-102", avaluo: 2_000_000 },
      ],
    })

    expect(dictamen.permitido).toBe(true)
    if (!dictamen.permitido) return
    expect(dictamen.cuotas.map((cuota) => cuota.monto)).toEqual([33.33, 66.67])
    expect(sumaEnCentavos(dictamen.cuotas)).toBe(centavos(100))
  })

  it("con empate en el avalúo máximo el residuo va a la primera unidad recibida", () => {
    const dictamen = repartirPorAvaluo({
      montoTotal: 100,
      unidades: [
        { unidadId: "u-101", avaluo: 1_000_000 },
        { unidadId: "u-102", avaluo: 1_000_000 },
        { unidadId: "u-103", avaluo: 1_000_000 },
      ],
    })

    expect(dictamen.permitido).toBe(true)
    if (!dictamen.permitido) return
    expect(dictamen.cuotas.map((cuota) => cuota.monto)).toEqual([33.34, 33.33, 33.33])
    expect(sumaEnCentavos(dictamen.cuotas)).toBe(centavos(100))
  })
})

describe("avaluoTotalDeCuotas — el avalúo congelado que se persiste", () => {
  it("suma los avalúos usados de las cuotas", () => {
    expect(
      avaluoTotalDeCuotas([
        { unidadId: "u-101", avaluoUsado: 60_000_000, monto: 600_000 },
        { unidadId: "u-102", avaluoUsado: 40_000_000, monto: 400_000 },
      ])
    ).toBe(100_000_000)
  })

  it("sin cuotas el avalúo total es cero (la regla no inventa un avalúo)", () => {
    expect(avaluoTotalDeCuotas([])).toBe(0)
  })
})
