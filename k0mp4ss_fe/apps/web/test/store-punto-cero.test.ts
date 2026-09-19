import { describe, it, expect, beforeEach } from "vitest"
import { useCompassStore, seedData } from "@/lib/store"
import { saldoFondo } from "@/lib/finanzas-utils"
import { resetStore } from "./helpers"
import puntoCero from "@/data/finanzas/punto-cero-2324.json"

const getState = () => useCompassStore.getState()
const migrate = useCompassStore.persist.getOptions().migrate!

describe("FI - Punto cero histórico 2023-2024 (migración v27)", () => {
  beforeEach(resetStore)

  it("seed incluye fondo Cuenta Corriente con saldoInicial 17082694 y 182+44 movimientos (4 egresos +1 ingreso con monto 0 filtrados por schema >0)", () => {
    const s = getState()
    const fondo = s.fondosFI.find(f => f.id === "fondo-cc-punto-cero")
    expect(fondo).toBeDefined()
    expect(fondo!.saldoInicial).toBe(17082694)
    expect(fondo!.tipo).toBe("gasto_comun")
    expect(s.egresosFI.filter(e => e.id.startsWith("fi-egr-hist-"))).toHaveLength(182)
    expect(s.ingresosFI.filter(i => i.id.startsWith("fi-ing-hist-"))).toHaveLength(44)
  })

  it("fixture JSON validado: totales y saldo 0 (filtrado: 182 egresos /44 ingresos, totales idénticos)", () => {
    const egresos = puntoCero.egresos as { monto: number; fecha: string }[]
    const ingresos = puntoCero.ingresos as { monto: number; fecha: string }[]
    const totalE = egresos.reduce((a, e) => a + e.monto, 0)
    const totalI = ingresos.reduce((a, e) => a + e.monto, 0)
    expect(egresos.length).toBe(182)
    expect(ingresos.length).toBe(44)
    expect(totalE).toBe(62491011)
    expect(totalI).toBe(45408317)
    const saldoFinal = 17082694 + totalI - totalE
    expect(saldoFinal).toBe(0)
    // totales por año (usar anio extra si existe en fixture? fallback a fecha)
    // Fixture reducido no trae anio, calculamos por fecha
    const porAnio = (arr: { fecha: string; monto: number }[]) => {
      const map: Record<string, number> = {}
      for (const r of arr) {
        const anio = r.fecha.slice(0, 4)
        map[anio] = (map[anio] ?? 0) + r.monto
      }
      return map
    }
    const ePorAnio = porAnio(egresos)
    const iPorAnio = porAnio(ingresos)
    expect(ePorAnio["2023"]).toBe(19506242)
    expect(ePorAnio["2024"]).toBe(42984769)
    expect(iPorAnio["2023"]).toBe(13309017)
    expect(iPorAnio["2024"]).toBe(32099300)
  })

  it("saldoFondo Cuenta Corriente es 0 con apertura cuadrada", () => {
    const s = getState()
    const fondoId = "fondo-cc-punto-cero"
    const saldo = saldoFondo(fondoId, {
      cobros: s.cobrosFI,
      egresos: s.egresosFI,
      emisiones: s.emisionesGC,
      ingresosFI: s.ingresosFI,
      saldoInicialPorFondo: Object.fromEntries(s.fondosFI.map(f => [f.id, f.saldoInicial ?? 0])),
    })
    expect(saldo).toBe(0)
  })

  it("totales por año coinciden con el libro tras seed", () => {
    const s = getState()
    const egresosHist = s.egresosFI.filter(e => e.id.startsWith("fi-egr-hist-"))
    const ingresosHist = s.ingresosFI.filter(i => i.id.startsWith("fi-ing-hist-"))
    const sumByYear = (arr: { fecha: string; monto: number }[]) => {
      const m: Record<string, number> = {}
      for (const r of arr) m[r.fecha.slice(0,4)] = (m[r.fecha.slice(0,4)] ?? 0) + r.monto
      return m
    }
    const eYear = sumByYear(egresosHist)
    const iYear = sumByYear(ingresosHist)
    expect(eYear["2023"]).toBe(19506242)
    expect(eYear["2024"]).toBe(42984769)
    expect(iYear["2023"]).toBe(13309017)
    expect(iYear["2024"]).toBe(32099300)
  })

  it("migración v26→v27 idempotente: fondo y movimientos no duplican", () => {
    // Simula persistido v26 sin punto cero
    const baseFondos = (s: ReturnType<typeof seedData>) => s.fondosFI.filter((f: {id:string})=> f.id !== "fondo-cc-punto-cero")
    const prev = {
      fondosFI: baseFondos(seedData()),
      egresosFI: [],
      ingresosFI: [],
      unidades: seedData().unidades,
    }
    const r1 = migrate(prev as never, 26) as unknown as { fondosFI: {id:string}[]; egresosFI: {id:string,folio:string}[]; ingresosFI: {id:string}[] }
    expect(r1.fondosFI.some(f=> f.id==="fondo-cc-punto-cero")).toBe(true)
    expect(r1.egresosFI.filter(e=> e.id.startsWith("fi-egr-hist-"))).toHaveLength(182)
    expect(r1.ingresosFI.filter(i=> i.id.startsWith("fi-ing-hist-"))).toHaveLength(44)
    // folios FE únicos y secuenciales desde 1 si no había previos
    const folios = r1.egresosFI.map(e=> e.folio).filter(Boolean) as string[]
    expect(new Set(folios).size).toBe(folios.length)
    expect(folios).toContain("FE-0001")
    expect(folios).toContain("FE-0182")

    // segunda migración no duplica
    const r2 = migrate(r1 as never, 26) as unknown as { fondosFI: unknown[]; egresosFI: unknown[]; ingresosFI: unknown[] }
    expect(r2.fondosFI).toHaveLength(r1.fondosFI.length)
    expect(r2.egresosFI).toHaveLength(r1.egresosFI.length)
    expect(r2.ingresosFI).toHaveLength(r1.ingresosFI.length)
  })

  it("folios históricos continúan secuencia si ya existen FE previos", () => {
    const prev = {
      fondosFI: seedData().fondosFI.filter(f=> f.id !== "fondo-cc-punto-cero"),
      egresosFI: [
        { id: "egr-manual-1", folio:"FE-0001", fecha:"2025-01-01", categoria:"otro", descripcion:"Manual 1", monto:1000, fondoId:"fondo-gc", esRecurrente:false },
        { id: "egr-manual-2", folio:"FE-0005", fecha:"2025-01-02", categoria:"otro", descripcion:"Manual 2", monto:2000, fondoId:"fondo-gc", esRecurrente:false },
      ],
      ingresosFI: [],
      unidades: seedData().unidades,
    }
    const r = migrate(prev as never, 26) as unknown as { egresosFI: {id:string, folio:string}[] }
    const historicos = r.egresosFI.filter(e=> e.id.startsWith("fi-egr-hist-"))
    expect(historicos).toHaveLength(182)
    // max previo era 5 → históricos deben empezar en FE-0006 (182 +5 =187)
    expect(historicos[0]!.folio).toBe("FE-0006")
    expect(historicos[181]!.folio).toBe("FE-0187")
    // no colisión con manuales
    const allFolios = r.egresosFI.map(e=> e.folio)
    expect(new Set(allFolios).size).toBe(allFolios.length)
  })

  it("convive con datos TEST-* y seed NSGC sin romper dashboards (no throw)", () => {
    const s = getState()
    // Simula que existen datos TEST-*
    useCompassStore.setState({
      egresosFI: [...s.egresosFI, { id:"TEST-egr-1", folio:"FE-9999", fecha:"2026-01-01", categoria:"otro", descripcion:"TEST", monto:999, fondoId:"fondo-gc", esRecurrente:false } as never],
      ingresosFI: [...s.ingresosFI, { id:"TEST-ing-1", fecha:"2026-01-02", monto:111, concepto:"TEST", fondoId:"fondo-gc" } as never],
    })
    // saldo del fondo GC debería seguir computable y no afectar CC
    const after = getState()
    const saldoCC = saldoFondo("fondo-cc-punto-cero", {
      cobros: after.cobrosFI,
      egresos: after.egresosFI,
      emisiones: after.emisionesGC,
      ingresosFI: after.ingresosFI,
      saldoInicialPorFondo: Object.fromEntries(after.fondosFI.map(f=> [f.id, f.saldoInicial ?? 0])),
    })
    expect(saldoCC).toBe(0)
  })

  it("F1: saldoInicial es DERIVADO (egresos − ingresos del fixture), no proviene del libro", () => {
    // La apertura 17.082.694 = total egresos − total ingresos del propio JSON.
    // El "saldo 0" del fondo CC es tautológico por construcción, no una
    // reconciliación contra fuente externa. Ver BACKLOG-100 §Punto cero (F1).
    const egresos = puntoCero.egresos as { monto: number }[]
    const ingresos = puntoCero.ingresos as { monto: number }[]
    const totalE = egresos.reduce((a, e) => a + e.monto, 0)
    const totalI = ingresos.reduce((a, i) => a + i.monto, 0)
    const fondo = getState().fondosFI.find(f => f.id === "fondo-cc-punto-cero")
    expect(fondo).toBeDefined()
    expect(fondo!.saldoInicial).toBe(totalE - totalI)
    expect(fondo!.saldoInicial).toBe(17082694)
  })

  it("F2: serie saldoCC del fixture es la cuenta bancaria del libro y NO se materializa", () => {
    // El fixture trae 24 saldos mensuales de la cuenta bancaria (fuente: libro).
    // Seed y migración v27 solo consumen egresos/ingresos; saldoCC no se lee en
    // producción y no reconcilia mes a mes con la derivada (difiere en 23/24
    // meses; solo coincide 2024-12 porque ambos cierran en 0). Ver BACKLOG-100 (F2).
    const saldoCC = puntoCero.saldoCC as { monto: number }[]
    expect(saldoCC).toHaveLength(24)
    const mov: Record<string, number> = {}
    for (const e of puntoCero.egresos as { fecha: string; monto: number }[])
      mov[e.fecha.slice(0, 7)] = (mov[e.fecha.slice(0, 7)] ?? 0) - e.monto
    for (const i of puntoCero.ingresos as { fecha: string; monto: number }[])
      mov[i.fecha.slice(0, 7)] = (mov[i.fecha.slice(0, 7)] ?? 0) + i.monto
    const meses = Object.keys(mov).sort()
    expect(meses).toHaveLength(24)
    let acum = 17082694
    let iguales = 0
    meses.forEach((m, idx) => {
      acum += mov[m] ?? 0
      if (acum === saldoCC[idx]!.monto) iguales++
    })
    expect(acum).toBe(0) // cierre cuadrado
    expect(iguales).toBe(1) // solo 2024-12 coincide (cierre en 0)
  })
})
