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

  describe("savePublicacionPortal", () => {
    it("rechaza unidad inexistente sin mutar el store", () => {
      const antes = getState().publicacionesPortal.length

      const r = getState().savePublicacionPortal(publicacionBase({ unidadId: "u-999" }))

      expect(r.ok).toBe(false)
      expect(r.error).toContain("unidad no existe")
      expect(getState().publicacionesPortal.length).toBe(antes)
    })

    it("rechaza imágenes embebidas en base64/data-URL (D1)", () => {
      const antes = getState().publicacionesPortal.length

      const r = getState().savePublicacionPortal(
        publicacionBase({
          imagenes: [{ nombre: "foto.jpg", tipoMime: "image/jpeg", tamanoKB: 500, url: "data:image/jpeg;base64,/9j/4AAQ" }],
        })
      )

      expect(r.ok).toBe(false)
      expect(r.error).toContain("Media por referencia")
      expect(getState().publicacionesPortal.length).toBe(antes)
    })

    it("acepta imagen por URL y registra PI_PROPERTY_LISTED al crearla activa", () => {
      const antesListed = getState().eventos.filter(e => e.tipoAccion === "PI_PROPERTY_LISTED").length

      const r = getState().savePublicacionPortal(
        publicacionBase({
          imagenes: [{ nombre: "foto.jpg", tipoMime: "image/jpeg", tamanoKB: 120, url: "https://cdn.example.com/foto.jpg" }],
        })
      )

      expect(r.ok).toBe(true)
      const despuesListed = getState().eventos.filter(e => e.tipoAccion === "PI_PROPERTY_LISTED").length
      expect(despuesListed).toBe(antesListed + 1)
      expect(lastEvent()?.categoria).toBe("PI")
    })
  })

  describe("removePublicacionPortal", () => {
    it("bloquea eliminar publicación con leads asociados", () => {
      getState().savePublicacionPortal(publicacionBase({}))
      getState().saveLeadPortal({ id: "lead-test", publicacionId: "pub-test", nombreContacto: "Interesado", contacto: "+56 9 1111 1111", fecha: "2026-08-24", atendido: false })

      const r = getState().removePublicacionPortal("pub-test")

      expect(r.ok).toBe(false)
      expect(r.error).toContain("lead")
      expect(getState().publicacionesPortal.some(p => p.id === "pub-test")).toBe(true)
    })

    it("elimina publicación sin leads", () => {
      getState().savePublicacionPortal(publicacionBase({}))

      const r = getState().removePublicacionPortal("pub-test")

      expect(r.ok).toBe(true)
      expect(getState().publicacionesPortal.some(p => p.id === "pub-test")).toBe(false)
    })
  })

  describe("saveLeadPortal y contacto seguro", () => {
    beforeEach(() => {
      getState().savePublicacionPortal(publicacionBase({}))
    })

    it("rechaza lead sobre publicación inexistente o inactiva", () => {
      const antes = getState().leadsPortal.length

      expect(getState().saveLeadPortal({ id: "l1", publicacionId: "no-existe", nombreContacto: "X", contacto: "y", fecha: "2026-08-24", atendido: false }).ok).toBe(false)

      getState().savePublicacionPortal(publicacionBase({ activa: false }))
      expect(getState().saveLeadPortal({ id: "l2", publicacionId: "pub-test", nombreContacto: "X", contacto: "y", fecha: "2026-08-24", atendido: false }).ok).toBe(false)

      expect(getState().leadsPortal.length).toBe(antes)
    })

    it("registra lead, notifica al propietario vía email_simulado y audita PI_LEAD_CONTACT", () => {
      // Propietario vigente para u-A-302 (seed de vínculos)
      const propietario = getState().vinculos.find(v => v.unidadId === "u-A-302" && v.rol === "propietario" && !v.fechaFin)
      const notificacionesAntes = getState().notificaciones.length

      const r = getState().saveLeadPortal({ id: "lead-ok", publicacionId: "pub-test", nombreContacto: "Ana Interesada", contacto: "+56 9 2222 2222", mensaje: "¿Disponible?", fecha: "2026-08-24", atendido: false })

      expect(r.ok).toBe(true)
      expect(lastEvent()?.tipoAccion).toBe("PI_LEAD_CONTACT")

      const notif = getState().notificaciones[getState().notificaciones.length - 1]!
      expect(getState().notificaciones.length).toBe(notificacionesAntes + 1)
      expect(notif.canal).toBe("email_simulado")
      expect(notif.destinatarioRol).toBe("propietario")
      if (propietario) expect(notif.destinatarioPersonaId).toBe(propietario.personaId)
    })

    it("re-ejecución del mismo lead no duplica notificación (idempotencia bulk)", () => {
      getState().saveLeadPortal({ id: "lead-idem", publicacionId: "pub-test", nombreContacto: "B", contacto: "c", fecha: "2026-08-24", atendido: false })
      const notificacionesTrasPrimera = getState().notificaciones.length

      getState().saveLeadPortal({ id: "lead-idem", publicacionId: "pub-test", nombreContacto: "B", contacto: "c", fecha: "2026-08-24", atendido: false })

      expect(getState().notificaciones.length).toBe(notificacionesTrasPrimera)
    })
  })

  describe("Centro de notificaciones simulado (D3)", () => {
    it("notify() agrega a la bandeja y marcarNotificacionLeida la marca", () => {
      const antes = getState().notificaciones.length

      getState().notify({ destinatarioRol: "administracion", asunto: "Prueba", cuerpo: "Cuerpo de prueba", moduloOrigen: "PI" })

      const creada = getState().notificaciones[getState().notificaciones.length - 1]!
      expect(getState().notificaciones.length).toBe(antes + 1)
      expect(creada.canal).toBe("email_simulado")
      expect(creada.leida).toBe(false)

      getState().marcarNotificacionLeida(creada.id)
      expect(getState().notificaciones.find(n => n.id === creada.id)?.leida).toBe(true)
    })
  })
})
