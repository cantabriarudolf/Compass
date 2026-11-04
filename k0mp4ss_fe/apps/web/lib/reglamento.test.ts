/**
 * @vitest-environment node
 *
 * T3 cobro-gastos-comunes-parametrico (S1/S3/S7) — resolución de la versión
 * vigente y compuerta de emisión, sin base de datos.
 *
 * Las versiones de prueba llevan nombre ("v1 del reglamento", "v2 del acta")
 * porque son datos de fixture, no números de un reglamento real (S8).
 */
import { describe, it, expect } from "vitest"
import { autorizaEmision, parametrosDeVersion, versionReglamentoVigente } from "./reglamento"
import type { ParametrosReglamento } from "./schemas"

const PARAMETROS: ParametrosReglamento = {
  porcentajeReserva: 10,
  diasPagoGc: 10,
  tasaMoraMensualPct: 1,
  topeMoraPct: 50,
  cuotasCorte: 3,
  diasPreavisoCorte: 5,
  ipcActivo: false,
}

/** Tres versiones del fixture: histórica, intermedia y futura. */
const VERSIONES = [
  {
    version: 1,
    vigenteDesde: "2026-01",
    fuenteInstrumento: "migracion_automatica",
    parametros: PARAMETROS,
  },
  {
    version: 2,
    vigenteDesde: "2026-06",
    fuenteInstrumento: "acta_asamblea",
    parametros: PARAMETROS,
  },
  {
    version: 3,
    vigenteDesde: "2027-01",
    fuenteInstrumento: "reglamento_copropiedad",
    parametros: PARAMETROS,
  },
]

describe("versionReglamentoVigente", () => {
  it("elige la versión con el vigenteDesde más alto que no supere el período", () => {
    expect(versionReglamentoVigente(VERSIONES, "2026-08")?.version).toBe(2)
  })

  it("ignora las versiones futuras al período pedido", () => {
    expect(versionReglamentoVigente(VERSIONES, "2026-05")?.version).toBe(1)
    expect(versionReglamentoVigente(VERSIONES, "2026-12")?.version).toBe(2)
  })

  it("devuelve null cuando ninguna versión rige todavía el período", () => {
    expect(versionReglamentoVigente(VERSIONES, "2025-12")).toBeNull()
    expect(versionReglamentoVigente([], "2026-05")).toBeNull()
  })

  it("incluye el período exacto en que empieza a regir", () => {
    expect(versionReglamentoVigente(VERSIONES, "2026-06")?.version).toBe(2)
  })

  it("desempata por número de versión cuando dos comparten vigenteDesde", () => {
    const mismoPeriodo = [
      { version: 1, vigenteDesde: "2026-01" },
      { version: 3, vigenteDesde: "2026-02" },
      { version: 2, vigenteDesde: "2026-02" },
    ]
    expect(versionReglamentoVigente(mismoPeriodo, "2026-03")?.version).toBe(3)
  })
})

describe("autorizaEmision", () => {
  it("solo autoriza las fuentes reales (reglamento de copropiedad o acta de asamblea)", () => {
    expect(autorizaEmision({ fuenteInstrumento: "reglamento_copropiedad" })).toBe(true)
    expect(autorizaEmision({ fuenteInstrumento: "acta_asamblea" })).toBe(true)
    expect(autorizaEmision({ fuenteInstrumento: "migracion_automatica" })).toBe(false)
    expect(autorizaEmision({ fuenteInstrumento: "otra_cosa" })).toBe(false)
  })
})

describe("parametrosDeVersion", () => {
  it("devuelve los parámetros cuando la versión los declara completos", () => {
    expect(parametrosDeVersion({ parametros: PARAMETROS })).toEqual(PARAMETROS)
  })

  it("devuelve null cuando falta un parámetro obligatorio", () => {
    expect(parametrosDeVersion({ parametros: {} })).toBeNull()
    expect(parametrosDeVersion({ parametros: { ...PARAMETROS, diasPagoGc: 61 } })).toBeNull()
  })
})
