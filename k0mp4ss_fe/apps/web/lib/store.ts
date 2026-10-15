/**
 * lib/store.ts — Store monolito LEGACY (BD-FUENTE-VERDAD Fase 5A).
 *
 * ⚠️ DEPRECADO: este store ya NO es la fuente de verdad.
 * Todos los datos de dominio persisten en el servidor vía API REST.
 * Las acciones de dominio están marcadas @deprecated.
 * Para estado de UI puro (modales, filtros, toasts) usar `lib/store-ui.ts`.
 * STORE_VERSION está congelado en 28; no se migran más datos de dominio.
 */
"use client"

import { useEffect } from "react"
import { create } from "zustand"
import { persist, createJSONStorage } from "zustand/middleware"
import { normalizarDocumento, calcularDigitoVerificador } from "./rut"
import {
  tiposUnidad as seedTiposUnidad,
  macroSectores as seedMacroSectores,
  microSectores as seedMicroSectores,
  unidades as seedUnidades,
} from "@/data/inventario/estructura"
import { personas as seedPersonas } from "@/data/comunidad/personas"
import {
  vinculos as seedVinculos,
  ESTADOS_INMOBILIARIOS as seedEstadosInmobiliarios,
} from "@/data/comunidad/vinculos"
import { plantillasComunicacion as seedPlantillasCO } from "@/data/comunidad/plantillas-co"
import { plantillasCVSeed } from "@/data/comunidad/plantillas-cv"
import { tiposInfraccionSeed } from "@/data/finanzas/tipos-infraccion"
import {
  AFPS as seedAFPS,
  PREVISIONES_SALUD as seedPrevisionesSalud,
  MUTUALES_CAJAS as seedMutualesCajas,
  FERIADOS as seedFeriados,
  BANCOS as seedBancos,
  INDICES_AJUSTE as seedIndicesAjuste,
  CAJAS_FONDOS as seedCajasFondos,
  CATEGORIAS_INSUMOS as seedCategoriasInsumos,
  UNIDADES_MEDIDA as seedUnidadesMedida,
  CONTACTOS_EMERGENCIA as seedContactosEmergencia,
  CONDICIONES_ESPECIALES as seedCondicionesEspeciales,
  ASIGNACION_FAMILIAR as seedAsignacionFamiliar,
  JORNADAS as seedJornadas,
  COURIERS as seedCouriers,
  CONTRATISTAS as seedContratistas,
  Afp,
  PrevisionSalud,
  MutualCaja,
  Feriado,
  Banco,
  IndiceAjuste,
  CajaFondo,
  CategoriaInsumo,
  UnidadMedida,
  ContactoEmergencia,
  CondicionEspecial,
  AsignacionFamiliar,
  Jornada,
  Courier,
  Contratista,
} from "@/data/admin/maestros"
import { configuracionDefault as seedConfiguracion } from "@/data/admin/configuracion"
import {
  ESTADOS_OCUPACION as seedEstadosOcupacion,
  CATEGORIAS_MACRO as seedCategoriasMacro,
  CATEGORIAS_MICRO as seedCategoriasMicro,
  CATEGORIAS_UNIDAD as seedCategoriasUnidad,
} from "@/data/maestros"
import puntoCeroData from "@/data/finanzas/punto-cero-2324.json"
import {
  TipoUnidadSchema,
  MacroSectorSchema,
  MicroSectorSchema,
  UnidadSchema,
  PersonaSchema,
  VinculoUnidadSchema,
  ConfiguracionGlobalSchema,
  EventoAuditoriaSchema,
  PublicacionPortalSchema,
  LeadPortalSchema,
  NotificacionSchema,
  ControlPropiedadSchema,
  ActaGDSchema,
  PlantillaCOSchema,
  EnvioCOSchema,
  MensajeBuzonCOSchema,
  DocumentoCOSchema,
  SolicitudGESchema,
  RecursoIRSchema,
  SolicitudInsumoIRSchema,
  EntregaEPPSchema,
  TipoInfraccionINSchema,
  InfraccionINSchema,
  TrabajoMTSchema,
  ProyectoMTSchema,
  ElementoRASchema,
  ReservaRASchema,
  AvisoCVSchema,
  PlantillaCVSchema,
  FondoFISchema,
  EgresoFISchema,
  IngresoFISchema,
  EmisionGCSchema,
  CobroFISchema,
  BitacoraVisitaPESchema,
  EncomiendaPESchema,
  IngresoContratistaPESchema,
  ProveedorPESchema,
  MantencionPreventivaPESchema,
  VisitaTecnicaPESchema,
  CierreTurnoPESchema,
  ProyeccionPESchema,
  LiquidacionPLSchema,
  AdelantoPLSchema,
  CertificadoCTSchema,
  PeriodoDirectivaSchema,
  ReporteRESchema,
  MAESTRO_SCHEMAS,
  validarConEsquema,
  validarMaestro,
  type TipoUnidad,
  type MacroSector,
  type MicroSector,
  type Unidad,
  type Persona,
  type VinculoUnidad,
  type ConfiguracionGlobal,
  type PublicacionPortal,
  type LeadPortal,
  type Notificacion,
  type ControlPropiedad,
  type ActaGD,
  type PlantillaCO,
  type EnvioCO,
  type MensajeBuzonCO,
  type EstadoBuzonCO,
  type DocumentoCO,
  type SolicitudGE,
  type RecursoIR,
  type SolicitudInsumoIR,
  type EntregaEPP,
  type TipoInfraccionIN,
  type InfraccionIN,
  type EstadoInfraccionIN,
  type TrabajoMT,
  type ProyectoMT,
  type EstadoPagoMT,
  type ElementoRA,
  type ReservaRA,
  type AvisoCV,
  type PlantillaCV,
  type FondoFI,
  type EgresoFI,
  type IngresoFI,
  type EmisionGC,
  type CobroFI,
  type BitacoraVisitaPE,
  type EncomiendaPE,
  type IngresoContratistaPE,
  type ProveedorPE,
  type MantencionPreventivaPE,
  type VisitaTecnicaPE,
  type CierreTurnoPE,
  type ProyeccionPE,
  type LiquidacionPL,
  type AdelantoPL,
  type CertificadoCT,
  type PeriodoDirectiva,
  type ReporteRE,
} from "@/lib/schemas"
import {
  calcularProyeccionCobertura,
  costoProyeccionPE,
  proximaFechaPreventiva,
} from "@/lib/personal-utils"
import { resolverSegmentacionRE } from "@/lib/reporteria-utils"
import {
  exigibleTotal,
  estadoDeCobro,
  montoMoraPropuesta,
  saldoFondo,
  saldoPendiente,
  totalPagado,
  vencimientoDesdeDiaCorte,
} from "@/lib/finanzas-utils"
import { hoyISO } from "@/lib/date-utils"
import {
  esMiembroDirectivaVigente,
  getDeudaVigenteFI,
  nombrePersona,
  periodoDirectivaVigente,
  refUnidad,
  registrarEvento,
  resolverVariablesCO,
  rolDestinatarioCO,
  siguienteCodigoIR,
  siguienteFolioFE,
  siguienteFolioRA,
  upsert,
} from "./store/helpers"
import { irSlice } from "./store/slices/ir-slice"
import { mtSlice } from "./store/slices/mt-slice"
import { adSlice } from "./store/slices/ad-slice"
import { piSlice } from "./store/slices/pi-slice"
import { coSlice } from "./store/slices/co-slice"
import { geSlice } from "./store/slices/ge-slice"
import { cvSlice } from "./store/slices/cv-slice"

export {
  esMiembroDirectivaVigente,
  getDeudaVigenteFI,
  nombrePersona,
  periodoDirectivaVigente,
  refUnidad,
  resolverVariablesCO,
  rolDestinatarioCO,
  siguienteCodigoIR,
  siguienteFolioFE,
  siguienteFolioRA,
  upsert,
}
import { generarId } from "@/lib/id-utils"
import { z } from "zod"

export type StoreResult = { ok: boolean; error?: string }

export interface EventoAuditoria {
  id: string
  timestamp: string
  usuario: string
  categoria: string
  tipoAccion: string
  referenciaId: string
  descripcion: string
}

const FONDOS_FI_SEED: FondoFI[] = [
  {
    id: "fondo-gc",
    nombre: "Fondo de Gasto Común",
    tipo: "gasto_comun",
    descripcion: "Caja principal para la operación ordinaria de la comunidad.",
    activo: true,
  },
  {
    id: "fondo-reserva",
    nombre: "Fondo de Reserva",
    tipo: "reserva",
    descripcion: "Ahorro obligatorio según la Ley de Copropiedad.",
    porcentajeAporte: 5,
    activo: true,
  },
  {
    id: "fondo-amenities",
    nombre: "Fondo de Amenities",
    tipo: "amenities",
    descripcion:
      "Centro de costos de reservas, tarifas y garantías de amenities.",
    activo: true,
  },
]

// P2 — Punto cero histórico 2023-2024 (fixture canónico). Se importa el JSON
// versionado y se deriva seed + migración: 182 egresos (FE-0001..0182) + 44
// ingresos sobre el fondo CC, dejando saldo 0.
// Semántica (BACKLOG-100 §Punto cero, hallazgos F1/F2 del dry-run @revisor-fin):
// - F1: `saldoInicial` 17.082.694 es DERIVADO (total egresos − total ingresos del
//   propio fixture), NO proviene del libro. El "saldo 0" es tautológico por
//   construcción, no una reconciliación contra fuente externa.
// - F2: la serie `saldoCC` del JSON (24 saldos mensuales) es la cuenta bancaria
//   del libro y NO se materializa: seed y migración v27 solo consumen
//   egresos/ingresos. No reconcilia mes a mes con la derivada (difiere en 23/24
//   meses; solo coincide 2024-12 porque ambos cierran en 0).
const PUNTO_CERO_FONDO: FondoFI = {
  id: (puntoCeroData as { fondoCC: { id: string } }).fondoCC.id as string,
  nombre: (puntoCeroData as { fondoCC: { nombre: string } }).fondoCC.nombre,
  tipo: (puntoCeroData as { fondoCC: { tipo: FondoFI["tipo"] } }).fondoCC.tipo,
  descripcion:
    "Cuenta corriente histórica (punto cero 2023-2024). Saldo inicial cuadra el libro.",
  saldoInicial: (puntoCeroData as { fondoCC: { saldoInicial: number } }).fondoCC
    .saldoInicial,
  activo: true,
}

function buildPuntoCeroEgresos(startFolioNum: number): EgresoFI[] {
  const egresosRaw = (
    puntoCeroData as {
      egresos: {
        fecha: string
        monto: number
        concepto: string
        categoria: string
        esRecurrente: boolean
      }[]
    }
  ).egresos
  return egresosRaw.map((e, idx) => ({
    id: `fi-egr-hist-${String(idx + 1).padStart(3, "0")}`,
    folio: `FE-${String(startFolioNum + idx).padStart(4, "0")}`,
    fecha: e.fecha,
    categoria: e.categoria as EgresoFI["categoria"],
    descripcion: e.concepto,
    monto: e.monto,
    fondoId: PUNTO_CERO_FONDO.id,
    esRecurrente: e.esRecurrente,
  }))
}

function buildPuntoCeroIngresos(): IngresoFI[] {
  const ingresosRaw = (
    puntoCeroData as {
      ingresos: {
        fecha: string
        monto: number
        concepto: string
        familia?: string
      }[]
    }
  ).ingresos
  return ingresosRaw.map((e, idx) => ({
    id: `fi-ing-hist-${String(idx + 1).padStart(3, "0")}`,
    fecha: e.fecha,
    monto: e.monto,
    concepto: e.concepto,
    fondoId: PUNTO_CERO_FONDO.id,
    ...(e.familia ? { familia: e.familia } : {}),
  }))
}

// Seed incluye punto cero: fresh installs arrancan con historia completa.
// Para migrados, el migrate v27 inyecta los mismos ids de forma idempotente.
const PUNTO_CERO_EGRESOS_SEED: EgresoFI[] = buildPuntoCeroEgresos(1)
const PUNTO_CERO_INGRESOS_SEED: IngresoFI[] = buildPuntoCeroIngresos()

/** STORE_VERSION congelado: las migraciones de dominio están descontinuadas. */
export const STORE_VERSION = 28

export interface MaestroCollections {
  afps: Afp[]
  previsionesSalud: PrevisionSalud[]
  mutualesCajas: MutualCaja[]
  feriados: Feriado[]
  bancos: Banco[]
  indicesAjuste: IndiceAjuste[]
  cajasFondos: CajaFondo[]
  categoriasInsumos: CategoriaInsumo[]
  unidadesMedida: UnidadMedida[]
  contactosEmergencia: ContactoEmergencia[]
  condicionesEspeciales: CondicionEspecial[]
  estadosOcupacion: {
    id: string
    nombre: string
    color: string
    hex?: string
  }[]
  categoriasMacro: { id: string; nombre: string }[]
  categoriasMicro: { id: string; nombre: string }[]
  categoriasUnidad: { id: string; nombre: string }[]
  estadosInmobiliarios: { id: string; nombre: string; color?: string }[]
  // Maestros legales/operativos de PE
  asignacionFamiliar: AsignacionFamiliar[]
  jornadas: Jornada[]
  couriers: Courier[]
  contratistas: Contratista[]
}

export interface CompassData {
  tiposUnidad: TipoUnidad[]
  macroSectores: MacroSector[]
  microSectores: MicroSector[]
  unidades: Unidad[]
  personas: Persona[]
  vinculos: VinculoUnidad[]
  eventos: EventoAuditoria[]
  configuracion: ConfiguracionGlobal
  maestros: MaestroCollections
  // Portal Inmobiliario (PI)
  publicacionesPortal: PublicacionPortal[]
  leadsPortal: LeadPortal[]
  // Notificaciones simuladas (D3, consumidas por todos los módulos)
  notificaciones: Notificacion[]
  // Gestión Administrativa (AD)
  controlesPropiedades: ControlPropiedad[]
  // Gestión de Directiva (GD)
  actasGD: ActaGD[]
  periodosDirectiva: PeriodoDirectiva[]
  // Comunicación con Vecinos (CO)
  plantillasCO: PlantillaCO[]
  enviosCO: EnvioCO[]
  mensajesBuzonCO: MensajeBuzonCO[]
  documentosCO: DocumentoCO[]
  // Gestión de Solicitudes (GE)
  solicitudesGE: SolicitudGE[]
  // Inventario y Recursos (IR)
  activosIR: RecursoIR[]
  solicitudesInsumoIR: SolicitudInsumoIR[]
  entregasEPP: EntregaEPP[]
  // Infracciones y Multas (IN)
  tiposInfraccionIN: TipoInfraccionIN[]
  infraccionesIN: InfraccionIN[]
  // Mantenimiento y Proyectos (MT)
  trabajosMT: TrabajoMT[]
  proyectosMT: ProyectoMT[]
  // Reservas y Amenities (RA)
  elementosRA: ElementoRA[]
  reservasRA: ReservaRA[]
  // Visor de Mensajes (CV)
  avisosCV: AvisoCV[]
  plantillasCV: PlantillaCV[]
  // Finanzas y Morosidad (FI)
  fondosFI: FondoFI[]
  egresosFI: EgresoFI[]
  ingresosFI: IngresoFI[]
  emisionesGC: EmisionGC[]
  cobrosFI: CobroFI[]
  // Personal y Servicios (PE)
  bitacoraVisitasPE: BitacoraVisitaPE[]
  encomiendasPE: EncomiendaPE[]
  ingresosContratistasPE: IngresoContratistaPE[]
  proveedoresPE: ProveedorPE[]
  mantencionesPreventivasPE: MantencionPreventivaPE[]
  visitasTecnicasPE: VisitaTecnicaPE[]
  cierresTurnoPE: CierreTurnoPE[]
  proyeccionesPE: ProyeccionPE[]
  // Liquidaciones y Remuneraciones (PL)
  liquidacionesPL: LiquidacionPL[]
  adelantosPL: AdelantoPL[]
  // Certificados (CT)
  certificadosCT: CertificadoCT[]
  // Reportería y Dashboards (RE)
  reportesRE: ReporteRE[]
}

