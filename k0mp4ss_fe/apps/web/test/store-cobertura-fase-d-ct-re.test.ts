import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { useCompassStore } from "@/lib/store"
import type {
  CertificadoCT,
  LiquidacionPL,
  PeriodoDirectiva,
} from "@/lib/schemas"
import { resetStore, lastEvent } from "./helpers"

/**
 * Fase D de cobertura del store legacy (SERIE-DEUDA-2 D4, change
 * `store-cobertura-fase-d`): `generarCertificadoCT` y `distribuirReporteRE`.
 * Se afirma el `StoreResult` y el efecto observable contra la API pública
 * (`useCompassStore`): validaciones, estado resultante y eventos de auditoría.
 */
const getState = () => useCompassStore.getState()

/** Unidad residencial del seed (excluye estacionamientos `u-E-*`). */
const unidadLibre = () => getState().unidades.find((u) => !u.id.startsWith("u-E-"))!

const cobroGC = (unidadId: string, montoBase: number) => ({
  id: "cob-gc-d",
  unidadId,
  periodo: "2026-09",
  concepto: "gasto_comun" as const,
  origenModulo: "FI" as const,
  fondoId: "fondo-gc-d",
  descripcion: "Gasto común septiembre",
  montoBase,
  fechaCargo: "2026-09-01",
  fechaVencimiento: "2026-09-05",
  moras: [],
  pagos: [],
  diferencias: [],
})

const liquidacionCT = (partial: Partial<LiquidacionPL>): LiquidacionPL =>
  ({
    id: "liq-d-1",
    folio: "LIQ-0042",
    trabajadorPersonaId: "p-4",
    periodo: "2026-08",
    fechaGeneracion: "2026-08-25",
    diasTrabajados: 30,
    sueldoBaseContrato: 600000,
    diasMesComercial: 30,
    jornadaSemanal: 45,
    sueldoBaseProporcional: 600000,
    horasExtrasHoras: 0,
    valorHoraOrdinaria: 3111,
    montoHorasExtras: 0,
    bonos: [],
    gratificacionLegal: 150000,
    totalImponible: 750000,
    asignacionMovilizacion: 0,
    asignacionColacion: 0,
    cargas: 0,
    montoAsignacionFamiliar: 0,
    totalHaberes: 750000,
    nombreAfp: "AFP Habitat",
    tasaAFP: 10.58,
    montoAFP: 79350,
    nombreSalud: "FONASA",
    saludTipo: "fonasa",
    montoSalud: 52500,
    tasaSIS: 1.48,
    montoSIS: 11100,
    montoSeguroCesantia: 4500,
    montoAPV: 0,
    totalDescuentos: 147450,
    descuentoAnticipos: 0,
    adelantosIds: [],
    alcanceLiquido: 602550,
    liquidoAPagar: 602550,
    estado: "confirmada",
    egresoFIReferencia: "egr-x",
    ...partial,
  }) as LiquidacionPL

const certificadoCT = (partial: Partial<CertificadoCT>): CertificadoCT =>
  ({
    id: "test-ct-seed",
    folio: "CT-0001",
    codigoVerificacion: "VC-SEED01",
    tipo: "al_dia",
    solicitanteNombre: "QA TEST",
    resumen: "resumen de prueba",
    detalle: [],
    fechaEmision: "2026-01-01",
    ...partial,
  }) as CertificadoCT

const periodoVigente = (
  id: string,
  personaId: string,
  nombre: string
): PeriodoDirectiva =>
  ({
    id,
    fechaInicio: "2025-03-01",
    duracionMeses: 24,
    fechaInscripcion: "2025-03-05",
    referenciaInscripcion: "Acta de asamblea TEST D4",
    estado: "vigente",
    miembros: [
      {
        personaId,
        nombre,
        cargo: "presidente",
        fechaAsuncion: "2025-03-01",
      },
    ],
  }) as PeriodoDirectiva

// --- CT: Certificados ---

