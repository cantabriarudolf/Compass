import { describe, it, expect, beforeEach } from "vitest"
import { useCompassStore, STORE_VERSION, seedData } from "@/lib/store"
import type { Persona } from "@/lib/schemas"
import {
  valorHoraExtra,
  montoHorasExtra,
  gratificacionLegal,
  descuentoAFP,
  descuentoSalud,
  asignacionFamiliarMonto,
  calcularLiquidacion,
} from "@/lib/pl-utils"
import { resetStore, lastEvent } from "./helpers"

const getState = () => useCompassStore.getState()
const migrate = useCompassStore.persist.getOptions().migrate

function fichaConSueldo(overrides: Partial<NonNullable<Persona["datosLaborales"]>> = {}): NonNullable<Persona["datosLaborales"]> {
  return {
    id: "l-test",
    cargo: "Conserje TEST",
    afp: "Habitat",
    prevision: "FONASA",
    fechaIngreso: "2025-01-01",
    tipoContrato: "indefinido",
    afpId: "afp-habitat",
    saludId: "fonasa",
    bancoId: "banco-estado",
    jornadaBaseHoras: 45,
    sueldoBase: 600000,
    ...overrides,
  }
}

function personaTrabajador(id = "p-4", ficha = fichaConSueldo()): Persona {
  const base = getState().personas.find(p => p.id === id)!
  return { ...base, datosLaborales: ficha }
}

describe("PL - cálculos puros", () => {
  it("valor hora extra §1.1: diario → semanal → ordinaria (recargo se aplica aparte)", () => {
    // 600000 / 30 días × 7 / 45 h = 3111.11 → 3111
    expect(valorHoraExtra(600000, 30, 45)).toBe(3111)
    expect(valorHoraExtra(0, 30, 45)).toBe(0)
  })

  it("monto horas extra aplica recargo 50%", () => {
    // 3111 × 1.5 × 2 = 9333
    expect(montoHorasExtra(600000, 30, 45, 2)).toBe(9333)
    expect(montoHorasExtra(600000, 30, 45, 0)).toBe(0)
  })

  it("gratificación legal con tope factor×IMM/12", () => {
    // 25% de 600000 = 150000 < tope 4.75×500000/12=197916
    expect(gratificacionLegal(600000, 500000, 4.75)).toBe(150000)
    // imponible alto: 25% de 2000000 = 500000 > tope → capped
    expect(gratificacionLegal(2000000, 500000, 4.75)).toBe(197917)
  })

  it("descuentos AFP, salud Fonasa/Isapre y asignación familiar", () => {
    expect(descuentoAFP(600000, 10.58)).toBe(63480)
    expect(descuentoSalud(600000, { tipo: "fonasa", ufVigente: 39000 })).toBe(42000)
    expect(descuentoSalud(600000, { tipo: "isapre", valorUF: 3, ufVigente: 39000 })).toBe(117000)
    expect(descuentoSalud(600000, { tipo: "isapre", porcentaje: 8, ufVigente: 39000 })).toBe(48000)
    expect(asignacionFamiliarMonto(20622, 2)).toBe(41244)
    expect(asignacionFamiliarMonto(20622, 0)).toBe(0)
  })

  it("calcularLiquidacion arma totales de control completos", () => {
    const r = calcularLiquidacion({
      sueldoBaseContrato: 600000,
      diasTrabajados: 30,
      diasMesComercial: 30,
      jornadaSemanal: 45,
      horasExtrasHoras: 2,
      bonos: [{ id: "b1", glosa: "Aguinaldo", monto: 50000, imponible: false }],
      asignacionMovilizacion: 30000,
      asignacionColacion: 40000,
      montoAsignacionFamiliar: 20622,
      tasaAFP: 10.58,
      saludPlan: { tipo: "fonasa", ufVigente: 39000 },
      ufVigente: 39000,
      ingresoMinimoMensual: 500000,
      topeGratificacionLegal: 4.75,
      tasaSIS: 1.48,
      tasaSeguroCesantia: 0.6,
      esHonorarios: false,
      montoAPV: 10000,
      anticiposPendientes: [{ id: "a1", monto: 80000 }],
    })
    // imponible sin grat: 600000 + 9333 = 609333; grat = min(152333, 197916) = 152333
    expect(r.totalImponible).toBe(761666)
    // haberes = imponible + 30000 + 40000 + 20622 + 50000
    expect(r.totalHaberes).toBe(902288)
    // descuentos legales = AFP 80584 + salud 53317 + SIS 11273 + cesantía 4570 + APV 10000
    expect(r.montoAFP).toBe(80584)
    expect(r.montoSalud).toBe(53317)
    expect(r.totalDescuentos).toBe(159744)
    // alcance = haberes - descuentos; líquido = alcance - anticipos 80000
    expect(r.alcanceLiquido).toBe(742544)
    expect(r.descuentoAnticipos).toBe(80000)
    expect(r.liquidoAPagar).toBe(662544)
  })
})

describe("PL - store y acciones", () => {
  beforeEach(resetStore)






  it("adelantos: folio ADE, notificación email_simulado, glosa obligatoria y ciclo", () => {
    expect(getState().savePersona(personaTrabajador()).ok).toBe(true)
    const hoy = new Date().toISOString().slice(0, 10)
    const corto = getState().saveAdelantoPL({
      id: "ade-x", folio: "", trabajadorPersonaId: "p-4", fecha: hoy, monto: 50000, glosa: "abc", estado: "pendiente",
    })
    expect(corto.ok).toBe(false)
    expect(corto.error).toContain("glosa")
    const ok = getState().saveAdelantoPL({
      id: "ade-ok", folio: "", trabajadorPersonaId: "p-4", fecha: hoy, monto: 50000, glosa: "Gasto urgente del hogar", estado: "pendiente",
    })
    expect(ok.ok).toBe(true)
    const ade = getState().adelantosPL.find(a => a.id === "ade-ok")!
    expect(ade.folio).toMatch(/^ADE-\d{4}$/)
    expect(lastEvent()?.tipoAccion).toBe("PL_ADD_ADVANCE")
    const notif = getState().notificaciones.filter(n => n.moduloOrigen === "PL" && n.destinatarioRol === "personal")
    expect(notif.some(n => n.asunto.includes(ade.folio))).toBe(true)
    // Descontado no eliminable; pendiente sí.
    useCompassStore.setState(s => ({
      adelantosPL: s.adelantosPL.map(a => (a.id === "ade-ok" ? { ...a, estado: "descontado" as const } : a)),
    }))
    expect(getState().removeAdelantoPL("ade-ok").error).toContain("descontado")
    expect(ok.ok).toBe(true)
    const r2 = getState().saveAdelantoPL({
      id: "ade-ok2", folio: "", trabajadorPersonaId: "p-4", fecha: hoy, monto: 10000, glosa: "Otro motivo válido", estado: "pendiente",
    })
    expect(r2.ok).toBe(true)
    expect(getState().removeAdelantoPL("ade-ok2").ok).toBe(true)
  })

  it(`usa versión ${STORE_VERSION} y migrate v23 siembra colecciones PL`, async () => {
    expect(STORE_VERSION).toBeGreaterThanOrEqual(23)
    const seed = seedData()
    const prev: Record<string, unknown> = {
      personas: seed.personas,
      configuracion: seed.configuracion,
      maestros: { feriados: seed.maestros.feriados },
    }
    const result = migrate!(prev as never, 22) as Record<string, unknown>
    expect(Array.isArray(result["liquidacionesPL"])).toBe(true)
    expect(Array.isArray(result["adelantosPL"])).toBe(true)
  })
})
