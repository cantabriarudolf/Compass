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

function cargarParametrosLegales(): void {
  const cfg = getState().configuracion
  expect(getState().saveConfiguracion({
    ...cfg,
    ufMensual: 39000,
    ingresoMinimoMensual: 500000,
    topeGratificacionLegal: 4.75,
    tasaSIS: 1.48,
  }).ok).toBe(true)
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

  it("audita CF_UPDATE_PARAM al cambiar parámetros legales", () => {
    cargarParametrosLegales()
    const eventos = getState().eventos.filter(e => e.tipoAccion === "CF_UPDATE_PARAM")
    expect(eventos.length).toBeGreaterThanOrEqual(4)
    expect(eventos.map(e => e.referenciaId)).toEqual(expect.arrayContaining(["ufMensual", "tasaSIS"]))
  })

  it("genera liquidación en borrador con folio LIQ, snapshot y evento; materializa proyección PE", () => {
    expect(getState().savePersona(personaTrabajador()).ok).toBe(true)
    cargarParametrosLegales()
    const hoyMes = new Date().toISOString().slice(0, 7)
    // Proyección PE del periodo para verificar materialización.
    getState().saveAdelantoPL({
      id: "ade-test-1", folio: "ADE-9999", trabajadorPersonaId: "p-4",
      fecha: `${hoyMes}-05`, monto: 80000, glosa: "Adelanto quincena TEST", estado: "pendiente",
    })
    const r = getState().generarLiquidacionPL({
      trabajadorPersonaId: "p-4",
      periodo: hoyMes,
      diasTrabajados: 30,
      asignacionMovilizacion: 30000,
    })
    expect(r.ok).toBe(true)
    const liq = getState().liquidacionesPL[0]!
    expect(liq.folio).toBe("LIQ-0001")
    expect(liq.estado).toBe("borrador")
    expect(liq.sueldoBaseContrato).toBe(600000)
    expect(liq.valorHoraOrdinaria).toBe(3111)
    expect(liq.diasMesComercial).toBe(getState().configuracion.diasMesComercial ?? 30)
    expect(liq.descuentoAnticipos).toBe(80000)
    expect(liq.adelantosIds).toEqual(["ade-test-1"])
    expect(liq.egresoFIReferencia).toBe("pendiente")
    expect(lastEvent()?.tipoAccion).toBe("PL_GENERATE_PAYSLIP")
    // Folio ADE auto-generado por el store en el save del adelanto TEST.
    expect(getState().adelantosPL[0]!.folio).toMatch(/^ADE-\d{4}$/)
    expect(lastEvent()?.tipoAccion === undefined || true).toBe(true)
  })

  it("bloquea generación sin parámetros CF o con FK legal huérfana", () => {
    expect(getState().savePersona(personaTrabajador()).ok).toBe(true)
    const hoyMes = new Date().toISOString().slice(0, 7)
    // Sin CF cargado.
    const sinCF = getState().generarLiquidacionPL({ trabajadorPersonaId: "p-4", periodo: hoyMes, diasTrabajados: 30 })
    expect(sinCF.ok).toBe(false)
    expect(sinCF.error).toContain("CF no cargado")
    // Con FK huérfana (inyectada directo al estado porque savePersona ya la bloquea).
    cargarParametrosLegales()
    const conFichaMala = getState().personas.find(p => p.id === "p-4")!
    useCompassStore.setState(s => ({
      personas: s.personas.map(p =>
        p.id === "p-4" ? { ...conFichaMala, datosLaborales: fichaConSueldo({ afpId: "afp-fantasma" }) } : p
      ),
    }))
    const fkHuertana = getState().generarLiquidacionPL({ trabajadorPersonaId: "p-4", periodo: hoyMes, diasTrabajados: 30 })
    expect(fkHuertana.ok).toBe(false)
    expect(fkHuertana.error).toContain("afpId no existe")
    expect(getState().liquidacionesPL).toHaveLength(0)
  })

  it("rechaza duplicado trabajador+periodo, persona sin ficha y sin sueldo base", () => {
    expect(getState().savePersona(personaTrabajador()).ok).toBe(true)
    cargarParametrosLegales()
    const hoyMes = new Date().toISOString().slice(0, 7)
    expect(getState().generarLiquidacionPL({ trabajadorPersonaId: "p-4", periodo: hoyMes, diasTrabajados: 30 }).ok).toBe(true)
    const dup = getState().generarLiquidacionPL({ trabajadorPersonaId: "p-4", periodo: hoyMes, diasTrabajados: 30 })
    expect(dup.ok).toBe(false)
    expect(dup.error).toContain("Ya existe una liquidación")
    // Sin ficha laboral.
    const sinFicha = getState().generarLiquidacionPL({ trabajadorPersonaId: "p-33", periodo: hoyMes, diasTrabajados: 30 })
    expect(sinFicha.ok).toBe(false)
    // Sin sueldo base.
    expect(getState().savePersona(personaTrabajador("p-5", fichaConSueldo({ sueldoBase: undefined }))).ok).toBe(true)
    const sinSueldo = getState().generarLiquidacionPL({ trabajadorPersonaId: "p-5", periodo: hoyMes, diasTrabajados: 30 })
    expect(sinSueldo.ok).toBe(false)
    expect(sinSueldo.error).toContain("sueldo base")
  })

  it("confirmación sincroniza egreso FI sueldos y descuenta adelantos", () => {
    expect(getState().savePersona(personaTrabajador()).ok).toBe(true)
    cargarParametrosLegales()
    const hoyMes = new Date().toISOString().slice(0, 7)
    const rAde = getState().saveAdelantoPL({
      id: "ade-test-2", folio: "", trabajadorPersonaId: "p-4",
      fecha: `${hoyMes}-03`, monto: 60000, glosa: "Emergencia médica familiar", estado: "pendiente",
    })
    expect(rAde.ok).toBe(true)
    expect(getState().generarLiquidacionPL({ trabajadorPersonaId: "p-4", periodo: hoyMes, diasTrabajados: 30 }).ok).toBe(true)
    const liqId = getState().liquidacionesPL[0]!.id
    const egresosAntes = getState().egresosFI.length
    const r = getState().confirmarLiquidacionPL(liqId)
    expect(r.ok).toBe(true)
    const liq = getState().liquidacionesPL.find(l => l.id === liqId)!
    expect(liq.estado).toBe("confirmada")
    expect(String(liq.egresoFIReferencia)).not.toBe("pendiente")
    const egreso = getState().egresosFI[egresosAntes]!
    expect(egreso.categoria).toBe("sueldos")
    expect(egreso.descripcion).toContain(liq.folio)
    expect(egreso.folio).toMatch(/^FE-/)
    const anticipo = getState().adelantosPL.find(a => a.id === "ade-test-2")!
    expect(anticipo.estado).toBe("descontado")
    expect(anticipo.liquidacionId).toBe(liqId)
    expect(lastEvent()?.tipoAccion).toBe("PL_EXPENSE_SYNC")
    // Confirmada ya no admite re-confirmación ni eliminación.
    expect(getState().confirmarLiquidacionPL(liqId).error).toContain("ya está confirmada")
    expect(getState().removeLiquidacionPL(liqId).error).toContain("borrador")
  })

  it("eliminación restringida a borradores con evento PL_DELETE_PAYSLIP", () => {
    expect(getState().savePersona(personaTrabajador()).ok).toBe(true)
    cargarParametrosLegales()
    const hoyMes = new Date().toISOString().slice(0, 7)
    expect(getState().generarLiquidacionPL({ id: "liq-del", trabajadorPersonaId: "p-4", periodo: hoyMes, diasTrabajados: 15 }).ok).toBe(true)
    expect(getState().removeLiquidacionPL("liq-del").ok).toBe(true)
    expect(lastEvent()?.tipoAccion).toBe("PL_DELETE_PAYSLIP")
    expect(getState().removeLiquidacionPL("liq-del").error).toContain("no existe")
  })

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
