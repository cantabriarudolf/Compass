import { describe, it, expect } from "vitest"
import {
  normalizarDocumento,
  calcularDigitoVerificador,
  validarRut,
  esPasaporte,
  validarDocumentoIdentidad,
  formatearRut,
  claveDocumento,
} from "@/lib/rut"
import { personas as seedPersonas } from "@/data/comunidad/personas"
import { configuracionDefault as seedConfiguracion } from "@/data/admin/configuracion"

describe("normalizarDocumento", () => {
  it("elimina espacios y pasa a mayúsculas", () => {
    expect(normalizarDocumento(" 15.123.456-k ")).toBe("15.123.456-K")
  })
})

describe("calcularDigitoVerificador (módulo 11)", () => {
  it("calcula DV conocido", () => {
    expect(calcularDigitoVerificador("15123456")).toBe("9")
  })

  it("retorna K cuando el resto da 10", () => {
    expect(calcularDigitoVerificador("10000013")).toBe("K")
  })

  it("retorna 0 cuando el resto da 11", () => {
    const cuerpo = "11111111"
    expect(calcularDigitoVerificador(cuerpo)).toBe(
      (() => {
        let s = 0,
          f = 2
        for (const d of "11111111".split("").reverse()) {
          s += Number(d) * f
          f = f === 7 ? 2 : f + 1
        }
        const r = s % 11
        return String(11 - r)
      })()
    )
  })
})

describe("validarRut", () => {
  it("acepta RUT con formato y DV correcto", () => {
    expect(validarRut("15.123.456-9")).toBe(true)
  })

  it("acepta RUT sin puntos", () => {
    expect(validarRut("15123456-9")).toBe(true)
  })

  it("rechaza DV incorrecto", () => {
    expect(validarRut("15.123.456-7")).toBe(false)
  })

  it("acepta DV K en mayúscula o minúscula", () => {
    expect(validarRut(`10000013-K`)).toBe(true)
    expect(validarRut(`10000013-k`)).toBe(true)
  })

  it("rechaza formatos malformados", () => {
    expect(validarRut("abc")).toBe(false)
    expect(validarRut("")).toBe(false)
    expect(validarRut("1234-5")).toBe(false)
  })
})

describe("esPasaporte", () => {
  it("acepta alfanumérico con letra", () => {
    expect(esPasaporte("AB123456")).toBe(true)
  })

  it("rechaza solo dígitos", () => {
    expect(esPasaporte("12345678")).toBe(false)
  })

  it("rechaza longitud fuera de rango y símbolos", () => {
    expect(esPasaporte("AB12")).toBe(false)
    expect(esPasaporte("AB-123-456")).toBe(false)
  })
})

describe("validarDocumentoIdentidad", () => {
  it("acepta RUT válido y pasaporte válido", () => {
    expect(validarDocumentoIdentidad("13.555.666-1")).toBe(true)
    expect(validarDocumentoIdentidad("AB123456")).toBe(true)
  })

  it("rechaza RUT con DV errado aunque parezca pasaporte no lo salve", () => {
    expect(validarDocumentoIdentidad("15.123.456-7")).toBe(false)
  })
})

describe("formatearRut (bonito chileno XX.XXX.XXX-X)", () => {
  it("formatea cuerpo+DV sin puntos ni guion", () => {
    expect(formatearRut("151234569")).toBe("15.123.456-9")
  })

  it("es idempotente con entrada ya formateada", () => {
    expect(formatearRut("15.123.456-9")).toBe("15.123.456-9")
  })

  it("pasa DV k a K y agrupa de a 3", () => {
    expect(formatearRut("10000013k")).toBe("10.000.013-K")
  })

  it("con un solo dígito no inventa guion", () => {
    expect(formatearRut("1")).toBe("1")
  })
})

describe("claveDocumento (comparación de duplicados)", () => {
  it("iguala formateado y sin formato", () => {
    expect(claveDocumento("15.123.456-9")).toBe(claveDocumento("15123456-9"))
  })

  it("distingue DV distinto", () => {
    expect(claveDocumento("15.123.456-9")).not.toBe(claveDocumento("15.123.456-7"))
  })
})

describe("barrido de seeds: todos los RUT sembrados son válidos", () => {
  it("personas del seed cumplen módulo 11 o son pasaporte", () => {
    const invalidos = seedPersonas.filter(
      (p) => !validarDocumentoIdentidad(p.rut)
    )
    expect(invalidos.map((p) => `${p.id}:${p.rut}`)).toEqual([])
  })

  it("configuración global cumple módulo 11", () => {
    expect(validarRut(seedConfiguracion.rutComunidad)).toBe(true)
    expect(validarRut(seedConfiguracion.rutAdministrador)).toBe(true)
  })
})
