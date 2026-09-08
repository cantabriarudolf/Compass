import { describe, it, expect, beforeEach } from "vitest"
import { useCompassStore } from "@/lib/store"
import type { ElementoRA, ReservaRA } from "@/lib/schemas"
import { resetStore } from "./helpers"

const getState = () => useCompassStore.getState()

const elementoBase = (partial: Partial<ElementoRA>): ElementoRA => ({
  id: "ra-el-1",
  nombre: "Quincho central TEST",
  tipo: "espacio_fisico",
  franja: "bloques_horas",
  duracionBloqueHoras: 3,
  tarifaUso: 15000,
  garantiaRequerida: 20000,
  activo: true,
  ...partial,
})

const reservaBase = (partial: Partial<ReservaRA>): ReservaRA => ({
  id: "ra-rs-1",
  folio: "",
  elementoId: "ra-el-1",
  solicitantePersonaId: getState().personas[0]!.id,
  fecha: "2026-09-10",
  horaInicio: "19:00",
  horaFin: "22:00",
  estado: "confirmada",
  montoTarifa: 0,
  montoGarantia: 0,
  ...partial,
})

describe("RA - Reservas y Amenities en el store", () => {
  beforeEach(resetStore)

  describe("saveElementoRA", () => {
    it("exige ubicación EF o IR con FKs válidas", () => {
      const sinUbicacion = getState().saveElementoRA(elementoBase({}))
      expect(sinUbicacion.ok).toBe(false)
      expect(sinUbicacion.error).toContain("ubicación")

      const microFantasma = getState().saveElementoRA(elementoBase({ microSectorId: "ms-fantasma" }))
      expect(microFantasma.ok).toBe(false)
      expect(microFantasma.error).toContain("sub-sector")

      const microSectorId = getState().microSectores[0]!.id
      const ok = getState().saveElementoRA(elementoBase({ microSectorId }))
      expect(ok.ok).toBe(true)
      expect(getState().elementosRA).toHaveLength(1)
    })

    it("bloques horarios exigen duración; stock mínimo 1", () => {
      const microSectorId = getState().microSectores[0]!.id
      const sinDuracion = getState().saveElementoRA(elementoBase({ microSectorId, duracionBloqueHoras: undefined }))
      expect(sinDuracion.ok).toBe(false)

      const stockCero = getState().saveElementoRA(elementoBase({ microSectorId, tipo: "activo_mobiliario", stock: 0 }))
      expect(stockCero.ok).toBe(false)
    })

    it("removeElementoRA bloqueado con reservas no canceladas", () => {
      const microSectorId = getState().microSectores[0]!.id
      getState().saveElementoRA(elementoBase({ microSectorId }))
      getState().saveReservaRA(reservaBase({}))
      const r = getState().removeElementoRA("ra-el-1")
      expect(r.ok).toBe(false)
      expect(r.error).toContain("reserva")

      getState().cancelarReservaRA("ra-rs-1")
      expect(getState().removeElementoRA("ra-el-1").ok).toBe(true)
    })
  })

  describe("saveReservaRA", () => {
    beforeEach(() => {
      getState().saveElementoRA(elementoBase({ microSectorId: getState().microSectores[0]!.id }))
    })

    it("confirma con folio RA único y snapshots de tarifa/garantía del elemento", () => {
      const r1 = getState().saveReservaRA(reservaBase({}))
      const r2 = getState().saveReservaRA(reservaBase({ id: "ra-rs-2", fecha: "2026-09-11" }))
      expect(r1.ok).toBe(true)
      expect(r2.ok).toBe(true)
      expect(getState().reservasRA.map(x => x.folio)).toEqual(["RA-0001", "RA-0002"])
      const primera = getState().reservasRA[0]!
      expect(primera.montoTarifa).toBe(15000)
      expect(primera.montoGarantia).toBe(20000)
      expect(String(primera.cargoFIReferencia)).toMatch(/^cob-/)
      const cobroTarifa = getState().cobrosFI.find(c => c.id === primera.cargoFIReferencia)!
      expect(cobroTarifa.concepto).toBe("reserva_ra")
      expect(cobroTarifa.fondoId).toBe(getState().fondosFI.find(f => f.tipo === "amenities")!.id)
      expect(getState().eventos.filter(e => e.tipoAccion === "RA_BOOKING_CREATED")).toHaveLength(2)
    })

    it("valida FKs de elemento, solicitante y unidad", () => {
      const fantasma = getState().saveReservaRA(reservaBase({ elementoId: "no-existe" }))
      expect(fantasma.ok).toBe(false)

      const inactiva = getState().personas.find(p => p.estadoCuenta !== "activa")
      if (inactiva) {
        const conInactiva = getState().saveReservaRA(reservaBase({ solicitantePersonaId: inactiva.id }))
        expect(conInactiva.ok).toBe(false)
        expect(conInactiva.error).toContain("activa")
      }

      const unidadFantasma = getState().saveReservaRA(reservaBase({ unidadId: "u-fantasma" }))
      expect(unidadFantasma.ok).toBe(false)
    })

    it("rechaza tramos invertidos y solapamientos (overbooking)", () => {
      const invertido = getState().saveReservaRA(reservaBase({ horaInicio: "22:00", horaFin: "19:00" }))
      expect(invertido.ok).toBe(false)
      expect(invertido.error).toContain("tramo horario")

      expect(getState().saveReservaRA(reservaBase({})).ok).toBe(true)
      const solapado = getState().saveReservaRA(reservaBase({ id: "ra-rs-2", horaInicio: "20:00", horaFin: "23:00" }))
      expect(solapado.ok).toBe(false)
      expect(solapado.error).toContain("Conflicto horario")

      // Tramo contiguo [22:00, 23:00) no se solapa con [19:00, 22:00) → confirmable.
      const contiguo = getState().saveReservaRA(reservaBase({ id: "ra-rs-3", horaInicio: "22:00", horaFin: "23:00" }))
      expect(contiguo.ok).toBe(true)
    })

    it("stock absorbe reservas paralelas hasta agotarse", () => {
      getState().saveElementoRA(
        elementoBase({
          id: "ra-el-hl",
          nombre: "Hidrolavadora TEST",
          tipo: "activo_mobiliario",
          activoIRId: undefined,
          microSectorId: getState().microSectores[0]!.id,
          stock: 2,
          tarifaUso: 5000,
          garantiaRequerida: 30000,
        })
      )
      expect(getState().saveReservaRA(reservaBase({ elementoId: "ra-el-hl" })).ok).toBe(true)
      expect(getState().saveReservaRA(reservaBase({ id: "ra-rs-2", elementoId: "ra-el-hl" })).ok).toBe(true)
      const tercera = getState().saveReservaRA(reservaBase({ id: "ra-rs-3", elementoId: "ra-el-hl" }))
      expect(tercera.ok).toBe(false)
      expect(tercera.error).toContain("Conflicto horario")
    })

    it("aplica anticipación mínima del elemento", () => {
      getState().saveElementoRA(
        elementoBase({
          id: "ra-el-antic",
          nombre: "Piscina TEST",
          microSectorId: getState().microSectores[0]!.id,
          anticipacionMinimaDias: 5,
          tarifaUso: 0,
        })
      )
      const manana = new Date()
      manana.setDate(manana.getDate() + 1)
      const r = getState().saveReservaRA(reservaBase({ elementoId: "ra-el-antic", fecha: manana.toISOString().slice(0, 10), montoGarantia: 0, garantiaRetenida: undefined }))
      expect(r.ok).toBe(false)
      expect(r.error).toContain("anticipación")
    })

    it("elemento inactivo no admite reservas", () => {
      getState().saveElementoRA(elementoBase({ id: "ra-el-off", nombre: "Cancha TEST", microSectorId: getState().microSectores[0]!.id, activo: false }))
      const r = getState().saveReservaRA(reservaBase({ elementoId: "ra-el-off" }))
      expect(r.ok).toBe(false)
      expect(r.error).toContain("deshabilitado")
    })
  })

  describe("cancelaciones y garantías", () => {
    beforeEach(() => {
      getState().saveElementoRA(
        elementoBase({
          cancelacionTardiaDias: 2,
          penalizacionTardiaMonto: 5000,
          microSectorId: getState().microSectores[0]!.id,
        })
      )
    })

    it("cancelación anticipada sin penalización", () => {
      // Regla de negocio (RA): una cancelación es "tardía" solo si ocurre dentro de los
      // `cancelacionTardiaDias` días previos a la fecha de la reserva (diasRestantes <= ventana).
      // Fuera de esa ventana (holgura mayor) es "anticipada" → tardia:false, sin penalización.
      // Fecha dinámica: un fixture hardcodeado envejece y eventualmente cae dentro de la ventana.
      const enTreintaDias = new Date()
      enTreintaDias.setDate(enTreintaDias.getDate() + 30)
      getState().saveReservaRA(reservaBase({ fecha: enTreintaDias.toISOString().slice(0, 10) }))
      const r = getState().cancelarReservaRA("ra-rs-1")
      expect(r.ok).toBe(true)
      const reserva = getState().reservasRA[0]!
      expect(reserva.estado).toBe("cancelada")
      expect(reserva.cancelacion?.tardia).toBe(false)
      expect(getState().eventos.filter(e => e.tipoAccion === "RA_BOOKING_CANCELLED")).toHaveLength(1)
    })

    it("cancelación tardía registra penalización con cobro FI materializado", () => {
      const ayerMenosUno = new Date()
      ayerMenosUno.setDate(ayerMenosUno.getDate() + 1)
      getState().saveReservaRA(reservaBase({ fecha: ayerMenosUno.toISOString().slice(0, 10) }))
      const r = getState().cancelarReservaRA("ra-rs-1")
      expect(r.ok).toBe(true)
      const reserva = getState().reservasRA[0]!
      expect(reserva.cancelacion?.tardia).toBe(true)
      expect(reserva.cancelacion?.penalizacion).toBe(5000)
      expect(String(reserva.cargoFIReferencia)).toMatch(/^cob-/)
      expect(getState().cobrosFI.find(c => c.id === reserva.cargoFIReferencia)?.montoBase).toBe(5000)
      expect(getState().eventos.some(e => e.tipoAccion === "RA_BOOKING_CANCELLED" && e.descripcion.includes("FUERA DE PLAZO"))).toBe(true)
    })

    it("solo reservas confirmadas pueden cancelarse", () => {
      getState().saveReservaRA(reservaBase({}))
      getState().cancelarReservaRA("ra-rs-1")
      expect(getState().cancelarReservaRA("ra-rs-1").ok).toBe(false)
    })

    it("retención de garantía única, con motivo y notificación", () => {
      getState().saveReservaRA(reservaBase({}))
      const sinMotivo = getState().retenerGarantiaRA("ra-rs-1", "   ")
      expect(sinMotivo.ok).toBe(false)

      expect(getState().retenerGarantiaRA("ra-rs-1", "Manguera fracturada al devolver el equipo.").ok).toBe(true)
      const reserva = getState().reservasRA[0]!
      expect(reserva.garantiaRetenida).toEqual({ monto: 20000, motivo: "Manguera fracturada al devolver el equipo." })
      expect(String(reserva.cargoFIReferencia)).toMatch(/^cob-/)
      expect(getState().cobrosFI.find(c => c.id === reserva.cargoFIReferencia)?.concepto).toBe("garantia_ra")
      expect(getState().eventos.filter(e => e.tipoAccion === "RA_WARRANTY_RETAINED")).toHaveLength(1)
      expect(getState().notificaciones.some(n => n.moduloOrigen === "RA")).toBe(true)

      const duplicada = getState().retenerGarantiaRA("ra-rs-1", "Segundo intento.")
      expect(duplicada.ok).toBe(false)
    })
  })
})
