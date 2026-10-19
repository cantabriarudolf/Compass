import { describe, it, expect, beforeEach } from "vitest"
import { useCompassStore } from "@/lib/store"
import type {
  CobroFI,
  ElementoRA,
  InfraccionIN,
  ReservaRA,
} from "@/lib/schemas"
import { resetStore, lastEvent } from "./helpers"

/**
 * Fase E de cobertura del store legacy (SERIE-DEUDA-2 D5, change
 * `store-cobertura-fase-e`): remanente de `apelarInfraccionIN`,
 * `removeTipoInfraccionIN`, `saveReservaRA`, `cancelarReservaRA`,
 * `retenerGarantiaRA`, `removeAdelantoPL`, `removeCertificadoCT` y
 * `emitirGastoComun`.
 */
const getState = () => useCompassStore.getState()

const evidencia = {
  nombre: "foto-e.jpg",
  tipoMime: "image/jpeg",
  tamanoKB: 90,
  url: "https://placeholder.supabase.co/foto-e.jpg",
}

const infraccionBase = (partial: Partial<InfraccionIN>): InfraccionIN => ({
  id: "in-e-1",
  folio: "",
  tipoInfraccionId: "tipo-in-mascotas",
  unidadId: getState().unidades[0]!.id,
  fechaSuceso: "2026-08-24",
  horaSuceso: "21:30",
  antecedentes:
    "Mascota sin correa reiteradamente en el jardín central según testimonios.",
  evidencias: [evidencia],
  estado: "en_revision",
  fechaRegistro: "2026-08-25",
  comentariosDirectiva: [],
  respaldosDirectiva: [],
  ...partial,
})

const elementoBase = (partial: Partial<ElementoRA>): ElementoRA => ({
  id: "ra-e-e-1",
  nombre: "Quincho TEST E",
  tipo: "espacio_fisico",
  franja: "bloques_horas",
  duracionBloqueHoras: 3,
  tarifaUso: 0,
  garantiaRequerida: 20000,
  activo: true,
  microSectorId: getState().microSectores[0]!.id,
  ...partial,
})

function fechaFutura(dias: number): string {
  const d = new Date()
  d.setDate(d.getDate() + dias)
  return d.toISOString().slice(0, 10)
}

const reservaBase = (partial: Partial<ReservaRA>): ReservaRA => ({
  id: "ra-rs-e-1",
  folio: "",
  elementoId: "ra-e-e-1",
  solicitantePersonaId: "p-1",
  fecha: fechaFutura(30),
  horaInicio: "19:00",
  horaFin: "22:00",
  estado: "confirmada",
  montoTarifa: 0,
  montoGarantia: 0,
  ...partial,
})

function periodoActual(): string {
  return new Date().toISOString().slice(0, 7)
}

function unidadConPropietario(): { unidadId: string } | null {
  const s = getState()
  const propietario = s.vinculos.find(
    (v) => v.rol === "propietario" && !v.fechaFin && !v.unidadId.startsWith("u-E-")
  )
  return propietario ? { unidadId: propietario.unidadId } : null
}

// --- IN: Infracciones y Multas ---

describe("apelarInfraccionIN — infracción ausente y mapa con otros registros", () => {
  beforeEach(() => resetStore())

  it("rechaza apelar una infracción que no existe", () => {
    const r = getState().apelarInfraccionIN(
      "in-nadie",
      "Descargos suficientemente detallados del vecino TEST."
    )
    expect(r.ok).toBe(false)
    expect(r.ok === false && r.error).toContain("la infracción no existe")
  })

  it("apela la indicada y preserva las demás (rama sin match del map)", () => {
    expect(getState().saveInfraccionIN(infraccionBase({ id: "in-e-a" })).ok).toBe(
      true
    )
    expect(getState().saveInfraccionIN(infraccionBase({ id: "in-e-b" })).ok).toBe(
      true
    )
    const r = getState().apelarInfraccionIN(
      "in-e-a",
      "Descargos del vecino con detalle suficiente para la directiva."
    )
    expect(r.ok).toBe(true)
    const apelada = getState().infraccionesIN.find((x) => x.id === "in-e-a")!
    expect(apelada.estado).toBe("apelada")
    expect(apelada.apelacion?.descargos).toContain("Descargos del vecino")
    const intacta = getState().infraccionesIN.find((x) => x.id === "in-e-b")!
    expect(intacta.estado).toBe("en_revision")
    expect(lastEvent()?.tipoAccion).toBe("IN_APELACION")
  })
})

