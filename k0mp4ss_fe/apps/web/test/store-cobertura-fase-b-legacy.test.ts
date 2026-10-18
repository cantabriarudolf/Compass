import { describe, it, expect, beforeEach } from "vitest"
import { useCompassStore } from "@/lib/store"
import {
  checklistEquipamientoBase,
  checklistInstalacionesParaJornada,
} from "@/lib/personal-utils"
import type {
  BitacoraVisitaPE,
  CierreTurnoPE,
  EgresoFI,
  FondoFI,
  IngresoContratistaPE,
  Persona,
  TrabajoMT,
} from "@/lib/schemas"
import { resetStore } from "./helpers"

// SERIE-NOCHE-3 P9 (fase 2 del change `store-cobertura-fase-b`): cobertura de
// `lib/store.ts` legacy (RE, FI y PE) con tests comportamentales sobre la API
// pública `useCompassStore`. Sin detalles internos ni shape persistido.

const getState = () => useCompassStore.getState()

const hoy = () => new Date().toISOString().slice(0, 10)

const masDias = (dias: number): string => {
  const d = new Date()
  d.setDate(d.getDate() + dias)
  return d.toISOString().slice(0, 10)
}

const fondoBase = (partial: Partial<FondoFI>): FondoFI => ({
  id: "fondo-cob",
  nombre: "Fondo Cuota Pintura COB",
  tipo: "especial",
  activo: true,
  ...partial,
})

const egresoBase = (partial: Partial<EgresoFI>): EgresoFI => ({
  id: "egr-cob-1",
  fecha: "2026-08-20",
  categoria: "mantencion",
  descripcion: "Reparación portón COB",
  monto: 50000,
  fondoId: "fondo-gc",
  esRecurrente: false,
  ...partial,
})

const trabajoBase = (partial: Partial<TrabajoMT>): TrabajoMT => ({
  id: "mt-pe-cob",
  folio: "",
  titulo: "Mantención Hidropack PE COB",
  descripcion: "Revisión mensual de presiones, sellos y tablero de control.",
  proveedor: { nombre: "AquaServicio COB", contacto: "+56 9 8888 0000" },
  prioridad: "media",
  estado: "planificado",
  costoTotal: 180000,
  origenFondos: "gasto_comun",
  estadoPago: "pendiente",
  alertaGarantiaEnviada: false,
  evidencias: [],
  ...partial,
})

const visitaBase = (partial: Partial<BitacoraVisitaPE>): BitacoraVisitaPE => ({
  id: "vis-cob-1",
  fecha: "2026-08-25",
  nombre: "Visitante COB",
  dni: "12.345.678-5",
  jornadaId: "j-manana",
  origenAgenda: "pre_agendada",
  estado: "agendada",
  ...partial,
})

const ingresoBase = (
  partial: Partial<IngresoContratistaPE>
): IngresoContratistaPE => ({
  id: "ing-cob-1",
  contratistaId: "cont-gasfiteria",
  motivo: "Reparación de filtración en sala de bombas",
  fecha: "2026-08-25",
  jornadaId: "j-manana",
  agendadoPor: "administracion",
  estado: "agendado",
  ...partial,
})

const fichaBase = (
  overrides: Partial<NonNullable<Persona["datosLaborales"]>> = {}
): NonNullable<Persona["datosLaborales"]> => ({
  id: "l-cob",
  cargo: "Conserje COB",
  afp: "Habitat",
  prevision: "FONASA",
  fechaIngreso: "2025-01-01",
  tipoContrato: "indefinido",
  afpId: "afp-habitat",
  saludId: "fonasa",
  bancoId: "banco-estado",
  jornadaBaseHoras: 45,
  ...overrides,
})

function personaConFicha(id = "p-4"): Persona {
  const base = getState().personas.find((p) => p.id === id)!
  return { ...base, datosLaborales: fichaBase() }
}

const cierreValido = (): Omit<
  CierreTurnoPE,
  "id" | "historialCambios" | "notificadoAAdmin"
> => ({
  fecha: "2026-08-25",
  hora: "20:00",
  jornadaReportadaId: "j-noche",
  trabajadorPersonaId: "p-4",
  novedadesGenerales: "Turno tranquilo, rondas al día.",
  incidencias: { hubo: false, descripcion: undefined, evidencias: [] },
  checklistInstalaciones: checklistInstalacionesParaJornada("j-noche").map(
    (i) => ({ ...i, ok: true })
  ),
  checklistEquipamiento: checklistEquipamientoBase().map((i) => ({
    ...i,
    ok: true,
  })),
})

