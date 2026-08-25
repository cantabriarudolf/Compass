import { describe, it, expect, beforeEach } from "vitest"
import { useCompassStore } from "@/lib/store"
import { calcularDigitoVerificador } from "@/lib/rut"
import type { MensajeBuzonCO, Persona, SolicitudGE } from "@/lib/schemas"
import { resetStore } from "./helpers"

const getState = () => useCompassStore.getState()

const rutValido = (cuerpo: string): string => `${cuerpo.slice(0, 2)}.${cuerpo.slice(2, 5)}.${cuerpo.slice(5, 8)}-${calcularDigitoVerificador(cuerpo)}`

const personaBase = (partial: Partial<Persona>): Persona => ({
  id: "p-ge-1",
  rut: rutValido("15467892"),
  nombreCompleto: "Elena Test Solicitante",
  nombres: "Elena",
  apellidos: "Test Solicitante",
  email: "elena@test.cl",
  telefonoMovil: "+56 9 6666 2222",
  estadoCuenta: "activa",
  condicionesEspecialesIds: [],
  roles: ["residente"],
  ...partial,
})

const unidadIdSeed = (): string => getState().unidades[0]!.id

const solicitudBase = (partial: Partial<SolicitudGE>): SolicitudGE => ({
  id: "sol-ge-1",
  folio: "",
  tipo: "grabaciones",
  titulo: "Solicitud de grabaciones TEST",
  descripcion: "Revisión de cámaras del lobby por hurto paquete.",
  solicitantePersonaId: undefined,
  unidadId: undefined,
  estado: "nuevo",
  fechaCreacion: "2026-08-25",
  comentarios: [],
  detalleGrabaciones: {
    fechaSuceso: "2026-08-24",
    horaSuceso: "18:30",
    justificacion: "Un courier retiró un paquete que no era suyo a las 18:30.",
  },
  historialEstados: [],
  ...partial,
})

function prepararBuzon(): string {
  const mensaje: MensajeBuzonCO = {
    id: "buz-ge-link",
    folio: "",
    clasificacion: "reclamo",
    reportanteNombre: "Elena Test",
    asunto: "Ruido reiterativo",
    cuerpo: "Ruido todas las noches en el piso 3.",
    visibilidadComite: false,
    fechaIngreso: "2026-08-25",
    estado: "recibido",
    respuestas: [],
  }
  const r = getState().saveMensajeBuzonCO(mensaje)
  if (!r.ok) throw new Error(r.error)
  return "buz-ge-link"
}

