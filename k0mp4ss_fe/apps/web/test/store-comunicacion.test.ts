import { describe, it, expect, beforeEach } from "vitest"
import { useCompassStore } from "@/lib/store"
import { calcularDigitoVerificador } from "@/lib/rut"
import type { Persona, PlantillaCO, EnvioCO, MensajeBuzonCO, DocumentoCO } from "@/lib/schemas"
import { resetStore } from "./helpers"

const getState = () => useCompassStore.getState()

const rutValido = (cuerpo: string): string => `${cuerpo.slice(0, 2)}.${cuerpo.slice(2, 5)}.${cuerpo.slice(5, 8)}-${calcularDigitoVerificador(cuerpo)}`

const personaBase = (partial: Partial<Persona>): Persona => ({
  id: "p-co-1",
  rut: rutValido("13456789"),
  nombreCompleto: "Camila Test Vecina",
  nombres: "Camila",
  apellidos: "Test Vecina",
  email: "camila@test.cl",
  telefonoMovil: "+56 9 5555 1111",
  estadoCuenta: "activa",
  condicionesEspecialesIds: [],
  roles: ["residente"],
  ...partial,
})

const plantillaBase = (partial: Partial<PlantillaCO>): PlantillaCO => ({
  id: "plant-test-1",
  nombre: "Plantilla TEST",
  categoria: "comunidad",
  asunto: "Asunto TEST [Nombre_Usuario]",
  cuerpo: "Hola [Nombre_Usuario], aviso de la [Nombre_Comunidad].",
  ...partial,
})

const envioBase = (partial: Partial<EnvioCO>): EnvioCO => ({
  id: "env-test-1",
  asunto: "Aviso TEST",
  cuerpo: "Estimado/a [Nombre_Usuario], corte de agua mañana.",
  destinatarios: [{ personaId: "p-co-1" }],
  fechaEnvio: "2026-08-25",
  lecturas: [],
  ...partial,
})

const mensajeBuzonBase = (partial: Partial<MensajeBuzonCO>): MensajeBuzonCO => ({
  id: "buz-test-1",
  folio: "",
  clasificacion: "reclamo",
  reportanteNombre: "Camila Test Vecina",
  asunto: "Ruido en sala de bombas",
  cuerpo: "Hay un ruido constante desde ayer.",
  visibilidadComite: false,
  fechaIngreso: "2026-08-25",
  estado: "recibido",
  respuestas: [],
  ...partial,
})

const docBase = (partial: Partial<DocumentoCO>): DocumentoCO => ({
  id: "doc-test-1",
  nombre: "Reglamento TEST.pdf",
  tipoMime: "application/pdf",
  tamanoKB: 320,
  url: "https://cdn.example.com/reglamento-test.pdf",
  categoria: "reglamento",
  ...partial,
})

function prepararDestinatarios(): string[] {
  getState().savePersona(personaBase({}))
  getState().savePersona(personaBase({ id: "p-co-2", rut: rutValido("14567890"), nombreCompleto: "Diego Test Dos", nombres: "Diego", apellidos: "Test Dos", email: "diego@test.cl", roles: ["personal"], datosLaborales: { id: "lab-d1", cargo: "Conserje", afp: "Habitat", prevision: "Fonasa", fechaIngreso: "2026-01-01" } }))
  return ["p-co-1", "p-co-2"]
}

