import { describe, it, expect, beforeEach } from "vitest"
import { useCompassStore } from "@/lib/store"
import { calcularDigitoVerificador } from "@/lib/rut"
import type { Persona, TipoInfraccionIN, InfraccionIN } from "@/lib/schemas"
import { resetStore } from "./helpers"

const getState = () => useCompassStore.getState()

const rutValido = (cuerpo: string): string => `${cuerpo.slice(0, 2)}.${cuerpo.slice(2, 5)}.${cuerpo.slice(5, 8)}-${calcularDigitoVerificador(cuerpo)}`

const personaBase = (partial: Partial<Persona>): Persona => ({
  id: "p-in-1",
  rut: rutValido("15467892"),
  nombreCompleto: "Test Vecino Infractor",
  nombres: "Test",
  apellidos: "Vecino Infractor",
  email: "vecino@test.cl",
  telefonoMovil: "+56 9 4444 2222",
  estadoCuenta: "activa",
  condicionesEspecialesIds: [],
  roles: ["residente"],
  ...partial,
})

const tipoBase = (partial: Partial<TipoInfraccionIN>): TipoInfraccionIN => ({
  id: "tipo-in-test",
  nombre: "Falta TEST",
  categoria: "leve",
  tipoSancion: "monto_fijo",
  valor: 20000,
  ...partial,
})

const evidencia = { nombre: "foto-dano.jpg", tipoMime: "image/jpeg", tamanoKB: 90, url: "https://placeholder.supabase.co/dano.jpg" }

const infraccionBase = (partial: Partial<InfraccionIN>): InfraccionIN => ({
  id: "in-1",
  folio: "",
  tipoInfraccionId: "tipo-in-mascotas",
  unidadId: "",
  fechaSuceso: "2026-08-24",
  horaSuceso: "21:30",
  antecedentes: "Mascota sin correa reiteradamente en el jardín central según testimonios.",
  evidencias: [evidencia],
  estado: "en_revision",
  fechaRegistro: "2026-08-25",
  comentariosDirectiva: [],
  respaldosDirectiva: [],
  ...partial,
})

const unidadIdSeed = (): string => getState().unidades[0]!.id

