import { describe, it, expect, beforeEach } from "vitest"
import { useCompassStore } from "@/lib/store"
import type { Unidad } from "@/data/inventario/estructura"
import type { Persona } from "@/data/comunidad/personas"
import { resetStore } from "./helpers"

const getState = () => useCompassStore.getState()

const personaValida: Persona = {
  id: "p-nueva",
  rut: "12.345.678-5",
  nombreCompleto: "Test Validacion",
  nombres: "Test",
  apellidos: "Validacion",
  email: "test.validacion@email.com",
  telefonoMovil: "+56 9 5555 6666",
  estadoCuenta: "activa",
  condicionesEspecialesIds: [],
  roles: ["residente"],
}

const unidadValida: Unidad = {
  id: "u-nueva",
  microSectorId: "piso-torre-a-1",
  numero: "105",
  etiqueta: "Depto",
  tipoUnidadId: "tipo-a",
  metraje: 55.5,
  prorrateo: 0.0125,
  rolSii: "123-A105",
  estadoId: "vacante",
  servicios: {},
}

describe("Capa de validación en escrituras del store", () => {
  beforeEach(resetStore)

  it("savePersona acepta una persona conforme al esquema", () => {
    const antes = getState().personas.length

    const result = getState().savePersona(personaValida)

    expect(result.ok).toBe(true)
    expect(getState().personas.length).toBe(antes + 1)
  })

  it("savePersona rechaza email inválido sin mutar el store", () => {
    const antes = getState().personas.length

    const result = getState().savePersona({ ...personaValida, email: "no-es-un-correo" })

    expect(result.ok).toBe(false)
    expect(getState().personas.length).toBe(antes)
  })

  it("saveUnidad rechaza metraje negativo sin mutar el store", () => {
    const antes = getState().unidades.length

    const result = getState().saveUnidad({ ...unidadValida, metraje: -5 })

    expect(result.ok).toBe(false)
    expect(getState().unidades.length).toBe(antes)
  })

  it("saveVinculo rechaza fechas mal formateadas antes de aplicar reglas de negocio", () => {
    const antes = getState().vinculos.length

    const result = getState().saveVinculo({
      id: "v-fecha-mala",
      personaId: "p-1",
      unidadId: "u-A-302",
      rol: "ocupante",
      fechaInicio: "01/02/2026",
      permiteVerFinanzas: false,
    })

    expect(result.ok).toBe(false)
    expect(result.error).toBeDefined()
    expect(getState().vinculos.length).toBe(antes)
  })

  it("saveConfiguracion rechaza día de corte fuera de rango", () => {
    const original = getState().configuracion

    const result = getState().saveConfiguracion({ ...original, diaCortePago: 99 })

    expect(result.ok).toBe(false)
    expect(getState().configuracion).toEqual(original)
  })
})