describe("GE - Gestión de Solicitudes en el store", () => {
  beforeEach(resetStore)

  describe("saveSolicitudGE", () => {
    it("crea ticket con folio GE único, estado Nuevo y notifica recepción", () => {
      getState().savePersona(personaBase({}))
      const r1 = getState().saveSolicitudGE(solicitudBase({ solicitantePersonaId: "p-ge-1", unidadId: unidadIdSeed() }))
      const r2 = getState().saveSolicitudGE(solicitudBase({ id: "sol-ge-2", solicitantePersonaId: "p-ge-1", unidadId: unidadIdSeed() }))

      expect(r1.ok).toBe(true)
      expect(r2.ok).toBe(true)
      const folios = getState().solicitudesGE.map(s => s.folio)
      expect(folios).toEqual(["GE-0001", "GE-0002"])
      expect(getState().solicitudesGE.every(s => s.estado === "nuevo")).toBe(true)
      expect(getState().eventos.filter(e => e.tipoAccion === "GE_TICKET_CREATED")).toHaveLength(2)

      const notifs = getState().notificaciones.filter(n => n.moduloOrigen === "GE")
      expect(notifs).toHaveLength(2)
      expect(notifs[0]!.canal).toBe("email_simulado")
    })

    it("rechaza grabaciones sin unidad (conserje debe vincular) o sin justificación extendida", () => {
      const sinUnidad = getState().saveSolicitudGE(solicitudBase({}))
      expect(sinUnidad.ok).toBe(false)
      expect(sinUnidad.error).toContain("deben vincularse a una unidad")

      const justCorta = getState().saveSolicitudGE(
        solicitudBase({
          unidadId: unidadIdSeed(),
          detalleGrabaciones: { fechaSuceso: "2026-08-24", horaSuceso: "18:30", justificacion: "robo" },
        })
      )
      expect(justCorta.ok).toBe(false)
      expect(justCorta.error).toContain("justificación")

      const sinDetalle = getState().saveSolicitudGE(solicitudBase({ unidadId: unidadIdSeed(), detalleGrabaciones: undefined }))
      expect(sinDetalle.ok).toBe(false)
      expect(getState().solicitudesGE).toHaveLength(0)
    })

    it("rechaza insumos sin área destino y FKs inexistentes", () => {
      expect(getState().saveSolicitudGE(solicitudBase({ tipo: "insumos", titulo: "Insumos TEST" })).ok).toBe(false)
      expect(getState().saveSolicitudGE(solicitudBase({ solicitantePersonaId: "p-fantasma" })).ok).toBe(false)
      expect(getState().saveSolicitudGE(solicitudBase({ unidadId: "u-fantasma" })).ok).toBe(false)
    })

    it("ticket tipo buzon exige mensaje CO existente y hereda contexto", () => {
      expect(getState().saveSolicitudGE(solicitudBase({ tipo: "buzon", titulo: "Ticket buzón", mensajeBuzonId: "buz-fantasma" })).ok).toBe(false)

      const mensajeId = prepararBuzon()
      const r = getState().saveSolicitudGE(
        solicitudBase({ tipo: "buzon", titulo: "Gestión reclamo ruido", mensajeBuzonId: mensajeId, unidadId: unidadIdSeed() })
      )
      expect(r.ok).toBe(true)
      expect(getState().solicitudesGE[0]!.mensajeBuzonId).toBe(mensajeId)
    })
  })

  describe("workflow automático", () => {
    beforeEach(() => {
      getState().savePersona(personaBase({}))
      getState().saveSolicitudGE(solicitudBase({ solicitantePersonaId: "p-ge-1", unidadId: unidadIdSeed() }))
    })

    it("abrir marca En Revisión solo la primera vez", () => {
      expect(getState().abrirSolicitudGE("sol-ge-1").ok).toBe(true)
      let ticket = getState().solicitudesGE.find(s => s.id === "sol-ge-1")!
      expect(ticket.estado).toBe("en_revision")
      expect(ticket.historialEstados).toHaveLength(1)

      // Segunda apertura es idempotente: no agrega historial.
      getState().abrirSolicitudGE("sol-ge-1")
      ticket = getState().solicitudesGE.find(s => s.id === "sol-ge-1")!
      expect(ticket.historialEstados).toHaveLength(1)
      expect(getState().eventos.filter(e => e.tipoAccion === "GE_TICKET_STATE_CHANGE")).toHaveLength(1)
    })

    it("respuesta admin pide datos → Requiere Acción Vecino con alerta al solicitante", () => {
      getState().abrirSolicitudGE("sol-ge-1")
      const r = getState().responderSolicitudGE("sol-ge-1", { autorRol: "administracion", texto: "Indique la hora exacta del retiro." })

      expect(r.ok).toBe(true)
      const ticket = getState().solicitudesGE.find(s => s.id === "sol-ge-1")!
      expect(ticket.estado).toBe("requiere_accion_vecino")
      expect(ticket.comentarios).toHaveLength(1)
      const alertas = getState().notificaciones.filter(n => n.asunto.includes("requiere más información"))
      expect(alertas).toHaveLength(1)
      expect(alertas[0]!.destinatarioPersonaId).toBe("p-ge-1")
    })

    it("respuesta del vecino devuelve el ticket a En Proceso y avisa a administración", () => {
      getState().abrirSolicitudGE("sol-ge-1")
      getState().responderSolicitudGE("sol-ge-1", { autorRol: "administracion", texto: "Indique la hora exacta." })
      const r = getState().responderSolicitudGE("sol-ge-1", { autorRol: "solicitante", texto: "Fue a las 18:30." })

      expect(r.ok).toBe(true)
      const ticket = getState().solicitudesGE.find(s => s.id === "sol-ge-1")!
      expect(ticket.estado).toBe("en_proceso")
      expect(getState().notificaciones.some(n => n.destinatarioRol === "administracion")).toBe(true)
    })

    it("comentario del vecino fuera de Requiere Acción no transiciona estado", () => {
      getState().abrirSolicitudGE("sol-ge-1")
      getState().responderSolicitudGE("sol-ge-1", { autorRol: "solicitante", texto: "Agrego antecedentes adicionales." })
      const ticket = getState().solicitudesGE.find(s => s.id === "sol-ge-1")!
      expect(ticket.estado).toBe("en_revision")
      expect(ticket.comentarios).toHaveLength(1)
    })

    it("resolver audita GE_TICKET_RESOLVED, notifica solución y cerrar registra SLA", () => {
      getState().abrirSolicitudGE("sol-ge-1")

      expect(getState().cerrarSolicitudGE("sol-ge-1").ok).toBe(false)

      const r = getState().resolverSolicitudGE("sol-ge-1", "Se entregó link del video al solicitante.")
      expect(r.ok).toBe(true)
      let ticket = getState().solicitudesGE.find(s => s.id === "sol-ge-1")!
      expect(ticket.estado).toBe("resuelto")
      expect(ticket.resolucion).toContain("link del video")
      expect(getState().eventos.filter(e => e.tipoAccion === "GE_TICKET_RESOLVED")).toHaveLength(1)

      const rCierre = getState().cerrarSolicitudGE("sol-ge-1")
      expect(rCierre.ok).toBe(true)
      ticket = getState().solicitudesGE.find(s => s.id === "sol-ge-1")!
      expect(ticket.estado).toBe("cerrado")
      expect(ticket.fechaCierre).toBeTruthy()

      const notifsFinales = getState().notificaciones.filter(n => n.asunto.includes("fue resuelta"))
      expect(notifsFinales).toHaveLength(1)
    })

    it("removeSolicitudGE elimina el ticket", () => {
      expect(getState().removeSolicitudGE("sol-ge-1").ok).toBe(true)
      expect(getState().solicitudesGE).toHaveLength(0)
    })
  })
})
