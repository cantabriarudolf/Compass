import { describe, it, expect, beforeEach } from "vitest"
import { useCompassStore, seedData, repararRut } from "@/lib/store"
import { resetStore, lastEvent } from "./helpers"

/**
 * Fase E de cobertura del store legacy (SERIE-DEUDA-2 D5, change
 * `store-cobertura-fase-e`): remanente de `ingresarBitacoraVisitaPE`,
 * `registrarRetiroEncomiendaPE`, `confirmarIngresoContratistaPE`,
 * `generarReporteRE` y las ramas de `migrate` / `repararDocumentos`.
 */
const getState = () => useCompassStore.getState()
const migrate = useCompassStore.persist.getOptions().migrate

// --- PE: Personal y Servicios ---

describe("ingresarBitacoraVisitaPE — mapa con otras visitas", () => {
  beforeEach(() => resetStore())

  it("sella la visita indicada y preserva las demás (rama sin match del map)", () => {
    expect(
      getState().saveBitacoraVisitaPE({
        id: "pe-vis-e-1",
        fecha: "2026-08-25",
        nombre: "Visita Primera TEST",
        dni: "11.111.111-1",
        jornadaId: "j-manana",
        origenAgenda: "pre_agendada",
        estado: "agendada",
      }).ok
    ).toBe(true)
    expect(
      getState().saveBitacoraVisitaPE({
        id: "pe-vis-e-2",
        fecha: "2026-08-25",
        nombre: "Visita Segunda TEST",
        dni: "12.222.222-2",
        jornadaId: "j-tarde",
        origenAgenda: "sin_aviso",
        estado: "agendada",
      }).ok
    ).toBe(true)
    const r = getState().ingresarBitacoraVisitaPE("pe-vis-e-1")
    expect(r.ok).toBe(true)
    const sellada = getState().bitacoraVisitasPE.find(
      (v) => v.id === "pe-vis-e-1"
    )!
    expect(sellada.estado).toBe("ingresada")
    expect(sellada.horaIngreso).toBeTruthy()
    const intacta = getState().bitacoraVisitasPE.find(
      (v) => v.id === "pe-vis-e-2"
    )!
    expect(intacta.estado).toBe("agendada")
    expect(lastEvent()?.tipoAccion).toBe("PE_VISITA_INGRESADA")
  })
})

describe("registrarRetiroEncomiendaPE — mapa con otras encomiendas", () => {
  beforeEach(() => resetStore())

  it("retira la indicada y preserva las demás (rama sin match del map)", () => {
    expect(
      getState().saveEncomiendaPE({
        id: "pe-enc-e-1",
        courierId: "cour-correos",
        fechaRecepcion: "2026-08-25",
        estado: "recibida",
      }).ok
    ).toBe(true)
    expect(
      getState().saveEncomiendaPE({
        id: "pe-enc-e-2",
        courierId: "cour-starken",
        fechaRecepcion: "2026-08-25",
        estado: "recibida",
      }).ok
    ).toBe(true)
    const r = getState().registrarRetiroEncomiendaPE(
      "pe-enc-e-1",
      "Vecina TEST",
      "propietario"
    )
    expect(r.ok).toBe(true)
    const retirada = getState().encomiendasPE.find(
      (e) => e.id === "pe-enc-e-1"
    )!
    expect(retirada.estado).toBe("retirada")
    expect(retirada.retiro?.retiradoPor).toBe("Vecina TEST")
    const pendiente = getState().encomiendasPE.find(
      (e) => e.id === "pe-enc-e-2"
    )!
    expect(pendiente.estado).toBe("recibida")
    expect(lastEvent()?.tipoAccion).toBe("PE_ENCOMIENDA_RETIRADA")
  })
})

