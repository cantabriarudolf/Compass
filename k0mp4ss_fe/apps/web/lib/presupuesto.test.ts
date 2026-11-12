/**
 * @vitest-environment node
 *
 * F31 — presupuesto por partidas aprobado por el cuerpo que el reglamento defina.
 *
 * Lo que se fija acá es la REGLA PURA, sin base ni reloj: el total se suma en
 * centavos enteros (un presupuesto no puede cerrar con drift de float), un acuerdo
 * no aprobado no habilita el presupuesto, el cuerpo del acuerdo es el que se copia
 * (comité o asamblea: el sistema no elige por la comunidad), el presupuesto del
 * mismo período se REEMPLAZA versionando en vez de convivir, y las partidas vacías
 * o con monto negativo no constituyen presupuesto.
 *
 * Base legal (Ley 21.442): el art. 17 faculta al comité a aprobar presupuestos
 * estimativos de gastos comunes y el art. 15 reserva materias a la asamblea; cuál
 * de los dos aprueba las partidas lo define el reglamento de cada comunidad, así
 * que el registro conserva el cuerpo del acuerdo y nunca lo asume.
 *
 * Todo se mide desde las funciones públicas: no se inspecciona ninguna estructura
 * interna ni se toca la base.
 */
import { describe, expect, it } from "vitest"

import {
  presupuestoPermitido,
  totalDePartidas,
  validarPartidas,
} from "./presupuesto"

/** Centavos enteros: la comparación de dinero se hace sin floats sueltos. */
const centavos = (monto: number): number => Math.round(monto * 100)

describe("totalDePartidas — la suma exacta en centavos", () => {
  it("suma centavos sin drift de float", () => {
    // 0.1 + 0.2 en floats da 0.30000000000000004: la regla suma en centavos.
    expect(totalDePartidas([{ monto: 0.1 }, { monto: 0.2 }])).toBe(0.3)
    expect(centavos(totalDePartidas([{ monto: 0.1 }, { monto: 0.2 }]))).toBe(30)
  })

  it("un presupuesto de tres partidas cierra al centavo", () => {
    const total = totalDePartidas([
      { monto: 333_333.33 },
      { monto: 333_333.33 },
      { monto: 333_333.34 },
    ])
    expect(centavos(total)).toBe(centavos(1_000_000))
    expect(total).toBe(1_000_000)
  })

  it("la suma de muchas partidas no arrastra fracciones de centavo", () => {
    const total = totalDePartidas([
      { monto: 1_234_567.89 },
      { monto: 0.01 },
      { monto: 10.1 },
      { monto: 10.2 },
    ])
    expect(centavos(total)).toBe(123_458_820)
  })

  it("sin partidas el total es cero (la regla no inventa un monto)", () => {
    expect(totalDePartidas([])).toBe(0)
  })
})

describe("presupuestoPermitido — el acuerdo habilita y define el cuerpo", () => {
  it("un acuerdo aprobado del comité habilita el presupuesto", () => {
    const dictamen = presupuestoPermitido({
      acuerdoEstado: "aprobado",
      acuerdoCuerpo: "comite",
      yaHayVigente: false,
    })
    expect(dictamen.permitido).toBe(true)
  })

  it("un acuerdo aprobado de la asamblea también: el reglamento decide el cuerpo", () => {
    const dictamen = presupuestoPermitido({
      acuerdoEstado: "aprobado",
      acuerdoCuerpo: "asamblea",
      yaHayVigente: false,
    })
    expect(dictamen.permitido).toBe(true)
  })

  it("un acuerdo abierto o rechazado no habilita", () => {
    for (const acuerdoEstado of ["abierto", "rechazado"]) {
      const dictamen = presupuestoPermitido({
        acuerdoEstado,
        acuerdoCuerpo: "comite",
        yaHayVigente: false,
      })
      expect(dictamen.permitido).toBe(false)
      if (!dictamen.permitido) expect(dictamen.motivo).toContain("aprobado")
    }
  })

  it("un cuerpo fuera de comité/asamblea no se asume: el registro no inventa quién aprobó", () => {
    for (const acuerdoCuerpo of ["directiva", "", "COMITE"]) {
      const dictamen = presupuestoPermitido({
        acuerdoEstado: "aprobado",
        acuerdoCuerpo,
        yaHayVigente: false,
      })
      expect(dictamen.permitido).toBe(false)
      if (!dictamen.permitido) {
        expect(dictamen.motivo).toContain("comité o la asamblea")
      }
    }
  })

  it("un presupuesto vigente no bloquea el del mismo período: se reemplaza versionando", () => {
    const dictamen = presupuestoPermitido({
      acuerdoEstado: "aprobado",
      acuerdoCuerpo: "comite",
      yaHayVigente: true,
    })
    // La regla no devuelve un 409: la coexistencia se evita con la versión, no
    // rechazando el alta. La versión y el reemplazo los resuelve la ruta.
    expect(dictamen.permitido).toBe(true)
  })
})

describe("validarPartidas — partidas vacías o con monto negativo no son presupuesto", () => {
  it("sin partidas no hay presupuesto", () => {
    const dictamen = validarPartidas([])
    expect(dictamen.validas).toBe(false)
    if (!dictamen.validas) expect(dictamen.motivo).toContain("al menos una partida")
  })

  it("un monto negativo no es un gasto presupuestable", () => {
    const dictamen = validarPartidas([
      { nombre: "Sueldos", categoria: "sueldos", monto: 500_000 },
      { nombre: "Ajuste", categoria: "otro", monto: -1 },
    ])
    expect(dictamen.validas).toBe(false)
    if (!dictamen.validas) expect(dictamen.motivo).toContain("negativo")
  })

  it("un monto no finito no entra al total", () => {
    for (const monto of [Number.NaN, Number.POSITIVE_INFINITY]) {
      const dictamen = validarPartidas([
        { nombre: "Sueldos", categoria: "sueldos", monto },
      ])
      expect(dictamen.validas).toBe(false)
    }
  })

  it("con partidas válidas devuelve el total exacto que se persiste como snapshot", () => {
    const dictamen = validarPartidas([
      { nombre: "Sueldos", categoria: "sueldos", monto: 600_000 },
      { nombre: "Aseo", categoria: "servicios", monto: 150_000.5 },
      { nombre: "Administración", categoria: "administracion", monto: 249_999.5 },
    ])
    expect(dictamen.validas).toBe(true)
    if (dictamen.validas) {
      expect(centavos(dictamen.total)).toBe(centavos(1_000_000))
      expect(dictamen.total).toBe(1_000_000)
    }
  })
})