describe("generarCertificadoCT — validaciones de media y de tipo", () => {
  beforeEach(() => resetStore())
  afterEach(() => vi.restoreAllMocks())

  it("rechaza la firma digitalizada embebida (data:/blob:) sin emitir", () => {
    const unidadId = unidadLibre().id
    const cfg = getState().configuracion
    for (const firmaUrl of [
      "data:image/png;base64,AAAA",
      "blob:https://localhost/firma",
    ]) {
      useCompassStore.setState({
        configuracion: { ...cfg, firmaDigitalizadaUrl: firmaUrl },
      })
      const r = getState().generarCertificadoCT({
        tipo: "al_dia",
        unidadId,
        solicitanteNombre: "QA TEST",
      })
      expect(r.ok).toBe(false)
      expect(r.ok === false && r.error).toContain("Media por referencia")
    }
    expect(getState().certificadosCT).toHaveLength(0)
  })

  it("exige los datos mínimos según el tipo de certificado", () => {
    const rRes = getState().generarCertificadoCT({
      tipo: "residencia",
      solicitanteNombre: "QA TEST",
    })
    expect(rRes.ok).toBe(false)
    expect(rRes.ok === false && rRes.error).toContain("exige persona y unidad")

    const rCta = getState().generarCertificadoCT({
      tipo: "estado_cuenta",
      solicitanteNombre: "QA TEST",
    })
    expect(rCta.ok).toBe(false)
    expect(rCta.ok === false && rCta.error).toContain("exige una unidad")

    const rLiq = getState().generarCertificadoCT({
      tipo: "liquidacion_sueldo",
      solicitanteNombre: "QA TEST",
    })
    expect(rLiq.ok).toBe(false)
    expect(rLiq.ok === false && rLiq.error).toContain("exige una liquidación")
    expect(getState().certificadosCT).toHaveLength(0)
  })

  it("estado de cuenta sin propietario vigente cae al marcador '—'", () => {
    const unidadSinDueno = getState().unidades.find(
      (u) =>
        !getState().vinculos.some(
          (v) => v.unidadId === u.id && v.rol === "propietario" && !v.fechaFin
        )
    )!
    const r = getState().generarCertificadoCT({
      tipo: "estado_cuenta",
      unidadId: unidadSinDueno.id,
      solicitanteNombre: "QA TEST",
    })
    expect(r.ok).toBe(true)
    const cert = getState().certificadosCT.at(-1)!
    expect(cert.detalle.find((d) => d.clave === "Propietario")?.valor).toBe("—")
  })

  it("al día rechaza una unidad con saldo pendiente", () => {
    const unidad = getState().unidades.find((u) =>
      getState().vinculos.some(
        (v) => v.unidadId === u.id && v.rol === "propietario" && !v.fechaFin
      )
    )!
    useCompassStore.setState({ cobrosFI: [cobroGC(unidad.id, 100000) as never] })
    const r = getState().generarCertificadoCT({
      tipo: "al_dia",
      unidadId: unidad.id,
      solicitanteNombre: "QA TEST",
    })
    expect(r.ok).toBe(false)
    expect(r.ok === false && r.error).toContain("saldo <= 0")
  })

  it("certificado de liquidación usa el id cuando no hay ficha en MP", () => {
    useCompassStore.setState({
      liquidacionesPL: [
        liquidacionCT({ id: "liq-d-1", trabajadorPersonaId: "p-fantasma" }) as never,
      ],
    })
    const r = getState().generarCertificadoCT({
      tipo: "liquidacion_sueldo",
      liquidacionId: "liq-d-1",
      solicitanteNombre: "QA TEST",
    })
    expect(r.ok).toBe(true)
    const cert = getState().certificadosCT.at(-1)!
    expect(cert.detalle.find((d) => d.clave === "Trabajador")?.valor).toBe(
      "p-fantasma"
    )
    expect(cert.personaId).toBe("p-fantasma")
    expect(lastEvent()?.tipoAccion).toBe("CT_GENERATE_PAYROLL")
  })

  it("congela el snapshot de la directiva vigente al emitir", () => {
    const unidadId = unidadLibre().id
    const miembro = getState().personas.find(
      (x) => x.datosGobernanza && x.estadoCuenta === "activa"
    )!
    useCompassStore.setState((s) => ({
      periodosDirectiva: [
        periodoVigente("pd-d-1", miembro.id, miembro.nombreCompleto),
      ],
      personas: s.personas.map((x) =>
        x.id === miembro.id
          ? {
              ...x,
              datosGobernanza: { ...x.datosGobernanza!, periodoId: "pd-d-1" },
            }
          : x
      ),
    }))
    const r = getState().generarCertificadoCT({
      tipo: "al_dia",
      unidadId,
      solicitanteNombre: "QA TEST",
    })
    expect(r.ok).toBe(true)
    const cert = getState().certificadosCT.at(-1)!
    expect(cert.directivaRef?.periodoId).toBe("pd-d-1")
    expect(
      cert.directivaRef?.firmantes.some((f) => f.personaId === miembro.id)
    ).toBe(true)
    expect(lastEvent()?.tipoAccion).toBe("CT_GENERATE_AL_DIA")
  })

  it("regenera el código de verificación cuando colisiona con uno existente", () => {
    useCompassStore.setState({
      certificadosCT: [
        certificadoCT({
          id: "test-ct-a",
          codigoVerificacion: "VC-4FZZZXJY",
        }),
      ],
    })
    const spy = vi
      .spyOn(Math, "random")
      .mockReturnValueOnce(0.123456789)
      .mockReturnValueOnce(0.987654321)
    const r = getState().generarCertificadoCT({
      tipo: "al_dia",
      unidadId: unidadLibre().id,
      solicitanteNombre: "QA TEST",
      id: "ct-d-colision",
    })
    expect(r.ok).toBe(true)
    const cert = getState().certificadosCT.find((c) => c.id === "ct-d-colision")!
    expect(cert.codigoVerificacion).toBe("VC-ZK00000Y")
    expect(cert.codigoVerificacion).not.toBe("VC-4FZZZXJY")
    // 1 código colisionado + 1 reintento (+ el id del evento de auditoría).
    expect(spy.mock.calls.length).toBeGreaterThanOrEqual(2)
  })
})

