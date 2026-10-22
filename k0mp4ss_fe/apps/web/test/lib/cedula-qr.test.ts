// @vitest-environment node
/**
 * Contrato de la lectura del QR de la cédula (PE-visitas).
 *
 * Lo que fija:
 * - `extraerRunDeQr` acepta la URL del Registro Civil (`?RUN=…`) y un RUN
 *   pelado, y normaliza puntos/guiones/minúsculas a `cuerpo-DV`.
 * - `validarRun` es la puerta: dígito verificador módulo 11, incluido el caso
 *   K y el inválido (un QR leído NUNCA se asume válido).
 * - `mascararRun` esconde el cuerpo salvo los dos primeros dígitos (lo que se
 *   muestra al conserje antes de confirmar) y conserva el DV.
 * - `variantesRun` alimenta el filtro server-side por RUT del padrón.
 */
import { describe, expect, it } from "vitest"
import { extraerRunDeQr } from "@/lib/cedula-qr"
import { mascararRun, normalizarRun, validarRun, variantesRun } from "@/lib/validacion-rut"

const URL_CEDULA =
  "https://www.registrocivil.cl/servicios-en-linea/valida-documento?RUN=16.444.555-0&type=CEDULA"
const URL_CEDULA_K =
  "https://www.registrocivil.cl/servicios-en-linea/valida-documento?type=CEDULA&run=1000005-k"

describe("extraerRunDeQr", () => {
  it("extrae el RUN del parámetro RUN de la URL del Registro Civil", () => {
    expect(extraerRunDeQr(URL_CEDULA)).toBe("16444555-0")
  })

  it("acepta el parámetro en minúscula y el DV K en minúscula", () => {
    expect(extraerRunDeQr(URL_CEDULA_K)).toBe("1000005-K")
  })

  it("acepta el RUN pelado con puntos, con guion o sin guion", () => {
    expect(extraerRunDeQr("16.444.555-0")).toBe("16444555-0")
    expect(extraerRunDeQr("16444555-0")).toBe("16444555-0")
    expect(extraerRunDeQr("164445550")).toBe("16444555-0")
    expect(extraerRunDeQr("  16444555-0 \n")).toBe("16444555-0")
  })

  it("devuelve null cuando el texto no es una cédula", () => {
    expect(extraerRunDeQr("Hola, ¿cómo estás?")).toBeNull()
    expect(extraerRunDeQr("https://example.com/promo?foo=1")).toBeNull()
    expect(extraerRunDeQr("")).toBeNull()
    expect(extraerRunDeQr("1234")).toBeNull()
    expect(extraerRunDeQr("16444555-")).toBeNull()
  })

  it("extrae el RUN aunque el DV sea inválido: validar es responsabilidad de validarRun", () => {
    // Un solo carácter cambiado en el DV ya rompe el módulo 11.
    const urlConDvInvalido =
      "https://www.registrocivil.cl/valida-documento?type=CEDULA&RUN=16444555-1"
    expect(extraerRunDeQr(urlConDvInvalido)).toBe("16444555-1")
    expect(validarRun("16444555-1")).toBe(false)
  })
})

describe("normalizarRun", () => {
  it("normaliza a cuerpo-DV sin puntos y con DV en mayúscula", () => {
    expect(normalizarRun("15.123.456-9")).toBe("15123456-9")
    expect(normalizarRun("151234569")).toBe("15123456-9")
    expect(normalizarRun("1000005k")).toBe("1000005-K")
  })

  it("rechaza lo que no tiene forma de RUN", () => {
    expect(normalizarRun("")).toBeNull()
    expect(normalizarRun("abc")).toBeNull()
    expect(normalizarRun("1234567890123")).toBeNull()
    expect(normalizarRun("16444555-X")).toBeNull()
  })
})

describe("validarRun (dígito verificador módulo 11)", () => {
  it("acepta RUN válidos en cualquier grafía", () => {
    expect(validarRun("16.444.555-0")).toBe(true)
    expect(validarRun("16444555-0")).toBe(true)
    expect(validarRun("164445550")).toBe(true)
    expect(validarRun("15.123.456-9")).toBe(true)
    expect(validarRun("12345678-5")).toBe(true)
  })

  it("acepta el DV K cuando corresponde", () => {
    expect(validarRun("1000005-K")).toBe(true)
    expect(validarRun("1000005k")).toBe(true)
    expect(validarRun("10000050")).toBe(false) // el DV de 1000005 es K, no 0
    expect(validarRun("1000005-0")).toBe(false)
  })

  it("rechaza RUN con dígito verificador incorrecto", () => {
    expect(validarRun("15.123.456-0")).toBe(false)
    expect(validarRun("16.444.555-1")).toBe(false)
    expect(validarRun("12345678-4")).toBe(false)
  })

  it("rechaza basura sin intentar adivinar", () => {
    expect(validarRun("")).toBe(false)
    expect(validarRun("sin-run")).toBe(false)
    expect(validarRun("16444555")).toBe(false)
  })
})

describe("variantesRun", () => {
  it("devuelve las grafías con y sin puntos para el filtro server-side", () => {
    expect(variantesRun("16444555-0")).toEqual(["16444555-0", "16.444.555-0", "164445550"])
  })

  it("devuelve [] cuando el valor no es un RUN", () => {
    expect(variantesRun("pasaporte-AB123456")).toEqual([])
  })
})

describe("mascararRun", () => {
  it("esconde el cuerpo salvo el primer grupo de miles y conserva el DV", () => {
    expect(mascararRun("16.444.555-0")).toBe("16.***.***-0")
    expect(mascararRun("1000005-K")).toBe("1.***.***-K")
  })

  it("devuelve null si no es un RUN", () => {
    expect(mascararRun("n/a")).toBeNull()
  })
})