describe("confirmarIngresoContratistaPE — mapa con otros ingresos", () => {
  beforeEach(() => resetStore())

  it("confirma el indicado y preserva los demás (rama sin match del map)", () => {
    expect(
      getState().saveIngresoContratistaPE({
        id: "ing-e-conf-1",
        contratistaId: "cont-gasfiteria",
        motivo: "Reparación de filtración TEST",
        fecha: "2026-08-25",
        jornadaId: "j-manana",
        agendadoPor: "administracion",
        estado: "agendado",
      }).ok
    ).toBe(true)
    expect(
      getState().saveIngresoContratistaPE({
        id: "ing-e-conf-2",
        contratistaId: "cont-electricidad",
        motivo: "Revisión eléctrica TEST",
        fecha: "2026-08-25",
        jornadaId: "j-tarde",
        agendadoPor: "administracion",
        estado: "agendado",
      }).ok
    ).toBe(true)
    const r = getState().confirmarIngresoContratistaPE("ing-e-conf-1")
    expect(r.ok).toBe(true)
    const confirmado = getState().ingresosContratistasPE.find(
      (i) => i.id === "ing-e-conf-1"
    )!
    expect(confirmado.estado).toBe("ingresado")
    expect(confirmado.horaIngreso).toBeTruthy()
    const agendado = getState().ingresosContratistasPE.find(
      (i) => i.id === "ing-e-conf-2"
    )!
    expect(agendado.estado).toBe("agendado")
    expect(lastEvent()?.tipoAccion).toBe("PE_CONTRATISTA_INGRESADO")
  })
})

// --- RE: Reportería ---

describe("generarReporteRE — cierre con novedades sin incidencias", () => {
  beforeEach(() => resetStore())

  it("usa novedadesGenerales cuando el cierre no reportó incidencias", () => {
    useCompassStore.setState({
      cierresTurnoPE: [
        {
          id: "cierre-e-1",
          fecha: "2026-10-01",
          trabajadorPersonaId: "p-1",
          jornadaReportadaId: "j-noche",
          incidencias: { hubo: false, evidencias: [] },
          novedadesGenerales: "Ronda nocturna sin novedades TEST E",
        } as never,
      ],
    })
    const r = getState().generarReporteRE({
      titulo: "Bitácora TEST E",
      bloques: ["bitacora_seguridad"],
      segmento: {},
    })
    expect(r.ok).toBe(true)
    const reporte = getState().reportesRE[getState().reportesRE.length - 1]!
    const bitacora = reporte.payloadSnapshot.find(
      (b) => b.bloque === "bitacora_seguridad"
    )!
    expect(
      bitacora.lineas.some((l) =>
        l.valor.includes("Ronda nocturna sin novedades TEST E")
      )
    ).toBe(true)
  })
})

// --- Migración (v22 mergeById con colección previa + reparación de documentos) ---

describe("migrate — ramas de arranque del remanente", () => {
  beforeEach(() => resetStore())

  it("mergeById fusiona la colección previa del v22 con el seed (sin duplicar ids)", () => {
    const seed = seedData()
    const previo = seed.maestros.asignacionFamiliar[0]!
    const result = migrate!(
      { maestros: { asignacionFamiliar: [previo] } } as never,
      21
    ) as unknown as {
      maestros: { asignacionFamiliar: unknown[] }
    }
    expect(result.maestros.asignacionFamiliar).toHaveLength(
      seed.maestros.asignacionFamiliar.length
    )
    expect(result.maestros.asignacionFamiliar[0]).toEqual(previo)
  })

  it("repara el DV de RUT y deja la comunidad sin RUT cuando ambos campos faltan", () => {
    const seed = seedData()
    const configuracion = {
      ...seed.configuracion,
      rutComunidad: undefined,
      rutCondominio: undefined,
    } as Record<string, unknown>
    const persona = { ...seed.personas[0]!, rut: "12.345.678-9" }
    const esperado = repararRut("12.345.678-9")
    expect(esperado).not.toBe("12.345.678-9")
    const result = migrate!(
      { personas: [persona], configuracion } as never,
      9
    ) as unknown as { personas: { rut: string }[] }
    expect(result.personas[0]!.rut).toBe(esperado)
  })
})