describe("removeTipoInfraccionIN — tipo libre", () => {
  beforeEach(() => resetStore())

  it("elimina un tipo que no referencia ninguna infracción", () => {
    const r = getState().removeTipoInfraccionIN("tipo-in-mascotas")
    expect(r.ok).toBe(true)
    expect(
      getState().tiposInfraccionIN.some((t) => t.id === "tipo-in-mascotas")
    ).toBe(false)
    expect(getState().tiposInfraccionIN.length).toBeGreaterThanOrEqual(4)
  })
})

// --- RA: Reservas y Amenities ---

describe("saveReservaRA — solicitante ausente en MP", () => {
  beforeEach(() => resetStore())

  it("rechaza una reserva cuyo solicitante no existe", () => {
    expect(
      getState().saveElementoRA(elementoBase({})).ok
    ).toBe(true)
    const r = getState().saveReservaRA(
      reservaBase({ solicitantePersonaId: "p-nadie" })
    )
    expect(r.ok).toBe(false)
    expect(r.ok === false && r.error).toContain("el solicitante no existe")
    expect(getState().reservasRA).toHaveLength(0)
  })
})

describe("cancelarReservaRA — reserva ausente", () => {
  beforeEach(() => resetStore())

  it("rechaza cancelar una reserva que no existe", () => {
    const r = getState().cancelarReservaRA("ra-nadie")
    expect(r.ok).toBe(false)
    expect(r.ok === false && r.error).toContain("la reserva no existe")
  })
})

describe("retenerGarantiaRA — retención sin fondo de amenities", () => {
  beforeEach(() => resetStore())

  it("retiene la garantía sin materializar cargo cuando no hay fondo activo", () => {
    expect(getState().saveElementoRA(elementoBase({})).ok).toBe(true)
    expect(getState().saveReservaRA(reservaBase({})).ok).toBe(true)
    // Sin fondo de amenities activo no hay cargo FI que materializar.
    const s = getState()
    useCompassStore.setState({
      fondosFI: s.fondosFI.filter((f) => f.tipo !== "amenities"),
    })
    const r = getState().retenerGarantiaRA(
      "ra-rs-e-1",
      "Rotura de mobiliario TEST"
    )
    expect(r.ok).toBe(true)
    const reserva = getState().reservasRA.find((x) => x.id === "ra-rs-e-1")!
    expect(reserva.garantiaRetenida?.motivo).toBe("Rotura de mobiliario TEST")
    expect(reserva.cargoFIReferencia).toBeUndefined()
    expect(
      getState().cobrosFI.some((c: CobroFI) => c.concepto === "garantia_ra")
    ).toBe(false)
    expect(lastEvent()?.tipoAccion).toBe("RA_WARRANTY_RETAINED")
  })
})

// --- PL: Remuneraciones ---

describe("removeAdelantoPL — adelanto ausente", () => {
  beforeEach(() => resetStore())

  it("rechaza eliminar un adelanto que no existe", () => {
    const r = getState().removeAdelantoPL("ade-nadie")
    expect(r.ok).toBe(false)
    expect(r.ok === false && r.error).toContain("el adelanto no existe")
  })
})

// --- CT: Certificados ---

describe("removeCertificadoCT — certificado ausente", () => {
  beforeEach(() => resetStore())

  it("rechaza eliminar un certificado que no existe", () => {
    const r = getState().removeCertificadoCT("test-nadie")
    expect(r.ok).toBe(false)
    expect(r.ok === false && r.error).toContain("el certificado no existe")
  })
})

// --- FI: Gasto Común ---

describe("emitirGastoComun — emisión sin aporte al fondo de reserva", () => {
  beforeEach(() => resetStore())

  it("emite sin aporte cuando no hay fondo de reserva activo con porcentaje", () => {
    const objetivo = unidadConPropietario()
    expect(objetivo).not.toBeNull()
    const s = getState()
    useCompassStore.setState({
      fondosFI: s.fondosFI.filter(
        (f) => !(f.tipo === "reserva" && (f.porcentajeAporte ?? 0) > 0)
      ),
    })
    const r = getState().emitirGastoComun({
      periodo: periodoActual(),
      gastoTotal: 250000,
      unidadIds: [objetivo!.unidadId],
    })
    expect(r.ok).toBe(true)
    const emision = getState().emisionesGC[0]!
    expect(emision.fondoReservaAporte).toBeUndefined()
    expect(emision.lineas.length).toBeGreaterThan(0)
  })
})
