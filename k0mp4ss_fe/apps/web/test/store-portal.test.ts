import { describe, it, expect, beforeEach } from "vitest"
import { useCompassStore } from "@/lib/store"
import type { PublicacionPortal } from "@/lib/schemas"
import { resetStore, lastEvent } from "./helpers"

const getState = () => useCompassStore.getState()

function publicacionBase(partial: Partial<PublicacionPortal>): PublicacionPortal {
  return {
    id: "pub-test",
    unidadId: "u-A-302",
    operacion: "arriendo",
    precio: 450000,
    imagenes: [],
    activa: true,
    fechaPublicacion: "2026-08-24",
    ...partial,
  }
}

describe("PI - Portal Inmobiliario en el store", () => {
  beforeEach(resetStore)

  describe("Trigger inmobiliario desde VU", () => {
    it("publica automáticamente al marcar En Arriendo en vínculo propietario", () => {
      const r = getState().saveVinculo({
        id: "v-pi-1",
        personaId: "p-11",
        unidadId: "u-A-302",
        rol: "propietario",
        fechaInicio: "2026-01-01",
        estadoOcupacionPropiedad: "en_arriendo",
        permiteVerFinanzas: false,
      })

      expect(r.ok).toBe(true)
      const pubs = getState().publicacionesPortal.filter(p => p.unidadId === "u-A-302")
      expect(pubs).toHaveLength(1)
      expect(pubs[0]!.activa).toBe(true)
      expect(pubs[0]!.operacion).toBe("arriendo")
      expect(lastEvent()?.tipoAccion).toBe("PI_PROPERTY_LISTED")
    })

    it("publica como venta cuando el estado es En Venta", () => {
      const r = getState().saveVinculo({
        id: "v-pi-2",
        personaId: "p-11",
        unidadId: "u-A-302",
        rol: "propietario",
        fechaInicio: "2026-01-01",
        estadoOcupacionPropiedad: "en_venta",
        permiteVerFinanzas: false,
      })

      expect(r.ok).toBe(true)
      const pub = getState().publicacionesPortal.find(p => p.unidadId === "u-A-302")
      expect(pub?.operacion).toBe("venta")
    })

    it("no publica con estados sin oferta (Habitada/Vacante)", () => {
      const antes = getState().eventos.length

      const r = getState().saveVinculo({
        id: "v-pi-3",
        personaId: "p-11",
        unidadId: "u-A-302",
        rol: "propietario",
        fechaInicio: "2026-01-01",
        estadoOcupacionPropiedad: "habitada",
        permiteVerFinanzas: false,
      })

      expect(r.ok).toBe(true)
      expect(getState().publicacionesPortal.find(p => p.unidadId === "u-A-302")).toBeUndefined()
      expect(getState().eventos.length).toBe(antes)
    })

    it("retira de la vitrina (sin borrar) cuando desaparece la oferta vigente", () => {
      getState().saveVinculo({
        id: "v-pi-4",
        personaId: "p-11",
        unidadId: "u-A-302",
        rol: "propietario",
        fechaInicio: "2026-01-01",
        estadoOcupacionPropiedad: "en_arriendo",
        permiteVerFinanzas: false,
      })
      const publicada = getState().publicacionesPortal.find(p => p.unidadId === "u-A-302")!

      const r = getState().saveVinculo({
        id: "v-pi-4",
        personaId: "p-11",
        unidadId: "u-A-302",
        rol: "propietario",
        fechaInicio: "2026-01-01",
        estadoOcupacionPropiedad: "habitada",
        permiteVerFinanzas: false,
      })

      expect(r.ok).toBe(true)
      const pub = getState().publicacionesPortal.find(p => p.id === publicada.id)
      expect(pub?.activa).toBe(false)
      expect(lastEvent()?.tipoAccion).toBe("PI_PROPERTY_UNLISTED")
    })
  })

  describe("removePublicacionPortal", () => {
    it("bloquea eliminar publicación con leads asociados", () => {
      // Se siembra el estado directo: `savePublicacionPortal`/`saveLeadPortal` (legacy) se
      // eliminaron en store-cleanup y el sujeto de este caso es `removePublicacionPortal`.
      useCompassStore.setState((s) => ({
        publicacionesPortal: [...s.publicacionesPortal, publicacionBase({})],
        leadsPortal: [
          ...s.leadsPortal,
          { id: "lead-test", publicacionId: "pub-test", nombreContacto: "Interesado", contacto: "+56 9 1111 1111", fecha: "2026-08-24", atendido: false },
        ],
      }))

      const r = getState().removePublicacionPortal("pub-test")

      expect(r.ok).toBe(false)
      expect(r.error).toContain("lead")
      expect(getState().publicacionesPortal.some(p => p.id === "pub-test")).toBe(true)
    })

    it("elimina publicación sin leads", () => {
      useCompassStore.setState((s) => ({
        publicacionesPortal: [...s.publicacionesPortal, publicacionBase({})],
      }))

      const r = getState().removePublicacionPortal("pub-test")

      expect(r.ok).toBe(true)
      expect(getState().publicacionesPortal.some(p => p.id === "pub-test")).toBe(false)
    })
  })


  describe("Centro de notificaciones simulado (D3)", () => {
    it("notify() agrega a la bandeja como no leída con canal email_simulado", () => {
      const antes = getState().notificaciones.length

      getState().notify({ destinatarioRol: "administracion", asunto: "Prueba", cuerpo: "Cuerpo de prueba", moduloOrigen: "PI" })

      const creada = getState().notificaciones[getState().notificaciones.length - 1]!
      expect(getState().notificaciones.length).toBe(antes + 1)
      expect(creada.canal).toBe("email_simulado")
      expect(creada.leida).toBe(false)
    })
  })
})
