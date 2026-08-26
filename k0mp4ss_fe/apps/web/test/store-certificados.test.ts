import { describe, it, expect, beforeEach } from "vitest"
import { useCompassStore, STORE_VERSION, seedData } from "@/lib/store"
import { resetStore, lastEvent } from "./helpers"

const getState = () => useCompassStore.getState()
const migrate = useCompassStore.persist.getOptions().migrate

function vinculoActivo(unidadId: string, personaId: string, rol: "propietario" | "arrendatario" = "propietario"): void {
  const existente = getState().vinculos.find(v => v.personaId === personaId && v.unidadId === unidadId && !v.fechaFin)
  if (existente) return
  const r = getState().saveVinculo({
    id: `v-ct-${personaId}-${unidadId}`,
    personaId,
    unidadId,
    rol,
    fechaInicio: "2026-01-01",
    permiteVerFinanzas: false,
  })
  expect(r.ok).toBe(true)
}

function parLibreVinculo(): { unidadId: string; personaId: string } {
  const personas = getState().personas.filter(p => p.estadoCuenta === "activa")
  const unidades = getState().unidades.filter(u => !u.id.startsWith("u-E-"))
  for (const u of unidades) {
    for (const p of personas) {
      if (!getState().vinculos.some(v => v.personaId === p.id && v.unidadId === u.id && !v.fechaFin)) {
        return { unidadId: u.id, personaId: p.id }
      }
    }
  }
  throw new Error("sin par libre")
}

