import { describe, it, expect, beforeEach } from "vitest"
import { useCompassStore, STORE_VERSION } from "@/lib/store"
import { saldoFondo } from "@/lib/finanzas-utils"
import { resetStore } from "./helpers"

const getState = () => useCompassStore.getState()
const migrate = useCompassStore.persist.getOptions().migrate

describe("FI - Ingreso manual a fondo y saldoInicial", () => {
  beforeEach(resetStore)

  it("usa STORE_VERSION 28", () => {
    expect(STORE_VERSION).toBe(28)
  })

  it("registrar ingreso OK persiste y saldoFondo refleja (con punto cero)", () => {
    const antes = getState().ingresosFI.length // 44 del punto cero (1 con monto 0 filtrado)
    expect(antes).toBe(44)
    const r = getState().registrarIngresoFI({ fecha: "2026-09-01", monto: 50000, concepto: "Aporte extraordinario", fondoId: "fondo-gc" })
    expect(r.ok).toBe(true)
    expect(getState().ingresosFI).toHaveLength(45)
    expect(getState().ingresosFI.some(i => i.concepto === "Aporte extraordinario")).toBe(true)
    expect(getState().eventos.some(e => e.tipoAccion === "FI_INGRESO_REGISTRADO")).toBe(true)
    const saldo = saldoFondo("fondo-gc", {
      cobros: getState().cobrosFI.filter(c => c.fondoId === "fondo-gc"),
      egresos: getState().egresosFI.filter(e => e.fondoId === "fondo-gc"),
      emisiones: getState().emisionesGC,
      ingresosFI: getState().ingresosFI.filter(i => i.fondoId === "fondo-gc"),
      saldoInicialPorFondo: {},
    })
    // Con punto cero, fondo-gc tiene 0 ingresos/egresos históricos (van a CC), así que saldo es solo el nuevo
    expect(saldo).toBe(50000)
  })

  it("fondo inexistente → error y no muta", () => {
    const antes = getState().ingresosFI.length
    const r = getState().registrarIngresoFI({ fecha: "2026-09-01", monto: 1000, concepto: "X", fondoId: "fondo-fantasma" })
    expect(r.ok).toBe(false)
    expect(r.error).toContain("fondo")
    expect(getState().ingresosFI).toHaveLength(antes)
  })

  it("monto ≤0 → error zod y no muta (mantiene punto cero)", () => {
    const antes = getState().ingresosFI.length
    expect(antes).toBe(44)
    const r1 = getState().registrarIngresoFI({ fecha: "2026-09-01", monto: 0, concepto: "X", fondoId: "fondo-gc" })
    expect(r1.ok).toBe(false)
    const r2 = getState().registrarIngresoFI({ fecha: "2026-09-01", monto: -100, concepto: "X", fondoId: "fondo-gc" })
    expect(r2.ok).toBe(false)
    expect(getState().ingresosFI).toHaveLength(44)
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

  it("removeIngresoFI paridad con removeEgresoFI (con punto cero)", () => {
    const base = getState().ingresosFI.length // 44
    getState().registrarIngresoFI({ fecha: "2026-09-01", monto: 1000, concepto: "A", fondoId: "fondo-gc" })
    expect(getState().ingresosFI).toHaveLength(45)
    const nuevoId = getState().ingresosFI.find(i => i.concepto === "A")!.id
    expect(getState().removeIngresoFI(nuevoId).ok).toBe(true)
    expect(getState().ingresosFI).toHaveLength(44)
    expect(base).toBe(44)
  })

  it("migración v26→v27 idempotente asegura punto cero inyectado (182+44) y preserva saldoInicial", () => {
    const prev = { fondosFI: getState().fondosFI.filter(f=> f.id !== "fondo-cc-punto-cero"), egresosFI: [], ingresosFI: [] }
    const r1 = migrate!(prev as never, 26) as unknown as Record<string, unknown>
    expect(Array.isArray(r1["ingresosFI"])).toBe(true)
    expect((r1["ingresosFI"] as unknown[]).length).toBe(44)
    expect((r1["egresosFI"] as unknown[]).length).toBe(182)
    expect(((r1["fondosFI"] as unknown) as {id:string}[]).some(f=> f.id==="fondo-cc-punto-cero")).toBe(true)
    const r2 = migrate!(r1 as never, 26) as unknown as Record<string, unknown>
    expect((r2["ingresosFI"] as unknown[]).length).toBe(44)
    expect((r2["egresosFI"] as unknown[]).length).toBe(182)
    // con fondo con saldoInicial preservado (no lo pisa si ya existe)
    const prev2 = { fondosFI: [{ id: "fondo-gc", nombre: "X", tipo: "gasto_comun", activo: true, saldoInicial: 999 }], egresosFI: [] as never[], ingresosFI: [] as never[] }
    const r3 = migrate!(prev2 as never, 26) as unknown as { fondosFI: { id:string; saldoInicial?: number }[] }
    expect(r3.fondosFI.find(f=> f.id==="fondo-gc")!.saldoInicial).toBe(999)
    expect(r3.fondosFI.some(f=> f.id==="fondo-cc-punto-cero")).toBe(true)
  })

  it("hydrated gate en registrarIngresoFI", () => {
    useCompassStore.setState({ hasHydrated: false })
    const r = getState().registrarIngresoFI({ fecha: "2026-09-01", monto: 1000, concepto: "X", fondoId: "fondo-gc" })
    expect(r.ok).toBe(false)
    expect(r.error).toContain("hidratando")
    useCompassStore.setState({ hasHydrated: true })
  })
})
