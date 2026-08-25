import { describe, it, expect, beforeEach } from "vitest"
import { useCompassStore } from "@/lib/store"
import type { CobroFI, EgresoFI, FondoFI } from "@/lib/schemas"
import {
  estadoDeCobro,
  montoMoraPropuesta,
  saldoFondo,
  unidadesParaCorteServicios,
  vencimientoDesdeDiaCorte,
} from "@/lib/finanzas-utils"
import { resetStore } from "./helpers"

const getState = () => useCompassStore.getState()

const fondoBase = (partial: Partial<FondoFI>): FondoFI => ({
  id: "fondo-test",
  nombre: "Fondo Cuota Pintura TEST",
  tipo: "especial",
  activo: true,
  ...partial,
})

const egresoBase = (partial: Partial<EgresoFI>): EgresoFI => ({
  id: "egr-1",
  fecha: "2026-08-20",
  categoria: "mantencion",
  descripcion: "Reparación portón TEST",
  monto: 50000,
  fondoId: "fondo-gc",
  esRecurrente: false,
  ...partial,
})

function periodoActual(): string {
  return new Date().toISOString().slice(0, 7)
}

function periodoMesesAtras(meses: number): string {
  const d = new Date()
  d.setMonth(d.getMonth() - meses)
  return d.toISOString().slice(0, 7)
}

function unidadConPropietario(): { unidadId: string; personaId: string; tipoUnidadId: string; prorrateo: number } | null {
  const s = getState()
  const propietario = s.vinculos.find(v => v.rol === "propietario" && !v.fechaFin && !v.unidadId.startsWith("u-E-"))
  if (!propietario) return null
  const unidad = s.unidades.find(u => u.id === propietario.unidadId)!
  return { unidadId: unidad.id, personaId: propietario.personaId, tipoUnidadId: unidad.tipoUnidadId, prorrateo: unidad.prorrateo }
}

function exigibleDe(cobro: Pick<CobroFI, "montoBase" | "moras">): number {
  return cobro.montoBase + cobro.moras.reduce((a, m) => a + m.monto, 0)
}

function crearActaPublicada(): string {
  const s = getState()
  const directivos = s.personas
    .filter(p => p.estadoCuenta === "activa" && !p.datosGobernanza)
    .slice(0, 1)
    .map(p => ({
      ...p,
      datosGobernanza: { id: "gob-fi-test", cargoDirectiva: "presidente" as const, fechaAsuncion: "2026-08-01" },
      roles: Array.from(new Set([...p.roles, "directiva" as const])),
    }))
  for (const d of directivos) {
    const r = s.savePersona(d)
    expect(r.ok).toBe(true)
  }
  const quorum = getState()
    .personas.filter(p => p.estadoCuenta === "activa" && p.datosGobernanza)
    .map(p => p.id)
  expect(quorum.length).toBeGreaterThan(0)

  const actaId = "acta-fi-test"
  const creada = getState().saveActaGD({
    id: actaId,
    fecha: new Date().toISOString().slice(0, 10),
    hora: "19:00",
    lugar: "Sede TEST",
    tablaTemas: ["Uso de fondo"],
    presentes: [...quorum],
    ausentes: [],
    invitados: [],
    minuta: "Aprueba retiro del fondo de reserva.",
    adjuntos: [],
    estado: "borrador",
    aprobaciones: [],
  })
  expect(creada.ok).toBe(true)
  for (const id of quorum) {
    const r = getState().aprobarActaGD(actaId, id)
    expect(r.ok).toBe(true)
  }
  return actaId
}

