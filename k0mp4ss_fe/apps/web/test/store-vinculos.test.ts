import { describe, it, expect, beforeEach } from "vitest"
import { useCompassStore } from "@/lib/store"
import type { VinculoUnidad } from "@/data/comunidad/vinculos"
import { resetStore, lastEvent } from "./helpers"

const getState = () => useCompassStore.getState()

function vinculoBase(partial: Partial<VinculoUnidad>): VinculoUnidad {
  return {
    id: "v-test",
    personaId: "p-11",
    unidadId: "u-A-302",
    rol: "arrendatario",
    fechaInicio: "2026-01-01",
    permiteVerFinanzas: false,
    ...partial,
  }
}

describe("saveVinculo - validaciones de negocio", () => {
  beforeEach(resetStore)

  it("se niega mientras el store no está hidratado", () => {
    useCompassStore.setState({ hasHydrated: false })

    const result = getState().saveVinculo(vinculoBase({}))

    expect(result.ok).toBe(false)
    expect(result.error).toContain("hidratando")
    useCompassStore.setState({ hasHydrated: true })
  })

  it("rechaza persona inexistente en el Maestro de Personas", () => {
    const antes = getState().vinculos.length

    const result = getState().saveVinculo(vinculoBase({ personaId: "p-999" }))

    expect(result.ok).toBe(false)
    expect(result.error).toBe("La persona no existe en el Maestro de Personas.")
    expect(getState().vinculos.length).toBe(antes)
  })

  it("rechaza vínculo para una persona con cuenta inactiva", () => {
    const antes = getState().vinculos.length

    const result = getState().saveVinculo(vinculoBase({ personaId: "p-8" }))

    expect(result.ok).toBe(false)
    expect(result.error).toContain("la persona está marcada como inactiva")
    expect(getState().vinculos.length).toBe(antes)
  })

  it("rechaza vínculo duplicado activo (misma persona y unidad)", () => {
    const antes = getState().vinculos.length

    const result = getState().saveVinculo(
      vinculoBase({ personaId: "p-1", unidadId: "u-A-101", rol: "propietario", fechaInicio: "2025-01-01" })
    )

    expect(result.ok).toBe(false)
    expect(result.error).toBe("Esta persona ya posee un vínculo activo con esta unidad.")
    expect(getState().vinculos.length).toBe(antes)
  })

  it("rechaza arriendo cuyo tramo cerrado se solapa con contrato vigente", () => {
    const antes = getState().vinculos.length

    const result = getState().saveVinculo(
      vinculoBase({
        personaId: "p-11",
        unidadId: "u-LC-02",
        rol: "arrendatario",
        fechaInicio: "2024-07-01",
        fechaFin: "2024-09-30",
      })
    )

    expect(result.ok).toBe(false)
    expect(result.error).toBe("El contrato de arriendo se solapa con otro contrato vigente en la misma unidad.")
    expect(getState().vinculos.length).toBe(antes)
  })

  it("rechaza arriendo abierto con cerrarAnterior=false sobre contrato vigente", () => {
    const antes = getState().vinculos.length

    const result = getState().saveVinculo(
      vinculoBase({
        id: "v-solape",
        personaId: "p-13",
        unidadId: "u-LC-02",
        rol: "arrendatario",
        fechaInicio: "2025-06-01",
        cerrarAnterior: false,
      })
    )

    expect(result.ok).toBe(false)
    expect(result.error).toBe("El contrato de arriendo se solapa con otro contrato vigente en la misma unidad.")
    expect(getState().vinculos.length).toBe(antes)
  })

  it("guarda vínculo nuevo y cierra automáticamente el tramo del titular saliente", () => {
    const antes = getState().vinculos.length

    const result = getState().saveVinculo(
      vinculoBase({
        id: "v-nuevo-dueno",
        personaId: "p-14",
        unidadId: "u-A-101",
        rol: "propietario",
        fechaInicio: "2026-08-01",
        estadoOcupacionPropiedad: "habitada",
      })
    )

    expect(result.ok).toBe(true)

    const state = getState()
    expect(state.vinculos.length).toBe(antes + 1)

    const anterior = state.vinculos.find(v => v.id === "v-1")
    expect(anterior?.fechaFin).toBe("2026-07-31")

    const tiposEvento = state.eventos.map(e => e.tipoAccion)
    expect(tiposEvento).toContain("VU_ASSIGN_RELEASED")
    expect(tiposEvento).toContain("VU_CHANGE_OWNER")

    const cambioDueno = state.eventos.find(e => e.tipoAccion === "VU_CHANGE_OWNER")
    expect(cambioDueno?.descripcion).toContain("Felipe Morales Díaz")
    expect(cambioDueno?.descripcion).toContain("Juan Pérez González")
  })

  it("permite coexistencia de ocupantes porque no rige exclusividad de titularidad", () => {
    const antes = getState().vinculos.length
    expect(getState().vinculos.some(v => v.unidadId === "u-D-401" && v.rol === "ocupante")).toBe(true)

    const result = getState().saveVinculo(
      vinculoBase({
        id: "v-ocupante-2",
        personaId: "p-15",
        unidadId: "u-D-401",
        rol: "ocupante",
      })
    )

    expect(result.ok).toBe(true)
    expect(getState().vinculos.length).toBe(antes + 1)
  })
})

describe("removeVinculo", () => {
  beforeEach(resetStore)

  it("elimina vínculo activo y registra evento de liberación", () => {
    const antes = getState().vinculos.length

    const result = getState().removeVinculo("v-12")

    expect(result.ok).toBe(true)
    expect(getState().vinculos.some(v => v.id === "v-12")).toBe(false)
    expect(getState().vinculos.length).toBe(antes - 1)
    expect(lastEvent()?.tipoAccion).toBe("VU_ASSIGN_RELEASED")
  })
})
