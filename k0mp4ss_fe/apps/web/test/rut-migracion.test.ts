import { describe, it, expect } from "vitest"
import { repararRut, STORE_VERSION, useCompassStore } from "@/lib/store"
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
})

describe(`migración a v${STORE_VERSION}`, () => {
  it("STORE_VERSION es 10", () => {
    expect(STORE_VERSION).toBe(12)
  })

  it("un persistido v9 con RUTs ficticios queda reparado y sin cambios de colección", () => {
    const migrate = useCompassStore.persist.getOptions().migrate
    const estadoViejo = {
      personas: [
        {
          id: "p-test",
          rut: "12.345.678-9",
          nombreCompleto: "Test Migración",
          nombres: "Test",
          apellidos: "Migración",
          email: "test@compass.local",
          telefonoMovil: "+56912345678",
          estadoCuenta: "activa",
          condicionesEspecialesIds: [],
          roles: ["propietario"],
        },
      ],
    }
    const migrado = migrate!(estadoViejo, 9) as Record<string, unknown>
    const personas = migrado.personas as Array<{ id: string; rut: string }>
    expect(personas).toHaveLength(1)
    const primera = personas[0]
    expect(primera?.id).toBe("p-test")
    expect(primera ? validarDocumentoIdentidad(primera.rut) : false).toBe(true)
    expect(primera?.rut).toBe("12.345.678-5")
  })
})