function unidadConPropietario(): { unidadId: string; personaId: string } {
  const vinculo = getState().vinculos.find(
    (v) => v.rol === "propietario" && !v.fechaFin && !v.unidadId.startsWith("u-E-")
  )!
  return { unidadId: vinculo.unidadId, personaId: vinculo.personaId }
}

function emitirConDeuda(periodo: string, fechaVencimiento: string): string {
  useCompassStore.setState((s) => ({
    configuracion: { ...s.configuracion, modoCalculoGC: "variable" },
  }))
  const { unidadId } = unidadConPropietario()
  const r = getState().emitirGastoComun({
    periodo,
    unidadIds: [unidadId],
    gastoTotal: 1_000_000,
    fechaVencimiento,
  })
  expect(r.ok).toBe(true)
  const cobro = getState().cobrosFI.find((c) => c.periodo === periodo)!
  expect(cobro.montoBase).toBeGreaterThan(0)
  return cobro.id
}

describe("store-cobertura-fase-b fase 2 — lib/store.ts legacy (RE · FI · PE)", () => {
  beforeEach(resetStore)

  describe("RE — Reportería", () => {
    it("generarReporteRE valida título, bloques y el segmento EF por FK", () => {
      const sinTitulo = getState().generarReporteRE({
        titulo: "ab",
        bloques: ["gastos_mes"],
        segmento: {},
      })
      expect(sinTitulo.ok).toBe(false)
      expect(sinTitulo.error).toContain("al menos 3 caracteres")

      const sinBloques = getState().generarReporteRE({
        titulo: "Reporte COB",
        bloques: [],
        segmento: {},
      })
      expect(sinBloques.ok).toBe(false)
      expect(sinBloques.error).toContain("al menos un bloque")

      const macroFantasma = getState().generarReporteRE({
        titulo: "Reporte COB",
        bloques: ["gastos_mes"],
        segmento: { macroSectorIds: ["msx-fantasma"] },
      })
      expect(macroFantasma.ok).toBe(false)
      expect(macroFantasma.error).toContain("macroSectorId msx-fantasma")

      const microFantasma = getState().generarReporteRE({
        titulo: "Reporte COB",
        bloques: ["gastos_mes"],
        segmento: { microSectorIds: ["msx-fantasma"] },
      })
      expect(microFantasma.ok).toBe(false)
      expect(microFantasma.error).toContain("microSectorId msx-fantasma")

      const unidadFantasma = getState().generarReporteRE({
        titulo: "Reporte COB",
        bloques: ["gastos_mes"],
        segmento: { unidadIds: ["u-fantasma"] },
      })
      expect(unidadFantasma.ok).toBe(false)
      expect(unidadFantasma.error).toContain("unidadId u-fantasma")

      expect(getState().reportesRE).toHaveLength(0)
    })

    it("generarReporteRE congela el snapshot de los 4 bloques y audita", () => {
      const { unidadId } = unidadConPropietario()
      expect(
        emitirConDeuda("2090-01", "2090-01-05").length
      ).toBeGreaterThan(0)

      const r = getState().generarReporteRE({
        titulo: "Reporte personalizado COB",
        bloques: [
          "gastos_mes",
          "bitacora_seguridad",
          "morosidad",
          "consumo_insumos",
        ],
        segmento: { unidadIds: [unidadId] },
      })
      expect(r.ok).toBe(true)
      const reporte = getState().reportesRE[0]!
      expect(reporte.bloques).toHaveLength(4)
      expect(reporte.payloadSnapshot).toHaveLength(4)
      expect(
        reporte.payloadSnapshot.every((b) => b.lineas.length > 0)
      ).toBe(true)
      expect(reporte.destinatariosPersonaId).toEqual([])
      expect(reporte.fechaGeneracion).toBe(hoy())
      expect(
        getState().eventos.some((e) => e.tipoAccion === "RE_REPORT_GENERATED")
      ).toBe(true)
    })

    it("distribuirReporteRE rechaza inexistente y ya distribuido", () => {
      const inexistente = getState().distribuirReporteRE("re-nadie")
      expect(inexistente.ok).toBe(false)
      expect(inexistente.error).toContain("el reporte no existe")

      const { unidadId } = unidadConPropietario()
      expect(
        getState().generarReporteRE({
          titulo: "Reporte a distribuir COB",
          bloques: ["gastos_mes"],
          segmento: { unidadIds: [unidadId] },
        }).ok
      ).toBe(true)
      const id = getState().reportesRE[0]!.id

      expect(getState().distribuirReporteRE(id).ok).toBe(true)
      const guardado = getState().reportesRE[0]!
      expect(guardado.distribuidoA).toBeGreaterThan(0)
      expect(guardado.fechaDistribucion).toBe(hoy())

      const repetido = getState().distribuirReporteRE(id)
      expect(repetido.ok).toBe(false)
      expect(repetido.error).toContain("ya fue distribuido")
      expect(
        getState().eventos.some((e) => e.tipoAccion === "RE_REPORT_DISTRIBUTED")
      ).toBe(true)
    })
  })

  describe("FI — Finanzas legacy", () => {
    it("saveEgresoFI genera folio FE y valida fondo, sub-sector, unidad y acta", () => {
      const ok = getState().saveEgresoFI(egresoBase({}))
      expect(ok.ok).toBe(true)
      expect(getState().egresosFI.find((e) => e.id === "egr-cob-1")!.folio).toMatch(
        /^FE-\d{4}$/
      )
      expect(
        getState().eventos.some((e) => e.tipoAccion === "FI_EGRESS_CREATED")
      ).toBe(true)

      const sinFondo = getState().saveEgresoFI(
        egresoBase({ id: "egr-2", fondoId: "fondo-nadie" })
      )
      expect(sinFondo.ok).toBe(false)
      expect(sinFondo.error).toContain("fondo de imputación no existe")

      useCompassStore.setState((s) => ({
        fondosFI: s.fondosFI.map((f) =>
          f.id === "fondo-gc" ? { ...f, activo: false } : f
        ),
      }))
      const inactivo = getState().saveEgresoFI(egresoBase({ id: "egr-3" }))
      expect(inactivo.ok).toBe(false)
      expect(inactivo.error).toContain("inactivo")
      useCompassStore.setState((s) => ({
        fondosFI: s.fondosFI.map((f) =>
          f.id === "fondo-gc" ? { ...f, activo: true } : f
        ),
      }))

      const microFantasma = getState().saveEgresoFI(
        egresoBase({ id: "egr-4", microSectoresIds: ["ms-nadie"] })
      )
      expect(microFantasma.ok).toBe(false)
      expect(microFantasma.error).toContain("sub-sectores diferenciados")

      const unidadFantasma = getState().saveEgresoFI(
        egresoBase({ id: "egr-5", unidadId: "u-nadie" })
      )
      expect(unidadFantasma.ok).toBe(false)
      expect(unidadFantasma.error).toContain("unidad indicada no existe")

      const actaFantasma = getState().saveEgresoFI(
        egresoBase({ id: "egr-6", aprobacionActaGDId: "acta-nadie" })
      )
      expect(actaFantasma.ok).toBe(false)
      expect(actaFantasma.error).toContain("acta de aprobación indicada no existe")
    })

    it("emitirGastoComun valida período, duplicado, unidades y fondo GC", () => {
      const formato = getState().emitirGastoComun({ periodo: "2090-1" })
      expect(formato.ok).toBe(false)
      expect(formato.error).toContain("formato AAAA-MM")

      const sinElegibles = getState().emitirGastoComun({
        periodo: "2090-02",
        unidadIds: ["u-nadie"],
      })
      expect(sinElegibles.ok).toBe(false)
      expect(sinElegibles.error).toContain("No hay unidades elegibles")

      // Unidad recién creada sin vínculo de propietario: bloquea la emisión.
      const modelo = getState().unidades.find((u) => !u.id.startsWith("u-E-"))!
      useCompassStore.setState((s) => ({
        unidades: [...s.unidades, { ...modelo, id: "u-cob-sin-resp" }],
      }))
      const sinResponsable = getState().emitirGastoComun({
        periodo: "2090-03",
        unidadIds: ["u-cob-sin-resp"],
      })
      expect(sinResponsable.ok).toBe(false)
      expect(sinResponsable.error).toContain("sin responsable de cobro")

      useCompassStore.setState((s) => ({
        fondosFI: s.fondosFI.map((f) =>
          f.tipo === "gasto_comun" ? { ...f, activo: false } : f
        ),
      }))
      const sinFondoGC = getState().emitirGastoComun({ periodo: "2090-04" })
      expect(sinFondoGC.ok).toBe(false)
      expect(sinFondoGC.error).toContain("Fondo de Gasto Común activo")
      useCompassStore.setState((s) => ({
        fondosFI: s.fondosFI.map((f) =>
          f.tipo === "gasto_comun" ? { ...f, activo: true } : f
        ),
      }))

      useCompassStore.setState((s) => ({
        configuracion: { ...s.configuracion, modoCalculoGC: "variable" },
      }))
      const sinGastoTotal = getState().emitirGastoComun({
        periodo: "2090-05",
        unidadIds: [unidadConPropietario().unidadId],
      })
      expect(sinGastoTotal.ok).toBe(false)
      expect(sinGastoTotal.error).toContain("gasto total a recaudar")
    })

    it("emitirGastoComun emite en modo variable y fijo con cobros y aporte de reserva", () => {
      useCompassStore.setState((s) => ({
        configuracion: { ...s.configuracion, modoCalculoGC: "variable" },
      }))
      const { unidadId } = unidadConPropietario()
      const variable = getState().emitirGastoComun({
        periodo: "2091-01",
        unidadIds: [unidadId],
        gastoTotal: 100000,
        fechaVencimiento: "2091-02-05",
      })
      expect(variable.ok).toBe(true)
      const emision = getState().emisionesGC.find((e) => e.periodo === "2091-01")!
      expect(emision.modo).toBe("variable")
      expect(emision.lineas).toHaveLength(1)
      expect(emision.lineas[0]!.monto).toBeGreaterThan(0)
      // Aporte al Fondo de Reserva (5% del seed) sobre el total emitido.
      const totalLineas = emision.lineas.reduce((acc, l) => acc + l.monto, 0)
      expect(emision.fondoReservaAporte?.monto).toBe(
        Math.round(totalLineas * 0.05)
      )
      const cobro = getState().cobrosFI.find((c) => c.periodo === "2091-01")!
      expect(cobro.montoBase).toBe(emision.lineas[0]!.monto)
      expect(cobro.fechaVencimiento).toBe("2091-02-05")
      expect(
        getState().eventos.some((e) => e.tipoAccion === "FI_EMISION_GC")
      ).toBe(true)
      expect(
        getState().notificaciones.some((n) =>
          n.asunto.includes("Gasto Común 2091-01")
        )
      ).toBe(true)

      const duplicado = getState().emitirGastoComun({ periodo: "2091-01" })
      expect(duplicado.ok).toBe(false)
      expect(duplicado.error).toContain("ya fue procesado")

      useCompassStore.setState((s) => ({
        configuracion: { ...s.configuracion, modoCalculoGC: "fijo" },
      }))
      const fijo = getState().emitirGastoComun({
        periodo: "2091-02",
        unidadIds: [unidadId],
      })
      expect(fijo.ok).toBe(true)
      expect(
        getState().emisionesGC.find((e) => e.periodo === "2091-02")!.modo
      ).toBe("fijo")
    })

    it("aplicarMoraFI valida el cobro y es idempotente por día", () => {
      const cobroId = emitirConDeuda("2092-01", masDias(-10))

      const inexistente = getState().aplicarMoraFI("cob-nadie")
      expect(inexistente.ok).toBe(false)
      expect(inexistente.error).toContain("el cobro no existe")

      const tasaInvalida = getState().aplicarMoraFI(cobroId, 0)
      expect(tasaInvalida.ok).toBe(false)
      expect(tasaInvalida.error).toContain("mayor a cero")

      const noVencidoId = emitirConDeuda("2092-02", masDias(10))
      const noVencido = getState().aplicarMoraFI(noVencidoId)
      expect(noVencido.ok).toBe(false)
      expect(noVencido.error).toContain("aún no está vencido")

      const r = getState().aplicarMoraFI(cobroId)
      expect(r.ok).toBe(true)
      const cobro = getState().cobrosFI.find((c) => c.id === cobroId)!
      expect(cobro.moras).toHaveLength(1)
      expect(cobro.moras[0]!.diasAtraso).toBeGreaterThanOrEqual(10)
      expect(
        getState().eventos.some((e) => e.tipoAccion === "FI_MORA_APPLIED")
      ).toBe(true)
      // Segunda pasada del día: no duplica la mora.
      expect(getState().aplicarMoraFI(cobroId).ok).toBe(true)
      expect(getState().cobrosFI.find((c) => c.id === cobroId)!.moras).toHaveLength(1)

      // Cobro sin vencimiento registrado.
      useCompassStore.setState((s) => ({
        cobrosFI: s.cobrosFI.map((c) =>
          c.id === noVencidoId ? { ...c, fechaVencimiento: undefined } : c
        ),
      }))
      const sinVencimiento = getState().aplicarMoraFI(noVencidoId)
      expect(sinVencimiento.ok).toBe(false)
      expect(sinVencimiento.error).toContain("no tiene fecha de vencimiento")
    })

    it("registrarPagoFI valida monto/medio/ajuste y audita la diferencia", () => {
      const cobroId = emitirConDeuda("2093-01", masDias(-5))
      const pendiente = getState().cobrosFI.find((c) => c.id === cobroId)!
        .montoBase

      const inexistente = getState().registrarPagoFI("cob-nadie", {
        monto: 1000,
        medio: "transferencia",
      })
      expect(inexistente.ok).toBe(false)
      expect(inexistente.error).toContain("el cobro no existe")

      const sinMonto = getState().registrarPagoFI(cobroId, {
        monto: 0,
        medio: "transferencia",
      })
      expect(sinMonto.ok).toBe(false)
      expect(sinMonto.error).toContain("mayor a cero")

      const sinMedio = getState().registrarPagoFI(cobroId, {
        monto: 1000,
        medio: "  ",
      })
      expect(sinMedio.ok).toBe(false)
      expect(sinMedio.error).toContain("medio de pago")

      const sinJustificar = getState().registrarPagoFI(cobroId, {
        monto: pendiente - 1000,
        medio: "transferencia",
      })
      expect(sinJustificar.ok).toBe(false)
      expect(sinJustificar.error).toContain("justificación obligatoria")

      const justificacionCorta = getState().registrarPagoFI(cobroId, {
        monto: pendiente - 1000,
        medio: "transferencia",
        ajusteJustificacion: "corto",
      })
      expect(justificacionCorta.ok).toBe(false)
      expect(justificacionCorta.error).toContain("mínimo 10 caracteres")

      const descuento = getState().registrarPagoFI(cobroId, {
        monto: pendiente - 1000,
        medio: "transferencia",
        ajusteJustificacion: "Convenio de pago aprobado por el comité.",
      })
      expect(descuento.ok).toBe(true)
      const conDiferencia = getState().cobrosFI.find((c) => c.id === cobroId)!
      expect(conDiferencia.diferencias).toHaveLength(1)
      expect(conDiferencia.diferencias[0]!.tipo).toBe("descuento")
      expect(
        getState().eventos.some((e) => e.tipoAccion === "FI_MANUAL_DISCOUNT")
      ).toBe(true)
      expect(
        getState().notificaciones.some((n) => n.asunto.includes("Pago recibido"))
      ).toBe(true)

      const saldoRestante =
        pendiente - (pendiente - 1000)
      const cierre = getState().registrarPagoFI(cobroId, {
        monto: saldoRestante,
        medio: "efectivo",
      })
      expect(cierre.ok).toBe(true)

      const yaPagado = getState().registrarPagoFI(cobroId, {
        monto: 1000,
        medio: "efectivo",
      })
      expect(yaPagado.ok).toBe(false)
      expect(yaPagado.error).toContain("completamente pagado")
    })

    it("enviarCobranzaFI valida unidad, deuda y responsable", () => {
      const inexistente = getState().enviarCobranzaFI("u-nadie")
      expect(inexistente.ok).toBe(false)
      expect(inexistente.error).toContain("la unidad no existe")

      const { unidadId } = unidadConPropietario()
      const sinDeuda = getState().enviarCobranzaFI(unidadId)
      expect(sinDeuda.ok).toBe(false)
      expect(sinDeuda.error).toContain("no registra deuda vencida")

      emitirConDeuda("2094-01", masDias(-3))
      const cobranza = getState().enviarCobranzaFI(unidadId)
      expect(cobranza.ok).toBe(true)
      expect(
        getState().eventos.some((e) => e.tipoAccion === "FI_COBRANZA_SENT")
      ).toBe(true)
      expect(
        getState().notificaciones.some((n) =>
          n.asunto.includes("Recordatorio de deuda vencida")
        )
      ).toBe(true)

      // Cobro sobre una unidad sin responsable de cobro asignado.
      const modelo = getState().unidades.find((u) => !u.id.startsWith("u-E-"))!
      useCompassStore.setState((s) => ({
        unidades: [...s.unidades, { ...modelo, id: "u-cob-cobranza" }],
        cobrosFI: [
          ...s.cobrosFI,
          {
            ...s.cobrosFI[0]!,
            id: "cob-sin-resp",
            unidadId: "u-cob-cobranza",
            fechaVencimiento: masDias(-1),
          },
        ],
      }))
      const sinResponsable = getState().enviarCobranzaFI("u-cob-cobranza")
      expect(sinResponsable.ok).toBe(false)
      expect(sinResponsable.error).toContain("responsable de cobro asignado")
    })

    it("retirarFondoFI valida fondo, monto, acta y saldo", () => {
      const sinFondo = getState().retirarFondoFI({
        fondoId: "fondo-nadie",
        monto: 1000,
        descripcion: "Pago proveedor",
      })
      expect(sinFondo.ok).toBe(false)
      expect(sinFondo.error).toContain("el fondo no existe")

      useCompassStore.setState((s) => ({
        fondosFI: s.fondosFI.map((f) =>
          f.id === "fondo-gc" ? { ...f, activo: false } : f
        ),
      }))
      const inactivo = getState().retirarFondoFI({
        fondoId: "fondo-gc",
        monto: 1000,
        descripcion: "Pago proveedor",
      })
      expect(inactivo.ok).toBe(false)
      expect(inactivo.error).toContain("está inactivo")
      useCompassStore.setState((s) => ({
        fondosFI: s.fondosFI.map((f) =>
          f.id === "fondo-gc" ? { ...f, activo: true } : f
        ),
      }))

      const montoCero = getState().retirarFondoFI({
        fondoId: "fondo-gc",
        monto: 0,
        descripcion: "Pago proveedor",
      })
      expect(montoCero.ok).toBe(false)
      expect(montoCero.error).toContain("mayor a cero")

      const sinDescripcion = getState().retirarFondoFI({
        fondoId: "fondo-gc",
        monto: 1000,
        descripcion: "   ",
      })
      expect(sinDescripcion.ok).toBe(false)
      expect(sinDescripcion.error).toContain("describir el uso del dinero")

      expect(
        getState().saveFondoFI(
          fondoBase({ id: "fondo-reserva-cob", tipo: "reserva" })
        ).ok
      ).toBe(true)
      const reservaSinActa = getState().retirarFondoFI({
        fondoId: "fondo-reserva-cob",
        monto: 1000,
        descripcion: "Pago proveedor",
      })
      expect(reservaSinActa.ok).toBe(false)
      expect(reservaSinActa.error).toContain("Fondo de Reserva exige aprobación")

      const actaFantasma = getState().retirarFondoFI({
        fondoId: "fondo-reserva-cob",
        monto: 1000,
        descripcion: "Pago proveedor",
        aprobacionActaGDId: "acta-nadie",
      })
      expect(actaFantasma.ok).toBe(false)
      expect(actaFantasma.error).toContain("acta de aprobación indicada no existe")

      expect(
        getState().saveActaGD({
          id: "acta-borrador-cob",
          fecha: "2026-08-25",
          hora: "19:00",
          lugar: "Sede COB",
          tablaTemas: [],
          presentes: [],
          ausentes: [],
          invitados: [],
          minuta: "Acta sin aprobar.",
          adjuntos: [],
          estado: "borrador",
          aprobaciones: [],
        }).ok
      ).toBe(true)
      const actaNoPublicada = getState().retirarFondoFI({
        fondoId: "fondo-reserva-cob",
        monto: 1000,
        descripcion: "Pago proveedor",
        aprobacionActaGDId: "acta-borrador-cob",
      })
      expect(actaNoPublicada.ok).toBe(false)
      expect(actaNoPublicada.error).toContain("Solo un acta Publicada")

      expect(
        getState().saveFondoFI(
          fondoBase({
            id: "fondo-cob-pobre",
            nombre: "Fondo COB pobre",
            saldoInicial: 1000,
          })
        ).ok
      ).toBe(true)
      const sinSaldo = getState().retirarFondoFI({
        fondoId: "fondo-cob-pobre",
        monto: 50000,
        descripcion: "Pago proveedor",
      })
      expect(sinSaldo.ok).toBe(false)
      expect(sinSaldo.error).toContain("Saldo insuficiente")

      expect(
        getState().saveFondoFI(
          fondoBase({
            id: "fondo-cob-rico",
            nombre: "Fondo COB rico",
            saldoInicial: 1_000_000,
          })
        ).ok
      ).toBe(true)
      // El saldo del fondo se compone de los pagos registrados sobre sus cobros.
      emitirConDeuda("2096-01", masDias(10))
      const baseCobro = getState().cobrosFI.find(
        (c) => c.periodo === "2096-01"
      )!
      useCompassStore.setState((s) => ({
        cobrosFI: [
          ...s.cobrosFI,
          {
            ...baseCobro,
            id: "cob-rico",
            periodo: "2096-02",
            fondoId: "fondo-cob-rico",
            pagos: [
              {
                id: "pag-rico",
                monto: baseCobro.montoBase,
                fecha: hoy(),
                medio: "transferencia",
              },
            ],
          },
        ],
      }))
      const ok = getState().retirarFondoFI({
        fondoId: "fondo-cob-rico",
        monto: 5000,
        descripcion: "Compra de pintura para escaleras",
      })
      expect(ok.ok).toBe(true)
      const egreso = getState().egresosFI.find(
        (e) => e.fondoId === "fondo-cob-rico"
      )!
      expect(egreso.categoria).toBe("uso_de_fondo")
      expect(egreso.monto).toBe(5000)
      expect(
        getState().eventos.some((e) => e.tipoAccion === "FI_FUND_WITHDRAWN")
      ).toBe(true)
    })
  })

  describe("PE — Personal y Servicios legacy", () => {
    it("completarTareaMonitoreoPE rechaza inexistente/cerrada y finaliza la tarea", () => {
      const inexistente = getState().completarTareaMonitoreoPE("mt-nadie")
      expect(inexistente.ok).toBe(false)
      expect(inexistente.error).toContain("no existe en Mantenimiento")

      const unidadId = getState().unidades[0]!.id
      expect(
        getState().saveTrabajoMT(trabajoBase({ id: "mt-pe-1", unidadId })).ok
      ).toBe(true)
      expect(getState().finalizarTrabajoMT("mt-pe-1").ok).toBe(true)
      const cerrada = getState().completarTareaMonitoreoPE("mt-pe-1")
      expect(cerrada.ok).toBe(false)
      expect(cerrada.error).toContain("ya se encuentra cerrada")

      expect(
        getState().saveTrabajoMT(trabajoBase({ id: "mt-pe-2", unidadId })).ok
      ).toBe(true)
      expect(getState().completarTareaMonitoreoPE("mt-pe-2").ok).toBe(true)
      const tarea = getState().trabajosMT.find((t) => t.id === "mt-pe-2")!
      expect(tarea.estado).toBe("finalizado")
      expect(tarea.fechaTermino).toBeTruthy()
      expect(
        getState().eventos.some((e) => e.tipoAccion === "PE_TASK_DONE")
      ).toBe(true)
    })

    it("saveIngresoContratistaPE valida FKs y confirmarIngreso cambia el estado", () => {
      const contratista = getState().saveIngresoContratistaPE(
        ingresoBase({ contratistaId: "cont-nadie" })
      )
      expect(contratista.ok).toBe(false)
      expect(contratista.error).toContain("maestro de contratistas")

      const jornada = getState().saveIngresoContratistaPE(
        ingresoBase({ id: "ing-2", jornadaId: "j-nadie" })
      )
      expect(jornada.ok).toBe(false)
      expect(jornada.error).toContain("maestro de jornadas")

      const unidad = getState().saveIngresoContratistaPE(
        ingresoBase({ id: "ing-3", unidadId: "u-nadie" })
      )
      expect(unidad.ok).toBe(false)
      expect(unidad.error).toContain("no existe en el inventario")

      const persona = getState().saveIngresoContratistaPE(
        ingresoBase({ id: "ing-4", personaAgendaId: "p-nadie" })
      )
      expect(persona.ok).toBe(false)
      expect(persona.error).toContain("Maestro de Personas")

      expect(getState().saveIngresoContratistaPE(ingresoBase({})).ok).toBe(true)

      const inexistente = getState().confirmarIngresoContratistaPE("ing-nadie")
      expect(inexistente.ok).toBe(false)
      expect(inexistente.error).toContain("El ingreso agendado no existe")

      expect(getState().confirmarIngresoContratistaPE("ing-cob-1").ok).toBe(true)
      const ingreso = getState().ingresosContratistasPE.find(
        (i) => i.id === "ing-cob-1"
      )!
      expect(ingreso.estado).toBe("ingresado")
      expect(ingreso.horaIngreso).toBeTruthy()
      expect(
        getState().eventos.some(
          (e) => e.tipoAccion === "PE_CONTRATISTA_INGRESADO"
        )
      ).toBe(true)

      const yaIngresado = getState().confirmarIngresoContratistaPE("ing-cob-1")
      expect(yaIngresado.ok).toBe(false)
      expect(yaIngresado.error).toContain("Solo ingresos agendados")
    })

    it("ingresarBitacoraVisitaPE sella la visita agendada y notifica al destino", () => {
      const inexistente = getState().ingresarBitacoraVisitaPE("vis-nadie")
      expect(inexistente.ok).toBe(false)
      expect(inexistente.error).toContain("La visita agendada no existe")

      const destino = getState().personas[0]!.id
      expect(
        getState().saveBitacoraVisitaPE(
          visitaBase({ id: "vis-cob-2", destinoPersonaId: destino, unidadId: getState().unidades[0]!.id })
        ).ok
      ).toBe(true)

      expect(getState().ingresarBitacoraVisitaPE("vis-cob-2").ok).toBe(true)
      const visita = getState().bitacoraVisitasPE.find(
        (v) => v.id === "vis-cob-2"
      )!
      expect(visita.estado).toBe("ingresada")
      expect(visita.horaIngreso).toBeTruthy()
      expect(
        getState().notificaciones.some((n) => n.asunto.includes("Visita ingresada"))
      ).toBe(true)

      const repetida = getState().ingresarBitacoraVisitaPE("vis-cob-2")
      expect(repetida.ok).toBe(false)
      expect(repetida.error).toContain("Solo las visitas agendadas")
    })

    it("cerrarTurnoPE valida trabajador, jornada, checklist, incidencias y duplicados", () => {
      const sinTrabajador = getState().cerrarTurnoPE({
        ...cierreValido(),
        trabajadorPersonaId: "p-nadie",
      })
      expect(sinTrabajador.ok).toBe(false)
      expect(sinTrabajador.error).toContain("no existe en el Maestro de Personas")

      // Se limpia la ficha del seed para forzar el rechazo por falta de ficha laboral.
      useCompassStore.setState((s) => ({
        personas: s.personas.map((p) =>
          p.id === "p-4" ? { ...p, datosLaborales: undefined } : p
        ),
      }))
      const sinFicha = getState().cerrarTurnoPE(cierreValido())
      expect(sinFicha.ok).toBe(false)
      expect(sinFicha.error).toContain("no tiene ficha laboral")

      expect(getState().savePersona(personaConFicha("p-4")).ok).toBe(true)

      const jornadaFantasma = getState().cerrarTurnoPE({
        ...cierreValido(),
        jornadaReportadaId: "j-nadie",
      })
      expect(jornadaFantasma.ok).toBe(false)
      expect(jornadaFantasma.error).toContain("maestro de jornadas")

      const sinDescripcion = getState().cerrarTurnoPE({
        ...cierreValido(),
        incidencias: { hubo: true, descripcion: "   ", evidencias: [] },
      })
      expect(sinDescripcion.ok).toBe(false)
      expect(sinDescripcion.error).toContain("describir lo ocurrido")

      const sinEvidencia = getState().cerrarTurnoPE({
        ...cierreValido(),
        incidencias: {
          hubo: true,
          descripcion: "Portón atascado durante la ronda nocturna completa.",
          evidencias: [],
        },
      })
      expect(sinEvidencia.ok).toBe(false)
      expect(sinEvidencia.error).toContain("al menos una evidencia")

      const sinChecklist = getState().cerrarTurnoPE({
        ...cierreValido(),
        checklistInstalaciones: [],
      })
      expect(sinChecklist.ok).toBe(false)
      expect(sinChecklist.error).toContain("checklist de instalaciones")

      expect(getState().cerrarTurnoPE(cierreValido()).ok).toBe(true)
      const cierre = getState().cierresTurnoPE[0]!
      expect(cierre.notificadoAAdmin).toBe(true)
      expect(
        getState().notificaciones.some(
          (n) => n.moduloOrigen === "PE" && n.destinatarioRol === "administracion"
        )
      ).toBe(true)
      expect(
        getState().notificaciones.some(
          (n) => n.moduloOrigen === "PE" && n.destinatarioRol === "personal"
        )
      ).toBe(true)
      expect(
        getState().eventos.some((e) => e.tipoAccion === "PE_CIERRE_TURNO")
      ).toBe(true)

      const duplicado = getState().cerrarTurnoPE(cierreValido())
      expect(duplicado.ok).toBe(false)
      expect(duplicado.error).toContain("ya registró un cierre")
    })
  })
})
