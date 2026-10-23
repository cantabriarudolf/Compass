/**
 * S de F2 (PENDIENTES-FUNCIONALIDAD): la variación tarifaria de `/admin/metricas`
 * estaba escrita a mano (`+7.2%`) y no salía de ningún dato.
 *
 * Decisión del owner: se calcula de las **emisiones** de gasto común; si no hay
 * datos comparables, **no se muestra número**. Este helper es puro: recibe las
 * emisiones y devuelve la variación entre los dos últimos periodos con gasto, o
 * `null` cuando no hay nada honesto que mostrar.
 */
import { describe, it, expect } from "vitest"
import { variacionTarifaria } from "@/lib/metricas-utils"

describe("variacionTarifaria — el número sale de las emisiones, no del código", () => {
  it("dos periodos con gasto dan el alza porcentual", () => {
    const resultado = variacionTarifaria([
      { periodo: "2026-09", gastoTotal: 1000 },
      { periodo: "2026-10", gastoTotal: 1100 },
    ])
    expect(resultado).not.toBeNull()
    expect(resultado?.porcentaje).toBe(10)
    expect(resultado?.periodoAnterior).toBe("2026-09")
    expect(resultado?.periodoActual).toBe("2026-10")
  })

  it("una baja devuelve el porcentaje negativo con un decimal", () => {
    const resultado = variacionTarifaria([
      { periodo: "2026-09", gastoTotal: 900 },
      { periodo: "2026-10", gastoTotal: 800 },
    ])
    expect(resultado?.porcentaje).toBe(-11.1)
  })

  it("con un solo periodo no inventa un número", () => {
    expect(variacionTarifaria([{ periodo: "2026-10", gastoTotal: 1000 }])).toBeNull()
  })

  it("sin emisiones no inventa un número", () => {
    expect(variacionTarifaria([])).toBeNull()
  })

  it("tolera desorden y periodos sin gasto: usa los dos válidos más recientes", () => {
    const resultado = variacionTarifaria([
      { periodo: "2026-07", gastoTotal: 500 }, // viejo: no participa
      { periodo: "2026-10", gastoTotal: 1200 }, // más reciente
      { periodo: "2026-08", gastoTotal: 0 }, // sin gasto: se ignora
      { periodo: "2026-09", gastoTotal: 1000 }, // anterior al más reciente
    ])
    expect(resultado?.periodoActual).toBe("2026-10")
    expect(resultado?.periodoAnterior).toBe("2026-09")
    expect(resultado?.porcentaje).toBe(20)
  })

  it("un periodo anterior en cero no se usa como divisor", () => {
    const resultado = variacionTarifaria([
      { periodo: "2026-08", gastoTotal: 0 },
      { periodo: "2026-09", gastoTotal: 1000 },
      { periodo: "2026-10", gastoTotal: 1100 },
    ])
    // El par comparable es 2026-09 → 2026-10, no el periodo en cero.
    expect(resultado?.periodoAnterior).toBe("2026-09")
    expect(resultado?.porcentaje).toBe(10)
  })
})
