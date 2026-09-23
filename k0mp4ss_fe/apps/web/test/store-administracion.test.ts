import { describe, it, expect, beforeEach } from "vitest"
import { useCompassStore } from "@/lib/store"
import type { Persona, ControlPropiedad } from "@/lib/schemas"
import { resetStore, lastEvent } from "./helpers"

const getState = () => useCompassStore.getState()

const personaBase = (partial: Partial<Persona>): Persona => ({
  id: "p-ad-test",
  rut: "12.345.678-5",
  nombreCompleto: "Test AD Persona",
  nombres: "Test",
  apellidos: "AD Persona",
  email: "test.ad@email.com",
  telefonoMovil: "+56 9 5555 7777",
  estadoCuenta: "activa",
  condicionesEspecialesIds: [],
  roles: ["propietario"],
  ...partial,
})

const controlBase = (partial: Partial<ControlPropiedad>): ControlPropiedad => ({
  id: "ctrl-ad-1",
  unidadId: "u-A-302",
  residenteVeMorosidad: false,
  residenteVeActas: false,
  alertasResidentesActivas: true,
  ...partial,
})

describe("AD - Gestión Administrativa en el store", () => {
  beforeEach(resetStore)

  describe("saveControlPropiedad", () => {
    it("crea controles para una unidad existente y audita AD_OWNER_CONFIG_CHANGE", () => {
      const r = getState().saveControlPropiedad(controlBase({}))

      expect(r.ok).toBe(true)
      expect(getState().controlesPropiedades).toHaveLength(1)
      expect(lastEvent()?.tipoAccion).toBe("AD_OWNER_CONFIG_CHANGE")
      expect(lastEvent()?.categoria).toBe("AD")
    })

    it("rechaza unidad inexistente sin mutar el store", () => {
      const antes = getState().controlesPropiedades.length

      const r = getState().saveControlPropiedad(controlBase({ unidadId: "u-999" }))

      expect(r.ok).toBe(false)
      expect(r.error).toContain("unidad no existe")
      expect(getState().controlesPropiedades.length).toBe(antes)
    })

    it("rechaza un segundo registro para la misma unidad con otro id", () => {
      getState().saveControlPropiedad(controlBase({ id: "ctrl-a" }))

      const r = getState().saveControlPropiedad(controlBase({ id: "ctrl-b" }))

      expect(r.ok).toBe(false)
      expect(r.error).toContain("ya tiene controles")
      expect(getState().controlesPropiedades.filter(c => c.unidadId === "u-A-302")).toHaveLength(1)
    })

    it("upsert idempotente del mismo id actualiza flags y audita los cambios", () => {
      getState().saveControlPropiedad(controlBase({}))

      const r = getState().saveControlPropiedad(controlBase({ residenteVeActas: true, alertasResidentesActivas: false }))

      expect(r.ok).toBe(true)
      expect(getState().controlesPropiedades).toHaveLength(1)
      expect(getState().controlesPropiedades[0]!.residenteVeActas).toBe(true)
      expect(lastEvent()?.descripcion).toContain("actas=visibles")
      expect(lastEvent()?.descripcion).toContain("alertas=silenciadas")
    })
  })

  describe("Validación D1 en savePersona (foto y firma por referencia)", () => {
    it("rechaza fotografiaUrl como data-URL", () => {
      const r = getState().savePersona(personaBase({ fotografiaUrl: "data:image/png;base64,iVBORw0KGgo=" }))
      expect(r.ok).toBe(false)
      expect(r.error).toContain("Media por referencia")
    })

    it("rechaza firma digitalizada embebida en base64", () => {
      const r = getState().savePersona(
        personaBase({
          roles: ["directiva"],
          datosGobernanza: { id: "gob-1", cargoDirectiva: "secretario", firmaDigital: "data:image/png;base64,AAAA", fechaAsuncion: "2026-01-01" },
        })
      )
      expect(r.ok).toBe(false)
      expect(r.error).toContain("firma digitalizada")
    })

    it("acepta firma por URL y audita AD_DIRECTIVA_SIGN_UPLOAD al cargarla", () => {
      // Primero existe la persona sin firma (con rol directiva: ficha coherente, GD-períodos)
      getState().savePersona(personaBase({ roles: ["directiva"], datosGobernanza: { id: "gob-1", cargoDirectiva: "secretario", fechaAsuncion: "2026-01-01" } }))

      const r = getState().savePersona(
        personaBase({
          roles: ["directiva"],
          datosGobernanza: { id: "gob-1", cargoDirectiva: "secretario", firmaDigital: "https://cdn.example.com/firma.png", fechaAsuncion: "2026-01-01" },
        })
      )

      expect(r.ok).toBe(true)
      expect(lastEvent()?.tipoAccion).toBe("AD_DIRECTIVA_SIGN_UPLOAD")
      expect(lastEvent()?.categoria).toBe("AD")
    })
  })

  describe("Gate de alertas residentes en notify() (D3 + AD)", () => {
    beforeEach(() => {
      getState().saveControlPropiedad(controlBase({ alertasResidentesActivas: false }))
    })

    it("no notifica a residente de unidad con alertas silenciadas", () => {
      const antes = getState().notificaciones.length

      getState().notify({ destinatarioRol: "residente", asunto: "Llegada de visita", cuerpo: "Visita en portería", moduloOrigen: "PE", unidadId: "u-A-302" })

      expect(getState().notificaciones.length).toBe(antes)
    })

    it("sí notifica cuando las alertas están activas", () => {
      getState().saveControlPropiedad(controlBase({ alertasResidentesActivas: true }))
      const antes = getState().notificaciones.length

      getState().notify({ destinatarioRol: "residente", asunto: "Encomienda", cuerpo: "Tiene una encomienda", moduloOrigen: "PE", unidadId: "u-A-302" })

      expect(getState().notificaciones.length).toBe(antes + 1)
    })

    it("el gate no afecta a propietarios ni actos formales", () => {
      const antes = getState().notificaciones.length

      getState().notify({ destinatarioRol: "propietario", asunto: "Acta publicada", cuerpo: "Nueva acta disponible", moduloOrigen: "GD", unidadId: "u-A-302" })

      expect(getState().notificaciones.length).toBe(antes + 1)
    })
  })
})