export interface CompassStore extends CompassData {
  hasHydrated: boolean
  // Tipos de Unidad (TU)
    /** @deprecated Los datos de dominio ahora persisten en el servidor vía API REST. Usar los hooks de `lib/api/use-*.ts` en código nuevo. Esta acción queda como fallback legacy. */
  saveTipoUnidad: (tipo: TipoUnidad) => StoreResult
    /** @deprecated Los datos de dominio ahora persisten en el servidor vía API REST. Usar los hooks de `lib/api/use-*.ts` en código nuevo. Esta acción queda como fallback legacy. */
  removeTipoUnidad: (id: string) => StoreResult
  // Macro Sectores (EF)
    /** @deprecated Los datos de dominio ahora persisten en el servidor vía API REST. Usar los hooks de `lib/api/use-*.ts` en código nuevo. Esta acción queda como fallback legacy. */
  saveMacroSector: (macro: MacroSector) => StoreResult
    /** @deprecated Los datos de dominio ahora persisten en el servidor vía API REST. Usar los hooks de `lib/api/use-*.ts` en código nuevo. Esta acción queda como fallback legacy. */
  removeMacroSector: (id: string) => StoreResult
  // Micro Sectores (EF)
    /** @deprecated Los datos de dominio ahora persisten en el servidor vía API REST. Usar los hooks de `lib/api/use-*.ts` en código nuevo. Esta acción queda como fallback legacy. */
  saveMicroSector: (micro: MicroSector) => StoreResult
    /** @deprecated Los datos de dominio ahora persisten en el servidor vía API REST. Usar los hooks de `lib/api/use-*.ts` en código nuevo. Esta acción queda como fallback legacy. */
  removeMicroSector: (id: string) => StoreResult
  // Unidades (EF)
    /** @deprecated Los datos de dominio ahora persisten en el servidor vía API REST. Usar los hooks de `lib/api/use-*.ts` en código nuevo. Esta acción queda como fallback legacy. */
  saveUnidad: (unidad: Unidad) => StoreResult
    /** @deprecated Los datos de dominio ahora persisten en el servidor vía API REST. Usar los hooks de `lib/api/use-*.ts` en código nuevo. Esta acción queda como fallback legacy. */
  removeUnidad: (id: string) => StoreResult
  // Personas (MP)
    /** @deprecated Los datos de dominio ahora persisten en el servidor vía API REST. Usar los hooks de `lib/api/use-*.ts` en código nuevo. Esta acción queda como fallback legacy. */
  savePersona: (persona: Persona) => StoreResult
    /** @deprecated Los datos de dominio ahora persisten en el servidor vía API REST. Usar los hooks de `lib/api/use-*.ts` en código nuevo. Esta acción queda como fallback legacy. */
  removePersona: (id: string) => StoreResult
  // Vínculos (VU)
    /** @deprecated Los datos de dominio ahora persisten en el servidor vía API REST. Usar los hooks de `lib/api/use-*.ts` en código nuevo. Esta acción queda como fallback legacy. */
  saveVinculo: (vinculo: VinculoUnidad) => StoreResult
    /** @deprecated Los datos de dominio ahora persisten en el servidor vía API REST. Usar los hooks de `lib/api/use-*.ts` en código nuevo. Esta acción queda como fallback legacy. */
  removeVinculo: (id: string) => StoreResult
  // Maestros Administrativos (MA)
    /** @deprecated Los datos de dominio ahora persisten en el servidor vía API REST. Usar los hooks de `lib/api/use-*.ts` en código nuevo. Esta acción queda como fallback legacy. */
  saveMaestro: <K extends keyof MaestroCollections>(
    key: K,
    item: MaestroCollections[K][number]
  ) => StoreResult
    /** @deprecated Los datos de dominio ahora persisten en el servidor vía API REST. Usar los hooks de `lib/api/use-*.ts` en código nuevo. Esta acción queda como fallback legacy. */
  removeMaestro: <K extends keyof MaestroCollections>(
    key: K,
    id: string
  ) => StoreResult
    /** @deprecated Los datos de dominio ahora persisten en el servidor vía API REST. Usar los hooks de `lib/api/use-*.ts` en código nuevo. Esta acción queda como fallback legacy. */
  removePublicacionPortal: (id: string) => StoreResult
  syncPublicacionesDesdeVinculos: (unidadId: string) => void
  // Notificaciones simuladas (D3)
  notify: (
    notificacion: Omit<Notificacion, "id" | "leida" | "canal" | "fecha"> & {
      canal?: Notificacion["canal"]
      unidadId?: string
    }
  ) => void
  // Gestión Administrativa (AD)
    /** @deprecated Los datos de dominio ahora persisten en el servidor vía API REST. Usar los hooks de `lib/api/use-*.ts` en código nuevo. Esta acción queda como fallback legacy. */
  saveControlPropiedad: (control: ControlPropiedad) => StoreResult
    /** @deprecated Los datos de dominio ahora persisten en el servidor vía API REST. Usar los hooks de `lib/api/use-*.ts` en código nuevo. Esta acción queda como fallback legacy. */
  removeControlPropiedad: (id: string) => StoreResult
  // Gestión de Directiva (GD)
    /** @deprecated Los datos de dominio ahora persisten en el servidor vía API REST. Usar los hooks de `lib/api/use-*.ts` en código nuevo. Esta acción queda como fallback legacy. */
  saveActaGD: (acta: ActaGD) => StoreResult
    /** @deprecated Los datos de dominio ahora persisten en el servidor vía API REST. Usar los hooks de `lib/api/use-*.ts` en código nuevo. Esta acción queda como fallback legacy. */
  removeActaGD: (id: string) => StoreResult
    /** @deprecated Los datos de dominio ahora persisten en el servidor vía API REST. Usar los hooks de `lib/api/use-*.ts` en código nuevo. Esta acción queda como fallback legacy. */
  aprobarActaGD: (id: string, personaId: string) => StoreResult
  periodoDirectivaVigente: () => PeriodoDirectiva | undefined
  // Comunicación con Vecinos (CO)
    /** @deprecated Los datos de dominio ahora persisten en el servidor vía API REST. Usar los hooks de `lib/api/use-*.ts` en código nuevo. Esta acción queda como fallback legacy. */
  savePlantillaCO: (plantilla: PlantillaCO) => StoreResult
    /** @deprecated Los datos de dominio ahora persisten en el servidor vía API REST. Usar los hooks de `lib/api/use-*.ts` en código nuevo. Esta acción queda como fallback legacy. */
  removePlantillaCO: (id: string) => StoreResult
    /** @deprecated Los datos de dominio ahora persisten en el servidor vía API REST. Usar los hooks de `lib/api/use-*.ts` en código nuevo. Esta acción queda como fallback legacy. */
  saveEnvioCO: (envio: EnvioCO) => StoreResult
  registrarLecturaEnvioCO: (id: string, personaId: string) => StoreResult
    /** @deprecated Los datos de dominio ahora persisten en el servidor vía API REST. Usar los hooks de `lib/api/use-*.ts` en código nuevo. Esta acción queda como fallback legacy. */
  saveMensajeBuzonCO: (mensaje: MensajeBuzonCO) => StoreResult
  responderMensajeBuzonCO: (
    id: string,
    respuesta: { autor: string; texto: string; compromisos?: string }
  ) => StoreResult
  cambiarEstadoBuzonCO: (id: string, estado: EstadoBuzonCO) => StoreResult
  removeMensajeBuzonCO: (id: string) => StoreResult
    /** @deprecated Los datos de dominio ahora persisten en el servidor vía API REST. Usar los hooks de `lib/api/use-*.ts` en código nuevo. Esta acción queda como fallback legacy. */
  saveDocumentoCO: (documento: DocumentoCO) => StoreResult
    /** @deprecated Los datos de dominio ahora persisten en el servidor vía API REST. Usar los hooks de `lib/api/use-*.ts` en código nuevo. Esta acción queda como fallback legacy. */
  removeDocumentoCO: (id: string) => StoreResult
  // Gestión de Solicitudes (GE)
    /** @deprecated Los datos de dominio ahora persisten en el servidor vía API REST. Usar los hooks de `lib/api/use-*.ts` en código nuevo. Esta acción queda como fallback legacy. */
  saveSolicitudGE: (solicitud: SolicitudGE) => StoreResult
  abrirSolicitudGE: (id: string) => StoreResult
  responderSolicitudGE: (
    id: string,
    comentario: { autorRol: "administracion" | "solicitante"; texto: string }
  ) => StoreResult
  resolverSolicitudGE: (id: string, resolucion: string) => StoreResult
  cerrarSolicitudGE: (id: string) => StoreResult
    /** @deprecated Los datos de dominio ahora persisten en el servidor vía API REST. Usar los hooks de `lib/api/use-*.ts` en código nuevo. Esta acción queda como fallback legacy. */
  removeSolicitudGE: (id: string) => StoreResult
  // Inventario y Recursos (IR)
    /** @deprecated Los datos de dominio ahora persisten en el servidor vía API REST. Usar los hooks de `lib/api/use-*.ts` en código nuevo. Esta acción queda como fallback legacy. */
  saveRecursoIR: (recurso: RecursoIR) => StoreResult
    /** @deprecated Los datos de dominio ahora persisten en el servidor vía API REST. Usar los hooks de `lib/api/use-*.ts` en código nuevo. Esta acción queda como fallback legacy. */
  removeRecursoIR: (id: string) => StoreResult
    /** @deprecated Los datos de dominio ahora persisten en el servidor vía API REST. Usar los hooks de `lib/api/use-*.ts` en código nuevo. Esta acción queda como fallback legacy. */
  saveSolicitudInsumoIR: (solicitud: SolicitudInsumoIR) => StoreResult
  resolverComodinIR: (
    id: string,
    decision: "aprobar_crear" | "sustituir" | "rechazar",
    opts?: { recursoSustitutoId?: string; justificacion?: string }
  ) => StoreResult
  entregarSolicitudInsumoIR: (id: string) => StoreResult
  registrarEntregaEPP: (entrega: EntregaEPP) => StoreResult
  asignarAccesoIR: (recursoId: string, personaId: string) => StoreResult
  devolverAccesoIR: (recursoId: string) => StoreResult
  // Infracciones y Multas (IN)
    /** @deprecated Los datos de dominio ahora persisten en el servidor vía API REST. Usar los hooks de `lib/api/use-*.ts` en código nuevo. Esta acción queda como fallback legacy. */
  saveTipoInfraccionIN: (tipo: TipoInfraccionIN) => StoreResult
    /** @deprecated Los datos de dominio ahora persisten en el servidor vía API REST. Usar los hooks de `lib/api/use-*.ts` en código nuevo. Esta acción queda como fallback legacy. */
  removeTipoInfraccionIN: (id: string) => StoreResult
    /** @deprecated Los datos de dominio ahora persisten en el servidor vía API REST. Usar los hooks de `lib/api/use-*.ts` en código nuevo. Esta acción queda como fallback legacy. */
  saveInfraccionIN: (infraccion: InfraccionIN) => StoreResult
  apelarInfraccionIN: (id: string, descargos: string) => StoreResult
  respaldarInfraccionIN: (id: string, personaId: string) => StoreResult
  aplicarInfraccionIN: (id: string) => StoreResult
  desestimarInfraccionIN: (id: string, justificacion: string) => StoreResult
    /** @deprecated Los datos de dominio ahora persisten en el servidor vía API REST. Usar los hooks de `lib/api/use-*.ts` en código nuevo. Esta acción queda como fallback legacy. */
  removeInfraccionIN: (id: string) => StoreResult
  // Mantenimiento y Proyectos (MT)
    /** @deprecated Los datos de dominio ahora persisten en el servidor vía API REST. Usar los hooks de `lib/api/use-*.ts` en código nuevo. Esta acción queda como fallback legacy. */
  saveTrabajoMT: (trabajo: TrabajoMT) => StoreResult
    /** @deprecated Los datos de dominio ahora persisten en el servidor vía API REST. Usar los hooks de `lib/api/use-*.ts` en código nuevo. Esta acción queda como fallback legacy. */
  removeTrabajoMT: (id: string) => StoreResult
  iniciarTrabajoMT: (id: string) => StoreResult
  finalizarTrabajoMT: (
    id: string,
    cierre?: { fechaTermino?: string; costoFinal?: number }
  ) => StoreResult
  actualizarPagoTrabajoMT: (id: string, estadoPago: EstadoPagoMT) => StoreResult
  verificarGarantiasMT: () => StoreResult
    /** @deprecated Los datos de dominio ahora persisten en el servidor vía API REST. Usar los hooks de `lib/api/use-*.ts` en código nuevo. Esta acción queda como fallback legacy. */
  saveProyectoMT: (proyecto: ProyectoMT) => StoreResult
  // Reservas y Amenities (RA)
    /** @deprecated Los datos de dominio ahora persisten en el servidor vía API REST. Usar los hooks de `lib/api/use-*.ts` en código nuevo. Esta acción queda como fallback legacy. */
  saveElementoRA: (elemento: ElementoRA) => StoreResult
    /** @deprecated Los datos de dominio ahora persisten en el servidor vía API REST. Usar los hooks de `lib/api/use-*.ts` en código nuevo. Esta acción queda como fallback legacy. */
  saveReservaRA: (reserva: ReservaRA) => StoreResult
  cancelarReservaRA: (id: string) => StoreResult
  retenerGarantiaRA: (id: string, motivo: string) => StoreResult
  // Visor de Mensajes (CV)
    /** @deprecated Los datos de dominio ahora persisten en el servidor vía API REST. Usar los hooks de `lib/api/use-*.ts` en código nuevo. Esta acción queda como fallback legacy. */
  saveAvisoCV: (aviso: AvisoCV, creadoPorPersonaId?: string) => StoreResult
  publicarAvisoCV: (id: string) => StoreResult
  caducarAvisosCV: () => StoreResult
  activarPlantillaCV: (id: string) => StoreResult
  publicarActaEnCV: (actaId: string) => StoreResult
  // Finanzas y Morosidad (FI)
    /** @deprecated Los datos de dominio ahora persisten en el servidor vía API REST. Usar los hooks de `lib/api/use-*.ts` en código nuevo. Esta acción queda como fallback legacy. */
  saveFondoFI: (fondo: FondoFI) => StoreResult
    /** @deprecated Los datos de dominio ahora persisten en el servidor vía API REST. Usar los hooks de `lib/api/use-*.ts` en código nuevo. Esta acción queda como fallback legacy. */
  saveEgresoFI: (egreso: EgresoFI) => StoreResult
  emitirGastoComun: (input: {
    periodo: string
    gastoTotal?: number
    fechaVencimiento?: string
    unidadIds?: string[]
  }) => StoreResult
  aplicarMoraFI: (cobroId: string, tasaMensualPct?: number) => StoreResult
  registrarPagoFI: (
    cobroId: string,
    pago: { monto: number; medio: string; ajusteJustificacion?: string }
  ) => StoreResult
  enviarCobranzaFI: (unidadId: string) => StoreResult
  retirarFondoFI: (input: {
    fondoId: string
    monto: number
    descripcion: string
    aprobacionActaGDId?: string
  }) => StoreResult
  // Personal y Servicios (PE)
  registrarHoraExtraPE: (
    personaId: string,
    horaExtra: { fecha: string; horas: number; motivo: string }
  ) => StoreResult
  registrarEvaluacionPE: (
    personaId: string,
    evaluacion: { fecha: string; puntaje: number; comentarios?: string }
  ) => StoreResult
  iniciarTurnoPE: (personaId: string, jornadaId: string) => StoreResult
  completarTareaMonitoreoPE: (trabajoMTId: string) => StoreResult
    /** @deprecated Los datos de dominio ahora persisten en el servidor vía API REST. Usar los hooks de `lib/api/use-*.ts` en código nuevo. Esta acción queda como fallback legacy. */
  saveBitacoraVisitaPE: (visita: BitacoraVisitaPE) => StoreResult
  ingresarBitacoraVisitaPE: (id: string) => StoreResult
    /** @deprecated Los datos de dominio ahora persisten en el servidor vía API REST. Usar los hooks de `lib/api/use-*.ts` en código nuevo. Esta acción queda como fallback legacy. */
  removeBitacoraVisitaPE: (id: string) => StoreResult
    /** @deprecated Los datos de dominio ahora persisten en el servidor vía API REST. Usar los hooks de `lib/api/use-*.ts` en código nuevo. Esta acción queda como fallback legacy. */
  saveEncomiendaPE: (encomienda: EncomiendaPE) => StoreResult
  registrarRetiroEncomiendaPE: (
    id: string,
    retiradoPor: string,
    relacion?: string
  ) => StoreResult
    /** @deprecated Los datos de dominio ahora persisten en el servidor vía API REST. Usar los hooks de `lib/api/use-*.ts` en código nuevo. Esta acción queda como fallback legacy. */
  removeEncomiendaPE: (id: string) => StoreResult
    /** @deprecated Los datos de dominio ahora persisten en el servidor vía API REST. Usar los hooks de `lib/api/use-*.ts` en código nuevo. Esta acción queda como fallback legacy. */
  saveIngresoContratistaPE: (ingreso: IngresoContratistaPE) => StoreResult
  confirmarIngresoContratistaPE: (id: string) => StoreResult
    /** @deprecated Los datos de dominio ahora persisten en el servidor vía API REST. Usar los hooks de `lib/api/use-*.ts` en código nuevo. Esta acción queda como fallback legacy. */
  removeIngresoContratistaPE: (id: string) => StoreResult
    /** @deprecated Los datos de dominio ahora persisten en el servidor vía API REST. Usar los hooks de `lib/api/use-*.ts` en código nuevo. Esta acción queda como fallback legacy. */
  saveProveedorPE: (proveedor: ProveedorPE) => StoreResult
    /** @deprecated Los datos de dominio ahora persisten en el servidor vía API REST. Usar los hooks de `lib/api/use-*.ts` en código nuevo. Esta acción queda como fallback legacy. */
  saveMantencionPE: (mantencion: MantencionPreventivaPE) => StoreResult
  registrarVisitaTecnicaPE: (visita: VisitaTecnicaPE) => StoreResult
  cerrarTurnoPE: (
    input: Omit<
      CierreTurnoPE,
      "id" | "historialCambios" | "notificadoAAdmin"
    > & { id?: string }
  ) => StoreResult
  enviarProyeccionCostoFI: (
    mesAnio: string,
    params: { costoParche: number; costoDiaExtra: number; id?: string }
  ) => StoreResult
    /** @deprecated Los datos de dominio ahora persisten en el servidor vía API REST. Usar los hooks de `lib/api/use-*.ts` en código nuevo. Esta acción queda como fallback legacy. */
  saveAdelantoPL: (adelanto: AdelantoPL) => StoreResult
    /** @deprecated Los datos de dominio ahora persisten en el servidor vía API REST. Usar los hooks de `lib/api/use-*.ts` en código nuevo. Esta acción queda como fallback legacy. */
  removeAdelantoPL: (id: string) => StoreResult
  // Certificados (CT)
    /** @deprecated Los datos de dominio ahora persisten en el servidor vía API REST. Usar los hooks de `lib/api/use-*.ts` en código nuevo. Esta acción queda como fallback legacy. */
  generarCertificadoCT: (input: {
    tipo: "residencia" | "estado_cuenta" | "liquidacion_sueldo" | "al_dia"
    unidadId?: string
    personaId?: string
    liquidacionId?: string
    solicitanteNombre: string
    id?: string
  }) => StoreResult
    /** @deprecated Los datos de dominio ahora persisten en el servidor vía API REST. Usar los hooks de `lib/api/use-*.ts` en código nuevo. Esta acción queda como fallback legacy. */
  removeCertificadoCT: (id: string) => StoreResult
  // Reportería y Dashboards (RE)
  registrarVistaDashboardRE: (
    vista: "demografico" | "operativo" | "gestiones" | "financiero"
  ) => void
    /** @deprecated Los datos de dominio ahora persisten en el servidor vía API REST. Usar los hooks de `lib/api/use-*.ts` en código nuevo. Esta acción queda como fallback legacy. */
  generarReporteRE: (input: {
    titulo: string
    bloques: (
      | "gastos_mes"
      | "bitacora_seguridad"
      | "morosidad"
      | "consumo_insumos"
    )[]
    segmento: {
      macroSectorIds?: string[]
      microSectorIds?: string[]
      unidadIds?: string[]
      perfiles?: ("administracion" | "personal" | "propietario" | "residente")[]
      tenencias?: ("propietarios" | "arrendatarios")[]
    }
    id?: string
  }) => StoreResult
  distribuirReporteRE: (id: string) => StoreResult
}

const ESTADO_NOMBRE_A_ID: Record<string, string> = {
  Vacante: "vacante",
  "En Uso": "en-uso",
  "En Arriendo": "en-arriendo",
  "En Venta": "en-venta",
  "En Mantención": "en-mantencion",
}

// EF §Dependencias ST — validateSeedOrder reporta rank internal violation.
// Orden interno obligatorio: macroSectores → microSectores (macroSectorId) → unidades (microSectorId, tipoUnidadId)
/** @deprecated Las migraciones de dominio del store están congeladas en STORE_VERSION 28. */
export function validateSeedOrder(data: {
  macroSectores: MacroSector[]
  microSectores: MicroSector[]
  unidades: Unidad[]
  tiposUnidad: TipoUnidad[]
}): { ok: boolean; violations: string[] } {
  const violations: string[] = []
  const macroIds = new Set(data.macroSectores.map((m) => m.id))
  const microIds = new Set(data.microSectores.map((m) => m.id))
  const tipoUnidadIds = new Set(data.tiposUnidad.map((t) => t.id))

  for (const micro of data.microSectores) {
    if (!macroIds.has(micro.macroSectorId)) {
      violations.push(
        `microSector ${micro.id} referencia macroSectorId inexistente: ${micro.macroSectorId}`
      )
    }
  }
  for (const unidad of data.unidades) {
    if (!microIds.has(unidad.microSectorId)) {
      violations.push(
        `unidad ${unidad.id} referencia microSectorId inexistente: ${unidad.microSectorId}`
      )
    }
    if (!tipoUnidadIds.has(unidad.tipoUnidadId)) {
      violations.push(
        `unidad ${unidad.id} referencia tipoUnidadId inexistente: ${unidad.tipoUnidadId}`
      )
    }
  }
  return { ok: violations.length === 0, violations }
}

/** @deprecated Las migraciones de dominio del store están congeladas en STORE_VERSION 28. */
function migrarEstadoUnidades(unidades: Unidad[]): Unidad[] {
  return unidades.map((u) => {
    const legacy = u as Unidad & { estado?: string }
    if (
      typeof legacy.estado === "string" &&
      (u as { estadoId?: string }).estadoId === undefined
    ) {
      const { estado, ...rest } = legacy
      return {
        ...rest,
        estadoId:
          ESTADO_NOMBRE_A_ID[estado] ??
          estado.toLowerCase().replace(/\s+/g, "-"),
      } as Unidad
    }
    return u
  })
}

export const seedData = (): CompassData => ({
  tiposUnidad: seedTiposUnidad,
  macroSectores: seedMacroSectores,
  microSectores: seedMicroSectores,
  unidades: seedUnidades,
  personas: seedPersonas,
  vinculos: seedVinculos,
  eventos: [],
  configuracion: seedConfiguracion,
  publicacionesPortal: [],
  leadsPortal: [],
  notificaciones: [],
  controlesPropiedades: [],
  actasGD: [],
  periodosDirectiva: [],
  plantillasCO: seedPlantillasCO,
  enviosCO: [],
  mensajesBuzonCO: [],
  documentosCO: [],
  solicitudesGE: [],
  activosIR: [],
  solicitudesInsumoIR: [],
  entregasEPP: [],
  tiposInfraccionIN: tiposInfraccionSeed,
  infraccionesIN: [],
  trabajosMT: [],
  proyectosMT: [],
  elementosRA: [],
  reservasRA: [],
  avisosCV: [],
  plantillasCV: plantillasCVSeed,
  fondosFI: [...FONDOS_FI_SEED, PUNTO_CERO_FONDO],
  egresosFI: [...PUNTO_CERO_EGRESOS_SEED],
  ingresosFI: [...PUNTO_CERO_INGRESOS_SEED],
  emisionesGC: [],
  cobrosFI: [],
  bitacoraVisitasPE: [],
  encomiendasPE: [],
  ingresosContratistasPE: [],
  proveedoresPE: [],
  mantencionesPreventivasPE: [],
  visitasTecnicasPE: [],
  cierresTurnoPE: [],
  proyeccionesPE: [],
  liquidacionesPL: [],
  adelantosPL: [],
  certificadosCT: [],
  reportesRE: [],
  maestros: {
    afps: seedAFPS,
    previsionesSalud: seedPrevisionesSalud,
    mutualesCajas: seedMutualesCajas,
    feriados: seedFeriados,
    bancos: seedBancos,
    indicesAjuste: seedIndicesAjuste,
    cajasFondos: seedCajasFondos,
    categoriasInsumos: seedCategoriasInsumos,
    unidadesMedida: seedUnidadesMedida,
    contactosEmergencia: seedContactosEmergencia,
    condicionesEspeciales: seedCondicionesEspeciales,
    estadosOcupacion: seedEstadosOcupacion,
    categoriasMacro: seedCategoriasMacro,
    categoriasMicro: seedCategoriasMicro,
    categoriasUnidad: seedCategoriasUnidad,
    estadosInmobiliarios: seedEstadosInmobiliarios,
    asignacionFamiliar: seedAsignacionFamiliar,
    jornadas: seedJornadas,
    couriers: seedCouriers,
    contratistas: seedContratistas,
  },
})

// VAL-006: esquema por colección del estado persistido. En rehidratación/migración
// cada colección se valida con safeParse; si una llega corrupta se descarta y se
// re-siembra desde el seed, sin que el resto del store deje de cargar.
const ESQUEMAS_COLECCION = {
  tiposUnidad: z.array(TipoUnidadSchema),
  macroSectores: z.array(MacroSectorSchema),
  microSectores: z.array(MicroSectorSchema),
  unidades: z.array(UnidadSchema),
  personas: z.array(PersonaSchema),
  vinculos: z.array(VinculoUnidadSchema),
  eventos: z.array(EventoAuditoriaSchema),
  configuracion: ConfiguracionGlobalSchema,
  publicacionesPortal: z.array(PublicacionPortalSchema),
  leadsPortal: z.array(LeadPortalSchema),
  notificaciones: z.array(NotificacionSchema),
  controlesPropiedades: z.array(ControlPropiedadSchema),
  actasGD: z.array(ActaGDSchema),
  periodosDirectiva: z.array(PeriodoDirectivaSchema),
  plantillasCO: z.array(PlantillaCOSchema),
  enviosCO: z.array(EnvioCOSchema),
  mensajesBuzonCO: z.array(MensajeBuzonCOSchema),
  documentosCO: z.array(DocumentoCOSchema),
  solicitudesGE: z.array(SolicitudGESchema),
  activosIR: z.array(RecursoIRSchema),
  solicitudesInsumoIR: z.array(SolicitudInsumoIRSchema),
  entregasEPP: z.array(EntregaEPPSchema),
  tiposInfraccionIN: z.array(TipoInfraccionINSchema),
  infraccionesIN: z.array(InfraccionINSchema),
  trabajosMT: z.array(TrabajoMTSchema),
  proyectosMT: z.array(ProyectoMTSchema),
  elementosRA: z.array(ElementoRASchema),
  reservasRA: z.array(ReservaRASchema),
  avisosCV: z.array(AvisoCVSchema),
  plantillasCV: z.array(PlantillaCVSchema),
  fondosFI: z.array(FondoFISchema),
  egresosFI: z.array(EgresoFISchema),
  ingresosFI: z.array(IngresoFISchema),
  emisionesGC: z.array(EmisionGCSchema),
  cobrosFI: z.array(CobroFISchema),
  bitacoraVisitasPE: z.array(BitacoraVisitaPESchema),
  encomiendasPE: z.array(EncomiendaPESchema),
  ingresosContratistasPE: z.array(IngresoContratistaPESchema),
  proveedoresPE: z.array(ProveedorPESchema),
  mantencionesPreventivasPE: z.array(MantencionPreventivaPESchema),
  visitasTecnicasPE: z.array(VisitaTecnicaPESchema),
  cierresTurnoPE: z.array(CierreTurnoPESchema),
  proyeccionesPE: z.array(ProyeccionPESchema),
  liquidacionesPL: z.array(LiquidacionPLSchema),
  adelantosPL: z.array(AdelantoPLSchema),
  certificadosCT: z.array(CertificadoCTSchema),
  reportesRE: z.array(ReporteRESchema),
} as const

type ClaveColeccion = keyof typeof ESQUEMAS_COLECCION
type ClaveMaestro = keyof MaestroCollections

/** @deprecated Las migraciones de dominio del store están congeladas en STORE_VERSION 28. */
function sanitizarColecciones(
  prev: Partial<CompassData> | undefined | null
): Partial<CompassData> | null {
  if (!prev || typeof prev !== "object") return null
  const seed = seedData()
  const fixes: Record<string, unknown> = {}
  let changed = false

  for (const key of Object.keys(ESQUEMAS_COLECCION) as ClaveColeccion[]) {
    const valor = (prev as Record<string, unknown>)[key]
    if (valor === undefined) continue
    if (!ESQUEMAS_COLECCION[key].safeParse(valor).success) {
      fixes[key] = seed[key]
      changed = true
    }
  }

  // Maestros (MA): colección por colección. Las ausentes o inválidas se rellenan
  // desde el seed para no dejar huecos que rompan el consumo en la UI.
  if (prev.maestros !== undefined) {
    const maestrosSaneados: Record<string, unknown> = {}
    let maestrosChanged = false
    for (const key of Object.keys(MAESTRO_SCHEMAS) as ClaveMaestro[]) {
      // SAFETY: prev.maestros is Record<string, unknown> at runtime; narrow for indexed access
      const valor = prev.maestros
        ? (prev.maestros as unknown as Record<string, unknown>)[key]
        : undefined
      const valido =
        valor !== undefined &&
        z.array(MAESTRO_SCHEMAS[key]).safeParse(valor).success
      if (valido) {
        maestrosSaneados[key] = valor
      } else {
        maestrosSaneados[key] = seed.maestros[key]
        maestrosChanged = true
      }
    }
    if (maestrosChanged) {
      fixes.maestros = maestrosSaneados
      changed = true
    }
  }

  return changed ? (fixes as Partial<CompassData>) : null
}

// VAL-005 (migración v10): los RUT sembrados históricamente tenían dígito
// verificador ficticio. Al endurecer la validación con módulo 11, todo store
// persistido previo fallaría safeParse y perdería la colección de personas.
// Se repara recalculando el DV del cuerpo (el cuerpo no cambia, solo el DV),
// preservando el formato original del cuerpo (con o sin puntos).
export function repararRut(rut: string): string {
  const normalizado = normalizarDocumento(rut)
  const indiceGuion = normalizado.lastIndexOf("-")
  if (indiceGuion === -1) return rut
  const cuerpoConFormato = normalizado.slice(0, indiceGuion)
  const cuerpo = cuerpoConFormato.replace(/\./g, "")
  if (!/^\d{7,8}$/.test(cuerpo)) return rut
  return `${cuerpoConFormato}-${calcularDigitoVerificador(cuerpo)}`
}

/** @deprecated Las migraciones de dominio del store están congeladas en STORE_VERSION 28. */
function repararDocumentos(result: Partial<CompassData>): Partial<CompassData> {
  let personas = result.personas
  if (Array.isArray(personas)) {
    personas = (personas as Persona[]).map((p) => ({
      ...p,
      rut: repararRut(p.rut),
    }))
  }
  let configuracion = result.configuracion
  if (configuracion) {
    // Soportar tanto rutCondominio (legacy) como rutComunidad (actual)
    const rutValue =
      (configuracion as Record<string, unknown>).rutCondominio ??
      configuracion.rutComunidad
    configuracion = {
      ...configuracion,
      rutComunidad: rutValue
        ? repararRut(rutValue as string)
        : (configuracion.rutComunidad ?? undefined),
      rutAdministrador: repararRut(configuracion.rutAdministrador),
    }
  }
  if (personas === result.personas && configuracion === result.configuracion)
    return result
  return {
    ...result,
    ...(personas !== result.personas ? { personas } : {}),
    ...(configuracion !== result.configuracion ? { configuracion } : {}),
  }
}

