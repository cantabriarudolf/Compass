import { describe, it, expect, beforeEach } from "vitest"
import { useCompassStore, STORE_VERSION } from "@/lib/store"
import { saldoFondo } from "@/lib/finanzas-utils"
import { resetStore } from "./helpers"

const getState = () => useCompassStore.getState()
const migrate = useCompassStore.persist.getOptions().migrate

describe("FI - Ingreso manual a fondo y saldoInicial", () => {
  beforeEach(resetStore)

  it("usa STORE_VERSION 27", () => {
    expect(STORE_VERSION).toBe(27)
  })

  it("registrar ingreso OK persiste y saldoFondo refleja", () => {
    const r = getState().registrarIngresoFI({ fecha: "2026-09-01", monto: 50000, concepto: "Aporte extraordinario", fondoId: "fondo-gc" })
    expect(r.ok).toBe(true)
    expect(getState().ingresosFI).toHaveLength(1)
    expect(getState().ingresosFI[0]!.concepto).toBe("Aporte extraordinario")
    expect(getState().eventos.some(e => e.tipoAccion === "FI_INGRESO_REGISTRADO")).toBe(true)
    const saldo = saldoFondo("fondo-gc", {
      cobros: getState().cobrosFI,
      egresos: getState().egresosFI,
      emisiones: getState().emisionesGC,
      ingresosFI: getState().ingresosFI,
      saldoInicialPorFondo: {},
    })
    expect(saldo).toBe(50000)
  })

  it("fondo inexistente → error y no muta", () => {
    const antes = getState().ingresosFI.length
    const r = getState().registrarIngresoFI({ fecha: "2026-09-01", monto: 1000, concepto: "X", fondoId: "fondo-fantasma" })
    expect(r.ok).toBe(false)
    expect(r.error).toContain("fondo")
    expect(getState().ingresosFI).toHaveLength(antes)
  })

  it("monto ≤0 → error zod y no muta", () => {
    const r1 = getState().registrarIngresoFI({ fecha: "2026-09-01", monto: 0, concepto: "X", fondoId: "fondo-gc" })
    expect(r1.ok).toBe(false)
    const r2 = getState().registrarIngresoFI({ fecha: "2026-09-01", monto: -100, concepto: "X", fondoId: "fondo-gc" })
    expect(r2.ok).toBe(false)
    expect(getState().ingresosFI).toHaveLength(0)
  })

  it("concepto vacío → error zod", () => {
    const r = getState().registrarIngresoFI({ fecha: "2026-09-01", monto: 1000, concepto: "", fondoId: "fondo-gc" })
    expect(r.ok).toBe(false)
  })

  it("evento FI_INGRESO_REGISTRADO queda auditado", () => {
    getState().registrarIngresoFI({ fecha: "2026-09-02", monto: 75000, concepto: "Multa", fondoId: "fondo-gc", familia: "Multas" })
    const ev = getState().eventos.find(e => e.tipoAccion === "FI_INGRESO_REGISTRADO")
    expect(ev).toBeDefined()
    expect(ev!.categoria).toBe("FI")
  })

  it("saldoInicial suma al saldo sin romper compatibilidad", () => {
    // Fondo con apertura 17082694 y movimientos netos 0 debería dar 17082694
    const fondoId = "fondo-gc"
    const saldoSinApertura = saldoFondo(fondoId, { cobros: [], egresos: [], emisiones: [], ingresosFI: [], saldoInicialPorFondo: {} })
    expect(saldoSinApertura).toBe(0)
    const saldoConApertura = saldoFondo(fondoId, { cobros: [], egresos: [], emisiones: [], ingresosFI: [], saldoInicialPorFondo: { [fondoId]: 17082694 } })
    expect(saldoConApertura).toBe(17082694)
    // Con egreso 50000 y apertura 100000 => 50000
    const saldoNeto = saldoFondo(fondoId, {
      cobros: [],
      egresos: [{ fondoId, monto: 50000 } as never],
      emisiones: [],
      ingresosFI: [],
      saldoInicialPorFondo: { [fondoId]: 100000 },
    })
    expect(saldoNeto).toBe(50000)
    // default 0 mantiene resultados previos: sin param el cálculo antiguo daba 0 con ingresosCobros+aportes-egresos
    const ingres = [{ fondoId, monto: 30000 } as never]
    const saldoConIng = saldoFondo(fondoId, { cobros: [], egresos: [], emisiones: [], ingresosFI: ingres, saldoInicialPorFondo: undefined })
    expect(saldoConIng).toBe(30000)
  })

  it("saldoInicial configurable 0 vs ajustado (versátil)", () => {
    const fondoId = "fondo-gc"
    // Simula flujo neto -17082694: egresos 62M, ingresos 45M
    const egresos = [{ fondoId, monto: 62491011 } as never]
    const ingresos = [{ fondoId, monto: 45408317 } as never]
    const saldoFielFlujo = saldoFondo(fondoId, { cobros: [], egresos, emisiones: [], ingresosFI: ingresos, saldoInicialPorFondo: { [fondoId]: 0 } })
    expect(saldoFielFlujo).toBe(-17082694)
    const saldoCuadrado = saldoFondo(fondoId, { cobros: [], egresos, emisiones: [], ingresosFI: ingresos, saldoInicialPorFondo: { [fondoId]: 17082694 } })
    expect(saldoCuadrado).toBe(0)
  })

  it("saveFondoFI persiste saldoInicial y saldoDe lo usa", () => {
    const r = getState().saveFondoFI({ id: "fondo-gc", nombre: "Fondo de Gasto Común", tipo: "gasto_comun", activo: true, saldoInicial: 12345 })
    expect(r.ok).toBe(true)
    const f = getState().fondosFI.find(x => x.id === "fondo-gc")!
    expect(f.saldoInicial).toBe(12345)
    const saldo = saldoFondo("fondo-gc", {
      cobros: getState().cobrosFI,
      egresos: getState().egresosFI,
      emisiones: getState().emisionesGC,
      ingresosFI: getState().ingresosFI,
      saldoInicialPorFondo: Object.fromEntries(getState().fondosFI.map(x => [x.id, x.saldoInicial ?? 0])),
    })
    expect(saldo).toBe(12345)
  })

  it("removeIngresoFI paridad con removeEgresoFI", () => {
    getState().registrarIngresoFI({ fecha: "2026-09-01", monto: 1000, concepto: "A", fondoId: "fondo-gc" })
    const id = getState().ingresosFI[0]!.id
    expect(getState().removeIngresoFI(id).ok).toBe(true)
    expect(getState().ingresosFI).toHaveLength(0)
  })

  it("migración v26→v27 idempotente asegura ingresosFI []", () => {
    const prev = { fondosFI: getState().fondosFI, egresosFI: [] }
    const r1 = migrate!(prev as never, 26) as unknown as Record<string, unknown>
    expect(Array.isArray(r1["ingresosFI"])).toBe(true)
    expect((r1["ingresosFI"] as unknown[]).length).toBe(0)
    const r2 = migrate!(r1 as never, 26) as unknown as Record<string, unknown>
    expect((r2["ingresosFI"] as unknown[]).length).toBe(0)
    // con fondo con saldoInicial preservado
    const prev2 = { fondosFI: [{ id: "fondo-gc", nombre: "X", tipo: "gasto_comun", activo: true, saldoInicial: 999 }], ingresosFI: [] as never[] }
    const r3 = migrate!(prev2 as never, 26) as unknown as { fondosFI: { saldoInicial?: number }[] }
    expect(r3.fondosFI[0]!.saldoInicial).toBe(999)
  })

  it("hydrated gate en registrarIngresoFI", () => {
    useCompassStore.setState({ hasHydrated: false })
    const r = getState().registrarIngresoFI({ fecha: "2026-09-01", monto: 1000, concepto: "X", fondoId: "fondo-gc" })
    expect(r.ok).toBe(false)
    expect(r.error).toContain("hidratando")
    useCompassStore.setState({ hasHydrated: true })
  })
})