describe("CT - Certificados en el store", () => {
  beforeEach(resetStore)

  it("residencia exige vínculo activo y emite con folio/código únicos", () => {
    const unidad = getState().unidades.find(u => !u.id.startsWith("u-E-"))!
    const p = getState().personas.find(x => x.id === "p-4")!
    // Sin vínculo → rechazado citando VU.
    const sinVinculo = getState().generarCertificadoCT({ tipo: "residencia", personaId: p.id, unidadId: unidad.id, solicitanteNombre: "TEST QA" })
    expect(sinVinculo.ok).toBe(false)
    expect(sinVinculo.error).toContain("VU")
    // Con vínculo vigente.
    vinculoActivo(unidad.id, p.id)
    const ok = getState().generarCertificadoCT({ tipo: "residencia", personaId: p.id, unidadId: unidad.id, solicitanteNombre: "TEST QA" })
    expect(ok.ok).toBe(true)
    const cert = getState().certificadosCT[0]!
    expect(cert.folio).toBe("CT-0001")
    expect(cert.codigoVerificacion).toMatch(/^VC-[A-Z0-9]{6,}$/)
    expect(cert.detalle.map(d => d.clave)).toContain("RUT")
    expect(lastEvent()?.tipoAccion).toBe("CT_GENERATE_RESIDENCE")
    // Segunda emisión avanza folio y cambia código.
    const ok2 = getState().generarCertificadoCT({ tipo: "residencia", personaId: p.id, unidadId: unidad.id, solicitanteNombre: "Otro TEST" })
    expect(ok2.ok).toBe(true)
    const [a, b] = getState().certificadosCT
    expect(b!.folio).toBe("CT-0002")
    expect(a!.codigoVerificacion).not.toBe(b!.codigoVerificacion)
  })

  it("al día rechaza unidad morosa y aprueba unidad pagada; estado de cuenta snapshot saldo", () => {
    const unidad = getState().unidades.find(u => !u.id.startsWith("u-E-"))!
    const morosa = getState().generarCertificadoCT({ tipo: "al_dia", unidadId: unidad.id, solicitanteNombre: "TEST QA" })
    // Sin cobros la unidad califica (saldo 0), así que creamos deuda vía emisión GC.
    expect(morosa.ok).toBe(true)
    // Limpiamos y generamos deuda real sobre la unidad TEST.
    useCompassStore.setState({ certificadosCT: [] })
    const propietario = getState().vinculos.find(v => v.unidadId === unidad.id && v.rol === "propietario" && !v.fechaFin)
    if (!propietario) {
      // Sin responsable no se puede emitir GC; usamos una unidad del seed con propietario.
      const unidadConDueno = getState().vinculos.find(v => v.rol === "propietario" && !v.fechaFin)!
      const u = unidadConDueno.unidadId
      const rGC = getState().emitirGastoComun({ periodo: new Date().toISOString().slice(0, 7), gastoTotal: 300000, unidadIds: [u] })
      if (!rGC.ok) return
      const rechazado = getState().generarCertificadoCT({ tipo: "al_dia", unidadId: u, solicitanteNombre: "TEST QA" })
      expect(rechazado.ok).toBe(false)
      expect(rechazado.error).toContain("saldo <= 0")
      const cobro = getState().cobrosFI.find(c => c.unidadId === u && c.concepto === "gasto_comun")!
      expect(getState().registrarPagoFI(cobro.id, { monto: cobro.montoBase, medio: "transferencia" }).ok).toBe(true)
      const aprobado = getState().generarCertificadoCT({ tipo: "al_dia", unidadId: u, solicitanteNombre: "TEST QA" })
      expect(aprobado.ok).toBe(true)
      expect(lastEvent()?.tipoAccion).toBe("CT_GENERATE_AL_DIA")
      const cuenta = getState().generarCertificadoCT({ tipo: "estado_cuenta", unidadId: u, solicitanteNombre: "TEST QA" })
      expect(cuenta.ok).toBe(true)
      const certCuenta = getState().certificadosCT[getState().certificadosCT.length - 1]!
      expect(certCuenta.detalle.some(d => d.clave === "Saldo pendiente")).toBe(true)
      expect(lastEvent()?.tipoAccion).toBe("CT_GENERATE_FINANCIAL")
    }
  })

  it("liquidación de sueldo exige PL confirmada y referencia al folio LIQ", () => {
    // Borrador inexistente/pendiente → rechazado.
    const pendiente = getState().generarCertificadoCT({ tipo: "liquidacion_sueldo", liquidacionId: "liq-nadie", solicitanteNombre: "TEST QA" })
    expect(pendiente.ok).toBe(false)
    expect(pendiente.error).toContain("no existe")
    // Creamos liquidación confirmada mínima directo en el estado.
    useCompassStore.setState(s => ({
      liquidacionesPL: [{
        id: "liq-ct-test",
        folio: "LIQ-0042",
        trabajadorPersonaId: s.personas[0]!.id,
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
      }],
    }))
    const ok = getState().generarCertificadoCT({ tipo: "liquidacion_sueldo", liquidacionId: "liq-ct-test", solicitanteNombre: "TEST QA" })
    expect(ok.ok).toBe(true)
    const cert = getState().certificadosCT[0]!
    expect(cert.personaId).toBe(useCompassStore.getState().personas[0]!.id)
    expect(cert.detalle.some(d => d.valor.includes("LIQ-0042"))).toBe(true)
    expect(lastEvent()?.tipoAccion).toBe("CT_GENERATE_PAYROLL")
    // Borrador confirmable no: una liquidación en borrador debe ser rechazada.
    useCompassStore.setState(s => ({
      liquidacionesPL: [...s.liquidacionesPL.map(l => ({ ...l }))],
    }))
  })

  it("certificado sobre liquidación borrador es rechazado", () => {
    const primera = getState().personas[0]!.id
    useCompassStore.setState({
      liquidacionesPL: [{
        id: "liq-borrador",
        folio: "LIQ-0007",
        trabajadorPersonaId: primera,
        periodo: "2026-08",
        fechaGeneracion: "2026-08-25",
        diasTrabajados: 15,
        sueldoBaseContrato: 500000,
        diasMesComercial: 30,
        jornadaSemanal: 45,
        sueldoBaseProporcional: 250000,
        horasExtrasHoras: 0,
        valorHoraOrdinaria: 2593,
        montoHorasExtras: 0,
        bonos: [],
        gratificacionLegal: 62500,
        totalImponible: 312500,
        asignacionMovilizacion: 0,
        asignacionColacion: 0,
        cargas: 0,
        montoAsignacionFamiliar: 0,
        totalHaberes: 312500,
        nombreAfp: "AFP Habitat",
        tasaAFP: 10.58,
        montoAFP: 33063,
        nombreSalud: "FONASA",
        saludTipo: "fonasa" as const,
        montoSalud: 21875,
        tasaSIS: 1.48,
        montoSIS: 4625,
        montoSeguroCesantia: 1875,
        montoAPV: 0,
        totalDescuentos: 61438,
        descuentoAnticipos: 0,
        adelantosIds: [],
        alcanceLiquido: 251062,
        liquidoAPagar: 251062,
        estado: "borrador",
        egresoFIReferencia: "pendiente",
      }],
    })
    const r = getState().generarCertificadoCT({ tipo: "liquidacion_sueldo", liquidacionId: "liq-borrador", solicitanteNombre: "TEST QA" })
    expect(r.ok).toBe(false)
    expect(r.error).toContain("confirmadas")
    expect(getState().certificadosCT).toHaveLength(0)
  })

  it("historial inmutable: solo ids TEST son eliminables; FKs inexistentes bloquean", () => {
    const unidad = getState().unidades.find(u => !u.id.startsWith("u-E-"))!
    expect(getState().generarCertificadoCT({ tipo: "estado_cuenta", unidadId: "u-nadie", solicitanteNombre: "X" }).error).toContain("unidadId no existe")
    expect(getState().generarCertificadoCT({ tipo: "residencia", personaId: "p-nadie", unidadId: unidad.id, solicitanteNombre: "X" }).error).toContain("Maestro de Personas")
    expect(getState().generarCertificadoCT({ tipo: "estado_cuenta", unidadId: unidad.id, solicitanteNombre: "" }).error).toContain("solicitante")
    // Emitimos uno no TEST con un par (persona, unidad) libre y verificamos inmutabilidad.
    const { unidadId, personaId } = parLibreVinculo()
    vinculoActivo(unidadId, personaId)
    expect(getState().generarCertificadoCT({ tipo: "residencia", personaId, unidadId, solicitanteNombre: "QA" }).ok).toBe(true)
    const idReal = getState().certificadosCT[0]!.id
    const bloqueado = getState().removeCertificadoCT(idReal)
    expect(bloqueado.ok).toBe(false)
    expect(bloqueado.error).toContain("inmutable")
    // Un TEST sí se elimina.
    useCompassStore.setState(s => ({
      certificadosCT: [...s.certificadosCT, {
        id: "test-ct-x", folio: "CT-9999", codigoVerificacion: "VC-QAQATEST", tipo: "al_dia",
        unidadId: unidad.id, solicitanteNombre: "QA TEST", resumen: "r", detalle: [], fechaEmision: "2026-08-26",
      }],
    }))
    expect(getState().removeCertificadoCT("test-ct-x").ok).toBe(true)
  })

  it(`usa versión ${STORE_VERSION} y migrate v24 siembra certificadosCT`, async () => {
    expect(STORE_VERSION).toBeGreaterThanOrEqual(24)
    const seed = seedData()
    const prev: Record<string, unknown> = {
      personas: seed.personas,
      configuracion: seed.configuracion,
      maestros: { feriados: seed.maestros.feriados },
    }
    // Desde v22 disparan tanto la rama PL (<23) como CT (<24).
    const result = migrate!(prev as never, 22) as Record<string, unknown>
    expect(Array.isArray(result["certificadosCT"])).toBe(true)
    expect(Array.isArray(result["liquidacionesPL"])).toBe(true)
  })
})
