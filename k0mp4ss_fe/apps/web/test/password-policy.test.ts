import { describe, it, expect } from "vitest"
import { validarPassword, MENSAJE_PASSWORD_INVALIDA } from "@/lib/password-policy"

describe("password-policy (SERIE-PRODUCCION-FASE2 P2)", () => {
  it("acepta password válida (8+, mayúscula, minúscula, número)", () => {
    const result = validarPassword("Test1234")
    expect(result.valido).toBe(true)
    expect(result.errores).toHaveLength(0)
  })

  it("rechaza password corta (< 8)", () => {
    const result = validarPassword("Test1")
    expect(result.valido).toBe(false)
    expect(result.errores.some(e => e.includes("8 caracteres"))).toBe(true)
  })

  it("rechaza password sin mayúscula", () => {
    const result = validarPassword("test1234")
    expect(result.valido).toBe(false)
    expect(result.errores.some(e => e.includes("mayúscula"))).toBe(true)
  })

  it("rechaza password sin minúscula", () => {
    const result = validarPassword("TEST1234")
    expect(result.valido).toBe(false)
    expect(result.errores.some(e => e.includes("minúscula"))).toBe(true)
  })

  it("rechaza password sin número", () => {
    const result = validarPassword("TestTest")
    expect(result.valido).toBe(false)
    expect(result.errores.some(e => e.includes("número"))).toBe(true)
  })

  it("rechaza password vacía", () => {
    const result = validarPassword("")
    expect(result.valido).toBe(false)
    expect(result.errores.length).toBeGreaterThan(0)
  })

  it("MENSAJE_PASSWORD_INVALIDA es constante", () => {
    expect(MENSAJE_PASSWORD_INVALIDA).toContain("seguridad")
  })
})
