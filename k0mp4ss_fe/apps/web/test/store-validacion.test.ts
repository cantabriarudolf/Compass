import { describe, it, expect, beforeEach } from "vitest"
import { useCompassStore, validateSeedOrder, seedData } from "@/lib/store"
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

function buildUnidad(overrides: Partial<Unidad> = {}): Unidad {
  return {
    id: "u-test",
    microSectorId: "piso-torre-a-1",
    numero: "105",
    etiqueta: "Depto",
    tipoUnidadId: "tipo-a",
    metraje: 55.5,
    prorrateo: 0.0125,
    rolSii: "123-A105",
    estadoId: "vacante",
    servicios: {},
    ...overrides,
  }
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

describe("validateSeedOrder — EF orden interno macro→micro→unidad", () => {
  beforeEach(resetStore)

  it("semilla NSGC pasa validación de orden interno", () => {
    const seed = seedData()
    const result = validateSeedOrder({
      macroSectores: seed.macroSectores,
      microSectores: seed.microSectores,
      unidades: seed.unidades,
      tiposUnidad: seed.tiposUnidad,
    })
    expect(result.ok).toBe(true)
    expect(result.violations).toHaveLength(0)
  })

  it("detecta microSector con macroSectorId inexistente", () => {
    const seed = seedData()
    const result = validateSeedOrder({
      macroSectores: seed.macroSectores,
      microSectores: [...seed.microSectores, { id: "ms-fake", macroSectorId: "macro-fantasma", nombre: "Fake", etiqueta: "F" }],
      unidades: seed.unidades,
      tiposUnidad: seed.tiposUnidad,
    })
    expect(result.ok).toBe(false)
    expect(result.violations.some(v => v.includes("macroSectorId inexistente"))).toBe(true)
  })

  it("detecta unidad con microSectorId inexistente", () => {
    const seed = seedData()
    const result = validateSeedOrder({
      macroSectores: seed.macroSectores,
      microSectores: seed.microSectores,
      unidades: [...seed.unidades, buildUnidad({ id: "u-fake", microSectorId: "ms-fantasma" })],
      tiposUnidad: seed.tiposUnidad,
    })
    expect(result.ok).toBe(false)
    expect(result.violations.some(v => v.includes("microSectorId inexistente"))).toBe(true)
  })

  it("detecta unidad con tipoUnidadId inexistente", () => {
    const seed = seedData()
    const result = validateSeedOrder({
      macroSectores: seed.macroSectores,
      microSectores: seed.microSectores,
      unidades: [...seed.unidades, buildUnidad({ id: "u-fake2", tipoUnidadId: "tipo-fantasma" })],
      tiposUnidad: seed.tiposUnidad,
    })
    expect(result.ok).toBe(false)
    expect(result.violations.some(v => v.includes("tipoUnidadId inexistente"))).toBe(true)
  })
})