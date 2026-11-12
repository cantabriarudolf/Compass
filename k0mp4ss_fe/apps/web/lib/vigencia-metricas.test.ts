/**
 * @vitest-environment node
 *
 * S9 — el KPI de unidades con el registro al día, para el Comité.
 *
 * El porcentaje no es una segunda definición del calendario: `kpiDeVigencia`
 * recibe los estados YA derivados por `estadoDelCaso` y sólo cuenta. Eso es lo
 * que impide que la métrica y la pantalla del registro digan cosas distintas del
 * mismo hecho. Por eso acá no hay fechas ni base: la unidad de prueba es un
 * estado, y lo que se fija es la aritmética que puede mentir.
 *
 * Los tres casos que importan: una comunidad sin unidades no puede dar `NaN`
 * (dividir por cero en una métrica es peor que no mostrar número), el porcentaje
 * se redondea a un decimal, y el desglose cuenta TODOS los estados presentes
 * —incluido `sin_declaracion`— sin perder filas en el camino.
 */
import { describe, it, expect } from "vitest"
import { kpiDeVigencia } from "@/lib/vigencia-metricas"
import type { EstadoCasoRegistro } from "@/lib/vigencia-registro"

const fila = (estado: EstadoCasoRegistro) => ({ estado })

describe("kpiDeVigencia — el porcentaje sale de los estados derivados (S9)", () => {
  it("una comunidad sin unidades da cero, nunca una división por cero", () => {
    const kpi = kpiDeVigencia([])

    expect(kpi.total).toBe(0)
    expect(kpi.alDia).toBe(0)
    expect(kpi.porcentajeAlDia).toBe(0)
    expect(kpi.porEstado).toEqual({})
    expect(Number.isNaN(kpi.porcentajeAlDia)).toBe(false)
  })

  it("con todas las unidades al día el porcentaje es 100", () => {
    const kpi = kpiDeVigencia([
      fila("al_dia"),
      fila("al_dia"),
      fila("al_dia"),
    ])

    expect(kpi.total).toBe(3)
    expect(kpi.alDia).toBe(3)
    expect(kpi.porcentajeAlDia).toBe(100)
    expect(kpi.porEstado).toEqual({ al_dia: 3 })
  })

  it("con estados mezclados cuenta cada uno y redondea el porcentaje a un decimal", () => {
    const kpi = kpiDeVigencia([
      fila("al_dia"),
      fila("al_dia"),
      fila("por_vencer"),
      fila("requerido"),
      fila("habilitado_para_multa"),
      fila("sin_declaracion"),
    ])

    expect(kpi.total).toBe(6)
    expect(kpi.alDia).toBe(2)
    // 2 de 6 = 33,333…: se muestra 33,3 y no 33 ni 33,33.
    expect(kpi.porcentajeAlDia).toBe(33.3)
    expect(kpi.porEstado).toEqual({
      al_dia: 2,
      por_vencer: 1,
      requerido: 1,
      habilitado_para_multa: 1,
      sin_declaracion: 1,
    })
  })

  it("la suma del desglose es el total, también con sin_declaracion en el medio", () => {
    const kpi = kpiDeVigencia([
      fila("sin_declaracion"),
      fila("sin_declaracion"),
      fila("sin_declaracion"),
      fila("al_dia"),
    ])

    const suma = Object.values(kpi.porEstado).reduce((acc, n) => acc + n, 0)
    expect(suma).toBe(kpi.total)
    expect(kpi.total).toBe(4)
    // 1 de 4: un decimal exacto, sin ruido binario.
    expect(kpi.porcentajeAlDia).toBe(25)
    expect(kpi.porEstado).toEqual({ sin_declaracion: 3, al_dia: 1 })
  })

  it("no redondea hacia arriba un porcentaje que no llega al decimal", () => {
    const kpi = kpiDeVigencia([
      fila("al_dia"),
      fila("sin_declaracion"),
      fila("sin_declaracion"),
      fila("sin_declaracion"),
      fila("sin_declaracion"),
      fila("sin_declaracion"),
      fila("sin_declaracion"),
    ])

    // 1 de 7 = 14,2857…: un decimal es 14,3, no 14,2 ni 15.
    expect(kpi.porcentajeAlDia).toBe(14.3)
  })
})