// --- RE: Reportería ---

describe("distribuirReporteRE — alcance, segmentación y bandejas", () => {
  beforeEach(() => resetStore())

  it("rechaza un reporte inexistente", () => {
    const r = getState().distribuirReporteRE("rep-nadie")
    expect(r.ok).toBe(false)
    expect(r.ok === false && r.error).toContain("no existe")
  })

  it("rechaza cuando la segmentación no resuelve destinatarios vigentes", () => {
    const gen = getState().generarReporteRE({
      titulo: "RE vacío TEST D4",
      bloques: ["morosidad"],
      segmento: {},
      id: "rep-d-vacio",
    })
    expect(gen.ok).toBe(true)
    const r = getState().distribuirReporteRE("rep-d-vacio")
    expect(r.ok).toBe(false)
    expect(r.ok === false && r.error).toContain("no resolvió destinatarios")
    expect(
      getState().reportesRE.find((x) => x.id === "rep-d-vacio")!.distribuidoA
    ).toBe(0)
  })

  it("resuelve el alcance EF por micro y macro sector y notifica por bandeja", () => {
    const micro = getState().microSectores.find((m) =>
      m.macroSectorId.startsWith("torre")
    )!
    const macro = getState().macroSectores.find(
      (m) => m.id === micro.macroSectorId
    )!
    const gen = getState().generarReporteRE({
      titulo: "Boletín D TEST",
      bloques: ["gastos_mes"],
      segmento: {
        microSectorIds: [micro.id],
        macroSectorIds: [macro.id],
        perfiles: ["personal", "administracion"],
        tenencias: ["propietarios", "arrendatarios"],
      },
      id: "rep-d-alcance",
    })
    expect(gen.ok).toBe(true)
    // Segundo reporte presente: el `.map` de la distribución recorre también los
    // registros que no son el distribuido (rama `: r`).
    useCompassStore.setState((s) => ({
      reportesRE: [
        ...s.reportesRE,
        { ...s.reportesRE[0]!, id: "rep-d-otro", titulo: "Boletín vecino TEST" },
      ],
    }))
    const antesNotif = getState().notificaciones.filter(
      (n) => n.moduloOrigen === "RE"
    ).length
    const r = getState().distribuirReporteRE("rep-d-alcance")
    expect(r.ok).toBe(true)
    const rep = getState().reportesRE.find((x) => x.id === "rep-d-alcance")!
    expect(rep.distribuidoA).toBe(rep.destinatariosPersonaId.length)
    expect(rep.distribuidoA).toBeGreaterThan(0)
    expect(rep.fechaDistribucion).toBeTruthy()
    const notis = getState().notificaciones.filter((n) => n.moduloOrigen === "RE")
    expect(notis.length - antesNotif).toBe(rep.distribuidoA)
    expect(
      getState().reportesRE.find((x) => x.id === "rep-d-otro")!.distribuidoA
    ).toBe(0)
    const bandejas = new Set(notis.map((n) => n.destinatarioRol))
    expect(bandejas.has("personal")).toBe(true)
    expect(bandejas.has("directiva")).toBe(true)
    expect(bandejas.has("residente")).toBe(true)
    expect(lastEvent()?.tipoAccion).toBe("RE_REPORT_DISTRIBUTED")
  })

  it("distribuye sin detalle cuando el snapshot no tiene líneas", () => {
    const gen = getState().generarReporteRE({
      titulo: "Boletín sin snapshot TEST",
      bloques: ["gastos_mes"],
      segmento: { perfiles: ["personal"] },
      id: "rep-d-sinsnap",
    })
    expect(gen.ok).toBe(true)
    useCompassStore.setState((s) => ({
      reportesRE: s.reportesRE.map((x) =>
        x.id === "rep-d-sinsnap" ? { ...x, payloadSnapshot: [] } : x
      ),
    }))
    expect(getState().distribuirReporteRE("rep-d-sinsnap").ok).toBe(true)
  })
})