describe("CO - Comunicación con Vecinos en el store", () => {
  beforeEach(resetStore)

  describe("plantillas", () => {
    it("semilla NSGC carga las 5 plantillas por categoría", () => {
      const categorias = getState().plantillasCO.map(p => p.categoria)
      expect(getState().plantillasCO).toHaveLength(5)
      expect(categorias).toEqual(expect.arrayContaining(["comunidad", "urgente", "cobranza", "informacion", "onboarding"]))
    })

    it("savePlantillaCO crea y edita", () => {
      expect(getState().savePlantillaCO(plantillaBase({})).ok).toBe(true)
      expect(getState().savePlantillaCO(plantillaBase({ asunto: "Editada" })).ok).toBe(true)
      expect(getState().plantillasCO.find(p => p.id === "plant-test-1")!.asunto).toBe("Editada")
    })

    it("removePlantillaCO bloquea si hay envíos que la usan", () => {
      prepararDestinatarios()
      getState().savePlantillaCO(plantillaBase({}))
      getState().saveEnvioCO(envioBase({ plantillaId: "plant-test-1" }))
      const r = getState().removePlantillaCO("plant-test-1")
      expect(r.ok).toBe(false)
      expect(r.error).toContain("envío(s)")
      expect(getState().plantillasCO.some(p => p.id === "plant-test-1")).toBe(true)
    })
  })

  describe("saveEnvioCO", () => {
    beforeEach(prepararDestinatarios)

    it("persiste snapshot, audita CO_SEND_MASSIVE y notifica por destinatario con variables resueltas", () => {
      const r = getState().saveEnvioCO(
        envioBase({
          asunto: "Recordatorio GC para [Nombre_Usuario]",
          destinatarios: [{ personaId: "p-co-1" }, { personaId: "p-co-2" }],
        })
      )

      expect(r.ok).toBe(true)
      const envio = getState().enviosCO.find(e => e.id === "env-test-1")!
      expect(envio.destinatarios).toHaveLength(2)
      expect(getState().eventos.filter(e => e.tipoAccion === "CO_SEND_MASSIVE")).toHaveLength(1)

      const notifs = getState().notificaciones.filter(n => n.moduloOrigen === "CO")
      expect(notifs).toHaveLength(2)
      expect(notifs.every(n => n.canal === "email_simulado")).toBe(true)
      expect(notifs.map(n => n.asunto)).toContain("Recordatorio GC para Camila Test Vecina")
    })

    it("rechaza plantilla, destinatario o unidad inexistentes sin mutar", () => {
      expect(getState().saveEnvioCO(envioBase({ plantillaId: "plant-fantasma" })).ok).toBe(false)
      expect(getState().saveEnvioCO(envioBase({ destinatarios: [{ personaId: "p-fantasma" }] })).ok).toBe(false)
      const unidadFantasma = getState().saveEnvioCO(envioBase({ destinatarios: [{ personaId: "p-co-1", unidadId: "u-fantasma" }] }))
      expect(unidadFantasma.ok).toBe(false)
      expect(getState().enviosCO).toHaveLength(0)
      expect(getState().notificaciones.filter(n => n.moduloOrigen === "CO")).toHaveLength(0)
    })

    it("respeta el gate AD de alertas silenciadas para residentes", () => {
      const unidadId = getState().unidades[0]!.id
      getState().saveControlPropiedad({ id: "ctrl-gate", unidadId, residenteVeMorosidad: false, residenteVeActas: false, alertasResidentesActivas: false })
      const r = getState().saveEnvioCO(envioBase({ destinatarios: [{ personaId: "p-co-1", unidadId }] }))

      expect(r.ok).toBe(true)
      // El envío persiste con su snapshot, pero la notificación operativa queda omitida.
      expect(getState().notificaciones.filter(n => n.moduloOrigen === "CO")).toHaveLength(0)
    })

    it("es idempotente al re-guardar: no duplica notificaciones ni eventos", () => {
      getState().saveEnvioCO(envioBase({}))
      getState().saveEnvioCO(envioBase({}))
      expect(getState().notificaciones.filter(n => n.moduloOrigen === "CO")).toHaveLength(1)
      expect(getState().eventos.filter(e => e.tipoAccion === "CO_SEND_MASSIVE")).toHaveLength(1)
    })
  })

  describe("registrarLecturaEnvioCO", () => {
    it("registra lectura una sola vez (idempotente)", () => {
      prepararDestinatarios()
      getState().saveEnvioCO(envioBase({}))
      expect(getState().registrarLecturaEnvioCO("env-test-1", "p-co-1").ok).toBe(true)
      expect(getState().registrarLecturaEnvioCO("env-test-1", "p-co-1").ok).toBe(true)
      expect(getState().enviosCO[0]!.lecturas).toEqual(["p-co-1"])
      expect(getState().registrarLecturaEnvioCO("no-existe", "p-co-1").ok).toBe(false)
    })
  })

  describe("biblioteca documental (D1)", () => {
    it("acepta documentos por URL http(s)", () => {
      expect(getState().saveDocumentoCO(docBase({})).ok).toBe(true)
    })

    it("rechaza contenido embebido data:/blob:", () => {
      const rData = getState().saveDocumentoCO(docBase({ url: "data:application/pdf;base64,JVBERi0=" }))
      expect(rData.ok).toBe(false)
      expect(rData.error).toContain("Media por referencia")
      expect(getState().saveDocumentoCO(docBase({ url: "blob:https://x/y" })).ok).toBe(false)
    })

    it("registrarDescargaDocCO audita CO_DOC_DOWNLOAD solo si existe", () => {
      getState().saveDocumentoCO(docBase({}))
      expect(getState().registrarDescargaDocCO("doc-test-1").ok).toBe(true)
      expect(getState().registrarDescargaDocCO("doc-fantasma").ok).toBe(false)
      expect(getState().eventos.filter(e => e.tipoAccion === "CO_DOC_DOWNLOAD")).toHaveLength(1)
    })
  })

  describe("buzón ciudadano", () => {
    it("crea tickets con folios BUZ únicos y estado inicial Recibido", () => {
      const r1 = getState().saveMensajeBuzonCO(mensajeBuzonBase({ folio: "lo-que-sea" }))
      const r2 = getState().saveMensajeBuzonCO(mensajeBuzonBase({ id: "buz-test-2", clasificacion: "felicitacion", asunto: "Buen trabajo conserjes" }))

      expect(r1.ok).toBe(true)
      expect(r2.ok).toBe(true)
      const folios = getState().mensajesBuzonCO.map(m => m.folio)
      expect(folios).toEqual(["BUZ-0001", "BUZ-0002"])
      expect(new Set(folios).size).toBe(2)
      expect(getState().mensajesBuzonCO.every(m => m.estado === "recibido")).toBe(true)
      expect(getState().eventos.filter(e => e.tipoAccion === "CO_TICKET_CREATED")).toHaveLength(2)
    })

    it("valida reportante contra el Maestro de Personas", () => {
      const r = getState().saveMensajeBuzonCO(mensajeBuzonBase({ reportantePersonaId: "p-fantasma" }))
      expect(r.ok).toBe(false)
      expect(r.error).toContain("Maestro de Personas")
    })

    it("responder auto-transiciona Recibido→En Gestión y audita", () => {
      getState().saveMensajeBuzonCO(mensajeBuzonBase({}))
      const r = getState().responderMensajeBuzonCO("buz-test-1", { autor: "Administración", texto: "Visitamos la sala hoy.", compromisos: "Revisión de bomba antes del viernes" })

      expect(r.ok).toBe(true)
      const ticket = getState().mensajesBuzonCO.find(m => m.id === "buz-test-1")!
      expect(ticket.estado).toBe("en_gestion")
      expect(ticket.respuestas).toHaveLength(1)
      expect(ticket.respuestas[0]!.compromisos).toContain("viernes")
      expect(getState().eventos.filter(e => e.tipoAccion === "CO_TICKET_RESPONDIDO")).toHaveLength(1)
      expect(getState().eventos.filter(e => e.tipoAccion === "CO_TICKET_ESTADO")).toHaveLength(1)
    })

    it("responder un ticket ya gestionado no re-transiciona estado", () => {
      getState().saveMensajeBuzonCO(mensajeBuzonBase({}))
      getState().responderMensajeBuzonCO("buz-test-1", { autor: "Admin", texto: "Primera respuesta." })
      getState().responderMensajeBuzonCO("buz-test-1", { autor: "Admin", texto: "Segunda respuesta." })
      const ticket = getState().mensajesBuzonCO.find(m => m.id === "buz-test-1")!
      expect(ticket.estado).toBe("en_gestion")
      expect(ticket.respuestas).toHaveLength(2)
    })

    it("matriz de estados: rechaza saltos y retrocesos, permite flujo completo", () => {
      getState().savePersona(personaBase({}))
      getState().saveMensajeBuzonCO(mensajeBuzonBase({ reportantePersonaId: "p-co-1" }))

      expect(getState().cambiarEstadoBuzonCO("buz-test-1", "resuelto").ok).toBe(false)
      expect(getState().cambiarEstadoBuzonCO("buz-test-1", "en_gestion").ok).toBe(true)
      const rResuelto = getState().cambiarEstadoBuzonCO("buz-test-1", "resuelto")
      expect(rResuelto.ok).toBe(true)
      // Al resolverse se notifica al reportante.
      expect(getState().notificaciones.filter(n => n.moduloOrigen === "CO").length).toBeGreaterThan(0)
      expect(getState().cambiarEstadoBuzonCO("buz-test-1", "en_gestion").ok).toBe(false)
      expect(getState().cambiarEstadoBuzonCO("buz-test-1", "cerrado").ok).toBe(true)
      expect(getState().cambiarEstadoBuzonCO("buz-test-1", "en_gestion").ok).toBe(false)

      const ticket = getState().mensajesBuzonCO.find(m => m.id === "buz-test-1")!
      expect(ticket.estado).toBe("cerrado")
      expect(getState().eventos.filter(e => e.tipoAccion === "CO_TICKET_ESTADO").length).toBeGreaterThanOrEqual(3)
    })

    it("preserva visibilidadComite para la vista de directiva", () => {
      getState().saveMensajeBuzonCO(mensajeBuzonBase({ visibilidadComite: true, clasificacion: "sugerencia" }))
      const visiblesComite = getState().mensajesBuzonCO.filter(m => m.visibilidadComite)
      expect(visiblesComite).toHaveLength(1)
      expect(visiblesComite[0]!.clasificacion).toBe("sugerencia")
    })

    it("removeMensajeBuzonCO elimina el registro", () => {
      getState().saveMensajeBuzonCO(mensajeBuzonBase({}))
      expect(getState().removeMensajeBuzonCO("buz-test-1").ok).toBe(true)
      expect(getState().mensajesBuzonCO).toHaveLength(0)
    })
  })
})
