// VAL-005 (migración v10): los RUT sembrados históricamente tenían dígito
// verificador ficticio; `repararRut` recalculaba el DV del cuerpo para que un
// estado persistido previo no perdiera la colección de personas. El estado
// persistido se retiró con el store legacy (F22a); la reparación sigue viva y
// su propiedad —el RUT reparado vuelve a validar con módulo 11— es la que se
// fija acá.
import { describe, it, expect } from "vitest"
import { repararRut } from "@/lib/store"
import { validarDocumentoIdentidad } from "@/lib/rut"

describe("repararRut (migración v10)", () => {
  it("corrige DV de RUT con formato", () => {
    expect(repararRut("15.123.456-7")).toBe("15.123.456-9")
  })

  it("corrige DV de RUT plano", () => {
    expect(repararRut("12345678-9")).toBe("12345678-5")
  })

  it("deja intacto un RUT ya válido", () => {
    const rut = "15.123.456-9"
    expect(repararRut(rut)).toBe(rut)
  })

  it("no toca pasaportes", () => {
    expect(repararRut("AB123456")).toBe("AB123456")
  })

  it("no toca un documento con guion y cuerpo no numérico", () => {
    expect(repararRut("ABC-1")).toBe("ABC-1")
  })

  it("el RUT reparado vuelve a validar con módulo 11", () => {
    const reparado = repararRut("12.345.678-9")
    expect(reparado).toBe("12.345.678-5")
    expect(validarDocumentoIdentidad(reparado)).toBe(true)
  })
})