describe("IN - Infracciones y Multas en el store", () => {
  beforeEach(resetStore)

  describe("catálogo de tipos", () => {
    it("seed NSGC disponible y alta/edición funcionan", () => {
      expect(getState().tiposInfraccionIN.length).toBeGreaterThanOrEqual(5)
      const r = getState().saveTipoInfraccionIN(tipoBase({}))
      expect(r.ok).toBe(true)
      expect(getState().tiposInfraccionIN.some(t => t.nombre === "Falta TEST")).toBe(true)

      const porcentaje = getState().saveTipoInfraccionIN(tipoBase({ id: "tipo-in-pct", nombre: "Ruidos TEST", categoria: "grave", tipoSancion: "porcentaje_gc", valor: 50 }))
      expect(porcentaje.ok).toBe(true)
    })

    it("tipo usado por infracciones no eliminable", () => {
      getState().savePersona(personaBase({}))
      getState().saveInfraccionIN(infraccionBase({ unidadId: unidadIdSeed() }))
      const r = getState().removeTipoInfraccionIN("tipo-in-mascotas")
      expect(r.ok).toBe(false)
      expect(r.error).toContain("infracción(es)")
    })
  })

  describe("registro de infracciones", () => {
    beforeEach(() => {
      getState().savePersona(personaBase({}))
    })

    it("crea con folio IN único, estado En Revisión y audita IN_REG_EVENT", () => {
      const r1 = getState().saveInfraccionIN(infraccionBase({ unidadId: unidadIdSeed() }))
      const r2 = getState().saveInfraccionIN(infraccionBase({ id: "in-2", unidadId: unidadIdSeed() }))
      expect(r1.ok).toBe(true)
      expect(r2.ok).toBe(true)
      expect(getState().infraccionesIN.map(i => i.folio)).toEqual(["IN-0001", "IN-0002"])
      expect(getState().infraccionesIN.every(i => i.estado === "en_revision")).toBe(true)
      expect(getState().eventos.filter(e => e.tipoAccion === "IN_REG_EVENT")).toHaveLength(2)
      expect(getState().notificaciones.filter(n => n.moduloOrigen === "IN" && n.destinatarioRol === "administracion").length).toBeGreaterThanOrEqual(2)
    })

    it("exige tipo del catálogo o daño directo (excluyentes)", () => {
      const sinNada = getState().saveInfraccionIN(infraccionBase({ unidadId: unidadIdSeed(), tipoInfraccionId: undefined }))
      expect(sinNada.ok).toBe(false)
      expect(sinNada.error).toContain("catálogo o ser un cobro directo")

      const ambos = getState().saveInfraccionIN(
        infraccionBase({
          unidadId: unidadIdSeed(),
          danoDirecto: { descripcionDaño: "Espejo roto", costoReparacion: 45000 },
          evidencias: [evidencia],
        })
      )
      expect(ambos.ok).toBe(false)

      const fantasma = getState().saveInfraccionIN(infraccionBase({ unidadId: unidadIdSeed(), tipoInfraccionId: "tipo-in-fantasma" }))
      expect(fantasma.ok).toBe(false)
    })

    it("cobro directo por daños exige descripción, costo y evidencia", () => {
      const sinEvidencia = getState().saveInfraccionIN(
        infraccionBase({ unidadId: unidadIdSeed(), tipoInfraccionId: undefined, danoDirecto: { descripcionDaño: "Rotura espejo ascensor", costoReparacion: 80000 }, evidencias: [] })
      )
      expect(sinEvidencia.ok).toBe(false)
      expect(sinEvidencia.error).toContain("evidencia")

      const completo = getState().saveInfraccionIN(
        infraccionBase({ id: "in-dano", unidadId: unidadIdSeed(), tipoInfraccionId: undefined, danoDirecto: { descripcionDaño: "Rotura espejo ascensor", costoReparacion: 80000 }, evidencias: [evidencia] })
      )
      expect(completo.ok).toBe(true)
    })

    it("valida FKs de unidad, reportante y mensaje CO", () => {
      expect(getState().saveInfraccionIN(infraccionBase({ unidadId: "u-fantasma" })).ok).toBe(false)
      expect(getState().saveInfraccionIN(infraccionBase({ unidadId: unidadIdSeed(), reportantePersonaId: "p-fantasma" })).ok).toBe(false)
      expect(getState().saveInfraccionIN(infraccionBase({ unidadId: unidadIdSeed(), mensajeBuzonId: "buz-fantasma" })).ok).toBe(false)
    })

    it("nace desde reclamo verídico del buzón CO", () => {
      const rBuzon = getState().saveMensajeBuzonCO({
        id: "buz-in-link",
        folio: "",
        clasificacion: "reclamo",
        reportanteNombre: "Test Vecino",
        asunto: "Ruidos molestos reiterados",
        cuerpo: "Fiestas hasta las 3 AM en el piso 4 todos los fines de semana.",
        visibilidadComite: true,
        fechaIngreso: "2026-08-25",
        estado: "recibido",
        respuestas: [],
      })
      expect(rBuzon.ok).toBe(true)
      const r = getState().saveInfraccionIN(
        infraccionBase({ id: "in-co", unidadId: unidadIdSeed(), tipoInfraccionId: "tipo-in-ruidos", mensajeBuzonId: "buz-in-link" })
      )
      expect(r.ok).toBe(true)
      expect(getState().infraccionesIN.find(i => i.id === "in-co")?.mensajeBuzonId).toBe("buz-in-link")
    })
  })

  describe("ciclo apelación / aplicación / desestimación", () => {
    beforeEach(() => {
      getState().savePersona(personaBase({}))
      getState().savePersona(personaBase({ id: "p-in-directivo", roles: ["directiva"], datosGobernanza: { id: "gob-in-1", cargoDirectiva: "tesorero", fechaAsuncion: "2026-08-01" } }))
      getState().saveInfraccionIN(infraccionBase({ unidadId: unidadIdSeed() }))
    })

    it("apelación registra descargos y transiciona a Apelada", () => {
      const cortos = getState().apelarInfraccionIN("in-1", "no fue")
      expect(cortos.ok).toBe(false)

      const r = getState().apelarInfraccionIN("in-1", "Mi mascota siempre usa correa; las cámaras lo demuestran.")
      expect(r.ok).toBe(true)
      const infraccion = getState().infraccionesIN.find(i => i.id === "in-1")!
      expect(infraccion.estado).toBe("apelada")
      expect(infraccion.apelacion?.descargos).toContain("correa")
      expect(getState().eventos.filter(e => e.tipoAccion === "IN_APELACION")).toHaveLength(1)

      // Doble apelación rechazada.
      expect(getState().apelarInfraccionIN("in-1", "Segunda apelación adicional.").ok).toBe(false)
    })

    it("multa grave sin respaldo directiva bloqueada; con respaldo se aplica", () => {
      // Leve: aplica sin respaldo.
      const leve = getState().aplicarInfraccionIN("in-1")
      expect(leve.ok).toBe(true)
      let infraccion = getState().infraccionesIN.find(i => i.id === "in-1")!
      expect(infraccion.estado).toBe("aplicada")
      expect(infraccion.montoAplicado).toBe(15000)
      expect(getState().eventos.filter(e => e.tipoAccion === "IN_APPLY_FINE")).toHaveLength(1)

      // FI conectado: la multa aplicada materializa un cobro real en el libro.
      expect(String(infraccion.cargoFIReferencia)).toMatch(/^cob-/)
      const cobroMulta = getState().cobrosFI.find(c => c.id === infraccion.cargoFIReferencia)!
      expect(cobroMulta.concepto).toBe("multa_in")
      expect(cobroMulta.montoBase).toBe(15000)
      expect(cobroMulta.origenRef).toBe("in-1")

      // Grave sin respaldo.
      getState().saveInfraccionIN(infraccionBase({ id: "in-grave", unidadId: unidadIdSeed(), tipoInfraccionId: "tipo-in-ruidos" }))
      const sinRespaldo = getState().aplicarInfraccionIN("in-grave")
      expect(sinRespaldo.ok).toBe(false)
      expect(sinRespaldo.error).toContain("respaldo")

      // Respaldo por no-directiva falla.
      const falsoDirector = getState().respaldarInfraccionIN("in-grave", "p-in-1")
      expect(falsoDirector.ok).toBe(false)

      // Respaldo válido → aplica.
      expect(getState().respaldarInfraccionIN("in-grave", "p-in-directivo").ok).toBe(true)
      expect(getState().respaldarInfraccionIN("in-grave", "p-in-directivo").ok).toBe(false)
      const aplicada = getState().aplicarInfraccionIN("in-grave")
      expect(aplicada.ok).toBe(true)
      infraccion = getState().infraccionesIN.find(i => i.id === "in-grave")!
      expect(infraccion.montoAplicado).toBe(50)
      expect(String(infraccion.cargoFIReferencia)).toMatch(/^cob-/)
    })

    it("desestimación exige justificación", () => {
      const vacia = getState().desestimarInfraccionIN("in-1", "")
      expect(vacia.ok).toBe(false)

      const r = getState().desestimarInfraccionIN("in-1", "Evidencia insuficiente tras revisión de cámaras.")
      expect(r.ok).toBe(true)
      const infraccion = getState().infraccionesIN.find(i => i.id === "in-1")!
      expect(infraccion.estado).toBe("desestimada")

      // Resuelta no admite segunda resolución.
      expect(getState().aplicarInfraccionIN("in-1").ok).toBe(false)
    })


    it("removeInfraccionIN elimina el registro", () => {
      expect(getState().removeInfraccionIN("in-1").ok).toBe(true)
      expect(getState().infraccionesIN).toHaveLength(0)
    })
  })
})