describe("FI - Finanzas y Morosidad en el store", () => {
  beforeEach(resetStore)

  describe("maestro de fondos", () => {
    it("seed NSGC con los tres fondos base", () => {
      const tipos = getState().fondosFI.map(f => f.tipo)
      expect(tipos).toContain("gasto_comun")
      expect(tipos).toContain("reserva")
      expect(tipos).toContain("amenities")
    })

    it("CRUD con unicidad de nombre y limpieza si no tiene movimientos", () => {
      expect(getState().saveFondoFI(fondoBase({})).ok).toBe(true)

      const duplicado = getState().saveFondoFI(fondoBase({ id: "fondo-test-2", nombre: "FONDO CUOTA PINTURA test" }))
      expect(duplicado.ok).toBe(false)

      expect(getState().saveFondoFI(fondoBase({ id: "fondo-test-2", nombre: "Otro TEST" })).ok).toBe(true)
      expect(getState().removeFondoFI("fondo-test-2").ok).toBe(true)
    })

    it("no elimina fondos con movimientos imputados", () => {
      expect(getState().saveEgresoFI(egresoBase({})).ok).toBe(true)
      const r = getState().removeFondoFI("fondo-gc")
      expect(r.ok).toBe(false)
      expect(r.error).toContain("movimiento")
    })
  })

  describe("egresos con imputación", () => {
    it("folio FE secuencial y evento de auditoría", () => {
      expect(getState().saveEgresoFI(egresoBase({})).ok).toBe(true)
      expect(getState().saveEgresoFI(egresoBase({ id: "egr-2" })).ok).toBe(true)
      expect(getState().egresosFI.map(e => e.folio)).toEqual(["FE-0001", "FE-0002"])
      expect(getState().eventos.filter(e => e.tipoAccion === "FI_EGRESS_CREATED")).toHaveLength(2)
    })

    it("rechaza fondo inexistente o inactivo y comprobante embebido", () => {
      const sinFondo = getState().saveEgresoFI(egresoBase({ fondoId: "fondo-fantasma" }))
      expect(sinFondo.ok).toBe(false)

      expect(getState().saveFondoFI(fondoBase({ id: "fondo-off", nombre: "Inactivo TEST", activo: false })).ok).toBe(true)
      const inactivo = getState().saveEgresoFI(egresoBase({ fondoId: "fondo-off" }))
      expect(inactivo.ok).toBe(false)

      const base64 = getState().saveEgresoFI(
        egresoBase({
          comprobante: { nombre: "boleta.pdf", tipoMime: "application/pdf", tamanoKB: 120, url: "data:application/pdf;base64,JVBERi0" },
        })
      )
      expect(base64.ok).toBe(false)
    })

    it("valida sub-sectores diferenciados", () => {
      const malo = getState().saveEgresoFI(egresoBase({ microSectoresIds: ["ms-fantasma"] }))
      expect(malo.ok).toBe(false)
      const ok = getState().saveEgresoFI(egresoBase({ microSectoresIds: [getState().microSectores[0]!.id] }))
      expect(ok.ok).toBe(true)
    })
  })

  describe("emisión de gasto común", () => {
    it("gate CF no cargado bloquea la emisión", () => {
      const s = getState()
      useCompassStore.setState({
        configuracion: { ...s.configuracion, modoCalculoGC: undefined },
      } as unknown as Partial<typeof s>)
      const r = getState().emitirGastoComun({ periodo: periodoActual() })
      expect(r.ok).toBe(false)
      expect(r.error).toContain("CF no cargado")
      expect(getState().emisionesGC).toHaveLength(0)
    })

    it("unidad sin responsable de cobro bloquea; periodo duplicado también", () => {
      const bloqueada = getState().emitirGastoComun({ periodo: "2025-12" })
      expect(bloqueada.ok).toBe(false)
      expect(bloqueada.error).toContain("responsable de cobro")

      const objetivo = unidadConPropietario()!
      const ok = getState().emitirGastoComun({ periodo: periodoActual(), gastoTotal: 100000, unidadIds: [objetivo.unidadId] })
      expect(ok.ok).toBe(true)

      const duplicado = getState().emitirGastoComun({ periodo: periodoActual(), unidadIds: [objetivo.unidadId] })
      expect(duplicado.ok).toBe(false)
      expect(duplicado.error).toContain("ya fue procesado")
    })

    it("modo fijo usa el monto base del tipo de unidad", () => {
      const s = getState()
      useCompassStore.setState({ configuracion: { ...s.configuracion, modoCalculoGC: "fijo" } })
      const objetivo = unidadConPropietario()!
      const tipo = getState().tiposUnidad.find(t => t.id === objetivo.tipoUnidadId)!
      const r = getState().emitirGastoComun({ periodo: periodoActual(), unidadIds: [objetivo.unidadId] })
      expect(r.ok).toBe(true)
      const emision = getState().emisionesGC[0]!
      expect(emision.modo).toBe("fijo")
      expect(emision.lineas[0]!.monto).toBe(tipo.montoBaseGc)
    })

    it("modo prorrateo reparte por coeficiente, aporta al fondo de reserva y notifica", () => {
      const objetivo = unidadConPropietario()!
      const esperado = Math.round(400000 * objetivo.prorrateo)
      const aporteEsperado = Math.round(esperado * 0.05)
      const r = getState().emitirGastoComun({ periodo: periodoActual(), gastoTotal: 400000, unidadIds: [objetivo.unidadId] })
      expect(r.ok).toBe(true)
      const emision = getState().emisionesGC[0]!
      expect(emision.modo).toBe("variable")
      expect(emision.lineas[0]!.monto).toBe(esperado)
      expect(emision.fondoReservaAporte?.monto).toBe(aporteEsperado)
      expect(getState().eventos.some(e => e.tipoAccion === "FI_EMISION_GC")).toBe(true)

      const cobro = getState().cobrosFI.find(c => c.id === emision.lineas[0]!.cobroId)!
      expect(cobro.concepto).toBe("gasto_comun")
      expect(cobro.fechaVencimiento).toBe(vencimientoDesdeDiaCorte(emision.periodo, getState().configuracion.diaCortePago))
      expect(getState().notificaciones.filter(n => n.moduloOrigen === "FI")).toHaveLength(1)
    })

    it("prorrateo exige gasto total mayor a cero", () => {
      const objetivo = unidadConPropietario()!
      const r = getState().emitirGastoComun({ periodo: periodoActual(), unidadIds: [objetivo.unidadId] })
      expect(r.ok).toBe(false)
      expect(r.error).toContain("prorrateo")
    })
  })

  describe("morosidad, mora y cobranza", () => {
    let cobroVencidoId: string
    let objetivo: { unidadId: string }
    beforeEach(() => {
      objetivo = unidadConPropietario()!
      expect(getState().emitirGastoComun({ periodo: periodoMesesAtras(1), gastoTotal: 200000, unidadIds: [objetivo.unidadId] }).ok).toBe(true)
      cobroVencidoId = getState().cobrosFI[0]!.id
    })

    it("mora pro-rata sobre cobro vencido, idempotente por día", () => {
      expect(getState().aplicarMoraFI(cobroVencidoId, 1).ok).toBe(true)
      const conMora = getState().cobrosFI.find(c => c.id === cobroVencidoId)!
      expect(conMora.moras).toHaveLength(1)
      expect(conMora.moras[0]!.diasAtraso).toBeGreaterThan(0)
      expect(getState().eventos.filter(e => e.tipoAccion === "FI_MORA_APPLIED")).toHaveLength(1)

      expect(getState().aplicarMoraFI(cobroVencidoId, 1).ok).toBe(true)
      expect(getState().cobrosFI.find(c => c.id === cobroVencidoId)!.moras).toHaveLength(1)
    })

    it("no aplica mora a cobros vigentes", () => {
      expect(getState().emitirGastoComun({ periodo: periodoActual(), gastoTotal: 100000, unidadIds: [objetivo.unidadId] }).ok).toBe(true)
      const vigente = getState().cobrosFI.find(c => c.periodo === periodoActual())!
      const r = getState().aplicarMoraFI(vigente.id)
      expect(r.ok).toBe(false)
      expect(r.error).toContain("vencido")
    })

    it("gestión de cobranza solo con deuda vencida y auditada", () => {
      const sinDeuda = getState().enviarCobranzaFI(objetivo.unidadId)
      expect(sinDeuda.ok).toBe(true)

      expect(getState().registrarPagoFI(cobroVencidoId, { monto: saldoPendienteDe(cobroVencidoId), medio: "transferencia" }).ok).toBe(true)
      const sinDeudaTrasPagar = getState().enviarCobranzaFI(objetivo.unidadId)
      expect(sinDeudaTrasPagar.ok).toBe(false)
      expect(sinDeudaTrasPagar.error).toContain("no registra deuda")

      expect(getState().emitirGastoComun({ periodo: periodoMesesAtras(2), gastoTotal: 100000, unidadIds: [objetivo.unidadId] }).ok).toBe(true)
      expect(getState().enviarCobranzaFI(objetivo.unidadId).ok).toBe(true)
      expect(getState().eventos.filter(e => e.tipoAccion === "FI_COBRANZA_SENT")).toHaveLength(2)
    })

    it("panel de corte de servicios deriva del límite configurado", () => {
      const hoy = new Date().toISOString().slice(0, 10)
      const limite = getState().configuracion.limiteMesesAvisoCorte
      const cobros: CobroFI[] = []
      for (let i = 1; i <= limite; i++) {
        cobros.push({
          id: `c-${i}`,
          unidadId: objetivo.unidadId,
          periodo: periodoMesesAtras(i),
          concepto: "gasto_comun",
          origenModulo: "FI",
          fondoId: "fondo-gc",
          descripcion: `GC -${i}`,
          montoBase: 100000,
          fechaCargo: hoy,
          fechaVencimiento: `2020-01-05`,
          moras: [],
          pagos: [],
          diferencias: [],
        })
      }
      const unidades = [{ id: objetivo.unidadId, numero: "999", etiqueta: "Depto" }]
      const enRiesgo = unidadesParaCorteServicios(unidades, cobros, limite, hoy)
      expect(enRiesgo).toHaveLength(1)
      expect(enRiesgo[0]!.periodosVencidos).toBe(limite)

      const fuera = unidadesParaCorteServicios(unidades, cobros.slice(0, limite - 1), limite, hoy)
      expect(fuera).toHaveLength(0)
    })
  })

  describe("pagos e informe de diferencia inmutable", () => {
    let cobroId: string
    beforeEach(() => {
      const objetivo = unidadConPropietario()!
      expect(getState().emitirGastoComun({ periodo: periodoMesesAtras(1), gastoTotal: 300000, unidadIds: [objetivo.unidadId] }).ok).toBe(true)
      cobroId = getState().cobrosFI[0]!.id
      expect(getState().aplicarMoraFI(cobroId, 1).ok).toBe(true)
    })

    it("pago exacto cierra el cobro con base + mora", () => {
      const exigible = exigibleDe(getState().cobrosFI.find(c => c.id === cobroId)!)
      const r = getState().registrarPagoFI(cobroId, { monto: exigible, medio: "transferencia" })
      expect(r.ok).toBe(true)
      const pagado = getState().cobrosFI.find(c => c.id === cobroId)!
      expect(estadoDeCobro(pagado)).toBe("pagado")
      expect(pagado.diferencias).toHaveLength(0)
      expect(getState().eventos.filter(e => e.tipoAccion === "FI_RECEIVE_PAYMENT")).toHaveLength(1)
    })

    it("descuento exige justificación y genera informe inmutable", () => {
      const exigible = exigibleDe(getState().cobrosFI.find(c => c.id === cobroId)!)
      const descuento = Math.min(100, exigible - 100)

      const sinJustificacion = getState().registrarPagoFI(cobroId, { monto: exigible - descuento, medio: "efectivo" })
      expect(sinJustificacion.ok).toBe(false)
      expect(sinJustificacion.error).toContain("justificación")

      const r = getState().registrarPagoFI(cobroId, { monto: exigible - descuento, medio: "efectivo", ajusteJustificacion: "Multa condonada por buena fe del residente." })
      expect(r.ok).toBe(true)
      const ajustado = getState().cobrosFI.find(c => c.id === cobroId)!
      expect(ajustado.diferencias).toHaveLength(1)
      expect(ajustado.diferencias[0]!.tipo).toBe("descuento")
      expect(ajustado.diferencias[0]!.diferencia).toBe(descuento)
      expect(getState().eventos.some(e => e.tipoAccion === "FI_MANUAL_DISCOUNT")).toBe(true)
    })

    it("recargo con justificación a favor de la comunidad", () => {
      const exigible = exigibleDe(getState().cobrosFI.find(c => c.id === cobroId)!)
      const r = getState().registrarPagoFI(cobroId, { monto: exigible + 2500, medio: "efectivo", ajusteJustificacion: "Saldo pendiente de mes anterior facturado ahora." })
      expect(r.ok).toBe(true)
      expect(getState().cobrosFI.find(c => c.id === cobroId)!.diferencias[0]!.tipo).toBe("recargo")
    })

    it("rechaza pagos duplicados sobre cobro ya pagado", () => {
      const exigible = exigibleDe(getState().cobrosFI.find(c => c.id === cobroId)!)
      expect(getState().registrarPagoFI(cobroId, { monto: exigible, medio: "transferencia" }).ok).toBe(true)
      expect(getState().registrarPagoFI(cobroId, { monto: 1000, medio: "efectivo" }).ok).toBe(false)
    })
  })

  describe("retiros de fondos", () => {
    it("fondo de reserva exige acta publicada", () => {
      const sinActa = getState().retirarFondoFI({ fondoId: "fondo-reserva", monto: 10000, descripcion: "Retiro TEST" })
      expect(sinActa.ok).toBe(false)
      expect(sinActa.error).toContain("acta")

      const actaFantasma = getState().retirarFondoFI({ fondoId: "fondo-reserva", monto: 10000, descripcion: "Retiro TEST", aprobacionActaGDId: "acta-fantasma" })
      expect(actaFantasma.ok).toBe(false)
    })

    it("retiro válido genera egreso uso_de_fondo auditado y descuenta saldo", () => {
      const objetivo = unidadConPropietario()!
      expect(getState().emitirGastoComun({ periodo: periodoMesesAtras(1), gastoTotal: 400000, unidadIds: [objetivo.unidadId] }).ok).toBe(true)
      expect(getState().registrarPagoFI(getState().cobrosFI[0]!.id, { monto: saldoPendienteDe(getState().cobrosFI[0]!.id), medio: "transferencia" }).ok).toBe(true)

      const saldoAntes = saldoFondo("fondo-reserva", { cobros: getState().cobrosFI, egresos: getState().egresosFI, emisiones: getState().emisionesGC })
      expect(saldoAntes).toBeGreaterThan(0)

      const actaId = crearActaPublicada()
      const retiro = Math.max(1, Math.floor(saldoAntes / 2))
      const r = getState().retirarFondoFI({ fondoId: "fondo-reserva", monto: retiro, descripcion: "Reposición cerradura bodega TEST", aprobacionActaGDId: actaId })
      expect(r.ok).toBe(true)
      expect(getState().egresosFI.some(e => e.categoria === "uso_de_fondo")).toBe(true)
      expect(getState().eventos.some(e => e.tipoAccion === "FI_FUND_WITHDRAWN")).toBe(true)

      const saldoDespues = saldoFondo("fondo-reserva", { cobros: getState().cobrosFI, egresos: getState().egresosFI, emisiones: getState().emisionesGC })
      expect(saldoAntes - saldoDespues).toBe(retiro)

      const excesivo = getState().retirarFondoFI({ fondoId: "fondo-reserva", monto: saldoDespues + 999999, descripcion: "Retiro imposible TEST", aprobacionActaGDId: actaId })
      expect(excesivo.ok).toBe(false)
      expect(excesivo.error).toContain("Saldo insuficiente")
    })
  })

  describe("conexión MT: proyectos financiados por fondo FI", () => {
    it("valida FK, fondo activo y saldo disponible", () => {
      const fkMala = getState().saveProyectoMT({
        id: "py-fi-1",
        nombre: "Techos TEST",
        presupuestoEstimado: 5000000,
        plazoMeses: 120,
        estado: "planificado",
        fondoFinanciamientoId: "fondo-fantasma",
      })
      expect(fkMala.ok).toBe(false)

      const sinSaldo = getState().saveProyectoMT({
        id: "py-fi-2",
        nombre: "Techos TEST",
        presupuestoEstimado: 5000000,
        plazoMeses: 120,
        estado: "planificado",
        fondoFinanciamientoId: "fondo-gc",
      })
      expect(sinSaldo.ok).toBe(false)
      expect(sinSaldo.error).toContain("Saldo insuficiente")
    })
  })
})

function saldoPendienteDe(cobroId: string): number {
  const cobro = getState().cobrosFI.find(c => c.id === cobroId)!
  return Math.max(0, cobro.montoBase + cobro.moras.reduce((a, m) => a + m.monto, 0) - cobro.pagos.reduce((a, p) => a + p.monto, 0))
}

describe("helpers financieros puros", () => {
  it("montoMoraPropuesta calcula pro-rata mensual", () => {
    expect(montoMoraPropuesta(200000, 15, 1)).toBe(1000)
    expect(montoMoraPropuesta(200000, 30, 2)).toBe(4000)
    expect(montoMoraPropuesta(0, 15, 1)).toBe(0)
  })

  it("vencimientoDesdeDiaCorte cae en el mes siguiente respetando días del mes", () => {
    expect(vencimientoDesdeDiaCorte("2026-01", 5)).toBe("2026-02-05")
    expect(vencimientoDesdeDiaCorte("2026-02", 31)).toBe("2026-03-31")
    expect(vencimientoDesdeDiaCorte("2024-02", 29)).toBe("2024-03-29")
  })
})
