import { describe, it, expect } from "vitest"
import {
  aTituloCaso,
  aOracion,
  emailNormalizado,
  telefonoNormalizado,
  sitioNormalizado,
  identificadorNormalizado,
} from "@/lib/normalizacion"

describe("aTituloCaso", () => {
  it("capitaliza cada palabra y respeta partículas", () => {
    expect(aTituloCaso("juan pablo de la cruz")).toBe("Juan Pablo de la Cruz")
  })

  it("normaliza mayúsculas sostenidas", () => {
    expect(aTituloCaso("MARIA")).toBe("Maria")
  })

  it("capitaliza la primera palabra aunque sea partícula", () => {
    expect(aTituloCaso("de la rosa")).toBe("De la Rosa")
  })

  it("colapsa espacios múltiples", () => {
    expect(aTituloCaso("  ana   maría  ")).toBe("Ana María")
  })
})

describe("aOracion", () => {
  it("recorta y capitaliza la primera letra", () => {
    expect(aOracion("  hola mundo. ")).toBe("Hola mundo.")
  })

  it("cadena vacía queda vacía", () => {
    expect(aOracion("   ")).toBe("")
  })
})

describe("emailNormalizado", () => {
  it("recorta y minúsculiza", () => {
    expect(emailNormalizado("  JUAN@MAIL.CL ")).toBe("juan@mail.cl")
  })
})

describe("telefonoNormalizado (móvil chileno +56 9)", () => {
  it("autocompleta +56 9 cuando faltan", () => {
    expect(telefonoNormalizado("912345678")).toBe("+56 9 1234 5678")
  })

  it("formatea 569 pegado", () => {
    expect(telefonoNormalizado("56912345678")).toBe("+56 9 1234 5678")
  })

  it("normaliza formato con espacios y guiones", () => {
    expect(telefonoNormalizado("  +56 9 1234-5678 ")).toBe("+56 9 1234 5678")
  })

  it("no inventa: fijo u otros quedan recortados tal cual", () => {
    expect(telefonoNormalizado("  2222 3333 ")).toBe("2222 3333")
    expect(telefonoNormalizado("9112345")).toBe("9112345")
  })
})

describe("identificadorNormalizado", () => {
  it("recorta y mayúsculiza", () => {
    expect(identificadorNormalizado("  14-b ")).toBe("14-B")
  })
})

describe("sitioNormalizado", () => {
  it("recorta y minúsculiza", () => {
    expect(sitioNormalizado(" HTTPS://Empresa.CL/ ")).toBe("https://empresa.cl/")
  })
})
