import { describe, it, expect, beforeEach } from "vitest"
import { useCompassStore } from "@/lib/store"
import { resetStore } from "./helpers"

// SERIE-NOCHE-3 P9 (fase 2 del change `store-cobertura-fase-b`): la guarda de
// hidratación es comportamiento observable de TODA la API legacy del store
// (mismo estándar que la tabla por slice de P8). Sin hidratar, cada acción
// rechaza con el mensaje canónico y no muta.

const SIN_HIDRATAR =
  "El almacenamiento aún se está hidratando. Intenta de nuevo."

// Las 97 acciones con retorno `StoreResult` del contrato `CompassStore`.
const ACCIONES = [
  "saveTipoUnidad",
  "removeTipoUnidad",
  "saveMacroSector",
  "removeMacroSector",
  "saveMicroSector",
  "removeMicroSector",
  "saveUnidad",
  "removeUnidad",
  "savePersona",
  "removePersona",
  "saveVinculo",
  "removeVinculo",
  "removePublicacionPortal",
  "saveControlPropiedad",
  "removeControlPropiedad",
  "saveActaGD",
  "removeActaGD",
  "aprobarActaGD",
  "savePlantillaCO",
  "removePlantillaCO",
  "saveEnvioCO",
  "registrarLecturaEnvioCO",
  "saveMensajeBuzonCO",
  "responderMensajeBuzonCO",
  "cambiarEstadoBuzonCO",
  "removeMensajeBuzonCO",
  "saveDocumentoCO",
  "removeDocumentoCO",
  "saveSolicitudGE",
  "abrirSolicitudGE",
  "responderSolicitudGE",
  "resolverSolicitudGE",
  "cerrarSolicitudGE",
  "removeSolicitudGE",
  "saveRecursoIR",
  "removeRecursoIR",
  "saveSolicitudInsumoIR",
  "resolverComodinIR",
  "entregarSolicitudInsumoIR",
  "registrarEntregaEPP",
  "asignarAccesoIR",
  "devolverAccesoIR",
  "saveTipoInfraccionIN",
  "removeTipoInfraccionIN",
  "saveInfraccionIN",
  "apelarInfraccionIN",
  "respaldarInfraccionIN",
  "aplicarInfraccionIN",
  "desestimarInfraccionIN",
  "removeInfraccionIN",
  "saveTrabajoMT",
  "removeTrabajoMT",
  "iniciarTrabajoMT",
  "finalizarTrabajoMT",
  "actualizarPagoTrabajoMT",
  "verificarGarantiasMT",
  "saveProyectoMT",
  "saveElementoRA",
  "saveReservaRA",
  "cancelarReservaRA",
  "retenerGarantiaRA",
  "saveAvisoCV",
  "publicarAvisoCV",
  "caducarAvisosCV",
  "activarPlantillaCV",
  "publicarActaEnCV",
  "saveFondoFI",
  "saveEgresoFI",
  "emitirGastoComun",
  "aplicarMoraFI",
  "registrarPagoFI",
  "enviarCobranzaFI",
  "retirarFondoFI",
  "registrarHoraExtraPE",
  "registrarEvaluacionPE",
  "iniciarTurnoPE",
  "completarTareaMonitoreoPE",
  "saveBitacoraVisitaPE",
  "ingresarBitacoraVisitaPE",
  "removeBitacoraVisitaPE",
  "saveEncomiendaPE",
  "registrarRetiroEncomiendaPE",
  "removeEncomiendaPE",
  "saveIngresoContratistaPE",
  "confirmarIngresoContratistaPE",
  "removeIngresoContratistaPE",
  "saveProveedorPE",
  "saveMantencionPE",
  "registrarVisitaTecnicaPE",
  "cerrarTurnoPE",
  "enviarProyeccionCostoFI",
  "saveAdelantoPL",
  "removeAdelantoPL",
  "generarCertificadoCT",
  "removeCertificadoCT",
  "generarReporteRE",
  "distribuirReporteRE",
] as const

describe("store-cobertura-fase-b fase 2 — guardas de hidratación de la API legacy", () => {
  beforeEach(resetStore)

  it("las 97 acciones rechazan sin hidratar con el mensaje canónico", () => {
    useCompassStore.setState({ hasHydrated: false })
    const estado = useCompassStore.getState() as unknown as Record<
      string,
      (...args: unknown[]) => { ok: boolean; error?: string }
    >

    for (const nombre of ACCIONES) {
      const r = estado[nombre]!("x", "x", "x")
      expect(r.ok, nombre).toBe(false)
      expect(r.error, nombre).toBe(SIN_HIDRATAR)
    }
  })
})