export const useCompassStore = create<CompassStore>()(
  persist(
    (set, get, api) => ({
      ...seedData(),
      hasHydrated: false,
      ...irSlice(set, get, api),
      ...mtSlice(set, get, api),
      ...adSlice(set, get, api),
      ...piSlice(set, get, api),
      ...coSlice(set, get, api),
      ...geSlice(set, get, api),
      ...cvSlice(set, get, api),

      // --- TU: Tipos de Unidad ---
        /** @deprecated Los datos de dominio ahora persisten en el servidor vía API REST. Usar los hooks de `lib/api/use-*.ts` en código nuevo. Esta acción queda como fallback legacy. */
      saveTipoUnidad: (tipo) => {
        if (!get().hasHydrated)
          return {
            ok: false,
            error:
              "El almacenamiento aún se está hidratando. Intenta de nuevo.",
          }
        const validacion = validarConEsquema(TipoUnidadSchema, tipo)
        if (!validacion.ok) return validacion
        set((s) => ({ tiposUnidad: upsert(s.tiposUnidad, validacion.data) }))
        return { ok: true }
      },

        /** @deprecated Los datos de dominio ahora persisten en el servidor vía API REST. Usar los hooks de `lib/api/use-*.ts` en código nuevo. Esta acción queda como fallback legacy. */

      removeTipoUnidad: (id) => {
        if (!get().hasHydrated)
          return {
            ok: false,
            error:
              "El almacenamiento aún se está hidratando. Intenta de nuevo.",
          }
        const linked = get().unidades.filter((u) => u.tipoUnidadId === id)
        if (linked.length > 0) {
          return {
            ok: false,
            error: `No se puede eliminar el tipo de unidad: ${linked.length} unidad(es) vinculada(s).`,
          }
        }
        set((s) => ({ tiposUnidad: s.tiposUnidad.filter((t) => t.id !== id) }))
        return { ok: true }
      },

      // --- EF: Macro Sectores ---
        /** @deprecated Los datos de dominio ahora persisten en el servidor vía API REST. Usar los hooks de `lib/api/use-*.ts` en código nuevo. Esta acción queda como fallback legacy. */
      saveMacroSector: (macro) => {
        if (!get().hasHydrated)
          return {
            ok: false,
            error:
              "El almacenamiento aún se está hidratando. Intenta de nuevo.",
          }
        const validacion = validarConEsquema(MacroSectorSchema, macro)
        if (!validacion.ok) return validacion
        set((s) => ({
          macroSectores: upsert(s.macroSectores, validacion.data),
        }))
        return { ok: true }
      },

        /** @deprecated Los datos de dominio ahora persisten en el servidor vía API REST. Usar los hooks de `lib/api/use-*.ts` en código nuevo. Esta acción queda como fallback legacy. */

      removeMacroSector: (id) => {
        if (!get().hasHydrated)
          return {
            ok: false,
            error:
              "El almacenamiento aún se está hidratando. Intenta de nuevo.",
          }
        const linked = get().microSectores.filter((m) => m.macroSectorId === id)
        if (linked.length > 0) {
          return {
            ok: false,
            error: `No se puede eliminar el macro sector: ${linked.length} sub-sector(es) asociado(s).`,
          }
        }
        set((s) => ({
          macroSectores: s.macroSectores.filter((m) => m.id !== id),
        }))
        return { ok: true }
      },

      // --- EF: Micro Sectores ---
        /** @deprecated Los datos de dominio ahora persisten en el servidor vía API REST. Usar los hooks de `lib/api/use-*.ts` en código nuevo. Esta acción queda como fallback legacy. */
      saveMicroSector: (micro) => {
        if (!get().hasHydrated)
          return {
            ok: false,
            error:
              "El almacenamiento aún se está hidratando. Intenta de nuevo.",
          }
        const validacion = validarConEsquema(MicroSectorSchema, micro)
        if (!validacion.ok) return validacion
        set((s) => ({
          microSectores: upsert(s.microSectores, validacion.data),
        }))
        return { ok: true }
      },

        /** @deprecated Los datos de dominio ahora persisten en el servidor vía API REST. Usar los hooks de `lib/api/use-*.ts` en código nuevo. Esta acción queda como fallback legacy. */

      removeMicroSector: (id) => {
        if (!get().hasHydrated)
          return {
            ok: false,
            error:
              "El almacenamiento aún se está hidratando. Intenta de nuevo.",
          }
        const linked = get().unidades.filter((u) => u.microSectorId === id)
        if (linked.length > 0) {
          return {
            ok: false,
            error: `No se puede eliminar el sub-sector: ${linked.length} unidad(es) asociada(s).`,
          }
        }
        set((s) => ({
          microSectores: s.microSectores.filter((m) => m.id !== id),
        }))
        return { ok: true }
      },

      // --- EF: Unidades ---
        /** @deprecated Los datos de dominio ahora persisten en el servidor vía API REST. Usar los hooks de `lib/api/use-*.ts` en código nuevo. Esta acción queda como fallback legacy. */
      saveUnidad: (unidad) => {
        if (!get().hasHydrated)
          return {
            ok: false,
            error:
              "El almacenamiento aún se está hidratando. Intenta de nuevo.",
          }
        const validacion = validarConEsquema(UnidadSchema, unidad)
        if (!validacion.ok) return validacion
        // RG escritura: validar FKs
        if (!get().microSectores.some((m) => m.id === unidad.microSectorId)) {
          return {
            ok: false,
            error: "microSectorId no existe en microSectores.",
          }
        }
        if (!get().tiposUnidad.some((t) => t.id === unidad.tipoUnidadId)) {
          return { ok: false, error: "tipoUnidadId no existe en tiposUnidad." }
        }
        if (
          !get().maestros.estadosOcupacion.some((e) => e.id === unidad.estadoId)
        ) {
          return {
            ok: false,
            error: "estadoId no existe en maestros.estadosOcupacion.",
          }
        }
        set((s) => ({ unidades: upsert(s.unidades, validacion.data) }))
        return { ok: true }
      },

        /** @deprecated Los datos de dominio ahora persisten en el servidor vía API REST. Usar los hooks de `lib/api/use-*.ts` en código nuevo. Esta acción queda como fallback legacy. */

      removeUnidad: (id) => {
        if (!get().hasHydrated)
          return {
            ok: false,
            error:
              "El almacenamiento aún se está hidratando. Intenta de nuevo.",
          }
        const linkedVinculos = get().vinculos.filter((v) => v.unidadId === id)
        if (linkedVinculos.length > 0) {
          return {
            ok: false,
            error: "No se puede eliminar la unidad: tiene vínculos asociados.",
          }
        }
        set((s) => ({ unidades: s.unidades.filter((u) => u.id !== id) }))
        return { ok: true }
      },

      // --- MP: Personas ---
        /** @deprecated Los datos de dominio ahora persisten en el servidor vía API REST. Usar los hooks de `lib/api/use-*.ts` en código nuevo. Esta acción queda como fallback legacy. */
      savePersona: (persona) => {
        if (!get().hasHydrated)
          return {
            ok: false,
            error:
              "El almacenamiento aún se está hidratando. Intenta de nuevo.",
          }
        // AD (D1): foto y firma digitalizada solo por referencia; jamás base64/Blob.
        const esReferenciaValida = (valor?: string): boolean =>
          valor === undefined ||
          (!/^data:/i.test(valor) &&
            !/^blob:/i.test(valor) &&
            valor.length <= 2048)
        if (!esReferenciaValida(persona.fotografiaUrl)) {
          return {
            ok: false,
            error:
              "Media por referencia (D1): la fotografía debe ser una URL, no contenido embebido.",
          }
        }
        const firma = persona.datosGobernanza?.firmaDigital
        if (!esReferenciaValida(firma)) {
          return {
            ok: false,
            error:
              "Media por referencia (D1): la firma digitalizada debe ser una URL, no contenido embebido.",
          }
        }
            const validacion = validarConEsquema(PersonaSchema, persona)
            if (!validacion.ok) return validacion
            // GD: coherencia rol↔ficha — sin rol directiva no hay miembro vigente
            // (la directiva se deriva de datosGobernanza; evita fantasmas en el quórum).
            if (!validacion.data.roles.includes("directiva") && validacion.data.datosGobernanza) {
              const nombre = `${validacion.data.nombres} ${validacion.data.apellidos}`
              validacion.data.datosGobernanza = undefined
              registrarEvento(
                set,
                "AD_DIRECTIVA_DESVINCULADA",
                persona.id,
                `Ficha de gobernanza depurada de ${nombre}: rol directiva removido.`,
                "AD"
              )
            }
            // GD-períodos: la ficha sin período hereda el vigente (alta espejo del libro).
            const vigenteFicha = periodoDirectivaVigente(get())
            if (
              vigenteFicha &&
              validacion.data.roles.includes("directiva") &&
              validacion.data.datosGobernanza &&
              !validacion.data.datosGobernanza.periodoId
            ) {
              validacion.data.datosGobernanza = {
                ...validacion.data.datosGobernanza,
                periodoId: vigenteFicha.id,
              }
            }
            // PE: FKs de la ficha laboral contra los maestros legales de MA (RG escritura).
        const dl = validacion.data.datosLaborales
        if (dl) {
          const m = get().maestros
          const fks: [string, string | undefined, { id: string }[]][] = [
            ["afpId", dl.afpId, m.afps],
            ["saludId", dl.saludId, m.previsionesSalud],
            [
              "asignacionFamiliarId",
              dl.asignacionFamiliarId,
              m.asignacionFamiliar,
            ],
            ["mutualidadId", dl.mutualidadId, m.mutualesCajas],
            ["bancoId", dl.bancoId, m.bancos],
          ]
          for (const [campo, valor, coleccion] of fks) {
            if (valor && !coleccion.some((x) => x.id === valor)) {
              return {
                ok: false,
                error: `${campo} no existe en el maestro correspondiente.`,
              }
            }
          }
        }
        // MP: validar condicionesEspecialesIds subset de maestros.condicionesEspeciales
        const conds = validacion.data.condicionesEspecialesIds ?? []
        if (conds.length > 0) {
          const condMaestros = get().maestros.condicionesEspeciales.map(
            (c) => c.id
          )
          for (const cid of conds) {
            if (!condMaestros.includes(cid)) {
              return { ok: false, error: `condicionEspecial ${cid} no existe.` }
            }
          }
        }
        const anterior = get().personas.find((p) => p.id === persona.id)
        set((s) => ({ personas: upsert(s.personas, validacion.data) }))
        // AD: carga/reemplazo de firma digitalizada de directiva queda auditado.
        const firmaNueva = validacion.data.datosGobernanza?.firmaDigital
        if (
          anterior &&
          firmaNueva &&
          anterior.datosGobernanza?.firmaDigital !== firmaNueva
        ) {
          registrarEvento(
            set,
            "AD_DIRECTIVA_SIGN_UPLOAD",
            persona.id,
            `Firma digitalizada actualizada para ${validacion.data.nombres} ${validacion.data.apellidos}.`,
            "AD"
          )
        }
        // PE: guardado de la ficha integral queda auditado solo si cambia.
        if (
          dl &&
          JSON.stringify(anterior?.datosLaborales ?? null) !==
            JSON.stringify(dl) &&
          Object.keys(dl).length > 4
        ) {
          registrarEvento(
            set,
            "PE_FICHA_SAVED",
            persona.id,
            `Ficha integral del trabajador ${validacion.data.nombres} ${validacion.data.apellidos} guardada (${dl.cargo}).`,
            "PE"
          )
        }
        return { ok: true }
      },

        /** @deprecated Los datos de dominio ahora persisten en el servidor vía API REST. Usar los hooks de `lib/api/use-*.ts` en código nuevo. Esta acción queda como fallback legacy. */

      removePersona: (id) => {
        if (!get().hasHydrated)
          return {
            ok: false,
            error:
              "El almacenamiento aún se está hidratando. Intenta de nuevo.",
          }
        const linked = get().vinculos.filter((v) => v.personaId === id)
        if (linked.length > 0) {
          return {
            ok: false,
            error: `No se puede eliminar la persona: ${linked.length} vínculo(s) de unidad asociado(s).`,
          }
        }
        set((s) => ({ personas: s.personas.filter((p) => p.id !== id) }))
        return { ok: true }
      },

      // --- VU: Vínculos ---
        /** @deprecated Los datos de dominio ahora persisten en el servidor vía API REST. Usar los hooks de `lib/api/use-*.ts` en código nuevo. Esta acción queda como fallback legacy. */
      saveVinculo: (vinculo) => {
        if (!get().hasHydrated)
          return {
            ok: false,
            error:
              "El almacenamiento aún se está hidratando. Intenta de nuevo.",
          }
        const validacion = validarConEsquema(VinculoUnidadSchema, vinculo)
        if (!validacion.ok) return validacion
        const persona = get().personas.find((p) => p.id === vinculo.personaId)
        if (!persona)
          return {
            ok: false,
            error: "La persona no existe en el Maestro de Personas.",
          }
        // RG escritura: validar FK unidadId existe
        if (!get().unidades.some((u) => u.id === vinculo.unidadId)) {
          return { ok: false, error: "unidadId no existe en unidades." }
        }
        if (persona.estadoCuenta === "inactiva") {
          return {
            ok: false,
            error:
              "No se puede vincular: la persona está marcada como inactiva en el Maestro de Personas.",
          }
        }
        // TST-001 (D6: bloqueo duro): una cuenta bloqueada no puede recibir vínculos, sin excepciones.
        if (persona.estadoCuenta === "bloqueada") {
          return {
            ok: false,
            error:
              "No se puede vincular: la persona está marcada como bloqueada en el Maestro de Personas.",
          }
        }
        const duplicado = get().vinculos.find(
          (v) =>
            v.personaId === vinculo.personaId &&
            v.unidadId === vinculo.unidadId &&
            !v.fechaFin &&
            v.id !== vinculo.id
        )
        if (duplicado) {
          return {
            ok: false,
            error: "Esta persona ya posee un vínculo activo con esta unidad.",
          }
        }

        // Cierre automático de tramo anterior (solo propietario/arrendatario).
        // Se calcula sobre un snapshot en memoria para poder validar contra el estado post-cierre sin mutar aún el store.
        let working = [...get().vinculos]
        let cerrado: { vinculo: VinculoUnidad; fechaFin: string } | null = null
        const cerrarAnterior = vinculo.cerrarAnterior !== false
        if (
          cerrarAnterior &&
          !vinculo.fechaFin &&
          (vinculo.rol === "propietario" || vinculo.rol === "arrendatario")
        ) {
          const anterior = working.find(
            (v) =>
              v.unidadId === vinculo.unidadId &&
              v.rol === vinculo.rol &&
              !v.fechaFin &&
              v.id !== vinculo.id
          )
          if (anterior) {
            const fechaCierre = new Date(vinculo.fechaInicio)
            fechaCierre.setDate(fechaCierre.getDate() - 1)
            const fechaFinStr = fechaCierre.toISOString().slice(0, 10)
            working = working.map((v) =>
              v.id === anterior.id ? { ...v, fechaFin: fechaFinStr } : v
            )
            cerrado = { vinculo: anterior, fechaFin: fechaFinStr }
          }
        }

        const inicio = vinculo.fechaInicio
        const fin = vinculo.fechaFin ?? "9999-12-31"

        // Exclusividad de titularidad/arriendo: un solo tramo vigente por unidad (cruza personas)
        if (vinculo.rol === "propietario" || vinculo.rol === "arrendatario") {
          const conflicto = working.find(
            (v) =>
              v.unidadId === vinculo.unidadId &&
              v.rol === vinculo.rol &&
              v.id !== vinculo.id &&
              inicio <= (v.fechaFin ?? "9999-12-31") &&
              v.fechaInicio <= fin
          )
          if (conflicto) {
            return {
              ok: false,
              error:
                vinculo.rol === "arrendatario"
                  ? "El contrato de arriendo se solapa con otro contrato vigente en la misma unidad."
                  : "Ya existe un tramo de propietario que se solapa con las fechas indicadas en esta unidad.",
            }
          }
        }

        // Anti-autosolapamiento: la misma persona no puede tener dos tramos solapados del mismo rol en la unidad
        const autosolape = working.find(
          (v) =>
            v.personaId === vinculo.personaId &&
            v.unidadId === vinculo.unidadId &&
            v.rol === vinculo.rol &&
            v.id !== vinculo.id &&
            inicio <= (v.fechaFin ?? "9999-12-31") &&
            v.fechaInicio <= fin
        )
        if (autosolape) {
          return {
            ok: false,
            error:
              "Esta persona ya registra un tramo del mismo rol que se solapa con las fechas indicadas en esta unidad.",
          }
        }

        set(() => ({ vinculos: upsert(working, vinculo) }))

        const nombreAnterior = cerrado
          ? nombrePersona(get, cerrado.vinculo.personaId)
          : ""
        if (cerrado) {
          registrarEvento(
            set,
            "VU_ASSIGN_RELEASED",
            cerrado.vinculo.id,
            `Tramo cerrado automáticamente (${cerrado.vinculo.rol}) de ${nombreAnterior} hasta ${cerrado.fechaFin}.`
          )
        }
        if (!vinculo.fechaFin && cerrado) {
          const nombreNuevo = nombrePersona(get, vinculo.personaId)
          if (vinculo.rol === "propietario") {
            registrarEvento(
              set,
              "VU_CHANGE_OWNER",
              vinculo.unidadId,
              `${nombreNuevo} reemplaza a ${nombreAnterior} como propietario.`
            )
          } else if (vinculo.rol === "arrendatario") {
            registrarEvento(
              set,
              "VU_NEW_TENANT",
              vinculo.unidadId,
              `${nombreNuevo} reemplaza a ${nombreAnterior} como arrendatario.`
            )
          }
        }

        // PI: sincroniza la vitrina según el estado inmobiliario del propietario vigente.
        get().syncPublicacionesDesdeVinculos(vinculo.unidadId)

        return { ok: true }
      },

        /** @deprecated Los datos de dominio ahora persisten en el servidor vía API REST. Usar los hooks de `lib/api/use-*.ts` en código nuevo. Esta acción queda como fallback legacy. */

      removeVinculo: (id) => {
        if (!get().hasHydrated)
          return {
            ok: false,
            error:
              "El almacenamiento aún se está hidratando. Intenta de nuevo.",
          }
        const objetivo = get().vinculos.find((v) => v.id === id)
        if (!objetivo)
          return { ok: false, error: "El vínculo a eliminar no existe." }

        // Validación inversa: no eliminar vínculo si hay certificados CT de residencia que lo requieren
        // (generarCertificadoCT valida vínculo activo y guarda unidadId+personaId del solicitante)
        const certificadosAsociados = get().certificadosCT.filter(
          (c) =>
            c.unidadId === objetivo.unidadId &&
            c.personaId === objetivo.personaId
        )
        if (certificadosAsociados.length > 0) {
          return {
            ok: false,
            error: `No se puede eliminar el vínculo: ${certificadosAsociados.length} certificado(s) CT de residencia lo requieren (folio(s): ${certificadosAsociados.map((c) => c.folio).join(", ")}).`,
          }
        }

        // Validación inversa: no eliminar vínculo de PROPIETARIO VIGENTE si hay control de propiedad en la unidad
        // (el control define visibilidad para residentes; al eliminar el propietario queda huérfano)
        // Solo bloquea si el vínculo NO tiene fechaFin (está vigente)
        const controlesUnidad = get().controlesPropiedades.filter(
          (c) => c.unidadId === objetivo.unidadId
        )
        if (
          controlesUnidad.length > 0 &&
          objetivo.rol === "propietario" &&
          !objetivo.fechaFin
        ) {
          return {
            ok: false,
            error: `No se puede eliminar el vínculo de propietario vigente: la unidad tiene control de propiedad configurado. Elimine o reasigne el control primero.`,
          }
        }

        set((s) => ({ vinculos: s.vinculos.filter((v) => v.id !== id) }))

        const unidad = get().unidades.find((u) => u.id === objetivo.unidadId)
        const ref = unidad
          ? `${unidad.etiqueta} ${unidad.numero}`
          : objetivo.unidadId
        if (!objetivo.fechaFin) {
          registrarEvento(
            set,
            "VU_ASSIGN_RELEASED",
            id,
            `Vínculo eliminado (${objetivo.rol}) sobre ${ref}.`
          )
        } else {
          registrarEvento(
            set,
            "VU_DELETE",
            id,
            `Tramo histórico (${objetivo.rol}) eliminado de ${ref}.`
          )
        }
        // PI: al retirar un vínculo puede desaparecer la oferta vigente.
        get().syncPublicacionesDesdeVinculos(objetivo.unidadId)

        return { ok: true }
      },

      // --- MA: Maestros Administrativos ---
        /** @deprecated Los datos de dominio ahora persisten en el servidor vía API REST. Usar los hooks de `lib/api/use-*.ts` en código nuevo. Esta acción queda como fallback legacy. */
      saveMaestro: (key, item) => {
        if (!get().hasHydrated)
          return {
            ok: false,
            error:
              "El almacenamiento aún se está hidratando. Intenta de nuevo.",
          }
        const validacion = validarMaestro(key, item)
        if (!validacion.ok) return validacion
        set((s) => ({
          maestros: {
            ...s.maestros,
            [key]: upsert(s.maestros[key] as { id: string }[], item),
          },
        }))
        return { ok: true }
      },

        /** @deprecated Los datos de dominio ahora persisten en el servidor vía API REST. Usar los hooks de `lib/api/use-*.ts` en código nuevo. Esta acción queda como fallback legacy. */

      removeMaestro: (key, id) => {
        if (!get().hasHydrated)
          return {
            ok: false,
            error:
              "El almacenamiento aún se está hidratando. Intenta de nuevo.",
          }
        // Validación de integridad referencial para maestros consumidos por unidades/vínculos
        if (key === "estadosOcupacion") {
          const enUso = get().unidades.some((u) => u.estadoId === id)
          if (enUso)
            return {
              ok: false,
              error: `No se puede eliminar el estado de ocupación: ${get().unidades.filter((u) => u.estadoId === id).length} unidad(es) lo usan.`,
            }
        }
        if (key === "categoriasUnidad") {
          const cat = get().maestros.categoriasUnidad.find((c) => c.id === id)
          const nombre = cat?.nombre
          if (nombre) {
            const enUso =
              get().tiposUnidad.some((t) => t.categoria === nombre) ||
              get().unidades.some((u) => u.etiqueta === nombre)
            if (enUso)
              return {
                ok: false,
                error: `No se puede eliminar la categoría de unidad "${nombre}": está en uso por tipos o unidades.`,
              }
          }
        }
        if (key === "categoriasMacro") {
          const cat = get().maestros.categoriasMacro.find((c) => c.id === id)
          // Validación laxa: si algún macroSector usa la etiqueta de esta categoría como nombre de etiqueta, bloquear
          if (
            cat &&
            get().macroSectores.some((m) => m.etiqueta === cat.nombre)
          ) {
            return {
              ok: false,
              error: `No se puede eliminar la categoría macro "${cat.nombre}": hay sectores que la usan como etiqueta.`,
            }
          }
        }
        if (key === "categoriasMicro") {
          const cat = get().maestros.categoriasMicro.find((c) => c.id === id)
          if (
            cat &&
            get().microSectores.some((m) => m.etiqueta === cat.nombre)
          ) {
            return {
              ok: false,
              error: `No se puede eliminar la categoría micro "${cat.nombre}": hay sub-sectores que la usan.`,
            }
          }
        }
        if (key === "estadosInmobiliarios") {
          const enUso = get().vinculos.some(
            (v) => v.estadoOcupacionPropiedad === id
          )
          if (enUso)
            return {
              ok: false,
              error: `No se puede eliminar el estado inmobiliario: ${get().vinculos.filter((v) => v.estadoOcupacionPropiedad === id).length} vínculo(s) lo usan.`,
            }
        }
        if (key === "condicionesEspeciales") {
          const enUso = get().personas.some((p) =>
            (p.condicionesEspecialesIds ?? []).includes(id)
          )
          if (enUso)
            return {
              ok: false,
              error:
                "No se puede eliminar la condición especial: hay personas que la tienen asignada.",
            }
        }
        // PE: maestros legales referenciados por fichas de trabajadores.
        if (
          [
            "afps",
            "previsionesSalud",
            "asignacionFamiliar",
            "mutualesCajas",
            "bancos",
          ].includes(key)
        ) {
          const campo = {
            afps: "afpId",
            previsionesSalud: "saludId",
            asignacionFamiliar: "asignacionFamiliarId",
            mutualesCajas: "mutualidadId",
            bancos: "bancoId",
          }[
            key as
              | "afps"
              | "previsionesSalud"
              | "asignacionFamiliar"
              | "mutualesCajas"
              | "bancos"
          ]!
          // SAFETY: datosLaborales is ExtensionLaboral | undefined; cast to access dynamic field
          const enUso = get().personas.filter(
            (p) =>
              (
                p.datosLaborales as unknown as
                  | Record<string, string | undefined>
                  | undefined
              )?.[campo] === id
          )
          if (enUso.length > 0) {
            return {
              ok: false,
              error: `No se puede eliminar el registro del maestro "${key}": ${enUso.length} ficha(s) de trabajador lo referencian.`,
            }
          }
        }
        // PE: maestros operativos de la bitácora.
        if (key === "jornadas") {
          const enUso =
            get().bitacoraVisitasPE.filter((v) => v.jornadaId === id).length +
            get().ingresosContratistasPE.filter((i) => i.jornadaId === id)
              .length +
            get().cierresTurnoPE.filter((c) => c.jornadaReportadaId === id)
              .length
          if (enUso > 0)
            return {
              ok: false,
              error: `No se puede eliminar la jornada: ${enUso} registro(s) operativo(s) la usan.`,
            }
        }
        if (key === "couriers") {
          const enUso = get().encomiendasPE.filter(
            (e) => e.courierId === id
          ).length
          if (enUso > 0)
            return {
              ok: false,
              error: `No se puede eliminar el courier: ${enUso} encomienda(s) lo usan.`,
            }
        }
        if (key === "contratistas") {
          const enUso = get().ingresosContratistasPE.filter(
            (i) => i.contratistaId === id
          ).length
          if (enUso > 0)
            return {
              ok: false,
              error: `No se puede eliminar el contratista: ${enUso} ingreso(s) registrados lo usan.`,
            }
        }
        set((s) => ({
          maestros: {
            ...s.maestros,
            [key]: (s.maestros[key] as { id: string }[]).filter(
              (i) => i.id !== id
            ),
          },
        }))
        return { ok: true }
      },

          // GD-períodos: registra un período (libro: archiva, nunca borra).
          periodoDirectivaVigente: () => periodoDirectivaVigente(get()),

      // --- IN: Infracciones y Multas ---
        /** @deprecated Los datos de dominio ahora persisten en el servidor vía API REST. Usar los hooks de `lib/api/use-*.ts` en código nuevo. Esta acción queda como fallback legacy. */
      saveTipoInfraccionIN: (tipo) => {
        if (!get().hasHydrated)
          return {
            ok: false,
            error:
              "El almacenamiento aún se está hidratando. Intenta de nuevo.",
          }
        const validacion = validarConEsquema(TipoInfraccionINSchema, tipo)
        if (!validacion.ok) return validacion
        set((s) => ({
          tiposInfraccionIN: upsert(s.tiposInfraccionIN, validacion.data),
        }))
        return { ok: true }
      },

        /** @deprecated Los datos de dominio ahora persisten en el servidor vía API REST. Usar los hooks de `lib/api/use-*.ts` en código nuevo. Esta acción queda como fallback legacy. */

      removeTipoInfraccionIN: (id) => {
        if (!get().hasHydrated)
          return {
            ok: false,
            error:
              "El almacenamiento aún se está hidratando. Intenta de nuevo.",
          }
        const enUso = get().infraccionesIN.filter(
          (i) => i.tipoInfraccionId === id
        )
        if (enUso.length > 0) {
          return {
            ok: false,
            error: `No se puede eliminar el tipo de infracción: ${enUso.length} infracción(es) registrada(s) lo utilizan.`,
          }
        }
        set((s) => ({
          tiposInfraccionIN: s.tiposInfraccionIN.filter((t) => t.id !== id),
        }))
        return { ok: true }
      },

        /** @deprecated Los datos de dominio ahora persisten en el servidor vía API REST. Usar los hooks de `lib/api/use-*.ts` en código nuevo. Esta acción queda como fallback legacy. */

      saveInfraccionIN: (infraccion) => {
        if (!get().hasHydrated)
          return {
            ok: false,
            error:
              "El almacenamiento aún se está hidratando. Intenta de nuevo.",
          }
        const esNueva = !get().infraccionesIN.some(
          (i) => i.id === infraccion.id
        )
        let candidato: InfraccionIN = infraccion
        if (esNueva) {
          const numeros = get()
            .infraccionesIN.map((i) =>
              Number.parseInt(i.folio.replace(/^IN-/, ""), 10)
            )
            .filter((n) => Number.isFinite(n))
          const siguiente = (numeros.length > 0 ? Math.max(...numeros) : 0) + 1
          candidato = {
            ...infraccion,
            folio: `IN-${String(siguiente).padStart(4, "0")}`,
            estado: "en_revision",
            comentariosDirectiva: [],
            respaldosDirectiva: [],
          }
        }
        const validacion = validarConEsquema(InfraccionINSchema, candidato)
        if (!validacion.ok) return validacion
        const registro = validacion.data

        // Excluyentes: catálogo o daño directo.
        if (!registro.tipoInfraccionId && !registro.danoDirecto) {
          return {
            ok: false,
            error:
              "La infracción exige un tipo del catálogo o ser un cobro directo por daños con descripción y costo.",
          }
        }
        if (registro.tipoInfraccionId && registro.danoDirecto) {
          return {
            ok: false,
            error:
              "Una infracción no puede tener tipo de catálogo y cobro directo por daños a la vez.",
          }
        }
        if (
          registro.tipoInfraccionId &&
          !get().tiposInfraccionIN.some(
            (t) => t.id === registro.tipoInfraccionId
          )
        ) {
          return {
            ok: false,
            error:
              "No se puede registrar: el tipo de infracción indicado no existe en el catálogo.",
          }
        }
        if (registro.danoDirecto && registro.evidencias.length === 0) {
          return {
            ok: false,
            error:
              "El cobro directo por daños exige al menos una evidencia adjunta (cotización/factura/foto).",
          }
        }
        if (!get().unidades.some((u) => u.id === registro.unidadId)) {
          return {
            ok: false,
            error:
              "No se puede registrar: la unidad infractora no existe en el inventario.",
          }
        }
        if (
          registro.reportantePersonaId &&
          !get().personas.some((p) => p.id === registro.reportantePersonaId)
        ) {
          return {
            ok: false,
            error:
              "No se puede registrar: el reportante no existe en el Maestro de Personas.",
          }
        }
        if (
          registro.mensajeBuzonId &&
          !get().mensajesBuzonCO.some((m) => m.id === registro.mensajeBuzonId)
        ) {
          return {
            ok: false,
            error:
              "No se puede registrar: el mensaje del buzón CO indicado no existe.",
          }
        }

        set((s) => ({ infraccionesIN: upsert(s.infraccionesIN, registro) }))
        if (esNueva) {
          const referencia = registro.danoDirecto
            ? `Daño directo: ${registro.danoDirecto.descripcionDaño}`
            : (get().tiposInfraccionIN.find(
                (t) => t.id === registro.tipoInfraccionId
              )?.nombre ?? registro.tipoInfraccionId)
          registrarEvento(
            set,
            "IN_REG_EVENT",
            registro.id,
            `Infracción ${registro.folio} (${referencia}) registrada para unidad ${refUnidad(get, registro.unidadId)}.`,
            "IN"
          )
          get().notify({
            destinatarioRol: "administracion",
            asunto: `Nueva infracción ${registro.folio} en Revisión`,
            cuerpo: `Unidad ${refUnidad(get, registro.unidadId)}: ${referencia}. Antecedentes: ${registro.antecedentes.slice(0, 140)}…`,
            moduloOrigen: "IN",
          })
        }
        return { ok: true }
      },

      apelarInfraccionIN: (id, descargos) => {
        if (!get().hasHydrated)
          return {
            ok: false,
            error:
              "El almacenamiento aún se está hidratando. Intenta de nuevo.",
          }
        const infraccion = get().infraccionesIN.find((i) => i.id === id)
        if (!infraccion)
          return {
            ok: false,
            error: "No se puede apelar: la infracción no existe.",
          }
        if (infraccion.estado !== "en_revision") {
          return {
            ok: false,
            error:
              "Solo una infracción En Revisión puede recibir descargos de apelación.",
          }
        }
        if (descargos.trim().length < 10) {
          return {
            ok: false,
            error:
              "Los descargos deben detallar la posición del vecino (mínimo 10 caracteres).",
          }
        }
        set((s) => ({
          infraccionesIN: s.infraccionesIN.map((x) =>
            x.id === id
              ? {
                  ...x,
                  estado: "apelada",
                  apelacion: { descargos: descargos.trim(), fecha: hoyISO() },
                }
              : x
          ),
        }))
        registrarEvento(
          set,
          "IN_APELACION",
          id,
          `Descargos presentados en infracción ${infraccion.folio}: En Revisión → Apelada.`,
          "IN"
        )
        return { ok: true }
      },

      respaldarInfraccionIN: (id, personaId) => {
        if (!get().hasHydrated)
          return {
            ok: false,
            error:
              "El almacenamiento aún se está hidratando. Intenta de nuevo.",
          }
        const infraccion = get().infraccionesIN.find((i) => i.id === id)
        if (!infraccion)
          return {
            ok: false,
            error: "No se puede respaldar: la infracción no existe.",
          }
        if (["aplicada", "desestimada"].includes(infraccion.estado)) {
          return {
            ok: false,
            error: "La infracción ya tiene resolución final.",
          }
        }
        const firmante = get().personas.find((p) => p.id === personaId)
        if (!firmante?.datosGobernanza || firmante.estadoCuenta !== "activa") {
          return {
            ok: false,
            error:
              "Solo un miembro vigente de la directiva puede respaldar la aplicación de la multa.",
          }
        }
        if (infraccion.respaldosDirectiva.includes(personaId)) {
          return {
            ok: false,
            error: "Este miembro de la directiva ya respaldó la multa.",
          }
        }
        set((s) => ({
          infraccionesIN: s.infraccionesIN.map((x) =>
            x.id === id
              ? {
                  ...x,
                  respaldosDirectiva: [...x.respaldosDirectiva, personaId],
                }
              : x
          ),
        }))
        registrarEvento(
          set,
          "IN_RESPALDO_DIRECTIVA",
          id,
          `${nombrePersona(get, personaId)} respalda la aplicación de la multa ${infraccion.folio}.`,
          "IN"
        )
        return { ok: true }
      },

      aplicarInfraccionIN: (id) => {
        if (!get().hasHydrated)
          return {
            ok: false,
            error:
              "El almacenamiento aún se está hidratando. Intenta de nuevo.",
          }
        const infraccion = get().infraccionesIN.find((i) => i.id === id)
        if (!infraccion)
          return {
            ok: false,
            error: "No se puede aplicar: la infracción no existe.",
          }
        if (!["en_revision", "apelada"].includes(infraccion.estado)) {
          return {
            ok: false,
            error: "Solo una infracción En Revisión o Apelada puede aplicarse.",
          }
        }

        let montoAplicado: number
        let descripcionSancion: string
        if (infraccion.danoDirecto) {
          montoAplicado = infraccion.danoDirecto.costoReparacion
          descripcionSancion = `Cobro directo $${montoAplicado.toLocaleString("es-CL")}`
        } else {
          const tipo = get().tiposInfraccionIN.find(
            (t) => t.id === infraccion.tipoInfraccionId
          )
          if (!tipo)
            return {
              ok: false,
              error:
                "No se puede aplicar: el tipo de infracción ya no existe en el catálogo.",
            }
          montoAplicado = tipo.valor
          descripcionSancion =
            tipo.tipoSancion === "porcentaje_gc"
              ? `${tipo.valor}% del Gasto Común`
              : `$${tipo.valor.toLocaleString("es-CL")} monto fijo`
          // Multas grave/gravísima exigen respaldo previo de la directiva.
          if (
            ["grave", "gravisima"].includes(tipo.categoria) &&
            infraccion.respaldosDirectiva.length === 0
          ) {
            return {
              ok: false,
              error:
                "Las multas Grave/Gravísima requieren el respaldo de la directiva antes de cargarse al Gasto Común.",
            }
          }
          // FI: la sanción % GC se resuelve contra el último cobro GC emitido a la unidad;
          // sin historial previo se usa el valor nominal del catálogo.
          if (tipo.tipoSancion === "porcentaje_gc") {
            const ultimoGC = [...get().cobrosFI]
              .filter(
                (c) =>
                  c.concepto === "gasto_comun" &&
                  c.unidadId === infraccion.unidadId
              )
              .sort((a, b) => b.periodo.localeCompare(a.periodo))[0]
            if (ultimoGC) {
              montoAplicado = Math.round(
                (tipo.valor / 100) * ultimoGC.montoBase
              )
              descripcionSancion = `${tipo.valor}% del Gasto Común ($${montoAplicado.toLocaleString("es-CL")})`
            }
          }
        }

        const hoyStr = hoyISO()
        const fondoGC = get().fondosFI.find(
          (f) => f.tipo === "gasto_comun" && f.activo
        )
        let cargoFIReferencia: string | undefined
        let nuevoCobro: CobroFI | undefined
        if (fondoGC && montoAplicado > 0) {
          nuevoCobro = {
            id: generarId("cob"),
            unidadId: infraccion.unidadId,
            periodo: hoyStr.slice(0, 7),
            concepto: "multa_in",
            origenModulo: "IN",
            origenRef: infraccion.id,
            fondoId: fondoGC.id,
            descripcion: `Multa ${infraccion.folio}: ${descripcionSancion}`,
            montoBase: montoAplicado,
            fechaCargo: hoyStr,
            fechaVencimiento: vencimientoDesdeDiaCorte(
              hoyStr.slice(0, 7),
              get().configuracion?.diaCortePago ?? 5
            ),
            moras: [],
            pagos: [],
            diferencias: [],
          }
          cargoFIReferencia = nuevoCobro.id
        }

        set((s) => ({
          infraccionesIN: s.infraccionesIN.map((x) =>
            x.id === id
              ? {
                  ...x,
                  estado: "aplicada" as EstadoInfraccionIN,
                  montoAplicado,
                  ...(cargoFIReferencia
                    ? { cargoFIReferencia }
                    : { cargoFIReferencia: "pendiente" as const }),
                }
              : x
          ),
          ...(nuevoCobro ? { cobrosFI: [...s.cobrosFI, nuevoCobro] } : {}),
        }))
        registrarEvento(
          set,
          "IN_APPLY_FINE",
          id,
          `Multa ${infraccion.folio} APLICADA (${descripcionSancion}) para unidad ${refUnidad(get, infraccion.unidadId)}${nuevoCobro ? `; cobro FI materializado (${nuevoCobro.id})` : "; sin fondo disponible para imputar el cargo"}.`,
          "IN"
        )
        // Notifica al propietario vigente de la unidad infractora (pasa por gate AD).
        const propietario = get().vinculos.find(
          (v) =>
            v.unidadId === infraccion.unidadId &&
            v.rol === "propietario" &&
            !v.fechaFin
        )
        if (propietario) {
          get().notify({
            destinatarioRol: "propietario",
            destinatarioPersonaId: propietario.personaId,
            asunto: `Multa aplicada a tu unidad (${infraccion.folio})`,
            cuerpo: `Se aplicó una sanción de ${descripcionSancion} según antecedentes registrados. Será cargada al Gasto Común del periodo.`,
            moduloOrigen: "IN",
            unidadId: infraccion.unidadId,
          })
        }
        return { ok: true }
      },

      desestimarInfraccionIN: (id, justificacion) => {
        if (!get().hasHydrated)
          return {
            ok: false,
            error:
              "El almacenamiento aún se está hidratando. Intenta de nuevo.",
          }
        const infraccion = get().infraccionesIN.find((i) => i.id === id)
        if (!infraccion)
          return {
            ok: false,
            error: "No se puede desestimar: la infracción no existe.",
          }
        if (!["en_revision", "apelada"].includes(infraccion.estado)) {
          return {
            ok: false,
            error: "La infracción ya tiene resolución final.",
          }
        }
        if (justificacion.trim().length === 0) {
          return {
            ok: false,
            error: "La desestimación exige justificación obligatoria.",
          }
        }
        set((s) => ({
          infraccionesIN: s.infraccionesIN.map((x) =>
            x.id === id
              ? {
                  ...x,
                  estado: "desestimada",
                  desestimacionJustificacion: justificacion.trim(),
                }
              : x
          ),
        }))
        registrarEvento(
          set,
          "IN_DESESTIMADA",
          id,
          `Infracción ${infraccion.folio} desestimada: ${justificacion.trim()}`,
          "IN"
        )
        return { ok: true }
      },

        /** @deprecated Los datos de dominio ahora persisten en el servidor vía API REST. Usar los hooks de `lib/api/use-*.ts` en código nuevo. Esta acción queda como fallback legacy. */

      removeInfraccionIN: (id) => {
        if (!get().hasHydrated)
          return {
            ok: false,
            error:
              "El almacenamiento aún se está hidratando. Intenta de nuevo.",
          }
        set((s) => ({
          infraccionesIN: s.infraccionesIN.filter((i) => i.id !== id),
        }))
        return { ok: true }
      },


      // --- RA: Reservas y Amenities ---
        /** @deprecated Los datos de dominio ahora persisten en el servidor vía API REST. Usar los hooks de `lib/api/use-*.ts` en código nuevo. Esta acción queda como fallback legacy. */
      saveElementoRA: (elemento) => {
        if (!get().hasHydrated)
          return {
            ok: false,
            error:
              "El almacenamiento aún se está hidratando. Intenta de nuevo.",
          }
        const validacion = validarConEsquema(ElementoRASchema, elemento)
        if (!validacion.ok) return validacion
        const registro = validacion.data
        if (!registro.microSectorId && !registro.activoIRId) {
          return {
            ok: false,
            error:
              "El elemento reservable exige una ubicación: sub-sector de la Estructura Física o activo del catálogo IR.",
          }
        }
        if (
          registro.microSectorId &&
          !get().microSectores.some((m) => m.id === registro.microSectorId)
        ) {
          return {
            ok: false,
            error:
              "No se puede guardar el elemento: el sub-sector indicado no existe en el inventario.",
          }
        }
        if (
          registro.activoIRId &&
          !get().activosIR.some((r) => r.id === registro.activoIRId)
        ) {
          return {
            ok: false,
            error:
              "No se puede guardar el elemento: el activo del catálogo IR indicado no existe.",
          }
        }
        set((s) => ({ elementosRA: upsert(s.elementosRA, registro) }))
        return { ok: true }
      },

        /** @deprecated Los datos de dominio ahora persisten en el servidor vía API REST. Usar los hooks de `lib/api/use-*.ts` en código nuevo. Esta acción queda como fallback legacy. */

      saveReservaRA: (reserva) => {
        if (!get().hasHydrated)
          return {
            ok: false,
            error:
              "El almacenamiento aún se está hidratando. Intenta de nuevo.",
          }
        const esNueva = !get().reservasRA.some((r) => r.id === reserva.id)
        let candidato: ReservaRA = reserva
        if (esNueva)
          candidato = {
            ...reserva,
            folio: siguienteFolioRA(get),
            estado: "confirmada",
          }
        const validacion = validarConEsquema(ReservaRASchema, candidato)
        if (!validacion.ok) return validacion
        const registro = validacion.data

        const elemento = get().elementosRA.find(
          (e) => e.id === registro.elementoId
        )
        if (!elemento)
          return {
            ok: false,
            error: "No se puede reservar: el elemento reservable no existe.",
          }
        if (!elemento.activo)
          return {
            ok: false,
            error: `No se puede reservar: ${elemento.nombre} está deshabilitado para reservas.`,
          }
        const solicitante = get().personas.find(
          (p) => p.id === registro.solicitantePersonaId
        )
        if (!solicitante)
          return {
            ok: false,
            error:
              "No se puede reservar: el solicitante no existe en el Maestro de Personas.",
          }
        if (solicitante.estadoCuenta !== "activa") {
          return {
            ok: false,
            error:
              "No se puede reservar: la cuenta del solicitante no está activa.",
          }
        }
        if (
          registro.unidadId &&
          !get().unidades.some((u) => u.id === registro.unidadId)
        ) {
          return {
            ok: false,
            error:
              "No se puede reservar: la unidad indicada no existe en el inventario.",
          }
        }
        if (registro.horaInicio >= registro.horaFin) {
          return {
            ok: false,
            error:
              "El tramo horario es inválido: la hora de inicio debe ser anterior a la de término.",
          }
        }

        // Regla especial: anticipación mínima para reservar.
        if (elemento.anticipacionMinimaDias) {
          const limite = new Date()
          limite.setDate(limite.getDate() + elemento.anticipacionMinimaDias)
          const limiteStr = limite.toISOString().slice(0, 10)
          if (registro.fecha < limiteStr) {
            return {
              ok: false,
              error: `Anticipación insuficiente: ${elemento.nombre} exige reservar con al menos ${elemento.anticipacionMinimaDias} día(s) de anticipación (hasta ${limiteStr}).`,
            }
          }
        }

        // Validación de morosidad (RA §2): bloquea solicitantes con deuda vencida en FI.
        const deudaFI = getDeudaVigenteFI(get, registro.solicitantePersonaId)
        if (deudaFI) return { ok: false, error: deudaFI }

        // Prevención de overbooking: solapamiento [inicio, fin) según stock concurrente.
        const solapadas = get().reservasRA.filter(
          (r) =>
            r.elementoId === registro.elementoId &&
            r.fecha === registro.fecha &&
            r.estado === "confirmada" &&
            registro.horaInicio < r.horaFin &&
            r.horaInicio < registro.horaFin
        )
        const capacidad = Math.max(1, elemento.stock ?? 1)
        if (solapadas.length >= capacidad) {
          const tramo = solapadas[0]!
          return {
            ok: false,
            error: `Conflicto horario: ${elemento.nombre} ya tiene ${solapadas.length} reserva(s) confirmada(s) que se solapan el ${registro.fecha} (${tramo.horaInicio}–${tramo.horaFin}).`,
          }
        }

        let final = registro
        if (esNueva) {
          final = {
            ...registro,
            montoTarifa: elemento.tarifaUso,
            montoGarantia: elemento.garantiaRequerida,
          }
          if (elemento.tarifaUso > 0) {
            const fondoAmenities = get().fondosFI.find(
              (f) => f.tipo === "amenities" && f.activo
            )
            const unidadCobro =
              registro.unidadId ??
              get().vinculos.find(
                (v) =>
                  v.personaId === registro.solicitantePersonaId && !v.fechaFin
              )?.unidadId
            if (fondoAmenities && unidadCobro) {
              const hoyStr = hoyISO()
              const cobro: CobroFI = {
                id: generarId("cob"),
                unidadId: unidadCobro,
                periodo: hoyStr.slice(0, 7),
                concepto: "reserva_ra",
                origenModulo: "RA",
                origenRef: registro.id,
                fondoId: fondoAmenities.id,
                descripcion: `Tarifa reserva ${elemento.nombre} (${registro.fecha})`,
                montoBase: elemento.tarifaUso,
                fechaCargo: hoyStr,
                fechaVencimiento: registro.fecha,
                moras: [],
                pagos: [],
                diferencias: [],
              }
              const v = validarConEsquema(CobroFISchema, cobro)
              if (!v.ok) return v
              set((s) => ({ cobrosFI: [...s.cobrosFI, cobro] }))
              final = { ...final, cargoFIReferencia: cobro.id }
            }
          } else {
            final = { ...final, cargoFIReferencia: registro.cargoFIReferencia }
          }
        }
        set((s) => ({ reservasRA: upsert(s.reservasRA, final) }))
        if (esNueva) {
          registrarEvento(
            set,
            "RA_BOOKING_CREATED",
            final.id,
            `Reserva ${final.folio} CONFIRMADA: ${elemento.nombre} el ${final.fecha} ${final.horaInicio}–${final.horaFin} a nombre de ${nombrePersona(get, final.solicitantePersonaId)}${final.montoTarifa > 0 ? ` (tarifa $${final.montoTarifa.toLocaleString("es-CL")}, cargo FI pendiente)` : ""}.`,
            "RA"
          )
        }
        return { ok: true }
      },

      cancelarReservaRA: (id) => {
        if (!get().hasHydrated)
          return {
            ok: false,
            error:
              "El almacenamiento aún se está hidratando. Intenta de nuevo.",
          }
        const reserva = get().reservasRA.find((r) => r.id === id)
        if (!reserva)
          return {
            ok: false,
            error: "No se puede cancelar: la reserva no existe.",
          }
        if (reserva.estado !== "confirmada") {
          return {
            ok: false,
            error: "Solo una reserva Confirmada puede cancelarse.",
          }
        }
        const elemento = get().elementosRA.find(
          (e) => e.id === reserva.elementoId
        )
        const hoyStr = hoyISO()
        const diasRestantes = Math.round(
          (new Date(`${reserva.fecha}T00:00:00`).getTime() -
            new Date(`${hoyStr}T00:00:00`).getTime()) /
            86400000
        )
        const ventanaTardia = elemento?.cancelacionTardiaDias
        const tardia =
          ventanaTardia !== undefined && diasRestantes <= ventanaTardia
        const penalizacion =
          tardia && elemento?.penalizacionTardiaMonto
            ? elemento.penalizacionTardiaMonto
            : undefined
        let cargoPenalizacion: string | undefined
        if (penalizacion) {
          const fondoAmenities = get().fondosFI.find(
            (f) => f.tipo === "amenities" && f.activo
          )
          const unidadCobro =
            reserva.unidadId ??
            get().vinculos.find(
              (v) => v.personaId === reserva.solicitantePersonaId && !v.fechaFin
            )?.unidadId
          if (fondoAmenities && unidadCobro) {
            const hoyStr2 = hoyISO()
            const cobro: CobroFI = {
              id: generarId("cob"),
              unidadId: unidadCobro,
              periodo: hoyStr2.slice(0, 7),
              concepto: "penalizacion_ra",
              origenModulo: "RA",
              origenRef: reserva.id,
              fondoId: fondoAmenities.id,
              descripcion: `Penalización por cancelación tardía (${reserva.folio})`,
              montoBase: penalizacion,
              fechaCargo: hoyStr2,
              fechaVencimiento: hoyStr2,
              moras: [],
              pagos: [],
              diferencias: [],
            }
            const v = validarConEsquema(CobroFISchema, cobro)
            if (!v.ok) return v
            cargoPenalizacion = cobro.id
            set((s) => ({ cobrosFI: [...s.cobrosFI, cobro] }))
          }
        }
        set((s) => ({
          reservasRA: s.reservasRA.map((r) =>
            r.id === id
              ? {
                  ...r,
                  estado: "cancelada",
                  cancelacion: {
                    fecha: hoyStr,
                    tardia,
                    ...(penalizacion ? { penalizacion } : {}),
                  },
                  ...(cargoPenalizacion
                    ? { cargoFIReferencia: cargoPenalizacion }
                    : {}),
                }
              : r
          ),
        }))
        registrarEvento(
          set,
          "RA_BOOKING_CANCELLED",
          id,
          `Reserva ${reserva.folio} cancelada${tardia ? ` FUERA DE PLAZO (faltaban ${diasRestantes} día(s))` : ""}${cargoPenalizacion ? `; penalización $${penalizacion!.toLocaleString("es-CL")} con cobro FI materializado (${cargoPenalizacion})` : ""}.`,
          "RA"
        )
        return { ok: true }
      },

      retenerGarantiaRA: (id, motivo) => {
        if (!get().hasHydrated)
          return {
            ok: false,
            error:
              "El almacenamiento aún se está hidratando. Intenta de nuevo.",
          }
        const reserva = get().reservasRA.find((r) => r.id === id)
        if (!reserva)
          return {
            ok: false,
            error: "No se puede retener: la reserva no existe.",
          }
        if (reserva.estado !== "confirmada") {
          return {
            ok: false,
            error: "La garantía se retiene sobre una reserva Confirmada.",
          }
        }
        if (reserva.garantiaRetenida) {
          return {
            ok: false,
            error: "La garantía de esta reserva ya fue retenida.",
          }
        }
        if (motivo.trim().length === 0) {
          return {
            ok: false,
            error: "La retención exige describir el daño o motivo.",
          }
        }
        if (reserva.montoGarantia <= 0) {
          return {
            ok: false,
            error: "El elemento no exige garantía: nada que retener.",
          }
        }
        const fondoAmenities = get().fondosFI.find(
          (f) => f.tipo === "amenities" && f.activo
        )
        const unidadCobro =
          reserva.unidadId ??
          get().vinculos.find(
            (v) => v.personaId === reserva.solicitantePersonaId && !v.fechaFin
          )?.unidadId
        let cargoGarantia: string | undefined
        let nuevoCobro: CobroFI | undefined
        if (fondoAmenities && unidadCobro) {
          const hoyStr = hoyISO()
          nuevoCobro = {
            id: generarId("cob"),
            unidadId: unidadCobro,
            periodo: hoyStr.slice(0, 7),
            concepto: "garantia_ra",
            origenModulo: "RA",
            origenRef: reserva.id,
            fondoId: fondoAmenities.id,
            descripcion: `Garantía retenida (${reserva.folio}): ${motivo.trim()}`,
            montoBase: reserva.montoGarantia,
            fechaCargo: hoyStr,
            fechaVencimiento: hoyStr,
            moras: [],
            pagos: [],
            diferencias: [],
          }
          const v = validarConEsquema(CobroFISchema, nuevoCobro)
          if (!v.ok) return v
          cargoGarantia = nuevoCobro.id
        }
        set((s) => ({
          reservasRA: s.reservasRA.map((r) =>
            r.id === id
              ? {
                  ...r,
                  garantiaRetenida: {
                    monto: r.montoGarantia,
                    motivo: motivo.trim(),
                  },
                  ...(cargoGarantia
                    ? { cargoFIReferencia: cargoGarantia }
                    : {}),
                }
              : r
          ),
          ...(nuevoCobro ? { cobrosFI: [...s.cobrosFI, nuevoCobro] } : {}),
        }))
        registrarEvento(
          set,
          "RA_WARRANTY_RETAINED",
          id,
          `Garantía RETENIDA ($${reserva.montoGarantia.toLocaleString("es-CL")}) en reserva ${reserva.folio}: ${motivo.trim()}. ${cargoGarantia ? `Cargo al fondo de amenities materializado (${cargoGarantia}).` : ""}`,
          "RA"
        )
        get().notify({
          destinatarioRol: "administracion",
          asunto: `Garantía retenida (reserva ${reserva.folio})`,
          cuerpo: `Se retuvo la garantía de $${reserva.montoGarantia.toLocaleString("es-CL")} por: ${motivo.trim()}`,
          moduloOrigen: "RA",
        })
        return { ok: true }
      },

      // --- FI: Finanzas y Morosidad ---
        /** @deprecated Los datos de dominio ahora persisten en el servidor vía API REST. Usar los hooks de `lib/api/use-*.ts` en código nuevo. Esta acción queda como fallback legacy. */
      saveFondoFI: (fondo) => {
        if (!get().hasHydrated)
          return {
            ok: false,
            error:
              "El almacenamiento aún se está hidratando. Intenta de nuevo.",
          }
        const validacion = validarConEsquema(FondoFISchema, fondo)
        if (!validacion.ok) return validacion
        const duplicado = get().fondosFI.find(
          (f) =>
            f.nombre.toLowerCase() === validacion.data.nombre.toLowerCase() &&
            f.id !== validacion.data.id
        )
        if (duplicado)
          return {
            ok: false,
            error: `Ya existe un fondo con el nombre "${validacion.data.nombre}".`,
          }
        set((s) => ({ fondosFI: upsert(s.fondosFI, validacion.data) }))
        return { ok: true }
      },

        /** @deprecated Los datos de dominio ahora persisten en el servidor vía API REST. Usar los hooks de `lib/api/use-*.ts` en código nuevo. Esta acción queda como fallback legacy. */

      saveEgresoFI: (egreso) => {
        if (!get().hasHydrated)
          return {
            ok: false,
            error:
              "El almacenamiento aún se está hidratando. Intenta de nuevo.",
          }
        const esNuevo = !get().egresosFI.some((e) => e.id === egreso.id)
        let candidato: EgresoFI = egreso
        if (esNuevo) candidato = { ...egreso, folio: siguienteFolioFE(get) }
        const validacion = validarConEsquema(EgresoFISchema, candidato)
        if (!validacion.ok) return validacion
        const registro = validacion.data
        const fondo = get().fondosFI.find((f) => f.id === registro.fondoId)
        if (!fondo)
          return {
            ok: false,
            error:
              "No se puede guardar el gasto: el fondo de imputación no existe.",
          }
        if (!fondo.activo)
          return {
            ok: false,
            error: `No se puede guardar el gasto: el fondo "${fondo.nombre}" está inactivo.`,
          }
        for (const microId of registro.microSectoresIds ?? []) {
          if (!get().microSectores.some((m) => m.id === microId)) {
            return {
              ok: false,
              error:
                "No se puede guardar el gasto: uno de los sub-sectores diferenciados no existe.",
            }
          }
        }
        if (
          registro.unidadId &&
          !get().unidades.some((u) => u.id === registro.unidadId)
        ) {
          return {
            ok: false,
            error:
              "No se puede guardar el gasto: la unidad indicada no existe en el inventario.",
          }
        }
        if (
          registro.aprobacionActaGDId &&
          !get().actasGD.some((a) => a.id === registro.aprobacionActaGDId)
        ) {
          return {
            ok: false,
            error:
              "No se puede guardar el gasto: el acta de aprobación indicada no existe.",
          }
        }
        set((s) => ({ egresosFI: upsert(s.egresosFI, registro) }))
        if (esNuevo) {
          registrarEvento(
            set,
            "FI_EGRESS_CREATED",
            registro.id,
            `Egreso ${registro.folio} "${registro.descripcion}" por $${registro.monto.toLocaleString("es-CL")} imputado a ${fondo.nombre}${registro.esRecurrente ? " (recurrente)" : ""}.`,
            "FI"
          )
        }
        return { ok: true }
      },

      emitirGastoComun: (input) => {
        if (!get().hasHydrated)
          return {
            ok: false,
            error:
              "El almacenamiento aún se está hidratando. Intenta de nuevo.",
          }
        const configuracion = get().configuracion
        if (!configuracion || configuracion.modoCalculoGC === undefined) {
          return {
            ok: false,
            error:
              "CF no cargado: la configuración global debe estar disponible para emitir el Gasto Común.",
          }
        }
        if (!/^\d{4}-\d{2}$/.test(input.periodo)) {
          return { ok: false, error: "El periodo debe tener formato AAAA-MM." }
        }
        if (get().emisionesGC.some((e) => e.periodo === input.periodo)) {
          return {
            ok: false,
            error: `El periodo ${input.periodo} ya fue procesado previamente.`,
          }
        }
        const modo = configuracion.modoCalculoGC
        const fondoGC = get().fondosFI.find(
          (f) => f.tipo === "gasto_comun" && f.activo
        )
        if (!fondoGC) {
          return {
            ok: false,
            error:
              "No existe un Fondo de Gasto Común activo para imputar la emisión.",
          }
        }
        const elegibles = get().unidades.filter((u) => {
          if (u.id.startsWith("u-E-")) return false
          if (input.unidadIds && input.unidadIds.length > 0)
            return input.unidadIds.includes(u.id)
          return true
        })
        if (elegibles.length === 0) {
          return {
            ok: false,
            error: "No hay unidades elegibles para la emisión.",
          }
        }
        const sinResponsable = elegibles.filter(
          (u) =>
            !get().vinculos.some(
              (v) =>
                v.unidadId === u.id && v.rol === "propietario" && !v.fechaFin
            )
        )
        if (sinResponsable.length > 0) {
          const refs = sinResponsable
            .slice(0, 3)
            .map((u) => refUnidad(get, u.id))
            .join(", ")
          return {
            ok: false,
            error: `Emisión bloqueada: ${sinResponsable.length} unidad(es) sin responsable de cobro asignado (${refs}${sinResponsable.length > 3 ? "…" : ""}).`,
          }
        }
        if (
          modo === "variable" &&
          (!input.gastoTotal || input.gastoTotal <= 0)
        ) {
          return {
            ok: false,
            error:
              "La modalidad prorrateo exige definir el gasto total a recaudar.",
          }
        }

        const hoyStr = hoyISO()
        const vencimiento =
          input.fechaVencimiento ??
          vencimientoDesdeDiaCorte(input.periodo, configuracion.diaCortePago)
        const stamp = Date.now()
        const emisionId = `egc-${stamp}-${Math.random().toString(36).slice(2, 8)}`
        const lineas: EmisionGC["lineas"] = []
        const nuevosCobros: CobroFI[] = []
        elegibles.forEach((u, idx) => {
          const responsable = get().vinculos.find(
            (v) => v.unidadId === u.id && v.rol === "propietario" && !v.fechaFin
          )!
          let monto: number
          if (modo === "fijo") {
            const tipo = get().tiposUnidad.find((t) => t.id === u.tipoUnidadId)
            monto = Math.round(tipo?.montoBaseGc ?? 0)
          } else {
            monto = Math.round((input.gastoTotal ?? 0) * u.prorrateo)
          }
          const cobroId = `cob-${stamp}-${idx}-${Math.random().toString(36).slice(2, 8)}`
          lineas.push({
            unidadId: u.id,
            responsablePersonaId: responsable.personaId,
            monto,
            cobroId,
          })
          nuevosCobros.push({
            id: cobroId,
            unidadId: u.id,
            periodo: input.periodo,
            concepto: "gasto_comun",
            origenModulo: "FI",
            origenRef: emisionId,
            fondoId: fondoGC.id,
            descripcion: `Gasto Común ${input.periodo}`,
            montoBase: monto,
            fechaCargo: hoyStr,
            fechaVencimiento: vencimiento,
            moras: [],
            pagos: [],
            diferencias: [],
          })
        })
        const fondoReserva = get().fondosFI.find(
          (f) =>
            f.tipo === "reserva" && f.activo && (f.porcentajeAporte ?? 0) > 0
        )
        const totalEmitido = lineas.reduce((acc, l) => acc + l.monto, 0)
        const aporte = fondoReserva
          ? {
              fondoId: fondoReserva.id,
              monto: Math.round(
                (totalEmitido * (fondoReserva.porcentajeAporte ?? 0)) / 100
              ),
            }
          : undefined
        const emision: EmisionGC = {
          id: emisionId,
          periodo: input.periodo,
          modo,
          gastoTotal:
            modo === "variable"
              ? (input.gastoTotal ?? totalEmitido)
              : totalEmitido,
          lineas,
          fondoReservaAporte: aporte && aporte.monto > 0 ? aporte : undefined,
          fechaEmision: hoyStr,
        }
        const validacion = validarConEsquema(EmisionGCSchema, emision)
        if (!validacion.ok) return validacion
        for (const cobro of nuevosCobros) {
          const v = validarConEsquema(CobroFISchema, cobro)
          if (!v.ok) return v
        }
        set((s) => ({
          emisionesGC: upsert(s.emisionesGC, validacion.data),
          cobrosFI: [...s.cobrosFI, ...nuevosCobros],
        }))
        registrarEvento(
          set,
          "FI_EMISION_GC",
          emisionId,
          `Emitido GC ${input.periodo} en modalidad ${modo === "fijo" ? "Fija" : "Variable"}: $${totalEmitido.toLocaleString("es-CL")} a ${lineas.length} unidad(es), vencimiento ${vencimiento}${aporte && aporte.monto > 0 ? `, aporte $${aporte.monto.toLocaleString("es-CL")} al Fondo de Reserva` : ""}.`,
          "FI"
        )
        if (configuracion.notificarEmisionGC !== false) {
          for (const linea of lineas) {
            get().notify({
              destinatarioRol: "propietario",
              destinatarioPersonaId: linea.responsablePersonaId,
              asunto: `Gasto Común ${input.periodo} emitido`,
              cuerpo: `${refUnidad(get, linea.unidadId)}: su Gasto Común ${input.periodo} es de $${linea.monto.toLocaleString("es-CL")} con vencimiento ${vencimiento}.`,
              moduloOrigen: "FI",
              unidadId: linea.unidadId,
            })
          }
        }
        return { ok: true }
      },

      aplicarMoraFI: (cobroId, tasaMensualPct = 1) => {
        if (!get().hasHydrated)
          return {
            ok: false,
            error:
              "El almacenamiento aún se está hidratando. Intenta de nuevo.",
          }
        const cobro = get().cobrosFI.find((c) => c.id === cobroId)
        if (!cobro)
          return {
            ok: false,
            error: "No se puede aplicar mora: el cobro no existe.",
          }
        if (!cobro.fechaVencimiento)
          return {
            ok: false,
            error: "El cobro no tiene fecha de vencimiento registrada.",
          }
        if (tasaMensualPct <= 0)
          return { ok: false, error: "La tasa de mora debe ser mayor a cero." }
        const hoyStr = hoyISO()
        const dias = Math.max(
          0,
          Math.floor(
            (new Date(`${hoyStr}T00:00:00`).getTime() -
              new Date(`${cobro.fechaVencimiento}T00:00:00`).getTime()) /
              86400000
          )
        )
        if (dias <= 0)
          return {
            ok: false,
            error: "El cobro aún no está vencido: no procede aplicar mora.",
          }
        const pendiente = saldoPendiente(cobro)
        if (pendiente <= 0)
          return { ok: false, error: "El cobro ya está completamente pagado." }
        if (cobro.moras.some((m) => m.fecha === hoyStr)) return { ok: true }
        const monto = montoMoraPropuesta(pendiente, dias, tasaMensualPct)
        if (monto <= 0)
          return { ok: false, error: "El cálculo no arrojó mora aplicable." }
        set((s) => ({
          cobrosFI: s.cobrosFI.map((c) =>
            c.id === cobroId
              ? {
                  ...c,
                  moras: [
                    ...c.moras,
                    {
                      id: generarId("mora"),
                      monto,
                      diasAtraso: dias,
                      tasaMensualPct,
                      fecha: hoyStr,
                    },
                  ],
                }
              : c
          ),
        }))
        registrarEvento(
          set,
          "FI_MORA_APPLIED",
          cobroId,
          `Mora aplicada a ${cobro.descripcion}: $${monto.toLocaleString("es-CL")} (${dias} día(s) de atraso, tasa ${tasaMensualPct}% mensual pro-rata).`,
          "FI"
        )
        return { ok: true }
      },

      registrarPagoFI: (cobroId, pago) => {
        if (!get().hasHydrated)
          return {
            ok: false,
            error:
              "El almacenamiento aún se está hidratando. Intenta de nuevo.",
          }
        const cobro = get().cobrosFI.find((c) => c.id === cobroId)
        if (!cobro)
          return {
            ok: false,
            error: "No se puede registrar el pago: el cobro no existe.",
          }
        if (!(pago.monto > 0))
          return {
            ok: false,
            error: "El monto del pago debe ser mayor a cero.",
          }
        if (pago.medio.trim().length === 0)
          return { ok: false, error: "Debe indicar el medio de pago." }
        const pendiente = saldoPendiente(cobro)
        if (pendiente <= 0)
          return { ok: false, error: "El cobro ya está completamente pagado." }
        const hoyStr = hoyISO()
        const ajuste = pago.monto !== pendiente
        let diferencia: CobroFI["diferencias"][number] | undefined
        if (ajuste) {
          const justificacion = pago.ajusteJustificacion?.trim()
          if (!justificacion) {
            return {
              ok: false,
              error:
                "El ajuste manual exige una justificación obligatoria para generar el informe de diferencia.",
            }
          }
          if (justificacion.length < 10) {
            return {
              ok: false,
              error:
                "La justificación debe explicar el motivo del ajuste (mínimo 10 caracteres).",
            }
          }
          diferencia = {
            id: generarId("dif"),
            tipo: pago.monto < pendiente ? "descuento" : "recargo",
            esperado: exigibleTotal(cobro),
            recibido: totalPagado(cobro) + pago.monto,
            diferencia: Math.abs(pago.monto - pendiente),
            justificacion,
            fecha: hoyStr,
          }
        }
        set((s) => ({
          cobrosFI: s.cobrosFI.map((c) =>
            c.id === cobroId
              ? {
                  ...c,
                  pagos: [
                    ...c.pagos,
                    {
                      id: generarId("pag"),
                      monto: pago.monto,
                      fecha: hoyStr,
                      medio: pago.medio.trim(),
                    },
                  ],
                  ...(diferencia
                    ? { diferencias: [...c.diferencias, diferencia] }
                    : {}),
                }
              : c
          ),
        }))
        registrarEvento(
          set,
          "FI_RECEIVE_PAYMENT",
          cobroId,
          `Pago recibido de ${refUnidad(get, cobro.unidadId)} por $${pago.monto.toLocaleString("es-CL")} (${pago.medio.trim()}) sobre ${cobro.descripcion}.`,
          "FI"
        )
        if (diferencia) {
          registrarEvento(
            set,
            "FI_MANUAL_DISCOUNT",
            cobroId,
            `Ajuste manual (${diferencia.tipo}) de $${diferencia.diferencia.toLocaleString("es-CL")} en ${cobro.descripcion}: ${diferencia.justificacion}.`,
            "FI"
          )
        }
        const propietario = get().vinculos.find(
          (v) =>
            v.unidadId === cobro.unidadId &&
            v.rol === "propietario" &&
            !v.fechaFin
        )
        if (propietario) {
          get().notify({
            destinatarioRol: "propietario",
            destinatarioPersonaId: propietario.personaId,
            asunto: `Pago recibido: ${cobro.descripcion}`,
            cuerpo: `Registramos tu pago de $${pago.monto.toLocaleString("es-CL")} por ${cobro.descripcion}.${diferencia ? ` Se aplicó un ajuste (${diferencia.tipo}) documentado.` : ""}`,
            moduloOrigen: "FI",
            unidadId: cobro.unidadId,
          })
        }
        return { ok: true }
      },

      enviarCobranzaFI: (unidadId) => {
        if (!get().hasHydrated)
          return {
            ok: false,
            error:
              "El almacenamiento aún se está hidratando. Intenta de nuevo.",
          }
        if (!get().unidades.some((u) => u.id === unidadId)) {
          return {
            ok: false,
            error:
              "No se puede enviar la cobranza: la unidad no existe en el inventario.",
          }
        }
        const hoyStr = hoyISO()
        const vencidos = get().cobrosFI.filter(
          (c) =>
            c.unidadId === unidadId && estadoDeCobro(c, hoyStr) === "vencido"
        )
        if (vencidos.length === 0) {
          return {
            ok: false,
            error:
              "La unidad no registra deuda vencida: no hay nada que cobrar.",
          }
        }
        const total = vencidos.reduce((acc, c) => acc + saldoPendiente(c), 0)
        const propietario = get().vinculos.find(
          (v) =>
            v.unidadId === unidadId && v.rol === "propietario" && !v.fechaFin
        )
        if (!propietario) {
          return {
            ok: false,
            error: "La unidad no tiene responsable de cobro asignado.",
          }
        }
        const detalle = vencidos
          .map(
            (c) =>
              `${c.descripcion} ($${saldoPendiente(c).toLocaleString("es-CL")})`
          )
          .join("; ")
        get().notify({
          destinatarioRol: "propietario",
          destinatarioPersonaId: propietario.personaId,
          asunto: `Recordatorio de deuda vencida (${refUnidad(get, unidadId)})`,
          cuerpo: `Su unidad registra $${total.toLocaleString("es-CL")} en ${vencidos.length} cobro(s) vencido(s): ${detalle}. Regularice su situación para evitar corte de servicios.`,
          moduloOrigen: "FI",
          unidadId,
        })
        registrarEvento(
          set,
          "FI_COBRANZA_SENT",
          unidadId,
          `Gestión de cobranza enviada a ${refUnidad(get, unidadId)}: $${total.toLocaleString("es-CL")} en ${vencidos.length} cobro(s) vencido(s).`,
          "FI"
        )
        return { ok: true }
      },

      retirarFondoFI: (input) => {
        if (!get().hasHydrated)
          return {
            ok: false,
            error:
              "El almacenamiento aún se está hidratando. Intenta de nuevo.",
          }
        const fondo = get().fondosFI.find((f) => f.id === input.fondoId)
        if (!fondo)
          return {
            ok: false,
            error: "No se puede retirar: el fondo no existe.",
          }
        if (!fondo.activo)
          return {
            ok: false,
            error: `No se puede retirar: el fondo "${fondo.nombre}" está inactivo.`,
          }
        if (!(input.monto > 0))
          return {
            ok: false,
            error: "El monto del retiro debe ser mayor a cero.",
          }
        if (input.descripcion.trim().length === 0)
          return {
            ok: false,
            error: "El retiro exige describir el uso del dinero.",
          }
        let actaPublicada: string | undefined
        if (input.aprobacionActaGDId) {
          const acta = get().actasGD.find(
            (a) => a.id === input.aprobacionActaGDId
          )
          if (!acta)
            return {
              ok: false,
              error: "El acta de aprobación indicada no existe.",
            }
          if (acta.estado !== "publicada") {
            return {
              ok: false,
              error:
                "Solo un acta Publicada por la directiva respalda el retiro.",
            }
          }
          actaPublicada = acta.id
        }
        if (fondo.tipo === "reserva" && !actaPublicada) {
          return {
            ok: false,
            error:
              "El retiro del Fondo de Reserva exige aprobación documentada mediante un acta publicada de la directiva.",
          }
        }
        const saldo = saldoFondo(fondo.id, {
          cobros: get().cobrosFI,
          egresos: get().egresosFI,
          emisiones: get().emisionesGC,
        })
        if (input.monto > saldo) {
          return {
            ok: false,
            error: `Saldo insuficiente en "${fondo.nombre}": disponible $${saldo.toLocaleString("es-CL")} para un retiro de $${input.monto.toLocaleString("es-CL")}.`,
          }
        }
        const egreso: EgresoFI = {
          id: generarId("egr"),
          folio: siguienteFolioFE(get),
          fecha: hoyISO(),
          categoria: "uso_de_fondo",
          descripcion: input.descripcion.trim(),
          monto: input.monto,
          fondoId: fondo.id,
          esRecurrente: false,
          aprobacionActaGDId: actaPublicada,
        }
        const validacion = validarConEsquema(EgresoFISchema, egreso)
        if (!validacion.ok) return validacion
        set((s) => ({ egresosFI: upsert(s.egresosFI, validacion.data) }))
        registrarEvento(
          set,
          "FI_FUND_WITHDRAWN",
          validacion.data.id,
          `Retiro de $${input.monto.toLocaleString("es-CL")} desde ${fondo.nombre}: ${input.descripcion.trim()}${actaPublicada ? ` (aprobado en acta ${actaPublicada})` : ""}.`,
          "FI"
        )
        return { ok: true }
      },

      // --- PE: Personal y Servicios ---

      registrarHoraExtraPE: (personaId, horaExtra) => {
        if (!get().hasHydrated)
          return {
            ok: false,
            error:
              "El almacenamiento aún se está hidratando. Intenta de nuevo.",
          }
        const persona = get().personas.find((p) => p.id === personaId)
        if (!persona?.datosLaborales)
          return {
            ok: false,
            error: "La persona no tiene ficha laboral de PE.",
          }
        const entrada = { id: generarId("he"), ...horaExtra }
        const actualizada: Persona = {
          ...persona,
          datosLaborales: {
            ...persona.datosLaborales,
            horasExtras: [
              ...(persona.datosLaborales.horasExtras ?? []),
              entrada,
            ],
          },
        }
        const validacion = validarConEsquema(PersonaSchema, actualizada)
        if (!validacion.ok) return validacion
        set((s) => ({ personas: upsert(s.personas, validacion.data) }))
        registrarEvento(
          set,
          "PE_HORA_EXTRA_REGISTRADA",
          personaId,
          `${horaExtra.horas} h extra (${horaExtra.motivo}) registradas para ${persona.nombres} ${persona.apellidos}.`,
          "PE"
        )
        return { ok: true }
      },

      registrarEvaluacionPE: (personaId, evaluacion) => {
        if (!get().hasHydrated)
          return {
            ok: false,
            error:
              "El almacenamiento aún se está hidratando. Intenta de nuevo.",
          }
        const persona = get().personas.find((p) => p.id === personaId)
        if (!persona?.datosLaborales)
          return {
            ok: false,
            error: "La persona no tiene ficha laboral de PE.",
          }
        const entrada = { id: generarId("ev"), ...evaluacion }
        const actualizada: Persona = {
          ...persona,
          datosLaborales: {
            ...persona.datosLaborales,
            evaluaciones: [
              ...(persona.datosLaborales.evaluaciones ?? []),
              entrada,
            ],
          },
        }
        const validacion = validarConEsquema(PersonaSchema, actualizada)
        if (!validacion.ok) return validacion
        set((s) => ({ personas: upsert(s.personas, validacion.data) }))
        registrarEvento(
          set,
          "PE_EVALUACION_REGISTRADA",
          personaId,
          `Evaluación de desempeño (${evaluacion.puntaje}/7) registrada para ${persona.nombres} ${persona.apellidos}.`,
          "PE"
        )
        return { ok: true }
      },

      iniciarTurnoPE: (personaId, jornadaId) => {
        if (!get().hasHydrated)
          return {
            ok: false,
            error:
              "El almacenamiento aún se está hidratando. Intenta de nuevo.",
          }
        const persona = get().personas.find((p) => p.id === personaId)
        if (!persona)
          return {
            ok: false,
            error: "El trabajador no existe en el Maestro de Personas.",
          }
        if (!persona.datosLaborales)
          return {
            ok: false,
            error: "La persona no tiene ficha laboral de PE.",
          }
        if (!get().maestros.jornadas.some((j) => j.id === jornadaId))
          return {
            ok: false,
            error: "jornadaId no existe en el maestro de jornadas.",
          }
        registrarEvento(
          set,
          "PE_START_SHIFT",
          personaId,
          `${persona.nombres} ${persona.apellidos} inicia turno (${get().maestros.jornadas.find((j) => j.id === jornadaId)?.nombre ?? jornadaId}).`,
          "PE"
        )
        return { ok: true }
      },

      completarTareaMonitoreoPE: (trabajoMTId) => {
        if (!get().hasHydrated)
          return {
            ok: false,
            error:
              "El almacenamiento aún se está hidratando. Intenta de nuevo.",
          }
        const trabajo = get().trabajosMT.find((t) => t.id === trabajoMTId)
        if (!trabajo)
          return {
            ok: false,
            error: "La tarea indicada no existe en Mantenimiento.",
          }
        if (trabajo.estado === "finalizado" || trabajo.estado === "cancelado") {
          return { ok: false, error: "La tarea ya se encuentra cerrada." }
        }
        set((s) => ({
          trabajosMT: s.trabajosMT.map((t) =>
            t.id === trabajoMTId
              ? {
                  ...t,
                  estado: "finalizado" as const,
                  fechaTermino: t.fechaTermino ?? hoyISO(),
                }
              : t
          ),
        }))
        registrarEvento(
          set,
          "PE_TASK_DONE",
          trabajoMTId,
          `Tarea "${trabajo.titulo}" completada desde el panel de monitoreo de PE.`,
          "PE"
        )
        return { ok: true }
      },

        /** @deprecated Los datos de dominio ahora persisten en el servidor vía API REST. Usar los hooks de `lib/api/use-*.ts` en código nuevo. Esta acción queda como fallback legacy. */

      saveBitacoraVisitaPE: (visita) => {
        if (!get().hasHydrated)
          return {
            ok: false,
            error:
              "El almacenamiento aún se está hidratando. Intenta de nuevo.",
          }
        const validacion = validarConEsquema(BitacoraVisitaPESchema, visita)
        if (!validacion.ok) return validacion
        const v = validacion.data
        if (!get().maestros.jornadas.some((j) => j.id === v.jornadaId)) {
          return {
            ok: false,
            error: "jornadaId no existe en el maestro de jornadas.",
          }
        }
        if (v.unidadId && !get().unidades.some((u) => u.id === v.unidadId)) {
          return { ok: false, error: "unidadId no existe en el inventario." }
        }
        if (
          v.destinoPersonaId &&
          !get().personas.some((p) => p.id === v.destinoPersonaId)
        ) {
          return {
            ok: false,
            error: "destinoPersonaId no existe en el Maestro de Personas.",
          }
        }
        set((s) => ({ bitacoraVisitasPE: upsert(s.bitacoraVisitasPE, v) }))
        if (v.estado === "ingresada") {
          const hora = v.horaIngreso ?? new Date().toTimeString().slice(0, 5)
          set((s) => ({
            bitacoraVisitasPE: s.bitacoraVisitasPE.map((x) =>
              x.id === v.id ? { ...x, horaIngreso: x.horaIngreso ?? hora } : x
            ),
          }))
          registrarEvento(
            set,
            "PE_VISITA_INGRESADA",
            v.id,
            `Visita ${v.nombre} ingresada (${v.origenAgenda === "pre_agendada" ? "agendada" : "sin aviso"}) a las ${hora}.`,
            "PE"
          )
          const cfg = get().configuracion
          if (cfg.notificarRegistroVisitas !== false && v.destinoPersonaId) {
            get().notify({
              destinatarioRol: "residente",
              destinatarioPersonaId: v.destinoPersonaId,
              asunto: `Visita recibida: ${v.nombre}`,
              cuerpo: `${v.nombre} fue ingresada por conserjería a las ${hora}.`,
              moduloOrigen: "PE",
              unidadId: v.unidadId,
            })
          }
        }
        return { ok: true }
      },

      ingresarBitacoraVisitaPE: (id) => {
        if (!get().hasHydrated)
          return {
            ok: false,
            error:
              "El almacenamiento aún se está hidratando. Intenta de nuevo.",
          }
        const visita = get().bitacoraVisitasPE.find((v) => v.id === id)
        if (!visita)
          return { ok: false, error: "La visita agendada no existe." }
        if (visita.estado !== "agendada")
          return {
            ok: false,
            error:
              "Solo las visitas agendadas pueden marcarse como ingresadas.",
          }
        const hora = new Date().toTimeString().slice(0, 5)
        set((s) => ({
          bitacoraVisitasPE: s.bitacoraVisitasPE.map((v) =>
            v.id === id
              ? { ...v, estado: "ingresada" as const, horaIngreso: hora }
              : v
          ),
        }))
        registrarEvento(
          set,
          "PE_VISITA_INGRESADA",
          id,
          `Visita pre-agendada ${visita.nombre} sellada a las ${hora}.`,
          "PE"
        )
        const cfg = get().configuracion
        if (cfg.notificarRegistroVisitas !== false && visita.destinoPersonaId) {
          get().notify({
            destinatarioRol: "residente",
            destinatarioPersonaId: visita.destinoPersonaId,
            asunto: `Visita ingresada: ${visita.nombre}`,
            cuerpo: `${visita.nombre} llegó y fue registrada por conserjería a las ${hora}.`,
            moduloOrigen: "PE",
            unidadId: visita.unidadId,
          })
        }
        return { ok: true }
      },

        /** @deprecated Los datos de dominio ahora persisten en el servidor vía API REST. Usar los hooks de `lib/api/use-*.ts` en código nuevo. Esta acción queda como fallback legacy. */

      removeBitacoraVisitaPE: (id) => {
        if (!get().hasHydrated)
          return {
            ok: false,
            error:
              "El almacenamiento aún se está hidratando. Intenta de nuevo.",
          }
        const visita = get().bitacoraVisitasPE.find((v) => v.id === id)
        if (visita?.estado === "ingresada") {
          return {
            ok: false,
            error:
              "No se puede eliminar una visita ya ingresada (registro auditable).",
          }
        }
        set((s) => ({
          bitacoraVisitasPE: s.bitacoraVisitasPE.filter((v) => v.id !== id),
        }))
        return { ok: true }
      },

        /** @deprecated Los datos de dominio ahora persisten en el servidor vía API REST. Usar los hooks de `lib/api/use-*.ts` en código nuevo. Esta acción queda como fallback legacy. */

      saveEncomiendaPE: (encomienda) => {
        if (!get().hasHydrated)
          return {
            ok: false,
            error:
              "El almacenamiento aún se está hidratando. Intenta de nuevo.",
          }
        const validacion = validarConEsquema(EncomiendaPESchema, encomienda)
        if (!validacion.ok) return validacion
        const e = validacion.data
        if (!get().maestros.couriers.some((c) => c.id === e.courierId)) {
          return {
            ok: false,
            error: "courierId no existe en el maestro de couriers.",
          }
        }
        if (
          e.destinatarioPersonaId &&
          !get().personas.some((p) => p.id === e.destinatarioPersonaId)
        ) {
          return {
            ok: false,
            error: "destinatarioPersonaId no existe en el Maestro de Personas.",
          }
        }
        if (e.unidadId && !get().unidades.some((u) => u.id === e.unidadId)) {
          return { ok: false, error: "unidadId no existe en el inventario." }
        }
        set((s) => ({ encomiendasPE: upsert(s.encomiendasPE, e) }))
        registrarEvento(
          set,
          "PE_ENCOMIENDA_RECIBIDA",
          e.id,
          `Encomienda recibida de ${get().maestros.couriers.find((c) => c.id === e.courierId)?.nombre ?? e.courierId}.`,
          "PE"
        )
        const cfg = get().configuracion
        if (cfg.notificarEncomiendas !== false && e.destinatarioPersonaId) {
          get().notify({
            destinatarioRol: "residente",
            destinatarioPersonaId: e.destinatarioPersonaId,
            asunto: "Encomienda recibida en conserjería",
            cuerpo: `Tiene una encomienda recibida el ${e.fechaRecepcion}. Retírela presentando su identificación.`,
            moduloOrigen: "PE",
            unidadId: e.unidadId,
          })
        }
        return { ok: true }
      },

      registrarRetiroEncomiendaPE: (id, retiradoPor, relacion) => {
        if (!get().hasHydrated)
          return {
            ok: false,
            error:
              "El almacenamiento aún se está hidratando. Intenta de nuevo.",
          }
        const encomienda = get().encomiendasPE.find((e) => e.id === id)
        if (!encomienda) return { ok: false, error: "La encomienda no existe." }
        if (encomienda.estado === "retirada")
          return { ok: false, error: "La encomienda ya fue retirada." }
        if (!retiradoPor || retiradoPor.trim().length === 0)
          return {
            ok: false,
            error: "Debe identificar quién retira la encomienda.",
          }
        set((s) => ({
          encomiendasPE: s.encomiendasPE.map((e) =>
            e.id === id
              ? {
                  ...e,
                  estado: "retirada" as const,
                  retiro: {
                    retiradoPor: retiradoPor.trim(),
                    fechaRetiro: hoyISO(),
                    relacion,
                  },
                }
              : e
          ),
        }))
        registrarEvento(
          set,
          "PE_ENCOMIENDA_RETIRADA",
          id,
          `Encomienda entregada a ${retiradoPor.trim()}.`,
          "PE"
        )
        return { ok: true }
      },

        /** @deprecated Los datos de dominio ahora persisten en el servidor vía API REST. Usar los hooks de `lib/api/use-*.ts` en código nuevo. Esta acción queda como fallback legacy. */

      removeEncomiendaPE: (id) => {
        if (!get().hasHydrated)
          return {
            ok: false,
            error:
              "El almacenamiento aún se está hidratando. Intenta de nuevo.",
          }
        const encomienda = get().encomiendasPE.find((e) => e.id === id)
        if (encomienda?.estado === "retirada") {
          return {
            ok: false,
            error:
              "No se puede eliminar una encomienda retirada (registro auditable).",
          }
        }
        set((s) => ({
          encomiendasPE: s.encomiendasPE.filter((e) => e.id !== id),
        }))
        return { ok: true }
      },

        /** @deprecated Los datos de dominio ahora persisten en el servidor vía API REST. Usar los hooks de `lib/api/use-*.ts` en código nuevo. Esta acción queda como fallback legacy. */

      saveIngresoContratistaPE: (ingreso) => {
        if (!get().hasHydrated)
          return {
            ok: false,
            error:
              "El almacenamiento aún se está hidratando. Intenta de nuevo.",
          }
        const validacion = validarConEsquema(
          IngresoContratistaPESchema,
          ingreso
        )
        if (!validacion.ok) return validacion
        const i = validacion.data
        if (
          !get().maestros.contratistas.some((c) => c.id === i.contratistaId)
        ) {
          return {
            ok: false,
            error: "contratistaId no existe en el maestro de contratistas.",
          }
        }
        if (!get().maestros.jornadas.some((j) => j.id === i.jornadaId)) {
          return {
            ok: false,
            error: "jornadaId no existe en el maestro de jornadas.",
          }
        }
        if (i.unidadId && !get().unidades.some((u) => u.id === i.unidadId)) {
          return { ok: false, error: "unidadId no existe en el inventario." }
        }
        if (
          i.personaAgendaId &&
          !get().personas.some((p) => p.id === i.personaAgendaId)
        ) {
          return {
            ok: false,
            error: "personaAgendaId no existe en el Maestro de Personas.",
          }
        }
        set((s) => ({
          ingresosContratistasPE: upsert(s.ingresosContratistasPE, i),
        }))
        return { ok: true }
      },

      confirmarIngresoContratistaPE: (id) => {
        if (!get().hasHydrated)
          return {
            ok: false,
            error:
              "El almacenamiento aún se está hidratando. Intenta de nuevo.",
          }
        const ingreso = get().ingresosContratistasPE.find((i) => i.id === id)
        if (!ingreso)
          return { ok: false, error: "El ingreso agendado no existe." }
        if (ingreso.estado !== "agendado")
          return {
            ok: false,
            error: "Solo ingresos agendados pueden confirmarse.",
          }
        const hora = new Date().toTimeString().slice(0, 5)
        set((s) => ({
          ingresosContratistasPE: s.ingresosContratistasPE.map((i) =>
            i.id === id
              ? { ...i, estado: "ingresado" as const, horaIngreso: hora }
              : i
          ),
        }))
        const contratista =
          get().maestros.contratistas.find(
            (c) => c.id === ingreso.contratistaId
          )?.nombre ?? ingreso.contratistaId
        registrarEvento(
          set,
          "PE_CONTRATISTA_INGRESADO",
          id,
          `Contratista ${contratista} ingresó (${ingreso.motivo.slice(0, 60)}).`,
          "PE"
        )
        return { ok: true }
      },

        /** @deprecated Los datos de dominio ahora persisten en el servidor vía API REST. Usar los hooks de `lib/api/use-*.ts` en código nuevo. Esta acción queda como fallback legacy. */

      removeIngresoContratistaPE: (id) => {
        if (!get().hasHydrated)
          return {
            ok: false,
            error:
              "El almacenamiento aún se está hidratando. Intenta de nuevo.",
          }
        const ingreso = get().ingresosContratistasPE.find((i) => i.id === id)
        if (ingreso?.estado === "ingresado") {
          return {
            ok: false,
            error:
              "No se puede eliminar un contratista ya ingresado (registro auditable).",
          }
        }
        set((s) => ({
          ingresosContratistasPE: s.ingresosContratistasPE.filter(
            (i) => i.id !== id
          ),
        }))
        return { ok: true }
      },

        /** @deprecated Los datos de dominio ahora persisten en el servidor vía API REST. Usar los hooks de `lib/api/use-*.ts` en código nuevo. Esta acción queda como fallback legacy. */

      saveProveedorPE: (proveedor) => {
        if (!get().hasHydrated)
          return {
            ok: false,
            error:
              "El almacenamiento aún se está hidratando. Intenta de nuevo.",
          }
        const validacion = validarConEsquema(ProveedorPESchema, proveedor)
        if (!validacion.ok) return validacion
        const duplicado = get().proveedoresPE.find(
          (p) =>
            p.nombre.toLowerCase() === validacion.data.nombre.toLowerCase() &&
            p.id !== validacion.data.id
        )
        if (duplicado)
          return {
            ok: false,
            error: `Ya existe un proveedor con el nombre "${validacion.data.nombre}".`,
          }
        set((s) => ({
          proveedoresPE: upsert(s.proveedoresPE, validacion.data),
        }))
        registrarEvento(
          set,
          "PE_PROVEEDOR_SAVED",
          validacion.data.id,
          `Proveedor "${validacion.data.nombre}" (${validacion.data.rubro}) guardado.`,
          "PE"
        )
        return { ok: true }
      },

        /** @deprecated Los datos de dominio ahora persisten en el servidor vía API REST. Usar los hooks de `lib/api/use-*.ts` en código nuevo. Esta acción queda como fallback legacy. */

      saveMantencionPE: (mantencion) => {
        if (!get().hasHydrated)
          return {
            ok: false,
            error:
              "El almacenamiento aún se está hidratando. Intenta de nuevo.",
          }
        const validacion = validarConEsquema(
          MantencionPreventivaPESchema,
          mantencion
        )
        if (!validacion.ok) return validacion
        const proveedor = get().proveedoresPE.find(
          (p) => p.id === validacion.data.proveedorId
        )
        if (!proveedor)
          return {
            ok: false,
            error: "proveedorId no existe en el catálogo de proveedores.",
          }
        if (!proveedor.activo)
          return {
            ok: false,
            error: `El proveedor "${proveedor.nombre}" está inactivo.`,
          }
        set((s) => ({
          mantencionesPreventivasPE: upsert(
            s.mantencionesPreventivasPE,
            validacion.data
          ),
        }))
        registrarEvento(
          set,
          "PE_MANTENCION_SAVED",
          validacion.data.id,
          `Mantención preventiva "${validacion.data.descripcion}" programada para ${validacion.data.proximaFecha}.`,
          "PE"
        )
        return { ok: true }
      },

      registrarVisitaTecnicaPE: (visita) => {
        if (!get().hasHydrated)
          return {
            ok: false,
            error:
              "El almacenamiento aún se está hidratando. Intenta de nuevo.",
          }
        const validacion = validarConEsquema(VisitaTecnicaPESchema, visita)
        if (!validacion.ok) return validacion
        const v = validacion.data
        const proveedor = get().proveedoresPE.find(
          (p) => p.id === v.proveedorId
        )
        if (!proveedor)
          return {
            ok: false,
            error: "proveedorId no existe en el catálogo de proveedores.",
          }
        const mantencion = get().mantencionesPreventivasPE.find(
          (m) => m.id === v.mantencionId
        )
        if (v.mantencionId && !mantencion) {
          return {
            ok: false,
            error: "mantencionId no existe en el calendario preventivo.",
          }
        }
        if (
          v.supervisorPersonaId &&
          !get().personas.some((p) => p.id === v.supervisorPersonaId)
        ) {
          return {
            ok: false,
            error: "supervisorPersonaId no existe en el Maestro de Personas.",
          }
        }
        if (v.unidadId && !get().unidades.some((u) => u.id === v.unidadId)) {
          return { ok: false, error: "unidadId no existe en el inventario." }
        }
        set((s) => ({ visitasTecnicasPE: upsert(s.visitasTecnicasPE, v) }))
        // Ciclo preventivo cerrado: la próxima fecha avanza según periodicidad.
        if (mantencion) {
          const proxima = proximaFechaPreventiva(
            v.fecha,
            mantencion.periodicidadMeses
          )
          set((s) => ({
            mantencionesPreventivasPE: s.mantencionesPreventivasPE.map((m) =>
              m.id === mantencion!.id ? { ...m, proximaFecha: proxima } : m
            ),
          }))
        }
        registrarEvento(
          set,
          "PE_VISITA_TECNICA",
          v.id,
          `Visita técnica de ${proveedor.nombre}: ${v.trabajoRealizado.slice(0, 80)}${mantencion ? `; próximo ciclo ${proximaFechaPreventiva(v.fecha, mantencion.periodicidadMeses)}` : ""}.`,
          "PE"
        )
        return { ok: true }
      },

      cerrarTurnoPE: (input) => {
        if (!get().hasHydrated)
          return {
            ok: false,
            error:
              "El almacenamiento aún se está hidratando. Intenta de nuevo.",
          }
        const trabajador = get().personas.find(
          (p) => p.id === input.trabajadorPersonaId
        )
        if (!trabajador)
          return {
            ok: false,
            error: "El trabajador no existe en el Maestro de Personas.",
          }
        if (!trabajador.datosLaborales)
          return {
            ok: false,
            error: "El trabajador no tiene ficha laboral de PE.",
          }
        if (
          !get().maestros.jornadas.some(
            (j) => j.id === input.jornadaReportadaId
          )
        ) {
          return {
            ok: false,
            error: "jornadaReportadaId no existe en el maestro de jornadas.",
          }
        }
        // Anti-negligencia: incidencias marcadas exigen descripción y evidencia.
        if (input.incidencias.hubo) {
          if (
            !input.incidencias.descripcion ||
            input.incidencias.descripcion.trim().length < 20
          ) {
            return {
              ok: false,
              error:
                "Con incidencias marcadas debe describir lo ocurrido (mínimo 20 caracteres).",
            }
          }
          if (
            !input.incidencias.evidencias ||
            input.incidencias.evidencias.length === 0
          ) {
            return {
              ok: false,
              error:
                "Con incidencias marcadas debe adjuntar al menos una evidencia por referencia (URL).",
            }
          }
        }
        if (
          input.checklistInstalaciones.length === 0 ||
          input.checklistEquipamiento.length === 0
        ) {
          return {
            ok: false,
            error:
              "El cierre exige los checklist de instalaciones y equipamiento.",
          }
        }
        const duplicado = get().cierresTurnoPE.some(
          (c) =>
            c.fecha === input.fecha &&
            c.jornadaReportadaId === input.jornadaReportadaId &&
            c.trabajadorPersonaId === input.trabajadorPersonaId
        )
        if (duplicado) {
          return {
            ok: false,
            error:
              "Este trabajador ya registró un cierre para esa fecha y jornada.",
          }
        }
        const cierre: CierreTurnoPE = {
          ...input,
          incidencias: {
            hubo: input.incidencias.hubo,
            descripcion: input.incidencias.descripcion,
            evidencias: input.incidencias.evidencias,
          },
          id: input.id ?? generarId("pe-cierre"),
          historialCambios: [],
          notificadoAAdmin: true,
        }
        const validacion = validarConEsquema(CierreTurnoPESchema, cierre)
        if (!validacion.ok) return validacion
        set((s) => ({
          cierresTurnoPE: upsert(s.cierresTurnoPE, validacion.data),
        }))
        const jornadaNombre =
          get().maestros.jornadas.find((j) => j.id === input.jornadaReportadaId)
            ?.nombre ?? input.jornadaReportadaId
        const resumen = [
          input.novedadesGenerales?.trim(),
          input.incidencias.hubo
            ? `Incidencias: ${input.incidencias.descripcion!.slice(0, 120)}`
            : "Sin incidencias reportadas",
        ]
          .filter(Boolean)
          .join(". ")
        get().notify({
          destinatarioRol: "administracion",
          asunto: `Cierre de turno ${jornadaNombre} – ${input.fecha}`,
          cuerpo: `${trabajador.nombres} ${trabajador.apellidos} cerró el turno de la jornada ${jornadaNombre}. ${resumen}`,
          moduloOrigen: "PE",
        })
        // Copia del reporte al correo registrado en la ficha del trabajador (D2).
        get().notify({
          destinatarioRol: "personal",
          destinatarioPersonaId: trabajador.id,
          asunto: `Copia de su cierre de turno (${jornadaNombre}, ${input.fecha})`,
          cuerpo: `Gracias ${trabajador.nombres}. Su reporte fue enviado a administración. ${resumen}`,
          moduloOrigen: "PE",
        })
        registrarEvento(
          set,
          "PE_CIERRE_TURNO",
          validacion.data.id,
          `Cierre de turno ${jornadaNombre} enviado por ${trabajador.nombres} ${trabajador.apellidos}${input.incidencias.hubo ? " con incidencias" : " sin incidencias"}; copia enviada a administración y al trabajador.`,
          "PE"
        )
        return { ok: true }
      },

      enviarProyeccionCostoFI: (mesAnio, params) => {
        if (!get().hasHydrated)
          return {
            ok: false,
            error:
              "El almacenamiento aún se está hidratando. Intenta de nuevo.",
          }
        if (!/^\d{4}-\d{2}$/.test(mesAnio))
          return { ok: false, error: "El mes debe tener formato AAAA-MM." }
        const proyeccionBase = calcularProyeccionCobertura({
          feriados: get().maestros.feriados,
          mesAnio,
        })
        if (proyeccionBase.diasFeriados === 0) {
          return {
            ok: false,
            error: `No hay feriados registrados para ${mesAnio}; cargue el calendario antes de proyectar.`,
          }
        }
        if (params.costoParche < 0 || params.costoDiaExtra < 0) {
          return {
            ok: false,
            error: "Los costos de parche y día extra no pueden ser negativos.",
          }
        }
        const personalPlanta = get().personas.filter(
          (p) => p.datosLaborales !== undefined && p.estadoCuenta === "activa"
        ).length
        const costoEstimado = costoProyeccionPE(
          proyeccionBase.reemplazosNecesarios,
          personalPlanta,
          params.costoParche,
          params.costoDiaExtra
        )
        const proyeccion: ProyeccionPE = {
          id: params.id ?? generarId("pe-proy"),
          mesAnio,
          feriados: proyeccionBase.feriados,
          diasFeriados: proyeccionBase.diasFeriados,
          reemplazosNecesarios: proyeccionBase.reemplazosNecesarios,
          costoEstimado,
          detalleCosto: {
            personalPlanta,
            costoParche: params.costoParche,
            costoDiaExtra: params.costoDiaExtra,
          },
          enviadoAFI: true,
          liquidacionPLReferencia: "pendiente",
        }
        const validacion = validarConEsquema(ProyeccionPESchema, proyeccion)
        if (!validacion.ok) return validacion
        set((s) => ({
          proyeccionesPE: upsert(s.proyeccionesPE, validacion.data),
        }))
        get().notify({
          destinatarioRol: "administracion",
          asunto: `Proyección operativa ${mesAnio}: ${proyeccionBase.diasFeriados} feriado(s)`,
          cuerpo: `Se requerirán ${proyeccionBase.reemplazosNecesarios} reemplazo(s) (parches) para cubrir los descansos legales. Sobrecosto estimado: $${costoEstimado.toLocaleString("es-CL")}. Proyección enviada a Finanzas.`,
          moduloOrigen: "PE",
        })
        registrarEvento(
          set,
          "PE_PROYECCION_ENVIADA",
          validacion.data.id,
          `Proyección ${mesAnio}: ${proyeccionBase.diasFeriados} feriado(s), ${proyeccionBase.reemplazosNecesarios} reemplazo(s), costo estimado $${costoEstimado.toLocaleString("es-CL")} (liquidación pendiente en PL).`,
          "PE"
        )
        return { ok: true }
      },

        /** @deprecated Los datos de dominio ahora persisten en el servidor vía API REST. Usar los hooks de `lib/api/use-*.ts` en código nuevo. Esta acción queda como fallback legacy. */

      saveAdelantoPL: (adelanto) => {
        if (!get().hasHydrated)
          return {
            ok: false,
            error:
              "El almacenamiento aún se está hidratando. Intenta de nuevo.",
          }
        const esNuevo = !get().adelantosPL.some((a) => a.id === adelanto.id)
        let candidato: AdelantoPL = adelanto
        if (esNuevo) {
          const numeros = get()
            .adelantosPL.map((a) =>
              Number.parseInt(a.folio.replace(/^ADE-/, ""), 10)
            )
            .filter((n) => Number.isFinite(n))
          const siguiente = (numeros.length > 0 ? Math.max(...numeros) : 0) + 1
          candidato = {
            ...adelanto,
            folio: `ADE-${String(siguiente).padStart(4, "0")}`,
            estado: "pendiente",
          }
        }
        const validacion = validarConEsquema(AdelantoPLSchema, candidato)
        if (!validacion.ok) return validacion
        const registro = validacion.data
        const trabajador = get().personas.find(
          (p) => p.id === registro.trabajadorPersonaId
        )
        if (!trabajador)
          return {
            ok: false,
            error: "El trabajador no existe en el Maestro de Personas.",
          }
        if (!trabajador.datosLaborales)
          return {
            ok: false,
            error: "La persona no tiene ficha laboral de PE.",
          }

        set((s) => ({ adelantosPL: upsert(s.adelantosPL, registro) }))
        if (esNuevo) {
          registrarEvento(
            set,
            "PL_ADD_ADVANCE",
            registro.id,
            `Adelanto ${registro.folio} de $${registro.monto.toLocaleString("es-CL")} entregado a ${trabajador.nombres} ${trabajador.apellidos}: ${registro.glosa}`,
            "PL"
          )
          get().notify({
            destinatarioRol: "personal",
            destinatarioPersonaId: trabajador.id,
            asunto: `Comprobante de adelanto ${registro.folio}`,
            cuerpo: `Se registró un adelanto de $${registro.monto.toLocaleString("es-CL")} (${registro.glosa}). Será descontado en tu próxima liquidación.`,
            moduloOrigen: "PL",
          })
        }
        return { ok: true }
      },

        /** @deprecated Los datos de dominio ahora persisten en el servidor vía API REST. Usar los hooks de `lib/api/use-*.ts` en código nuevo. Esta acción queda como fallback legacy. */

      removeAdelantoPL: (id) => {
        if (!get().hasHydrated)
          return {
            ok: false,
            error:
              "El almacenamiento aún se está hidratando. Intenta de nuevo.",
          }
        const adelanto = get().adelantosPL.find((a) => a.id === id)
        if (!adelanto)
          return {
            ok: false,
            error: "No se puede eliminar: el adelanto no existe.",
          }
        if (adelanto.estado !== "pendiente") {
          return {
            ok: false,
            error:
              "No se puede eliminar un adelanto ya descontado en liquidación.",
          }
        }
        set((s) => ({ adelantosPL: s.adelantosPL.filter((a) => a.id !== id) }))
        return { ok: true }
      },

      // --- CT: Certificados ---

        /** @deprecated Los datos de dominio ahora persisten en el servidor vía API REST. Usar los hooks de `lib/api/use-*.ts` en código nuevo. Esta acción queda como fallback legacy. */

      generarCertificadoCT: (input) => {
        if (!get().hasHydrated)
          return {
            ok: false,
            error:
              "El almacenamiento aún se está hidratando. Intenta de nuevo.",
          }
        if (
          !input.solicitanteNombre ||
          input.solicitanteNombre.trim().length === 0
        ) {
          return {
            ok: false,
            error: "Debe identificar al solicitante del certificado.",
          }
        }
        const cfg = get().configuracion
        const firmaUrl = cfg.firmaDigitalizadaUrl
        if (
          firmaUrl &&
          (/^data:/i.test(firmaUrl) || /^blob:/i.test(firmaUrl))
        ) {
          return {
            ok: false,
            error:
              "Media por referencia (D1): la firma digitalizada configurada en CF no puede estar embebida como base64/Blob.",
          }
        }

        let unidadId = input.unidadId
        let personaId = input.personaId
        let origenRef = input.unidadId ?? input.personaId ?? input.liquidacionId
        let resumen = ""
        let detalle: [string, string][] = []
        let evento: string

        if (input.tipo === "residencia") {
          if (!personaId || !unidadId)
            return {
              ok: false,
              error: "El certificado de residencia exige persona y unidad.",
            }
          const persona = get().personas.find((p) => p.id === personaId)
          if (!persona)
            return {
              ok: false,
              error: "La persona indicada no existe en el Maestro de Personas.",
            }
          if (!get().unidades.some((u) => u.id === unidadId))
            return { ok: false, error: "unidadId no existe en el inventario." }
          // Requisito VU: solicitante Activo en la unidad.
          const vinculoVigente = get().vinculos.find(
            (v) =>
              v.personaId === personaId &&
              v.unidadId === unidadId &&
              !v.fechaFin
          )
          if (!vinculoVigente) {
            return {
              ok: false,
              error:
                "No se puede emitir: el solicitante no mantiene un vínculo activo en la unidad (VU).",
            }
          }
          origenRef = vinculoVigente.id
          resumen = `Se certifica que ${persona.nombres} ${persona.apellidos} (RUT ${persona.rut}) reside actualmente en ${refUnidad(get, unidadId)} según los registros de vinculación vigentes.`
          detalle = [
            ["Residente", `${persona.nombres} ${persona.apellidos}`],
            ["RUT", persona.rut],
            ["Unidad", refUnidad(get, unidadId)],
            ["Rol", vinculoVigente.rol],
          ]
          evento = "CT_GENERATE_RESIDENCE"
        } else if (input.tipo === "estado_cuenta" || input.tipo === "al_dia") {
          if (!unidadId)
            return {
              ok: false,
              error: `El certificado de ${input.tipo === "al_dia" ? "unidad al día" : "estado de cuenta"} exige una unidad.`,
            }
          if (!get().unidades.some((u) => u.id === unidadId))
            return { ok: false, error: "unidadId no existe en el inventario." }
          const cobros = get().cobrosFI.filter((c) => c.unidadId === unidadId)
          const totalCargado = cobros.reduce(
            (acc, c) => acc + exigibleTotal(c),
            0
          )
          const saldoPendienteTotal = cobros.reduce(
            (acc, c) => acc + saldoPendiente(c),
            0
          )
          if (input.tipo === "al_dia" && saldoPendienteTotal > 0) {
            return {
              ok: false,
              error: `No se puede emitir: la unidad mantiene $${saldoPendienteTotal.toLocaleString("es-CL")} pendiente(s). El certificado Al Día exige saldo <= 0.`,
            }
          }
          const propietario = get().vinculos.find(
            (v) =>
              v.unidadId === unidadId && v.rol === "propietario" && !v.fechaFin
          )
          const nombreProp = propietario
            ? nombrePersona(get, propietario.personaId)
            : "—"
          if (input.tipo === "estado_cuenta") {
            resumen = `Estado de cuenta oficial de ${refUnidad(get, unidadId)}: detalle de gastos comunes pagados, cuotas extraordinarias y fondos pendientes según el libro de Finanzas.`
            evento = "CT_GENERATE_FINANCIAL"
          } else {
            resumen = `Se certifica que la unidad ${refUnidad(get, unidadId)} NO registra deudas pendientes con la comunidad a la fecha de emisión.`
            evento = "CT_GENERATE_AL_DIA"
          }
          detalle = [
            ["Unidad", refUnidad(get, unidadId)],
            ["Propietario", nombreProp],
            ["Cobros registrados", String(cobros.length)],
            ["Total cargado", `$${totalCargado.toLocaleString("es-CL")}`],
            [
              "Saldo pendiente",
              `$${saldoPendienteTotal.toLocaleString("es-CL")}`,
            ],
          ]
        } else {
          // liquidacion_sueldo
          if (!input.liquidacionId)
            return {
              ok: false,
              error:
                "El certificado de liquidación exige una liquidación de PL.",
            }
          const liq = get().liquidacionesPL.find(
            (l) => l.id === input.liquidacionId
          )
          if (!liq)
            return {
              ok: false,
              error: "liquidacionId no existe en Remuneraciones.",
            }
          if (liq.estado !== "confirmada") {
            return {
              ok: false,
              error:
                "Solo liquidaciones confirmadas admiten certificado oficial (control tras cierre del mes).",
            }
          }
          unidadId = undefined
          personaId = liq.trabajadorPersonaId
          origenRef = liq.id
          const trabajador = get().personas.find(
            (p) => p.id === liq.trabajadorPersonaId
          )
          const nombreTrabajador = trabajador
            ? `${trabajador.nombres} ${trabajador.apellidos}`
            : liq.trabajadorPersonaId
          resumen = `Se certifica la remuneración, descuentos legales y haberes de ${nombreTrabajador} correspondientes al periodo ${liq.periodo}, según la liquidación folio ${liq.folio} emitida por la administración.`
          detalle = [
            ["Trabajador", nombreTrabajador],
            ["Periodo", liq.periodo],
            ["Folio liquidación", liq.folio],
            [
              "Total imponible",
              `$${liq.totalImponible.toLocaleString("es-CL")}`,
            ],
            ["Total haberes", `$${liq.totalHaberes.toLocaleString("es-CL")}`],
            [
              "Total descuentos legales",
              `$${liq.totalDescuentos.toLocaleString("es-CL")}`,
            ],
            [
              "Líquido a pagar",
              `$${liq.liquidoAPagar.toLocaleString("es-CL")}`,
            ],
          ]
          evento = "CT_GENERATE_PAYROLL"
        }

        // Folio CT correlativo + código de verificación único.
        const numeros = get()
          .certificadosCT.map((c) =>
            Number.parseInt(c.folio.replace(/^CT-/, ""), 10)
          )
          .filter((n) => Number.isFinite(n))
        const folio = `CT-${String((numeros.length > 0 ? Math.max(...numeros) : 0) + 1).padStart(4, "0")}`
        let codigoVerificacion = `VC-${Math.random().toString(36).slice(2, 10).toUpperCase()}`
        while (
          get().certificadosCT.some(
            (c) => c.codigoVerificacion === codigoVerificacion
          )
        ) {
          codigoVerificacion = `VC-${Math.random().toString(36).slice(2, 10).toUpperCase()}`
        }

            // Snapshot de la directiva vigente al emitir (trazabilidad histórica, no bloqueante).
            const vigenteCT = periodoDirectivaVigente(get())
            const firmantesCT = vigenteCT
              ? get()
                  .personas.filter((p) =>
                    esMiembroDirectivaVigente(p, vigenteCT.id)
                  )
                  .flatMap((p) =>
                    p.datosGobernanza
                      ? [
                          {
                            personaId: p.id,
                            nombre: p.nombreCompleto,
                            cargo: p.datosGobernanza.cargoDirectiva,
                          },
                        ]
                      : []
                  )
              : []
            const registro: CertificadoCT = {
          id: input.id ?? generarId("ct"),
          folio,
          codigoVerificacion,
          tipo: input.tipo,
          ...(unidadId ? { unidadId } : {}),
          ...(personaId ? { personaId } : {}),
          ...(origenRef ? { origenRef } : {}),
          solicitanteNombre: input.solicitanteNombre.trim(),
          resumen,
          detalle: detalle.map(([clave, valor]) => ({ clave, valor })),
              ...(firmaUrl ? { firmaUrl } : {}),
              ...(vigenteCT
                ? {
                    directivaRef: {
                      periodoId: vigenteCT.id,
                      firmantes: firmantesCT,
                    },
                  }
                : {}),
              fechaEmision: hoyISO(),
            }
        const validacion = validarConEsquema(CertificadoCTSchema, registro)
        if (!validacion.ok) return validacion
        set((s) => ({ certificadosCT: [...s.certificadosCT, validacion.data] }))
        registrarEvento(
          set,
          evento,
          validacion.data.id,
          `Certificado ${folio} (${validacion.data.tipo}) emitido para ${validacion.data.solicitanteNombre}; código de verificación ${codigoVerificacion}.`,
          "CT"
        )
        return { ok: true }
      },

        /** @deprecated Los datos de dominio ahora persisten en el servidor vía API REST. Usar los hooks de `lib/api/use-*.ts` en código nuevo. Esta acción queda como fallback legacy. */

      removeCertificadoCT: (id) => {
        if (!get().hasHydrated)
          return {
            ok: false,
            error:
              "El almacenamiento aún se está hidratando. Intenta de nuevo.",
          }
        const certificado = get().certificadosCT.find((c) => c.id === id)
        if (!certificado)
          return {
            ok: false,
            error: "No se puede eliminar: el certificado no existe.",
          }
        // Historial de emisión auditablemente inmutable; solo registros TEST son removibles.
        if (!id.startsWith("test-")) {
          return {
            ok: false,
            error:
              "El historial de emisión es inmutable: los certificados emitidos no pueden eliminarse.",
          }
        }
        set((s) => ({
          certificadosCT: s.certificadosCT.filter((c) => c.id !== id),
        }))
        return { ok: true }
      },

      // --- RE: Reportería y Dashboards ---

      registrarVistaDashboardRE: (vista) => {
        if (!get().hasHydrated) return
        registrarEvento(
          set,
          "RE_DASHBOARD_VIEW",
          vista,
          `Vista "${vista}" del Centro de Mando consultada por administración.`,
          "RE"
        )
      },

        /** @deprecated Los datos de dominio ahora persisten en el servidor vía API REST. Usar los hooks de `lib/api/use-*.ts` en código nuevo. Esta acción queda como fallback legacy. */

      generarReporteRE: (input) => {
        if (!get().hasHydrated)
          return {
            ok: false,
            error:
              "El almacenamiento aún se está hidratando. Intenta de nuevo.",
          }
        if (!input.titulo || input.titulo.trim().length < 3) {
          return {
            ok: false,
            error: "El título debe tener al menos 3 caracteres.",
          }
        }
        const bloques = [...new Set(input.bloques)]
        if (bloques.length === 0)
          return {
            ok: false,
            error: "Selecciona al menos un bloque de información.",
          }
        // Validación FK del segmento.
        const macroSectorIds = input.segmento.macroSectorIds ?? []
        const microSectorIds = input.segmento.microSectorIds ?? []
        const unidadIds = input.segmento.unidadIds ?? []
        for (const id of macroSectorIds) {
          if (!get().macroSectores.some((m) => m.id === id))
            return {
              ok: false,
              error: `macroSectorId ${id} no existe en la Estructura Física.`,
            }
        }
        for (const id of microSectorIds) {
          if (!get().microSectores.some((m) => m.id === id))
            return {
              ok: false,
              error: `microSectorId ${id} no existe en la Estructura Física.`,
            }
        }
        for (const id of unidadIds) {
          if (!get().unidades.some((u) => u.id === id))
            return {
              ok: false,
              error: `unidadId ${id} no existe en el inventario.`,
            }
        }

        // Snapshot inmutable por bloque (congelado al momento de generar).
        const mesActual = hoyISO().slice(0, 7)
        const payloadSnapshot: ReporteRE["payloadSnapshot"] = []
        for (const bloque of bloques) {
          const lineas: { etiqueta: string; valor: string }[] = []
          if (bloque === "gastos_mes") {
            const delMes = get().egresosFI.filter((e) =>
              e.fecha.startsWith(`${mesActual}-`)
            )
            const total = delMes.reduce((acc, e) => acc + e.monto, 0)
            lineas.push({ etiqueta: "Mes", valor: mesActual })
            lineas.push({
              etiqueta: "Egresos registrados",
              valor: String(delMes.length),
            })
            lineas.push({
              etiqueta: "Total egresos",
              valor: `$${total.toLocaleString("es-CL")}`,
            })
            const recurrentes = delMes
              .filter((e) => e.esRecurrente)
              .reduce((acc, e) => acc + e.monto, 0)
            lineas.push({
              etiqueta: "Gastos fijos recurrentes",
              valor: `$${recurrentes.toLocaleString("es-CL")}`,
            })
          } else if (bloque === "bitacora_seguridad") {
            const conNovedades = [...get().cierresTurnoPE]
              .filter((c) => c.incidencias.hubo || c.novedadesGenerales)
              .sort((a, b) => b.fecha.localeCompare(a.fecha))
              .slice(0, 10)
            lineas.push({
              etiqueta: "Reportes con novedades (últimos 10)",
              valor: String(conNovedades.length),
            })
            for (const c of conNovedades.slice(0, 5)) {
              lineas.push({
                etiqueta: `${c.fecha} (${nombrePersona(get, c.trabajadorPersonaId)})`,
                valor: c.incidencias.hubo
                  ? (c.incidencias.descripcion ?? "").slice(0, 80)
                  : (c.novedadesGenerales ?? "").slice(0, 80),
              })
            }
          } else if (bloque === "morosidad") {
            const vencidos = get()
              .cobrosFI.map((c) => ({ cobro: c, saldo: saldoPendiente(c) }))
              .filter(
                (x) =>
                  x.saldo > 0 &&
                  x.cobro.fechaVencimiento !== undefined &&
                  x.cobro.fechaVencimiento < hoyISO()
              )
              .sort((a, b) => b.saldo - a.saldo)
            const totalVencido = vencidos.reduce((acc, x) => acc + x.saldo, 0)
            lineas.push({
              etiqueta: "Cobros vencidos con deuda",
              valor: String(vencidos.length),
            })
            lineas.push({
              etiqueta: "Deuda vencida total",
              valor: `$${totalVencido.toLocaleString("es-CL")}`,
            })
            for (const x of vencidos.slice(0, 5)) {
              lineas.push({
                etiqueta: refUnidad(get, x.cobro.unidadId),
                valor: `$${x.saldo.toLocaleString("es-CL")}`,
              })
            }
          } else {
            const entregas = get().solicitudesInsumoIR.filter(
              (s) => s.estado === "entregada"
            )
            lineas.push({
              etiqueta: "Solicitudes entregadas (histórico)",
              valor: String(entregas.length),
            })
            const porArea = new Map<string, number>()
            for (const s of entregas)
              porArea.set(
                s.areaDestino,
                (porArea.get(s.areaDestino) ?? 0) + s.cantidad
              )
            for (const [area, cantidad] of [...porArea.entries()].slice(0, 5)) {
              lineas.push({ etiqueta: area, valor: `${cantidad} ítem(s)` })
            }
          }
          payloadSnapshot.push({ bloque, lineas })
        }

        const registro: ReporteRE = {
          id: input.id ?? generarId("re-rep"),
          titulo: input.titulo.trim(),
          bloques,
          segmento: {
            macroSectorIds,
            microSectorIds,
            unidadIds,
            perfiles: input.segmento.perfiles ?? [],
            tenencias: input.segmento.tenencias ?? [],
          },
          payloadSnapshot,
          fechaGeneracion: hoyISO(),
          destinatariosPersonaId: [],
          distribuidoA: 0,
        }
        const validacion = validarConEsquema(ReporteRESchema, registro)
        if (!validacion.ok) return validacion
        set((s) => ({ reportesRE: upsert(s.reportesRE, validacion.data) }))
        registrarEvento(
          set,
          "RE_REPORT_GENERATED",
          validacion.data.id,
          `Reporte "${registro.titulo}" generado con ${bloques.length} bloque(s); snapshot inmutable capturado.`,
          "RE"
        )
        return { ok: true }
      },

      distribuirReporteRE: (id) => {
        if (!get().hasHydrated)
          return {
            ok: false,
            error:
              "El almacenamiento aún se está hidratando. Intenta de nuevo.",
          }
        const reporte = get().reportesRE.find((r) => r.id === id)
        if (!reporte)
          return {
            ok: false,
            error: "No se puede distribuir: el reporte no existe.",
          }
        if (reporte.distribuidoA > 0 || reporte.fechaDistribucion) {
          return {
            ok: false,
            error: `El reporte ya fue distribuido a ${reporte.distribuidoA} destinatario(s) el ${reporte.fechaDistribucion}.`,
          }
        }

        // Alcance EF resuelto: unidades directas + micros + macros completos.
        const alcance = new Set<string>(reporte.segmento.unidadIds)
        for (const microId of reporte.segmento.microSectorIds) {
          for (const u of get().unidades.filter(
            (u) => u.microSectorId === microId
          ))
            alcance.add(u.id)
        }
        for (const macroId of reporte.segmento.macroSectorIds) {
          const microsDelMacro = new Set(
            get()
              .microSectores.filter((m) => m.macroSectorId === macroId)
              .map((m) => m.id)
          )
          for (const u of get().unidades.filter((u) =>
            microsDelMacro.has(u.microSectorId)
          ))
            alcance.add(u.id)
        }

        // Resolución vigente al momento de distribuir.
        const destinatarios = resolverSegmentacionRE({
          segmento: {
            perfiles: reporte.segmento.perfiles,
            tenencias: reporte.segmento.tenencias,
          },
          unidadesAlcanceIds: [...alcance],
          vinculos: get().vinculos,
          personas: get().personas,
        })
        if (destinatarios.length === 0) {
          return {
            ok: false,
            error:
              "La segmentación no resolvió destinatarios vigentes; ajusta el alcance.",
          }
        }

        const primerBloque = reporte.payloadSnapshot[0]
        const resumenBloques = reporte.bloques.join(", ")
        for (const personaId of destinatarios) {
          const persona = get().personas.find((p) => p.id === personaId)
          const rolBandeja = persona?.roles.includes("personal")
            ? ("personal" as const)
            : persona?.roles.includes("directiva") ||
                persona?.datosGobernanza !== undefined
              ? ("directiva" as const)
              : ("residente" as const)
          const unidadVinculo = get().vinculos.find(
            (v) => v.personaId === personaId && !v.fechaFin
          )?.unidadId
          get().notify({
            ...(rolBandeja === "personal"
              ? { destinatarioRol: "personal" as const }
              : rolBandeja === "directiva"
                ? { destinatarioRol: "directiva" as const }
                : { destinatarioRol: "residente" as const }),
            destinatarioPersonaId: personaId,
            asunto: `Reporte distribuido: ${reporte.titulo}`,
            cuerpo: `${reporte.titulo} — bloques: ${resumenBloques}.${primerBloque?.lineas[0] ? ` ${primerBloque.lineas[0].etiqueta}: ${primerBloque.lineas[0].valor}.` : ""}`,
            moduloOrigen: "RE",
            ...(unidadVinculo ? { unidadId: unidadVinculo } : {}),
          })
        }

        set((s) => ({
          reportesRE: s.reportesRE.map((r) =>
            r.id === id
              ? {
                  ...r,
                  destinatariosPersonaId: destinatarios,
                  distribuidoA: destinatarios.length,
                  fechaDistribucion: hoyISO(),
                }
              : r
          ),
        }))
        registrarEvento(
          set,
          "RE_REPORT_DISTRIBUTED",
          id,
          `Reporte "${reporte.titulo}" distribuido a ${destinatarios.length} destinatario(s) vía bandeja simulada (segmentación EF+MP+tenencia).`,
          "RE"
        )
        return { ok: true }
      },
    }),
    {
      name: "compass-store",
      version: STORE_VERSION,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        tiposUnidad: state.tiposUnidad,
        macroSectores: state.macroSectores,
        microSectores: state.microSectores,
        unidades: state.unidades,
        personas: state.personas,
        vinculos: state.vinculos,
        eventos: state.eventos,
        // C2-final: los secretos (smtpPassword/claveEliminacionMaestro) ya no existen
        // en el schema cliente; viven solo como env servidor (SMTP_PASSWORD /
        // CLAVE_ELIMINACION_MAESTRO). Se persiste configuracion tal cual.
        configuracion: state.configuracion,
        maestros: state.maestros,
        publicacionesPortal: state.publicacionesPortal,
        leadsPortal: state.leadsPortal,
        notificaciones: state.notificaciones,
        controlesPropiedades: state.controlesPropiedades,
        actasGD: state.actasGD,
        periodosDirectiva: state.periodosDirectiva,
        plantillasCO: state.plantillasCO,
        enviosCO: state.enviosCO,
        mensajesBuzonCO: state.mensajesBuzonCO,
        documentosCO: state.documentosCO,
        solicitudesGE: state.solicitudesGE,
        activosIR: state.activosIR,
        solicitudesInsumoIR: state.solicitudesInsumoIR,
        entregasEPP: state.entregasEPP,
        tiposInfraccionIN: state.tiposInfraccionIN,
        infraccionesIN: state.infraccionesIN,
        trabajosMT: state.trabajosMT,
        proyectosMT: state.proyectosMT,
        elementosRA: state.elementosRA,
        reservasRA: state.reservasRA,
        avisosCV: state.avisosCV,
        plantillasCV: state.plantillasCV,
        fondosFI: state.fondosFI,
        egresosFI: state.egresosFI,
        ingresosFI: state.ingresosFI,
        emisionesGC: state.emisionesGC,
        cobrosFI: state.cobrosFI,
        bitacoraVisitasPE: state.bitacoraVisitasPE,
        encomiendasPE: state.encomiendasPE,
        ingresosContratistasPE: state.ingresosContratistasPE,
        proveedoresPE: state.proveedoresPE,
        mantencionesPreventivasPE: state.mantencionesPreventivasPE,
        visitasTecnicasPE: state.visitasTecnicasPE,
        cierresTurnoPE: state.cierresTurnoPE,
        proyeccionesPE: state.proyeccionesPE,
        liquidacionesPL: state.liquidacionesPL,
        adelantosPL: state.adelantosPL,
        certificadosCT: state.certificadosCT,
        reportesRE: state.reportesRE,
      }),
      migrate: (persisted, version) => {
        const prev = (persisted ?? {}) as Partial<CompassData>
        let result: Partial<CompassData> = { ...prev }
        if ((version ?? 0) < 2) {
          result = {
            ...result,
            maestros: {
              ...seedData().maestros,
              ...prev.maestros,
            },
          }
        }
        if ((version ?? 0) < 3) {
          result = {
            ...result,
            unidades: migrarEstadoUnidades(prev.unidades ?? []),
          }
        }
        if ((version ?? 0) < 4) {
          result = {
            ...result,
            maestros: {
              ...seedData().maestros,
              ...prev.maestros,
            },
          }
        }
        if ((version ?? 0) < 5) {
          result = {
            ...result,
            maestros: {
              ...seedData().maestros,
              ...prev.maestros,
            },
          }
        }
        if ((version ?? 0) < 6) {
          result = {
            ...result,
            maestros: {
              ...seedData().maestros,
              ...prev.maestros,
            },
          }
        }
        if ((version ?? 0) < 8) {
          const seed = seedData()
          const mergeById = <T extends { id: string }>(
            prevArr: T[],
            seedArr: T[]
          ): T[] => {
            const prevIds = new Set(prevArr.map((p) => p.id))
            return [...prevArr, ...seedArr.filter((s) => !prevIds.has(s.id))]
          }
          // TST-002: mergeById reconstruye `unidades` desde el persistido crudo y
          // deshacía la conversión estado→estadoId de la rama <3; se reaplica
          // migrarEstadoUnidades sobre la fusión resultante.
          // SAFETY: prev/seed arrays contain objects with id; narrow to {id:string}[] for mergeById
          const unidadesFusionadas = mergeById(
            (prev.unidades ?? []) as { id: string }[],
            seed.unidades as unknown as { id: string }[]
          )
          // SAFETY: prev may have legacy keys; cast to Record for safe key deletion
          const prevAny = prev as unknown as Record<string, unknown>
          result = {
            ...result,
            // SAFETY: same pattern for macro/micro sectores
            macroSectores: mergeById(
              (prev.macroSectores ?? []) as { id: string }[],
              seed.macroSectores as unknown as { id: string }[]
            ) as never,
            // SAFETY: same pattern for micro sectores
            microSectores: mergeById(
              (prev.microSectores ?? []) as { id: string }[],
              seed.microSectores as unknown as { id: string }[]
            ) as never,
            // SAFETY: unidadesFusionadas contains Unidad-compatible objects
            unidades: migrarEstadoUnidades(
              unidadesFusionadas as unknown as Unidad[]
            ) as never,
            maestros: {
              ...seed.maestros,
              ...(prev.maestros ?? {}),
              // SAFETY: maestro arrays contain objects with id
              categoriasMacro: mergeById(
                (prev.maestros?.categoriasMacro ?? []) as { id: string }[],
                seed.maestros.categoriasMacro as unknown as { id: string }[]
              ) as never,
            } as never,
          }
          // Eliminar estacionamientos legacy del persistido si existe
          // SAFETY: result is Partial<CompassData>; cast to delete legacy key
          if (prevAny["estacionamientos"] !== undefined)
            // SAFETY: result is Partial<CompassData>, dynamic key deletion is safe
            delete (result as unknown as Record<string, unknown>)[
              "estacionamientos"
            ]
          // SAFETY: result.maestros is Record<string, unknown> at runtime
          const maestrosAny = (result.maestros ?? {}) as unknown as Record<
            string,
            unknown
          >
          if (maestrosAny["ubicacionesEstacionamiento"] !== undefined)
            // SAFETY: maestrosAny is a mutable record, dynamic key deletion is safe
            delete maestrosAny["ubicacionesEstacionamiento"]
        }
        // PI (v11): colecciones nuevas del Portal Inmobiliario + notificaciones
        // simuladas (D3). Aditivas: si no existen en el persistido, entran vacías.
        if ((version ?? 0) < 11) {
          result = {
            ...result,
            publicacionesPortal: prev.publicacionesPortal ?? [],
            leadsPortal: prev.leadsPortal ?? [],
            notificaciones: prev.notificaciones ?? [],
          }
        }
        if ((version ?? 0) < 12) {
          result = {
            ...result,
            controlesPropiedades: prev.controlesPropiedades ?? [],
          }
        }
        if ((version ?? 0) < 13) {
          result = {
            ...result,
            actasGD: prev.actasGD ?? [],
            periodosDirectiva: prev.periodosDirectiva ?? [],
          }
        }
        // CO (v14): maestro de plantillas (sembrado si ausente), envíos masivos,
        // buzón ciudadano y biblioteca documental. Aditivo.
        if ((version ?? 0) < 14) {
          result = {
            ...result,
            plantillasCO: prev.plantillasCO ?? seedData().plantillasCO,
            enviosCO: prev.enviosCO ?? [],
            mensajesBuzonCO: prev.mensajesBuzonCO ?? [],
            documentosCO: prev.documentosCO ?? [],
          }
        }
        // GE (v15): colección de tickets del motor de solicitudes. Aditiva.
        if ((version ?? 0) < 15) {
          result = {
            ...result,
            solicitudesGE: prev.solicitudesGE ?? [],
          }
        }
        // IR (v16): catálogo de recursos, solicitudes de insumo y entregas EPP. Aditivo.
        if ((version ?? 0) < 16) {
          result = {
            ...result,
            activosIR: prev.activosIR ?? [],
            solicitudesInsumoIR: prev.solicitudesInsumoIR ?? [],
            entregasEPP: prev.entregasEPP ?? [],
          }
        }
        // IN (v17): catálogo de tipos de infracción (sembrado si ausente) e
        // infracciones registradas. Aditivo.
        if ((version ?? 0) < 17) {
          result = {
            ...result,
            tiposInfraccionIN: prev.tiposInfraccionIN ?? tiposInfraccionSeed,
            infraccionesIN: prev.infraccionesIN ?? [],
          }
        }
        // MT (v18): trabajos/mantenciones y proyectos a largo plazo. Aditivo.
        if ((version ?? 0) < 18) {
          result = {
            ...result,
            trabajosMT: prev.trabajosMT ?? [],
            proyectosMT: prev.proyectosMT ?? [],
          }
        }
        // RA (v19): maestro de elementos reservables y reservas. Aditivo.
        if ((version ?? 0) < 19) {
          result = {
            ...result,
            elementosRA: prev.elementosRA ?? [],
            reservasRA: prev.reservasRA ?? [],
          }
        }
        // CV (v20): avisos del carrusel y plantillas rápidas (sembradas si
        // ausente). Aditivo.
        if ((version ?? 0) < 20) {
          result = {
            ...result,
            avisosCV: prev.avisosCV ?? [],
            plantillasCV: prev.plantillasCV ?? plantillasCVSeed,
          }
        }
        // FI (v21): maestro de fondos (sembrado si ausente), egresos, emisiones
        // GC y libro de cobros. Aditivo.
        if ((version ?? 0) < 21) {
          result = {
            ...result,
            fondosFI: prev.fondosFI ?? FONDOS_FI_SEED,
            egresosFI: prev.egresosFI ?? [],
            emisionesGC: prev.emisionesGC ?? [],
            cobrosFI: prev.cobrosFI ?? [],
          }
        }
        // PE (v22): maestros legales/operativos nuevos (sembrados si ausentes)
        // y colecciones operacionales de Personal y Servicios. Aditivo.
        if ((version ?? 0) < 22) {
          const seed = seedData()
          const mergeById = <T extends { id: string }>(
            prevArr: T[] | undefined,
            seedArr: T[]
          ): T[] => {
            if (!prevArr) return seedArr
            const prevIds = new Set(prevArr.map((p) => p.id))
            return [...prevArr, ...seedArr.filter((s) => !prevIds.has(s.id))]
          }
          const maestrosPrev = (prev.maestros ?? {}) as Record<string, unknown>
          result = {
            ...result,
            bitacoraVisitasPE: prev.bitacoraVisitasPE ?? [],
            encomiendasPE: prev.encomiendasPE ?? [],
            ingresosContratistasPE: prev.ingresosContratistasPE ?? [],
            proveedoresPE: prev.proveedoresPE ?? [],
            mantencionesPreventivasPE: prev.mantencionesPreventivasPE ?? [],
            visitasTecnicasPE: prev.visitasTecnicasPE ?? [],
            cierresTurnoPE: prev.cierresTurnoPE ?? [],
            proyeccionesPE: prev.proyeccionesPE ?? [],
            maestros: {
              ...(result.maestros ?? prev.maestros ?? {}),
              asignacionFamiliar: mergeById(
                maestrosPrev["asignacionFamiliar"] as
                  | AsignacionFamiliar[]
                  | undefined,
                seed.maestros.asignacionFamiliar
              ),
              jornadas: mergeById(
                maestrosPrev["jornadas"] as Jornada[] | undefined,
                seed.maestros.jornadas
              ),
              couriers: mergeById(
                maestrosPrev["couriers"] as Courier[] | undefined,
                seed.maestros.couriers
              ),
              contratistas: mergeById(
                maestrosPrev["contratistas"] as Contratista[] | undefined,
                seed.maestros.contratistas
              ),
            } as never,
          }
        }
        // PL (v23): colecciones de remuneraciones (transaccionales, nacen
        // vacías). Aditivo.
        if ((version ?? 0) < 23) {
          result = {
            ...result,
            liquidacionesPL: prev.liquidacionesPL ?? [],
            adelantosPL: prev.adelantosPL ?? [],
          }
        }
        // CT (v24): historial de certificados emitidos (transaccional, nace
        // vacía). Aditivo.
        if ((version ?? 0) < 24) {
          result = {
            ...result,
            certificadosCT: prev.certificadosCT ?? [],
          }
        }
        // RE (v25): reportería personalizada (transaccional, nace vacía).
        // Aditivo.
        if ((version ?? 0) < 25) {
          result = {
            ...result,
            reportesRE: prev.reportesRE ?? [],
          }
        }
        // C2-final v26: limpieza de secretos legacy del persistido v25 sin romper resto (patrón v8)
        if ((version ?? 0) < 26) {
          if (
            result.configuracion &&
            typeof result.configuracion === "object"
          ) {
            const cfg = result.configuracion as Record<string, unknown>
            if ("smtpPassword" in cfg) delete cfg.smtpPassword
            if ("claveEliminacionMaestro" in cfg)
              delete cfg.claveEliminacionMaestro
          }
        }
        // FI v27: punto cero histórico 2023-2024. Aditivo e idempotente por IDs
        // deterministas. Crea fondo Cuenta Corriente con saldoInicial 17082694 e
        // inyecta 182 egresos (folio FE-#### continuo sin chocar) + 44 ingresos.
        // Documentado: históricos usan rango siguiente a max(FE) existente.
        // Semántica F1/F2: ver comentario en PUNTO_CERO_FONDO (saldoInicial
        // derivado, serie saldoCC del libro no materializada).
        if ((version ?? 0) < 27) {
          // SAFETY: `prev` es el estado persistido sin tipar (versión anterior);
          // el acceso indexado con fallback `??` lo trata como parcial y cada
          // colección se valida por forma antes de inyectar (filtros por id/folio).
          const prevFondos = (prev as unknown as Record<string, unknown>)[
            "fondosFI"
          ] as FondoFI[] | undefined
          // SAFETY: igual que prevFondos — prev sin tipar, acceso indexado con fallback.
          const prevEgresos = (prev as unknown as Record<string, unknown>)[
            "egresosFI"
          ] as EgresoFI[] | undefined
          // SAFETY: igual que prevFondos — prev sin tipar, acceso indexado con fallback.
          const prevIngresos = (prev as unknown as Record<string, unknown>)[
            "ingresosFI"
          ] as IngresoFI[] | undefined

          // Asegura colecciones base si vienen undefined
          const fondosBase: FondoFI[] =
            prevFondos ?? (result.fondosFI as FondoFI[] | undefined) ?? []
          const egresosBase: EgresoFI[] =
            prevEgresos ?? (result.egresosFI as EgresoFI[] | undefined) ?? []
          const ingresosBase: IngresoFI[] =
            prevIngresos ?? (result.ingresosFI as IngresoFI[] | undefined) ?? []

          // Fondo Cuenta Corriente (idempotente por id)
          const tieneFondoCC = fondosBase.some(
            (f) => f.id === PUNTO_CERO_FONDO.id
          )
          const fondosNext: FondoFI[] = tieneFondoCC
            ? fondosBase
            : [...fondosBase, PUNTO_CERO_FONDO]

          // Egresos históricos: idempotente por id, folios continuos desde max existente
          const idsEgresosExistentes = new Set(egresosBase.map((e) => e.id))
          let egresosNext = [...egresosBase]
          const faltanEgresos = PUNTO_CERO_EGRESOS_SEED.filter(
            (e) => !idsEgresosExistentes.has(e.id)
          )
          if (faltanEgresos.length > 0) {
            const maxFolio = egresosBase
              .map((e) =>
                Number.parseInt((e.folio ?? "").replace(/^FE-/, ""), 10)
              )
              .filter((n) => Number.isFinite(n))
              .reduce((a, b) => Math.max(a, b), 0)
            let nextFolio = maxFolio + 1
            // Si no hay folios previos, empezamos en 1 (ya viene en seed)
            // Pero para idempotencia fresca con max=0, PUNTO_CERO_EGRESOS_SEED ya trae 1..186, así que usamos esos folios
            // Solo si max>0 necesitamos re-foliar los faltantes
            if (maxFolio === 0) {
              egresosNext = [...egresosBase, ...faltanEgresos]
            } else {
              const refolios = faltanEgresos.map((e) => ({
                ...e,
                folio: `FE-${String(nextFolio++).padStart(4, "0")}`,
              }))
              egresosNext = [...egresosBase, ...refolios]
            }
          }

          // Ingresos históricos: idempotente por id
          const idsIngresosExistentes = new Set(ingresosBase.map((i) => i.id))
          const ingresosNext = [
            ...ingresosBase,
            ...PUNTO_CERO_INGRESOS_SEED.filter(
              (i) => !idsIngresosExistentes.has(i.id)
            ),
          ]

          result = {
            ...result,
            fondosFI: fondosNext,
            egresosFI: egresosNext,
            ingresosFI: ingresosNext,
          }
        }
            // GD-períodos v28: período inicial estimado (actualizar desde el libro
            // físico) + periodoId en fichas existentes. Idempotente por id.
            if ((version ?? 0) < 28) {
              // SAFETY: `result` es el estado migrado sin tipar estricto; se lee por
              // forma con fallback y el período se valida por schema antes de inyectar.
              const personasPrev = (result.personas as Persona[] | undefined) ?? []
              const periodosPrev = (result.periodosDirectiva as
                | PeriodoDirectiva[]
                | undefined) ?? []
              const fichasPrev = personasPrev.filter((p) => p.datosGobernanza)
              const inicioInicial =
                fichasPrev[0]?.datosGobernanza?.fechaAsuncion ?? "2025-03-01"
              const periodoInicial = {
                id: "periodo-1",
                fechaInicio: inicioInicial,
                duracionMeses: 36,
                fechaInscripcion: inicioInicial,
                referenciaInscripcion:
                  "Período inicial estimado desde fichas seed — actualizar fechas desde el libro físico.",
                fechasEstimadas: true,
                estado: "vigente",
                miembros: fichasPrev.flatMap((p) =>
                  p.datosGobernanza
                    ? [
                        {
                          personaId: p.id,
                          nombre: p.nombreCompleto,
                          cargo: p.datosGobernanza.cargoDirectiva,
                          fechaAsuncion: p.datosGobernanza.fechaAsuncion,
                        },
                      ]
                    : []
                ),
              }
              const parsed = PeriodoDirectivaSchema.safeParse(periodoInicial)
              if (parsed.success) {
                result = {
                  ...result,
                  periodosDirectiva: periodosPrev.some((p) => p.id === periodoInicial.id)
                    ? periodosPrev
                    : [...periodosPrev, parsed.data],
                  personas: personasPrev.map((p) =>
                    p.datosGobernanza && !p.datosGobernanza.periodoId
                      ? {
                          ...p,
                          datosGobernanza: {
                            ...p.datosGobernanza,
                            periodoId: periodoInicial.id,
                          },
                        }
                      : p
                  ),
                }
              }
            }
            // TST-002: los stores que ya quedaron en v8 con unidades dañadas por este
        // bug (estado sin estadoId) se rescatan aquí en el salto a v9.
        if ((version ?? 0) < STORE_VERSION && Array.isArray(result.unidades)) {
          result = {
            ...result,
            unidades: migrarEstadoUnidades(result.unidades),
          }
        }
        // VAL-005: reparación de DV de RUT en datos persistidos ≤v9, antes del
        // saneo para que la colección personas/configuración pase la validación.
        if ((version ?? 0) < STORE_VERSION) {
          result = repararDocumentos(result)
        }
        // VAL-006: saneo por colección antes de devolver el resultado migrado.
        // Colección inválida → re-sembrada desde seed; resto del store intacto.
        const saneado = sanitizarColecciones(result)
        if (saneado) result = { ...result, ...saneado }
        return result
      },
      onRehydrateStorage: () => (state, error) => {
        // VAL-006: lo cargado sin migrate (versión vigente o fresh install) también
        // se sanea; una colección corrupta se re-siembra sin romper el resto.
        if (!error && state) {
          const saneado = sanitizarColecciones(state)
          if (saneado) useCompassStore.setState(saneado)
        }
        useCompassStore.setState({ hasHydrated: true })
      },
      skipHydration: true,
    }
  )
)

