import { afterEach, describe, expect, it, vi } from "vitest"
import { ahoraISO, finMesISO, hoyISO, inicioMesISO } from "@/lib/date-utils"

describe("hoyISO", () => {
  it("devuelve la fecha de hoy en formato YYYY-MM-DD", () => {
    const resultado = hoyISO()
    expect(resultado).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(resultado).toBe(new Date().toISOString().slice(0, 10))
  })
})

describe("ahoraISO", () => {
  it("devuelve un timestamp ISO-8601 completo parseable", () => {
    const resultado = ahoraISO()
    const parsed = new Date(resultado)
    expect(Number.isNaN(parsed.getTime())).toBe(false)
    expect(resultado).toBe(new Date().toISOString())
  })
})

describe("inicioMesISO", () => {
  it("devuelve el día 01 del mes y año dados", () => {
    expect(inicioMesISO(3, 2024)).toBe("2024-03-01")
    expect(inicioMesISO(12, 1999)).toBe("1999-12-01")
  })

  it("rellena el mes a 2 dígitos", () => {
    expect(inicioMesISO(1, 2025)).toBe("2025-01-01")
  })

  it("por defecto usa el mes y año actuales", () => {
    const ahora = new Date()
    const esperado = `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, "0")}-01`
    expect(inicioMesISO()).toBe(esperado)
  })
})

describe("finMesISO", () => {
  it("devuelve el último día del mes dado", () => {
    expect(finMesISO(1, 2024)).toBe("2024-01-31")
    expect(finMesISO(4, 2023)).toBe("2023-04-30")
  })

  it("maneja año bisiesto (feb 2024 → 29)", () => {
    expect(finMesISO(2, 2024)).toBe("2024-02-29")
  })

  it("maneja año no bisiesto (feb 2023 → 28)", () => {
    expect(finMesISO(2, 2023)).toBe("2023-02-28")
  })

  it("por defecto usa el mes y año actuales", () => {
    const ahora = new Date()
    const esperado = finMesISO(ahora.getMonth() + 1, ahora.getFullYear())
    expect(finMesISO()).toBe(esperado)
  })
})

describe("validación de mes fuera de rango", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("lanza RangeError con mes 0, 13 o no entero", () => {
    expect(() => inicioMesISO(0, 2024)).toThrow(RangeError)
    expect(() => inicioMesISO(13, 2024)).toThrow(RangeError)
    expect(() => finMesISO(1.5, 2024)).toThrow(RangeError)
    expect(() => finMesISO(0, 2024)).toThrow(RangeError)
  })
})