export function rehydrateStore(): void {
  if (typeof window !== "undefined") useCompassStore.persist.rehydrate()
}

// Espera acotada a que zustand-persist marque `hasHydrated`. El store usa
// `skipHydration: true`, así que la hidratación arranca en el mount de cada
// página (useStoreRehydrated) y un click inmediato puede llegar antes de que
// termine: en vez de abortar, se espera. Resuelve false solo si el timeout
// vence sin hidratar (comportamiento previo de los guards del QA-Lab).
export function waitForStoreHydration(timeoutMs = 10_000): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false)
  if (useCompassStore.getState().hasHydrated) return Promise.resolve(true)
  return new Promise<boolean>((resolve) => {
    let settled = false
    const finish = (value: boolean) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      unsubscribe()
      resolve(value)
    }
    const timer = setTimeout(() => finish(useCompassStore.getState().hasHydrated), timeoutMs)
    const unsubscribe = useCompassStore.subscribe((state) => {
      if (state.hasHydrated) finish(true)
    })
    // Carrera: si la hidratación terminó entre el chequeo y la suscripción, el
    // listener ya no recibe el cambio; se re-chequea una vez.
    if (useCompassStore.getState().hasHydrated) finish(true)
  })
}

export function useStoreRehydrated(): void {
  useEffect(() => {
    rehydrateStore()
  }, [])
}
