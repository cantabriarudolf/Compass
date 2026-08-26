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
import { vinculos as seedVinculos, ESTADOS_INMOBILIARIOS as seedEstadosInmobiliarios } from "@/data/comunidad/vinculos"
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
import {
  configuracionDefault as seedConfiguracion,
} from "@/data/admin/configuracion"
import {
  ESTADOS_OCUPACION as seedEstadosOcupacion,
  CATEGORIAS_MACRO as seedCategoriasMacro,
  CATEGORIAS_MICRO as seedCategoriasMicro,
  CATEGORIAS_UNIDAD as seedCategoriasUnidad,
} from "@/data/maestros"
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
  type OperacionPortal,
  type ControlPropiedad,
  type ActaGD,
  type PlantillaCO,
  type EnvioCO,
  type MensajeBuzonCO,
  type EstadoBuzonCO,
  type DocumentoCO,
  type SolicitudGE,
  type EstadoSolicitudGE,
  type RecursoIR,
  type SolicitudInsumoIR,
  type EntregaEPP,
  type EstadoActivoIR,
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
} from "@/lib/schemas"
import {
  calcularProyeccionCobertura,
  costoProyeccionPE,
  proximaFechaPreventiva,
} from "@/lib/personal-utils"
import {
  calcularLiquidacion,
  hoyISOPL,
} from "@/lib/pl-utils"
import {
  exigibleTotal,
  estadoDeCobro,
  hoyISO,
  montoMoraPropuesta,
  saldoFondo,
  saldoPendiente,
  totalPagado,
  vencimientoDesdeDiaCorte,
} from "@/lib/finanzas-utils"
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

const MAX_EVENTOS = 500

type SetStateFn = (partial: Partial<CompassStore> | ((state: CompassStore) => Partial<CompassStore>)) => void

function registrarEvento(
  set: SetStateFn,
  tipoAccion: string,
  referenciaId: string,
  descripcion: string,
  categoria = "VU"
): void {
  set(s => ({
    eventos: [
      ...s.eventos.slice(-(MAX_EVENTOS - 1)),
      {
        id: `ev-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        timestamp: new Date().toISOString(),
        usuario: "Admin",
        categoria,
        tipoAccion,
        referenciaId,
        descripcion,
      },
    ],
  }))
}

function nombrePersona(get: () => CompassStore, personaId: string): string {
  const p = get().personas.find(x => x.id === personaId)
  return p ? `${p.nombres} ${p.apellidos}` : personaId
}

function refUnidad(get: () => CompassStore, unidadId: string): string {
  const u = get().unidades.find(x => x.id === unidadId)
  return u ? `${u.etiqueta} ${u.numero}` : unidadId
}

// CO: sustitución de variables dinámicas de plantillas por destinatario.
function resolverVariablesCO(get: () => CompassStore, texto: string, nombreUsuario?: string): string {
  const comunidad = get().configuracion.nombreComunidad || "su comunidad"
  const torre = get().macroSectores[0]?.nombre ?? comunidad
  return texto
    .replace(/\[Nombre_Usuario\]/g, nombreUsuario && nombreUsuario.trim().length > 0 ? nombreUsuario : "vecino/a")
    .replace(/\[Nombre_Torre\]/g, torre)
    .replace(/\[Nombre_Comunidad\]/g, comunidad)
}

// CO: rol de bandeja para el destinatario de un envío masivo.
function rolDestinatarioCO(get: () => CompassStore, personaId: string): "propietario" | "residente" | "personal" | "directiva" {
  const persona = get().personas.find(p => p.id === personaId)
  if (persona?.roles.includes("personal")) return "personal"
  if (persona?.roles.includes("directiva")) return "directiva"
  if (get().vinculos.some(v => v.personaId === personaId && v.rol === "propietario" && !v.fechaFin)) return "propietario"
  return "residente"
}

// IR: siguiente código de inventario IR-A-####.
function siguienteCodigoIR(get: () => CompassStore): string {
  const numeros = get().activosIR
    .map(r => Number.parseInt((r.codigo ?? "").replace(/^IR-A-/, ""), 10))
    .filter(n => Number.isFinite(n))
  const siguiente = (numeros.length > 0 ? Math.max(...numeros) : 0) + 1
  return `IR-A-${String(siguiente).padStart(4, "0")}`
}

// RA: siguiente folio de reserva RA-####.
function siguienteFolioRA(get: () => CompassStore): string {
  const numeros = get().reservasRA
    .map(r => Number.parseInt(r.folio.replace(/^RA-/, ""), 10))
    .filter(n => Number.isFinite(n))
  const siguiente = (numeros.length > 0 ? Math.max(...numeros) : 0) + 1
  return `RA-${String(siguiente).padStart(4, "0")}`
}

// RA §2: gate de morosidad — bloquea al solicitante que mantiene cobros
// vencidos sin cubrir en las unidades donde tiene vínculo vigente.
function getDeudaVigenteFI(get: () => CompassStore, personaId: string): string | null {
  const hoy = hoyISO()
  const unidadesPersona = get().vinculos.filter(v => v.personaId === personaId && !v.fechaFin).map(v => v.unidadId)
  const vencidos = get().cobrosFI.filter(
    c =>
      unidadesPersona.includes(c.unidadId) &&
      c.fechaVencimiento !== undefined &&
      c.fechaVencimiento < hoy &&
      saldoPendiente(c) > 0
  )
  if (vencidos.length === 0) return null
  const total = vencidos.reduce((acc, c) => acc + saldoPendiente(c), 0)
  return `No se puede reservar: mantienes deuda vencida en Finanzas ($${total.toLocaleString("es-CL")} en ${vencidos.length} cobro(s)). Regulariza tu situación para volver a reservar.`
}

function siguienteFolioFE(get: () => CompassStore): string {
  const numeros = get().egresosFI
    .map(e => Number.parseInt((e.folio ?? "").replace(/^FE-/, ""), 10))
    .filter(n => Number.isFinite(n))
  const siguiente = (numeros.length > 0 ? Math.max(...numeros) : 0) + 1
  return `FE-${String(siguiente).padStart(4, "0")}`
}

const FONDOS_FI_SEED: FondoFI[] = [
  { id: "fondo-gc", nombre: "Fondo de Gasto Común", tipo: "gasto_comun", descripcion: "Caja principal para la operación ordinaria de la comunidad.", activo: true },
  { id: "fondo-reserva", nombre: "Fondo de Reserva", tipo: "reserva", descripcion: "Ahorro obligatorio según la Ley de Copropiedad.", porcentajeAporte: 5, activo: true },
  { id: "fondo-amenities", nombre: "Fondo de Amenities", tipo: "amenities", descripcion: "Centro de costos de reservas, tarifas y garantías de amenities.", activo: true },
]

export const STORE_VERSION = 23

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
  estadosOcupacion: { id: string; nombre: string; color: string; hex?: string }[]
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
}

interface CompassStore extends CompassData {
  hasHydrated: boolean
  // Tipos de Unidad (TU)
  saveTipoUnidad: (tipo: TipoUnidad) => StoreResult
  toggleActivoTipoUnidad: (id: string) => void
  removeTipoUnidad: (id: string) => StoreResult
  // Macro Sectores (EF)
  saveMacroSector: (macro: MacroSector) => StoreResult
  removeMacroSector: (id: string) => StoreResult
  // Micro Sectores (EF)
  saveMicroSector: (micro: MicroSector) => StoreResult
  removeMicroSector: (id: string) => StoreResult
  // Unidades (EF)
  saveUnidad: (unidad: Unidad) => StoreResult
  removeUnidad: (id: string) => StoreResult
  // Personas (MP)
  savePersona: (persona: Persona) => StoreResult
  removePersona: (id: string) => StoreResult
  // Vínculos (VU)
  saveVinculo: (vinculo: VinculoUnidad) => StoreResult
  removeVinculo: (id: string) => StoreResult
  // Maestros Administrativos (MA)
  saveMaestro: <K extends keyof MaestroCollections>(key: K, item: MaestroCollections[K][number]) => StoreResult
  removeMaestro: <K extends keyof MaestroCollections>(key: K, id: string) => StoreResult
  // Configuración Global (CF)
  saveConfiguracion: (config: ConfiguracionGlobal) => StoreResult
  // Portal Inmobiliario (PI)
  savePublicacionPortal: (publicacion: PublicacionPortal) => StoreResult
  removePublicacionPortal: (id: string) => StoreResult
  saveLeadPortal: (lead: LeadPortal) => StoreResult
  syncPublicacionesDesdeVinculos: (unidadId: string) => void
  // Notificaciones simuladas (D3)
  notify: (notificacion: Omit<Notificacion, "id" | "leida" | "canal" | "fecha"> & { canal?: Notificacion["canal"]; unidadId?: string }) => void
  marcarNotificacionLeida: (id: string) => void
  // Gestión Administrativa (AD)
  saveControlPropiedad: (control: ControlPropiedad) => StoreResult
  removeControlPropiedad: (id: string) => StoreResult
  // Gestión de Directiva (GD)
  saveActaGD: (acta: ActaGD) => StoreResult
  removeActaGD: (id: string) => StoreResult
  aprobarActaGD: (id: string, personaId: string) => StoreResult
  // Comunicación con Vecinos (CO)
  savePlantillaCO: (plantilla: PlantillaCO) => StoreResult
  removePlantillaCO: (id: string) => StoreResult
  saveEnvioCO: (envio: EnvioCO) => StoreResult
  registrarLecturaEnvioCO: (id: string, personaId: string) => StoreResult
  saveMensajeBuzonCO: (mensaje: MensajeBuzonCO) => StoreResult
  responderMensajeBuzonCO: (id: string, respuesta: { autor: string; texto: string; compromisos?: string }) => StoreResult
  cambiarEstadoBuzonCO: (id: string, estado: EstadoBuzonCO) => StoreResult
  removeMensajeBuzonCO: (id: string) => StoreResult
  saveDocumentoCO: (documento: DocumentoCO) => StoreResult
  removeDocumentoCO: (id: string) => StoreResult
  registrarDescargaDocCO: (id: string) => StoreResult
  // Gestión de Solicitudes (GE)
  saveSolicitudGE: (solicitud: SolicitudGE) => StoreResult
  abrirSolicitudGE: (id: string) => StoreResult
  responderSolicitudGE: (id: string, comentario: { autorRol: "administracion" | "solicitante"; texto: string }) => StoreResult
  resolverSolicitudGE: (id: string, resolucion: string) => StoreResult
  cerrarSolicitudGE: (id: string) => StoreResult
  removeSolicitudGE: (id: string) => StoreResult
  // Inventario y Recursos (IR)
  saveRecursoIR: (recurso: RecursoIR) => StoreResult
  removeRecursoIR: (id: string) => StoreResult
  cambiarEstadoRecursoIR: (id: string, estado: EstadoActivoIR) => StoreResult
  saveSolicitudInsumoIR: (solicitud: SolicitudInsumoIR) => StoreResult
  resolverComodinIR: (id: string, decision: "aprobar_crear" | "sustituir" | "rechazar", opts?: { recursoSustitutoId?: string; justificacion?: string }) => StoreResult
  entregarSolicitudInsumoIR: (id: string) => StoreResult
  registrarEntregaEPP: (entrega: EntregaEPP) => StoreResult
  asignarAccesoIR: (recursoId: string, personaId: string) => StoreResult
  devolverAccesoIR: (recursoId: string) => StoreResult
  // Infracciones y Multas (IN)
  saveTipoInfraccionIN: (tipo: TipoInfraccionIN) => StoreResult
  removeTipoInfraccionIN: (id: string) => StoreResult
  saveInfraccionIN: (infraccion: InfraccionIN) => StoreResult
  apelarInfraccionIN: (id: string, descargos: string) => StoreResult
  comentarInfraccionIN: (id: string, comentario: { autorPersonaId: string; texto: string }) => StoreResult
  respaldarInfraccionIN: (id: string, personaId: string) => StoreResult
  aplicarInfraccionIN: (id: string) => StoreResult
  desestimarInfraccionIN: (id: string, justificacion: string) => StoreResult
  removeInfraccionIN: (id: string) => StoreResult
  // Mantenimiento y Proyectos (MT)
  saveTrabajoMT: (trabajo: TrabajoMT) => StoreResult
  removeTrabajoMT: (id: string) => StoreResult
  iniciarTrabajoMT: (id: string) => StoreResult
  finalizarTrabajoMT: (id: string, cierre?: { fechaTermino?: string; costoFinal?: number }) => StoreResult
  cancelarTrabajoMT: (id: string) => StoreResult
  actualizarPagoTrabajoMT: (id: string, estadoPago: EstadoPagoMT) => StoreResult
  verificarGarantiasMT: () => StoreResult
  saveProyectoMT: (proyecto: ProyectoMT) => StoreResult
  removeProyectoMT: (id: string) => StoreResult
  // Reservas y Amenities (RA)
  saveElementoRA: (elemento: ElementoRA) => StoreResult
  removeElementoRA: (id: string) => StoreResult
  saveReservaRA: (reserva: ReservaRA) => StoreResult
  cancelarReservaRA: (id: string) => StoreResult
  retenerGarantiaRA: (id: string, motivo: string) => StoreResult
  // Visor de Mensajes (CV)
  saveAvisoCV: (aviso: AvisoCV, creadoPorPersonaId?: string) => StoreResult
  removeAvisoCV: (id: string) => StoreResult
  publicarAvisoCV: (id: string) => StoreResult
  archivarAvisoCV: (id: string) => StoreResult
  caducarAvisosCV: () => StoreResult
  savePlantillaCV: (plantilla: PlantillaCV) => StoreResult
  removePlantillaCV: (id: string) => StoreResult
  activarPlantillaCV: (id: string) => StoreResult
  publicarActaEnCV: (actaId: string) => StoreResult
  // Finanzas y Morosidad (FI)
  saveFondoFI: (fondo: FondoFI) => StoreResult
  removeFondoFI: (id: string) => StoreResult
  saveEgresoFI: (egreso: EgresoFI) => StoreResult
  removeEgresoFI: (id: string) => StoreResult
  emitirGastoComun: (input: { periodo: string; gastoTotal?: number; fechaVencimiento?: string; unidadIds?: string[] }) => StoreResult
  aplicarMoraFI: (cobroId: string, tasaMensualPct?: number) => StoreResult
  registrarPagoFI: (cobroId: string, pago: { monto: number; medio: string; ajusteJustificacion?: string }) => StoreResult
  enviarCobranzaFI: (unidadId: string) => StoreResult
  retirarFondoFI: (input: { fondoId: string; monto: number; descripcion: string; aprobacionActaGDId?: string }) => StoreResult
  // Personal y Servicios (PE)
  registrarHoraExtraPE: (personaId: string, horaExtra: { fecha: string; horas: number; motivo: string }) => StoreResult
  registrarEvaluacionPE: (personaId: string, evaluacion: { fecha: string; puntaje: number; comentarios?: string }) => StoreResult
  iniciarTurnoPE: (personaId: string, jornadaId: string) => StoreResult
  completarTareaMonitoreoPE: (trabajoMTId: string) => StoreResult
  saveBitacoraVisitaPE: (visita: BitacoraVisitaPE) => StoreResult
  ingresarBitacoraVisitaPE: (id: string) => StoreResult
  removeBitacoraVisitaPE: (id: string) => StoreResult
  saveEncomiendaPE: (encomienda: EncomiendaPE) => StoreResult
  registrarRetiroEncomiendaPE: (id: string, retiradoPor: string, relacion?: string) => StoreResult
  removeEncomiendaPE: (id: string) => StoreResult
  saveIngresoContratistaPE: (ingreso: IngresoContratistaPE) => StoreResult
  confirmarIngresoContratistaPE: (id: string) => StoreResult
  removeIngresoContratistaPE: (id: string) => StoreResult
  saveProveedorPE: (proveedor: ProveedorPE) => StoreResult
  removeProveedorPE: (id: string) => StoreResult
  saveMantencionPE: (mantencion: MantencionPreventivaPE) => StoreResult
  removeMantencionPE: (id: string) => StoreResult
  registrarVisitaTecnicaPE: (visita: VisitaTecnicaPE) => StoreResult
  cerrarTurnoPE: (input: Omit<CierreTurnoPE, "id" | "historialCambios" | "notificadoAAdmin"> & { id?: string }) => StoreResult
  editarCierreTurnoPE: (id: string, cambios: Partial<Pick<CierreTurnoPE, "jornadaReportadaId" | "novedadesGenerales" | "incidencias" | "checklistInstalaciones" | "checklistEquipamiento">>, resumen: string) => StoreResult
  removeCierreTurnoPE: (id: string) => StoreResult
  enviarProyeccionCostoFI: (mesAnio: string, params: { costoParche: number; costoDiaExtra: number; id?: string }) => StoreResult
  // Liquidaciones y Remuneraciones (PL)
  generarLiquidacionPL: (input: {
    trabajadorPersonaId: string
    periodo: string
    diasTrabajados: number
    asignacionMovilizacion?: number
    asignacionColacion?: number
    montoAPV?: number
    saludPorcentaje?: number
    saludValorUF?: number
    bonos?: { id?: string; glosa: string; monto: number; imponible: boolean }[]
    id?: string
  }) => StoreResult
  confirmarLiquidacionPL: (id: string) => StoreResult
  removeLiquidacionPL: (id: string) => StoreResult
  saveAdelantoPL: (adelanto: AdelantoPL) => StoreResult
  removeAdelantoPL: (id: string) => StoreResult
}

function upsert<T extends { id: string }>(list: T[], item: T): T[] {
  return list.some(i => i.id === item.id)
    ? list.map(i => (i.id === item.id ? item : i))
    : [...list, item]
}

const ESTADO_NOMBRE_A_ID: Record<string, string> = {
  "Vacante": "vacante",
  "En Uso": "en-uso",
  "En Arriendo": "en-arriendo",
  "En Venta": "en-venta",
  "En Mantención": "en-mantencion",
}

function migrarEstadoUnidades(unidades: Unidad[]): Unidad[] {
  return unidades.map(u => {
    const legacy = u as Unidad & { estado?: string }
    if (typeof legacy.estado === "string" && (u as { estadoId?: string }).estadoId === undefined) {
      const { estado, ...rest } = legacy
      return { ...rest, estadoId: ESTADO_NOMBRE_A_ID[estado] ?? estado.toLowerCase().replace(/\s+/g, "-") } as Unidad
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
  fondosFI: FONDOS_FI_SEED,
  egresosFI: [],
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
} as const

type ClaveColeccion = keyof typeof ESQUEMAS_COLECCION
type ClaveMaestro = keyof MaestroCollections

function sanitizarColecciones(prev: Partial<CompassData> | undefined | null): Partial<CompassData> | null {
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
      const valor = prev.maestros
        ? (prev.maestros as unknown as Record<string, unknown>)[key]
        : undefined
      const valido =
        valor !== undefined && z.array(MAESTRO_SCHEMAS[key]).safeParse(valor).success
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

function repararDocumentos(result: Partial<CompassData>): Partial<CompassData> {
  let personas = result.personas
  if (Array.isArray(personas)) {
    personas = (personas as Persona[]).map((p) => ({ ...p, rut: repararRut(p.rut) }))
  }
  let configuracion = result.configuracion
  if (configuracion) {
    configuracion = {
      ...configuracion,
      rutCondominio: repararRut(configuracion.rutCondominio),
      rutAdministrador: repararRut(configuracion.rutAdministrador),
    }
  }
  if (personas === result.personas && configuracion === result.configuracion) return result
  return { ...result, ...(personas !== result.personas ? { personas } : {}), ...(configuracion !== result.configuracion ? { configuracion } : {}) }
}

export const useCompassStore = create<CompassStore>()(
  persist(
    (set, get) => ({
      ...seedData(),
      hasHydrated: false,

      // --- TU: Tipos de Unidad ---
      saveTipoUnidad: (tipo) => {
        if (!get().hasHydrated) return { ok: false, error: "El almacenamiento aún se está hidratando. Intenta de nuevo." }
        const validacion = validarConEsquema(TipoUnidadSchema, tipo)
        if (!validacion.ok) return validacion
        set(s => ({ tiposUnidad: upsert(s.tiposUnidad, validacion.data) }))
        return { ok: true }
      },

      toggleActivoTipoUnidad: (id) => {
        if (!get().hasHydrated) return
        set(s => ({
          tiposUnidad: s.tiposUnidad.map(t =>
            t.id === id ? { ...t, activo: !t.activo } : t
          ),
        }))
      },

      removeTipoUnidad: (id) => {
        if (!get().hasHydrated) return { ok: false, error: "El almacenamiento aún se está hidratando. Intenta de nuevo." }
        const linked = get().unidades.filter(u => u.tipoUnidadId === id)
        if (linked.length > 0) {
          return {
            ok: false,
            error: `No se puede eliminar el tipo de unidad: ${linked.length} unidad(es) vinculada(s).`,
          }
        }
        set(s => ({ tiposUnidad: s.tiposUnidad.filter(t => t.id !== id) }))
        return { ok: true }
      },

      // --- EF: Macro Sectores ---
      saveMacroSector: (macro) => {
        if (!get().hasHydrated) return { ok: false, error: "El almacenamiento aún se está hidratando. Intenta de nuevo." }
        const validacion = validarConEsquema(MacroSectorSchema, macro)
        if (!validacion.ok) return validacion
        set(s => ({ macroSectores: upsert(s.macroSectores, validacion.data) }))
        return { ok: true }
      },

      removeMacroSector: (id) => {
        if (!get().hasHydrated) return { ok: false, error: "El almacenamiento aún se está hidratando. Intenta de nuevo." }
        const linked = get().microSectores.filter(m => m.macroSectorId === id)
        if (linked.length > 0) {
          return {
            ok: false,
            error: `No se puede eliminar el macro sector: ${linked.length} sub-sector(es) asociado(s).`,
          }
        }
        set(s => ({ macroSectores: s.macroSectores.filter(m => m.id !== id) }))
        return { ok: true }
      },

      // --- EF: Micro Sectores ---
      saveMicroSector: (micro) => {
        if (!get().hasHydrated) return { ok: false, error: "El almacenamiento aún se está hidratando. Intenta de nuevo." }
        const validacion = validarConEsquema(MicroSectorSchema, micro)
        if (!validacion.ok) return validacion
        set(s => ({ microSectores: upsert(s.microSectores, validacion.data) }))
        return { ok: true }
      },

      removeMicroSector: (id) => {
        if (!get().hasHydrated) return { ok: false, error: "El almacenamiento aún se está hidratando. Intenta de nuevo." }
        const linked = get().unidades.filter(u => u.microSectorId === id)
        if (linked.length > 0) {
          return {
            ok: false,
            error: `No se puede eliminar el sub-sector: ${linked.length} unidad(es) asociada(s).`,
          }
        }
        set(s => ({ microSectores: s.microSectores.filter(m => m.id !== id) }))
        return { ok: true }
      },

      // --- EF: Unidades ---
      saveUnidad: (unidad) => {
        if (!get().hasHydrated) return { ok: false, error: "El almacenamiento aún se está hidratando. Intenta de nuevo." }
        const validacion = validarConEsquema(UnidadSchema, unidad)
        if (!validacion.ok) return validacion
        set(s => ({ unidades: upsert(s.unidades, validacion.data) }))
        return { ok: true }
      },

      removeUnidad: (id) => {
        if (!get().hasHydrated) return { ok: false, error: "El almacenamiento aún se está hidratando. Intenta de nuevo." }
        const linkedVinculos = get().vinculos.filter(v => v.unidadId === id)
        if (linkedVinculos.length > 0) {
          return {
            ok: false,
            error: "No se puede eliminar la unidad: tiene vínculos asociados.",
          }
        }
        set(s => ({ unidades: s.unidades.filter(u => u.id !== id) }))
        return { ok: true }
      },

      // --- MP: Personas ---
      savePersona: (persona) => {
        if (!get().hasHydrated) return { ok: false, error: "El almacenamiento aún se está hidratando. Intenta de nuevo." }
        // AD (D1): foto y firma digitalizada solo por referencia; jamás base64/Blob.
        const esReferenciaValida = (valor?: string): boolean =>
          valor === undefined || (!/^data:/i.test(valor) && !/^blob:/i.test(valor) && valor.length <= 2048)
        if (!esReferenciaValida(persona.fotografiaUrl)) {
          return { ok: false, error: "Media por referencia (D1): la fotografía debe ser una URL, no contenido embebido." }
        }
        const firma = persona.datosGobernanza?.firmaDigital
        if (!esReferenciaValida(firma)) {
          return { ok: false, error: "Media por referencia (D1): la firma digitalizada debe ser una URL, no contenido embebido." }
        }
        const validacion = validarConEsquema(PersonaSchema, persona)
        if (!validacion.ok) return validacion
        // PE: FKs de la ficha laboral contra los maestros legales de MA (RG escritura).
        const dl = validacion.data.datosLaborales
        if (dl) {
          const m = get().maestros
          const fks: [string, string | undefined, { id: string }[]][] = [
            ["afpId", dl.afpId, m.afps],
            ["saludId", dl.saludId, m.previsionesSalud],
            ["asignacionFamiliarId", dl.asignacionFamiliarId, m.asignacionFamiliar],
            ["mutualidadId", dl.mutualidadId, m.mutualesCajas],
            ["bancoId", dl.bancoId, m.bancos],
          ]
          for (const [campo, valor, coleccion] of fks) {
            if (valor && !coleccion.some(x => x.id === valor)) {
              return { ok: false, error: `${campo} no existe en el maestro correspondiente.` }
            }
          }
        }
        const anterior = get().personas.find(p => p.id === persona.id)
        set(s => ({ personas: upsert(s.personas, validacion.data) }))
        // AD: carga/reemplazo de firma digitalizada de directiva queda auditado.
        const firmaNueva = validacion.data.datosGobernanza?.firmaDigital
        if (anterior && firmaNueva && anterior.datosGobernanza?.firmaDigital !== firmaNueva) {
          registrarEvento(set, "AD_DIRECTIVA_SIGN_UPLOAD", persona.id, `Firma digitalizada actualizada para ${validacion.data.nombres} ${validacion.data.apellidos}.`, "AD")
        }
        // PE: guardado de la ficha integral queda auditado solo si cambia.
        if (
          dl &&
          JSON.stringify(anterior?.datosLaborales ?? null) !== JSON.stringify(dl) &&
          Object.keys(dl).length > 4
        ) {
          registrarEvento(set, "PE_FICHA_SAVED", persona.id, `Ficha integral del trabajador ${validacion.data.nombres} ${validacion.data.apellidos} guardada (${dl.cargo}).`, "PE")
        }
        return { ok: true }
      },

      removePersona: (id) => {
        if (!get().hasHydrated) return { ok: false, error: "El almacenamiento aún se está hidratando. Intenta de nuevo." }
        const linked = get().vinculos.filter(v => v.personaId === id)
        if (linked.length > 0) {
          return {
            ok: false,
            error: `No se puede eliminar la persona: ${linked.length} vínculo(s) de unidad asociado(s).`,
          }
        }
        set(s => ({ personas: s.personas.filter(p => p.id !== id) }))
        return { ok: true }
      },

      // --- VU: Vínculos ---
      saveVinculo: (vinculo) => {
        if (!get().hasHydrated) return { ok: false, error: "El almacenamiento aún se está hidratando. Intenta de nuevo." }
        const validacion = validarConEsquema(VinculoUnidadSchema, vinculo)
        if (!validacion.ok) return validacion
        const persona = get().personas.find(p => p.id === vinculo.personaId)
        if (!persona) return { ok: false, error: "La persona no existe en el Maestro de Personas." }
        if (persona.estadoCuenta === "inactiva") {
          return { ok: false, error: "No se puede vincular: la persona está marcada como inactiva en el Maestro de Personas." }
        }
        // TST-001 (D6: bloqueo duro): una cuenta bloqueada no puede recibir vínculos, sin excepciones.
        if (persona.estadoCuenta === "bloqueada") {
          return { ok: false, error: "No se puede vincular: la persona está marcada como bloqueada en el Maestro de Personas." }
        }
        const duplicado = get().vinculos.find(v =>
          v.personaId === vinculo.personaId &&
          v.unidadId === vinculo.unidadId &&
          !v.fechaFin &&
          v.id !== vinculo.id
        )
        if (duplicado) {
          return { ok: false, error: "Esta persona ya posee un vínculo activo con esta unidad." }
        }

        // Cierre automático de tramo anterior (solo propietario/arrendatario).
        // Se calcula sobre un snapshot en memoria para poder validar contra el estado post-cierre sin mutar aún el store.
        let working = [...get().vinculos]
        let cerrado: { vinculo: VinculoUnidad; fechaFin: string } | null = null
        const cerrarAnterior = vinculo.cerrarAnterior !== false
        if (cerrarAnterior && !vinculo.fechaFin && (vinculo.rol === "propietario" || vinculo.rol === "arrendatario")) {
          const anterior = working.find(v =>
            v.unidadId === vinculo.unidadId &&
            v.rol === vinculo.rol &&
            !v.fechaFin &&
            v.id !== vinculo.id
          )
          if (anterior) {
            const fechaCierre = new Date(vinculo.fechaInicio)
            fechaCierre.setDate(fechaCierre.getDate() - 1)
            const fechaFinStr = fechaCierre.toISOString().slice(0, 10)
            working = working.map(v =>
              v.id === anterior.id ? { ...v, fechaFin: fechaFinStr } : v
            )
            cerrado = { vinculo: anterior, fechaFin: fechaFinStr }
          }
        }

        const inicio = vinculo.fechaInicio
        const fin = vinculo.fechaFin ?? "9999-12-31"

        // Exclusividad de titularidad/arriendo: un solo tramo vigente por unidad (cruza personas)
        if (vinculo.rol === "propietario" || vinculo.rol === "arrendatario") {
          const conflicto = working.find(v =>
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
        const autosolape = working.find(v =>
          v.personaId === vinculo.personaId &&
          v.unidadId === vinculo.unidadId &&
          v.rol === vinculo.rol &&
          v.id !== vinculo.id &&
          inicio <= (v.fechaFin ?? "9999-12-31") &&
          v.fechaInicio <= fin
        )
        if (autosolape) {
          return { ok: false, error: "Esta persona ya registra un tramo del mismo rol que se solapa con las fechas indicadas en esta unidad." }
        }

        set(() => ({ vinculos: upsert(working, vinculo) }))

        const nombreAnterior = cerrado ? nombrePersona(get, cerrado.vinculo.personaId) : ""
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
            registrarEvento(set, "VU_CHANGE_OWNER", vinculo.unidadId, `${nombreNuevo} reemplaza a ${nombreAnterior} como propietario.`)
          } else if (vinculo.rol === "arrendatario") {
            registrarEvento(set, "VU_NEW_TENANT", vinculo.unidadId, `${nombreNuevo} reemplaza a ${nombreAnterior} como arrendatario.`)
          }
        }

        // PI: sincroniza la vitrina según el estado inmobiliario del propietario vigente.
        get().syncPublicacionesDesdeVinculos(vinculo.unidadId)

        return { ok: true }
      },

      removeVinculo: (id) => {
        if (!get().hasHydrated) return { ok: false, error: "El almacenamiento aún se está hidratando. Intenta de nuevo." }
        const objetivo = get().vinculos.find(v => v.id === id)
        set(s => ({ vinculos: s.vinculos.filter(v => v.id !== id) }))
        if (objetivo) {
          const unidad = get().unidades.find(u => u.id === objetivo.unidadId)
          const ref = unidad ? `${unidad.etiqueta} ${unidad.numero}` : objetivo.unidadId
          if (!objetivo.fechaFin) {
            registrarEvento(set, "VU_ASSIGN_RELEASED", id, `Vínculo eliminado (${objetivo.rol}) sobre ${ref}.`)
          } else {
            registrarEvento(set, "VU_DELETE", id, `Tramo histórico (${objetivo.rol}) eliminado de ${ref}.`)
          }
          // PI: al retirar un vínculo puede desaparecer la oferta vigente.
          get().syncPublicacionesDesdeVinculos(objetivo.unidadId)
        }
        return { ok: true }
      },

      // --- MA: Maestros Administrativos ---
      saveMaestro: (key, item) => {
        if (!get().hasHydrated) return { ok: false, error: "El almacenamiento aún se está hidratando. Intenta de nuevo." }
        const validacion = validarMaestro(key, item)
        if (!validacion.ok) return validacion
        set(s => ({
          maestros: {
            ...s.maestros,
            [key]: upsert(s.maestros[key] as { id: string }[], item),
          },
        }))
        return { ok: true }
      },

      removeMaestro: (key, id) => {
        if (!get().hasHydrated) return { ok: false, error: "El almacenamiento aún se está hidratando. Intenta de nuevo." }
        // Validación de integridad referencial para maestros consumidos por unidades/vínculos
        if (key === "estadosOcupacion") {
          const enUso = get().unidades.some(u => u.estadoId === id)
          if (enUso) return { ok: false, error: `No se puede eliminar el estado de ocupación: ${get().unidades.filter(u => u.estadoId === id).length} unidad(es) lo usan.` }
        }
        if (key === "categoriasUnidad") {
          const cat = get().maestros.categoriasUnidad.find(c => c.id === id)
          const nombre = cat?.nombre
          if (nombre) {
            const enUso = get().tiposUnidad.some(t => t.categoria === nombre) || get().unidades.some(u => u.etiqueta === nombre)
            if (enUso) return { ok: false, error: `No se puede eliminar la categoría de unidad "${nombre}": está en uso por tipos o unidades.` }
          }
        }
        if (key === "categoriasMacro") {
          const cat = get().maestros.categoriasMacro.find(c => c.id === id)
          // Validación laxa: si algún macroSector usa la etiqueta de esta categoría como nombre de etiqueta, bloquear
          if (cat && get().macroSectores.some(m => m.etiqueta === cat.nombre)) {
            return { ok: false, error: `No se puede eliminar la categoría macro "${cat.nombre}": hay sectores que la usan como etiqueta.` }
          }
        }
        if (key === "categoriasMicro") {
          const cat = get().maestros.categoriasMicro.find(c => c.id === id)
          if (cat && get().microSectores.some(m => m.etiqueta === cat.nombre)) {
            return { ok: false, error: `No se puede eliminar la categoría micro "${cat.nombre}": hay sub-sectores que la usan.` }
          }
        }
        if (key === "estadosInmobiliarios") {
          const enUso = get().vinculos.some(v => v.estadoOcupacionPropiedad === id)
          if (enUso) return { ok: false, error: `No se puede eliminar el estado inmobiliario: ${get().vinculos.filter(v => v.estadoOcupacionPropiedad === id).length} vínculo(s) lo usan.` }
        }
        if (key === "condicionesEspeciales") {
          const enUso = get().personas.some(p => (p.condicionesEspecialesIds ?? []).includes(id))
          if (enUso) return { ok: false, error: "No se puede eliminar la condición especial: hay personas que la tienen asignada." }
        }
        // PE: maestros legales referenciados por fichas de trabajadores.
        if (["afps", "previsionesSalud", "asignacionFamiliar", "mutualesCajas", "bancos"].includes(key)) {
          const campo = { afps: "afpId", previsionesSalud: "saludId", asignacionFamiliar: "asignacionFamiliarId", mutualesCajas: "mutualidadId", bancos: "bancoId" }[key as "afps" | "previsionesSalud" | "asignacionFamiliar" | "mutualesCajas" | "bancos"]!
          const enUso = get().personas.filter(p => (p.datosLaborales as unknown as Record<string, string | undefined> | undefined)?.[campo] === id)
          if (enUso.length > 0) {
            return { ok: false, error: `No se puede eliminar el registro del maestro "${key}": ${enUso.length} ficha(s) de trabajador lo referencian.` }
          }
        }
        // PE: maestros operativos de la bitácora.
        if (key === "jornadas") {
          const enUso =
            get().bitacoraVisitasPE.filter(v => v.jornadaId === id).length +
            get().ingresosContratistasPE.filter(i => i.jornadaId === id).length +
            get().cierresTurnoPE.filter(c => c.jornadaReportadaId === id).length
          if (enUso > 0) return { ok: false, error: `No se puede eliminar la jornada: ${enUso} registro(s) operativo(s) la usan.` }
        }
        if (key === "couriers") {
          const enUso = get().encomiendasPE.filter(e => e.courierId === id).length
          if (enUso > 0) return { ok: false, error: `No se puede eliminar el courier: ${enUso} encomienda(s) lo usan.` }
        }
        if (key === "contratistas") {
          const enUso = get().ingresosContratistasPE.filter(i => i.contratistaId === id).length
          if (enUso > 0) return { ok: false, error: `No se puede eliminar el contratista: ${enUso} ingreso(s) registrados lo usan.` }
        }
        set(s => ({
          maestros: {
            ...s.maestros,
            [key]: (s.maestros[key] as { id: string }[]).filter(i => i.id !== id),
          },
        }))
        return { ok: true }
      },

      // --- CF: Configuración Global ---
      saveConfiguracion: (config) => {
        if (!get().hasHydrated) return { ok: false, error: "El almacenamiento aún se está hidratando. Intenta de nuevo." }
        const validacion = validarConEsquema(ConfiguracionGlobalSchema, config)
        if (!validacion.ok) return validacion
        const anterior = get().configuracion
        set(() => ({ configuracion: validacion.data }))
        // PL: cambios de parámetros legales de remuneraciones quedan auditados.
        const CAMPOS_LEGALES = ["ufMensual", "ingresoMinimoMensual", "topeGratificacionLegal", "tasaSIS"] as const
        for (const campo of CAMPOS_LEGALES) {
          const viejo = anterior?.[campo]
          const nuevo = validacion.data[campo]
          if (JSON.stringify(viejo) !== JSON.stringify(nuevo)) {
            registrarEvento(
              set,
              "CF_UPDATE_PARAM",
              campo,
              `Parámetro legal ${campo} actualizado (${JSON.stringify(viejo ?? null)} → ${JSON.stringify(nuevo ?? null)}).`,
              "CF"
            )
          }
        }
        return { ok: true }
      },

      // --- PI: Portal Inmobiliario ---
      savePublicacionPortal: (publicacion) => {
        if (!get().hasHydrated) return { ok: false, error: "El almacenamiento aún se está hidratando. Intenta de nuevo." }
        const validacion = validarConEsquema(PublicacionPortalSchema, publicacion)
        if (!validacion.ok) return validacion
        const unidad = get().unidades.find(u => u.id === validacion.data.unidadId)
        if (!unidad) {
          return { ok: false, error: "No se puede guardar la publicación: la unidad no existe en el inventario." }
        }
        const existente = get().publicacionesPortal.find(p => p.id === validacion.data.id)
        set(s => ({ publicacionesPortal: upsert(s.publicacionesPortal, validacion.data) }))

        // Eventos AM según transición de visibilidad en la vitrina.
        const ref = refUnidad(get, validacion.data.unidadId)
        if ((!existente || !existente.activa) && validacion.data.activa) {
          registrarEvento(set, "PI_PROPERTY_LISTED", validacion.data.id, `Publicación ${validacion.data.operacion} activada para ${ref}.`, "PI")
        }
        if (existente?.activa && !validacion.data.activa) {
          registrarEvento(set, "PI_PROPERTY_UNLISTED", validacion.data.id, `Publicación retirada de la vitrina (${ref}).`, "PI")
        }
        return { ok: true }
      },

      removePublicacionPortal: (id) => {
        if (!get().hasHydrated) return { ok: false, error: "El almacenamiento aún se está hidratando. Intenta de nuevo." }
        const leads = get().leadsPortal.filter(l => l.publicacionId === id)
        if (leads.length > 0) {
          return {
            ok: false,
            error: `No se puede eliminar la publicación: tiene ${leads.length} lead(s) asociado(s).`,
          }
        }
        set(s => ({ publicacionesPortal: s.publicacionesPortal.filter(p => p.id !== id) }))
        return { ok: true }
      },

      saveLeadPortal: (lead) => {
        if (!get().hasHydrated) return { ok: false, error: "El almacenamiento aún se está hidratando. Intenta de nuevo." }
        const validacion = validarConEsquema(LeadPortalSchema, lead)
        if (!validacion.ok) return validacion
        const publicacion = get().publicacionesPortal.find(p => p.id === validacion.data.publicacionId)
        if (!publicacion) {
          return { ok: false, error: "No se puede registrar el interés: la publicación no existe." }
        }
        if (!publicacion.activa) {
          return { ok: false, error: "No se puede registrar el interés: la publicación no está activa." }
        }
        // Idempotencia bulk: solo el alta nueva genera notificación y evento.
        const esNueva = !get().leadsPortal.some(l => l.id === validacion.data.id)
        set(s => ({ leadsPortal: upsert(s.leadsPortal, validacion.data) }))
        if (!esNueva) return { ok: true }

        // Contacto seguro (D3): notifica al propietario vigente sin exponer sus datos.
        const propietario = get().vinculos.find(v =>
          v.unidadId === publicacion.unidadId && v.rol === "propietario" && !v.fechaFin
        )
        get().notify({
          destinatarioRol: "propietario",
          destinatarioPersonaId: propietario?.personaId,
          asunto: "Nuevo interesado en tu propiedad",
          cuerpo: `${validacion.data.nombreContacto} mostró interés en ${refUnidad(get, publicacion.unidadId)} (${publicacion.operacion}). Contacto: ${validacion.data.contacto}`,
          moduloOrigen: "PI",
        })
        registrarEvento(set, "PI_LEAD_CONTACT", validacion.data.id, `Lead de ${validacion.data.nombreContacto} sobre ${refUnidad(get, publicacion.unidadId)}.`, "PI")
        return { ok: true }
      },

      syncPublicacionesDesdeVinculos: (unidadId) => {
        const s = get()
        const claveEstado = (estadoId?: string): string => {
          if (!estadoId) return ""
          const e = s.maestros.estadosInmobiliarios.find(x => x.id === estadoId)
          if (!e) return ""
          return `${e.id} ${e.nombre}`.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        }
        const esOferta = (clave: string): boolean => clave.includes("arriendo") || clave.includes("venta")

        const vigente = s.vinculos.find(
          v => v.unidadId === unidadId && v.rol === "propietario" && !v.fechaFin && esOferta(claveEstado(v.estadoOcupacionPropiedad))
        )
        const existente = s.publicacionesPortal.find(p => p.unidadId === unidadId)

        if (vigente) {
          const operacion: OperacionPortal = claveEstado(vigente.estadoOcupacionPropiedad).includes("venta") ? "venta" : "arriendo"
          if (!existente) {
            const nueva: PublicacionPortal = {
              id: `pub-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
              unidadId,
              operacion,
              precio: 0,
              imagenes: [],
              activa: true,
              fechaPublicacion: new Date().toISOString().slice(0, 10),
            }
            set(st => ({ publicacionesPortal: upsert(st.publicacionesPortal, nueva) }))
            registrarEvento(set, "PI_PROPERTY_LISTED", nueva.id, `Trigger inmobiliario: ${refUnidad(get, unidadId)} publicada como ${operacion}.`, "PI")
          } else {
            const cambios: Partial<PublicacionPortal> = {}
            if (!existente.activa) cambios.activa = true
            if (existente.operacion !== operacion) cambios.operacion = operacion
            if (Object.keys(cambios).length > 0) {
              set(st => ({
                publicacionesPortal: st.publicacionesPortal.map(p =>
                  p.id === existente.id ? { ...p, ...cambios } : p
                ),
              }))
              if (cambios.activa) {
                registrarEvento(set, "PI_PROPERTY_LISTED", existente.id, `Trigger inmobiliario: ${refUnidad(get, unidadId)} vuelve a la vitrina como ${operacion}.`, "PI")
              }
            }
          }
        } else if (existente?.activa) {
          set(st => ({
            publicacionesPortal: st.publicacionesPortal.map(p =>
              p.id === existente.id ? { ...p, activa: false } : p
            ),
          }))
          registrarEvento(set, "PI_PROPERTY_UNLISTED", existente.id, `Trigger inmobiliario: ${refUnidad(get, unidadId)} retirada de la vitrina.`, "PI")
        }
      },

      // --- Notificaciones simuladas (D3) ---
      notify: (notificacion) => {
        if (!get().hasHydrated) return
        // AD: el propietario puede silenciar las alertas automáticas hacia los
        // residentes de su unidad ("Gestión de Alertas Residentes"). Los actos
        // formales de gobernanza (GD) no pasan por este gate.
        if (notificacion.destinatarioRol === "residente" && notificacion.unidadId) {
          const control = get().controlesPropiedades.find(c => c.unidadId === notificacion.unidadId)
          if (control && !control.alertasResidentesActivas) return
        }
        const completa: Notificacion = {
          id: `notif-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          destinatarioRol: notificacion.destinatarioRol,
          destinatarioPersonaId: notificacion.destinatarioPersonaId,
          asunto: notificacion.asunto,
          cuerpo: notificacion.cuerpo,
          canal: notificacion.canal ?? "email_simulado",
          moduloOrigen: notificacion.moduloOrigen,
          fecha: new Date().toISOString().slice(0, 10),
          leida: false,
        }
        const validacion = validarConEsquema(NotificacionSchema, completa)
        if (!validacion.ok) return
        set(s => ({
          notificaciones: [...s.notificaciones.slice(-(MAX_EVENTOS - 1)), validacion.data],
        }))
      },

      marcarNotificacionLeida: (id) => {
        if (!get().hasHydrated) return
        set(s => ({
          notificaciones: s.notificaciones.map(n => (n.id === id ? { ...n, leida: true } : n)),
        }))
      },

      // --- AD: Gestión Administrativa ---
      saveControlPropiedad: (control) => {
        if (!get().hasHydrated) return { ok: false, error: "El almacenamiento aún se está hidratando. Intenta de nuevo." }
        const validacion = validarConEsquema(ControlPropiedadSchema, control)
        if (!validacion.ok) return validacion
        if (!get().unidades.some(u => u.id === validacion.data.unidadId)) {
          return { ok: false, error: "No se puede guardar el control: la unidad no existe en el inventario." }
        }
        // Unicidad: un solo registro de controles por unidad.
        const duplicado = get().controlesPropiedades.find(
          c => c.unidadId === validacion.data.unidadId && c.id !== validacion.data.id
        )
        if (duplicado) {
          return { ok: false, error: `La unidad ya tiene controles registrados (${duplicado.id}).` }
        }
        const anterior = get().controlesPropiedades.find(c => c.id === validacion.data.id)
        set(s => ({ controlesPropiedades: upsert(s.controlesPropiedades, validacion.data) }))

        const ref = refUnidad(get, validacion.data.unidadId)
        if (!anterior) {
          registrarEvento(set, "AD_OWNER_CONFIG_CHANGE", validacion.data.id, `Controles de privacidad creados para ${ref}.`, "AD")
        } else {
          const cambios: string[] = []
          if (anterior.residenteVeMorosidad !== validacion.data.residenteVeMorosidad) cambios.push(`morosidad=${validacion.data.residenteVeMorosidad ? "visible" : "oculta"}`)
          if (anterior.residenteVeActas !== validacion.data.residenteVeActas) cambios.push(`actas=${validacion.data.residenteVeActas ? "visibles" : "ocultas"}`)
          if (anterior.alertasResidentesActivas !== validacion.data.alertasResidentesActivas) cambios.push(`alertas=${validacion.data.alertasResidentesActivas ? "activas" : "silenciadas"}`)
          if (cambios.length > 0) {
            registrarEvento(set, "AD_OWNER_CONFIG_CHANGE", validacion.data.id, `Controles de ${ref} actualizados: ${cambios.join("; ")}.`, "AD")
          }
        }
        return { ok: true }
      },

      removeControlPropiedad: (id) => {
        if (!get().hasHydrated) return { ok: false, error: "El almacenamiento aún se está hidratando. Intenta de nuevo." }
        set(s => ({ controlesPropiedades: s.controlesPropiedades.filter(c => c.id !== id) }))
        return { ok: true }
      },

      // --- GD: Gestión de Directiva ---
      saveActaGD: (acta) => {
        if (!get().hasHydrated) return { ok: false, error: "El almacenamiento aún se está hidratando. Intenta de nuevo." }
        const validacion = validarConEsquema(ActaGDSchema, acta)
        if (!validacion.ok) return validacion
        // Integridad referencial: presentes/ausentes deben ser miembros de directiva vigentes.
        for (const idAsistente of [...validacion.data.presentes, ...validacion.data.ausentes]) {
          const persona = get().personas.find(p => p.id === idAsistente)
          if (!persona) {
            return { ok: false, error: `No se puede guardar el acta: el asistente "${idAsistente}" no existe en el Maestro de Personas.` }
          }
          if (!persona.datosGobernanza) {
            return { ok: false, error: `No se puede guardar el acta: ${persona.nombres} ${persona.apellidos} no es miembro de la directiva (sin extensión de gobernanza).` }
          }
        }
        const esNueva = !get().actasGD.some(a => a.id === validacion.data.id)
        set(s => ({ actasGD: upsert(s.actasGD, validacion.data) }))
        if (esNueva) {
          registrarEvento(set, "GD_ACTA_CREATED", validacion.data.id, `Acta de reunión del ${validacion.data.fecha} registrada (${validacion.data.lugar}).`, "GD")
          for (const presenteId of validacion.data.presentes) {
            registrarEvento(set, "GD_ASISTENCIA_REG", presenteId, `Asistencia registrada (${nombrePersona(get, presenteId)}) en acta ${validacion.data.id}.`, "GD")
          }
        }
        return { ok: true }
      },

      removeActaGD: (id) => {
        if (!get().hasHydrated) return { ok: false, error: "El almacenamiento aún se está hidratando. Intenta de nuevo." }
        set(s => ({ actasGD: s.actasGD.filter(a => a.id !== id) }))
        return { ok: true }
      },

      aprobarActaGD: (id, personaId) => {
        if (!get().hasHydrated) return { ok: false, error: "El almacenamiento aún se está hidratando. Intenta de nuevo." }
        const acta = get().actasGD.find(a => a.id === id)
        if (!acta) return { ok: false, error: "No se puede aprobar: el acta no existe." }
        if (acta.estado === "publicada") return { ok: false, error: "El acta ya está publicada." }
        const firmante = get().personas.find(p => p.id === personaId)
        if (!firmante?.datosGobernanza || firmante.estadoCuenta !== "activa") {
          return { ok: false, error: "Solo un miembro vigente de la directiva puede aprobar el acta." }
        }
        if (acta.aprobaciones.includes(personaId)) {
          return { ok: false, error: "Esta directiva ya aprobó el acta." }
        }
        const aprobaciones = [...acta.aprobaciones, personaId]
        // Quórum 100% de la directiva vigente (personas activas con extensión de gobernanza).
        const directivaVigente = get().personas.filter(p => p.datosGobernanza && p.estadoCuenta === "activa").map(p => p.id)
        const quorumCompleto = directivaVigente.every(idMiembro => aprobaciones.includes(idMiembro))
        if (quorumCompleto) {
          const publicada: ActaGD = {
            ...acta,
            aprobaciones,
            estado: "publicada",
            fechaPublicacion: new Date().toISOString().slice(0, 10),
            avisoCVReferencia: "pendiente",
          }
          set(s => ({ actasGD: upsert(s.actasGD, publicada) }))

          registrarEvento(set, "GD_ACTA_APPROVED", id, `Acta ${id} aprobada por ${nombrePersona(get, personaId)} y PUBLICADA (quórum 100%).`, "GD")

          // Publicación automática: notificación formal a todos los propietarios
          // (acto de gobernanza; no pasa por el gate de alertas operativas).
          const propietarios = new Set(
            get().vinculos.filter(v => v.rol === "propietario" && !v.fechaFin).map(v => v.personaId)
          )
          for (const idPropietario of propietarios) {
            get().notify({
              destinatarioRol: "propietario",
              destinatarioPersonaId: idPropietario,
              asunto: `Nueva acta publicada (${publicada.fecha})`,
              cuerpo: `Ya está disponible el acta de la reunión del ${publicada.fecha} en ${publicada.lugar}. Revisa el repositorio de actas.`,
              moduloOrigen: "GD",
            })
          }
        } else {
          set(s => ({
            actasGD: s.actasGD.map(a => (a.id === id ? { ...a, aprobaciones } : a)),
          }))
          registrarEvento(set, "GD_ACTA_APPROVED", id, `${nombrePersona(get, personaId)} aprobó el acta ${id}. Pendientes: ${directivaVigente.filter(x => !aprobaciones.includes(x)).length}.`, "GD")
        }
        return { ok: true }
      },

      // --- CO: Comunicación con Vecinos ---
      savePlantillaCO: (plantilla) => {
        if (!get().hasHydrated) return { ok: false, error: "El almacenamiento aún se está hidratando. Intenta de nuevo." }
        const validacion = validarConEsquema(PlantillaCOSchema, plantilla)
        if (!validacion.ok) return validacion
        set(s => ({ plantillasCO: upsert(s.plantillasCO, validacion.data) }))
        return { ok: true }
      },

      removePlantillaCO: (id) => {
        if (!get().hasHydrated) return { ok: false, error: "El almacenamiento aún se está hidratando. Intenta de nuevo." }
        const enUso = get().enviosCO.filter(e => e.plantillaId === id)
        if (enUso.length > 0) {
          return { ok: false, error: `No se puede eliminar la plantilla: ${enUso.length} envío(s) la utilizan.` }
        }
        set(s => ({ plantillasCO: s.plantillasCO.filter(p => p.id !== id) }))
        return { ok: true }
      },

      saveEnvioCO: (envio) => {
        if (!get().hasHydrated) return { ok: false, error: "El almacenamiento aún se está hidratando. Intenta de nuevo." }
        const validacion = validarConEsquema(EnvioCOSchema, envio)
        if (!validacion.ok) return validacion
        if (validacion.data.plantillaId && !get().plantillasCO.some(p => p.id === validacion.data!.plantillaId)) {
          return { ok: false, error: "No se puede enviar: la plantilla indicada no existe en el Maestro de Mensajes." }
        }
        for (const d of validacion.data.destinatarios) {
          if (!get().personas.some(p => p.id === d.personaId)) {
            return { ok: false, error: `No se puede enviar: el destinatario "${d.personaId}" no existe en el Maestro de Personas.` }
          }
          if (d.unidadId && !get().unidades.some(u => u.id === d.unidadId)) {
            return { ok: false, error: `No se puede enviar: la unidad "${d.unidadId}" del destinatario no existe.` }
          }
        }
        // Idempotencia bulk: solo el alta nueva dispara notificaciones y evento.
        const esNuevo = !get().enviosCO.some(e => e.id === validacion.data.id)
        set(s => ({ enviosCO: upsert(s.enviosCO, validacion.data) }))
        if (!esNuevo) return { ok: true }

        const nombreDe = (personaId: string): string => {
          const p = get().personas.find(x => x.id === personaId)
          return p ? `${p.nombres} ${p.apellidos}` : ""
        }
        for (const d of validacion.data.destinatarios) {
          get().notify({
            destinatarioRol: rolDestinatarioCO(get, d.personaId),
            destinatarioPersonaId: d.personaId,
            asunto: resolverVariablesCO(get, validacion.data.asunto, nombreDe(d.personaId)),
            cuerpo: resolverVariablesCO(get, validacion.data.cuerpo, nombreDe(d.personaId)),
            moduloOrigen: "CO",
            ...(d.unidadId ? { unidadId: d.unidadId } : {}),
          })
        }
        registrarEvento(set, "CO_SEND_MASSIVE", validacion.data.id, `Envío masivo "${validacion.data.asunto}" a ${validacion.data.destinatarios.length} destinatario(s).`, "CO")
        return { ok: true }
      },

      registrarLecturaEnvioCO: (id, personaId) => {
        if (!get().hasHydrated) return { ok: false, error: "El almacenamiento aún se está hidratando. Intenta de nuevo." }
        const envio = get().enviosCO.find(e => e.id === id)
        if (!envio) return { ok: false, error: "No se puede confirmar lectura: el envío no existe." }
        if (envio.lecturas.includes(personaId)) return { ok: true }
        set(s => ({
          enviosCO: s.enviosCO.map(e =>
            e.id === id ? { ...e, lecturas: [...e.lecturas, personaId] } : e
          ),
        }))
        return { ok: true }
      },

      saveMensajeBuzonCO: (mensaje) => {
        if (!get().hasHydrated) return { ok: false, error: "El almacenamiento aún se está hidratando. Intenta de nuevo." }
        const esNuevo = !get().mensajesBuzonCO.some(m => m.id === mensaje.id)
        // Folio BUZ-#### único por construcción (se ignora el entrante en alta);
        // estado inicial forzado a Recibido.
        let candidato: MensajeBuzonCO = mensaje
        if (esNuevo) {
          const numeros = get().mensajesBuzonCO
            .map(m => Number.parseInt(m.folio.replace(/^BUZ-/, ""), 10))
            .filter(n => Number.isFinite(n))
          const siguiente = (numeros.length > 0 ? Math.max(...numeros) : 0) + 1
          candidato = { ...mensaje, folio: `BUZ-${String(siguiente).padStart(4, "0")}` }
        }
        const validacion = validarConEsquema(MensajeBuzonCOSchema, candidato)
        if (!validacion.ok) return validacion
        if (validacion.data.reportantePersonaId && !get().personas.some(p => p.id === validacion.data!.reportantePersonaId)) {
          return { ok: false, error: "No se puede registrar: el reportante no existe en el Maestro de Personas." }
        }
        let registro = validacion.data
        if (esNuevo) {
          registro = {
            ...registro,
            estado: "recibido",
            respuestas: [],
          }
        }
        set(s => ({ mensajesBuzonCO: upsert(s.mensajesBuzonCO, registro) }))
        if (esNuevo) {
          registrarEvento(
            set,
            "CO_TICKET_CREATED",
            registro.id,
            `Ticket ${registro.folio} (${registro.clasificacion}) ingresado por ${registro.reportanteNombre}: ${registro.asunto}.`,
            "CO"
          )
        }
        return { ok: true }
      },

      responderMensajeBuzonCO: (id, respuesta) => {
        if (!get().hasHydrated) return { ok: false, error: "El almacenamiento aún se está hidratando. Intenta de nuevo." }
        const mensaje = get().mensajesBuzonCO.find(m => m.id === id)
        if (!mensaje) return { ok: false, error: "No se puede responder: el ticket del buzón no existe." }
        if (respuesta.texto.trim().length === 0) return { ok: false, error: "La respuesta no puede estar vacía." }
        const nueva: MensajeBuzonCO = {
          ...mensaje,
          estado: mensaje.estado === "recibido" ? "en_gestion" : mensaje.estado,
          respuestas: [
            ...mensaje.respuestas,
            {
              id: `resp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
              autor: respuesta.autor,
              texto: respuesta.texto,
              compromisos: respuesta.compromisos?.trim() || undefined,
              fecha: new Date().toISOString().slice(0, 10),
            },
          ],
        }
        set(s => ({ mensajesBuzonCO: upsert(s.mensajesBuzonCO, nueva) }))
        registrarEvento(
          set,
          "CO_TICKET_RESPONDIDO",
          id,
          `Respuesta de administración al ticket ${nueva.folio}${mensaje.estado === "recibido" ? " (Recibido → En Gestión)" : ""}.`,
          "CO"
        )
        if (mensaje.estado === "recibido" && nueva.estado !== mensaje.estado) {
          registrarEvento(set, "CO_TICKET_ESTADO", id, `Ticket ${nueva.folio}: Recibido → En Gestión.`, "CO")
        }
        return { ok: true }
      },

      cambiarEstadoBuzonCO: (id, estado) => {
        if (!get().hasHydrated) return { ok: false, error: "El almacenamiento aún se está hidratando. Intenta de nuevo." }
        const mensaje = get().mensajesBuzonCO.find(m => m.id === id)
        if (!mensaje) return { ok: false, error: "No se puede actualizar: el ticket del buzón no existe." }
        if (mensaje.estado === estado) return { ok: true }
        const TRANSICIONES: Record<string, EstadoBuzonCO[]> = {
          recibido: ["en_gestion"],
          en_gestion: ["resuelto", "cerrado"],
          resuelto: ["cerrado"],
          cerrado: [],
        }
        if (!TRANSICIONES[mensaje.estado]?.includes(estado)) {
          return { ok: false, error: `Transición inválida: un ticket ${mensaje.estado} no puede pasar a ${estado}.` }
        }
        set(s => ({
          mensajesBuzonCO: s.mensajesBuzonCO.map(m => (m.id === id ? { ...m, estado } : m)),
        }))
        registrarEvento(set, "CO_TICKET_ESTADO", id, `Ticket ${mensaje.folio}: ${mensaje.estado} → ${estado}.`, "CO")
        if (estado === "resuelto" && mensaje.reportantePersonaId) {
          get().notify({
            destinatarioRol: rolDestinatarioCO(get, mensaje.reportantePersonaId),
            destinatarioPersonaId: mensaje.reportantePersonaId,
            asunto: `Tu ticket ${mensaje.folio} fue resuelto`,
            cuerpo: `La administración resolvió tu ${mensaje.clasificacion} "${mensaje.asunto}". Gracias por ayudarnos a mejorar.`,
            moduloOrigen: "CO",
            ...(mensaje.unidadId ? { unidadId: mensaje.unidadId } : {}),
          })
        }
        return { ok: true }
      },

      removeMensajeBuzonCO: (id) => {
        if (!get().hasHydrated) return { ok: false, error: "El almacenamiento aún se está hidratando. Intenta de nuevo." }
        set(s => ({ mensajesBuzonCO: s.mensajesBuzonCO.filter(m => m.id !== id) }))
        return { ok: true }
      },

      saveDocumentoCO: (documento) => {
        if (!get().hasHydrated) return { ok: false, error: "El almacenamiento aún se está hidratando. Intenta de nuevo." }
        const validacion = validarConEsquema(DocumentoCOSchema, documento)
        if (!validacion.ok) return validacion
        set(s => ({ documentosCO: upsert(s.documentosCO, validacion.data) }))
        return { ok: true }
      },

      removeDocumentoCO: (id) => {
        if (!get().hasHydrated) return { ok: false, error: "El almacenamiento aún se está hidratando. Intenta de nuevo." }
        set(s => ({ documentosCO: s.documentosCO.filter(d => d.id !== id) }))
        return { ok: true }
      },

      registrarDescargaDocCO: (id) => {
        if (!get().hasHydrated) return { ok: false, error: "El almacenamiento aún se está hidratando. Intenta de nuevo." }
        const doc = get().documentosCO.find(d => d.id === id)
        if (!doc) return { ok: false, error: "No se puede registrar la descarga: el documento no existe." }
        registrarEvento(set, "CO_DOC_DOWNLOAD", id, `Descarga registrada: ${doc.nombre} (${doc.categoria}).`, "CO")
        return { ok: true }
      },

      // --- GE: Gestión de Solicitudes ---
      saveSolicitudGE: (solicitud) => {
        if (!get().hasHydrated) return { ok: false, error: "El almacenamiento aún se está hidratando. Intenta de nuevo." }
        const esNueva = !get().solicitudesGE.some(s => s.id === solicitud.id)
        let candidato: SolicitudGE = solicitud
        if (esNueva) {
          const numeros = get().solicitudesGE
            .map(s => Number.parseInt(s.folio.replace(/^GE-/, ""), 10))
            .filter(n => Number.isFinite(n))
          const siguiente = (numeros.length > 0 ? Math.max(...numeros) : 0) + 1
          candidato = { ...solicitud, folio: `GE-${String(siguiente).padStart(4, "0")}` }
        }
        const validacion = validarConEsquema(SolicitudGESchema, candidato)
        if (!validacion.ok) return validacion
        const registro = validacion.data

        if (registro.solicitantePersonaId && !get().personas.some(p => p.id === registro.solicitantePersonaId)) {
          return { ok: false, error: "No se puede crear la solicitud: el solicitante no existe en el Maestro de Personas." }
        }
        if (registro.unidadId && !get().unidades.some(u => u.id === registro.unidadId)) {
          return { ok: false, error: "No se puede crear la solicitud: la unidad indicada no existe en el inventario." }
        }
        if (registro.tipo === "grabaciones") {
          if (!registro.unidadId) {
            return { ok: false, error: "Las solicitudes de grabaciones deben vincularse a una unidad/residente del maestro." }
          }
          if (!registro.detalleGrabaciones) {
            return { ok: false, error: "Las solicitudes de grabaciones requieren fecha/hora del suceso y justificación extendida." }
          }
        }
        if (registro.tipo === "insumos" && !registro.detalleInsumos) {
          return { ok: false, error: "Las solicitudes de insumos requieren área de destino y material solicitado (catálogo pendiente a IR)." }
        }
        if (registro.tipo === "buzon") {
          if (!registro.mensajeBuzonId || !get().mensajesBuzonCO.some(m => m.id === registro.mensajeBuzonId)) {
            return { ok: false, error: "Los tickets del buzón deben referenciar un mensaje existente de CO." }
          }
        }

        set(s => ({ solicitudesGE: upsert(s.solicitudesGE, registro) }))
        if (esNueva) {
          registrarEvento(set, "GE_TICKET_CREATED", registro.id, `Ticket ${registro.folio} (${registro.tipo}) creado: ${registro.titulo}.`, "GE")
          if (registro.solicitantePersonaId) {
            get().notify({
              destinatarioRol: rolDestinatarioCO(get, registro.solicitantePersonaId),
              destinatarioPersonaId: registro.solicitantePersonaId,
              asunto: `Recibimos tu solicitud ${registro.folio}`,
              cuerpo: `Tu solicitud "${registro.titulo}" fue ingresada con estado Nuevo. Te avisaremos en cada avance.`,
              moduloOrigen: "GE",
              ...(registro.unidadId ? { unidadId: registro.unidadId } : {}),
            })
          }
        }
        return { ok: true }
      },

      abrirSolicitudGE: (id) => {
        if (!get().hasHydrated) return { ok: false, error: "El almacenamiento aún se está hidratando. Intenta de nuevo." }
        const ticket = get().solicitudesGE.find(s => s.id === id)
        if (!ticket) return { ok: false, error: "No se puede abrir: el ticket no existe." }
        if (ticket.estado !== "nuevo") return { ok: true }
        set(s => ({
          solicitudesGE: s.solicitudesGE.map(t =>
            t.id === id
              ? { ...t, estado: "en_revision", historialEstados: [...t.historialEstados, { de: t.estado, a: "en_revision", fecha: new Date().toISOString() }] }
              : t
          ),
        }))
        registrarEvento(set, "GE_TICKET_STATE_CHANGE", id, `Ticket ${ticket.folio}: Nuevo → En Revisión (primera lectura de administración).`, "GE")
        return { ok: true }
      },

      responderSolicitudGE: (id, comentario) => {
        if (!get().hasHydrated) return { ok: false, error: "El almacenamiento aún se está hidratando. Intenta de nuevo." }
        const ticket = get().solicitudesGE.find(s => s.id === id)
        if (!ticket) return { ok: false, error: "No se puede responder: el ticket no existe." }
        if (comentario.texto.trim().length === 0) return { ok: false, error: "El comentario no puede estar vacío." }
        if (["resuelto", "cerrado"].includes(ticket.estado)) {
          return { ok: false, error: `No se puede comentar un ticket ${ticket.estado}.` }
        }

        let nuevoEstado: EstadoSolicitudGE = ticket.estado
        if (comentario.autorRol === "administracion" && ["en_revision", "en_proceso"].includes(ticket.estado)) {
          nuevoEstado = "requiere_accion_vecino"
        } else if (comentario.autorRol === "solicitante" && ticket.estado === "requiere_accion_vecino") {
          nuevoEstado = "en_proceso"
        }

        set(s => ({
          solicitudesGE: s.solicitudesGE.map(t =>
            t.id === id
              ? {
                  ...t,
                  estado: nuevoEstado,
                  comentarios: [...t.comentarios, { id: `com-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, autorRol: comentario.autorRol, texto: comentario.texto.trim(), fecha: new Date().toISOString() }],
                  ...(nuevoEstado !== t.estado
                    ? { historialEstados: [...t.historialEstados, { de: t.estado, a: nuevoEstado, fecha: new Date().toISOString() }] }
                    : {}),
                }
              : t
          ),
        }))

        if (nuevoEstado === "requiere_accion_vecino") {
          registrarEvento(set, "GE_TICKET_STATE_CHANGE", id, `Ticket ${ticket.folio}: administración requiere acción del vecino.`, "GE")
          if (ticket.solicitantePersonaId) {
            get().notify({
              destinatarioRol: rolDestinatarioCO(get, ticket.solicitantePersonaId),
              destinatarioPersonaId: ticket.solicitantePersonaId,
              asunto: `Tu solicitud ${ticket.folio} requiere más información`,
              cuerpo: comentario.texto,
              moduloOrigen: "GE",
              ...(ticket.unidadId ? { unidadId: ticket.unidadId } : {}),
            })
          }
        } else if (nuevoEstado === "en_proceso") {
          registrarEvento(set, "GE_TICKET_STATE_CHANGE", id, `Ticket ${ticket.folio}: el solicitante respondió → En Proceso.`, "GE")
          get().notify({
            destinatarioRol: "administracion",
            asunto: `El vecino respondió al ticket ${ticket.folio}`,
            cuerpo: `${nombrePersona(get, ticket.solicitantePersonaId ?? "")}: "${comentario.texto}". El ticket volvió al lado de la administración.`,
            moduloOrigen: "GE",
          })
        } else {
          registrarEvento(set, "GE_TICKET_COMMENT", id, `Nuevo comentario (${comentario.autorRol}) en ticket ${ticket.folio}.`, "GE")
        }
        return { ok: true }
      },

      resolverSolicitudGE: (id, resolucion) => {
        if (!get().hasHydrated) return { ok: false, error: "El almacenamiento aún se está hidratando. Intenta de nuevo." }
        const ticket = get().solicitudesGE.find(s => s.id === id)
        if (!ticket) return { ok: false, error: "No se puede resolver: el ticket no existe." }
        if (ticket.estado === "cerrado") return { ok: false, error: "El ticket ya está cerrado." }
        if (resolucion.trim().length === 0) return { ok: false, error: "La resolución es obligatoria para resolver el ticket." }

        set(s => ({
          solicitudesGE: s.solicitudesGE.map(t =>
            t.id === id
              ? {
                  ...t,
                  estado: "resuelto",
                  resolucion: resolucion.trim(),
                  historialEstados: [...t.historialEstados, { de: t.estado, a: "resuelto", fecha: new Date().toISOString() }],
                }
              : t
          ),
        }))
        registrarEvento(set, "GE_TICKET_STATE_CHANGE", id, `Ticket ${ticket.folio}: ${ticket.estado} → Resuelto.`, "GE")
        registrarEvento(set, "GE_TICKET_RESOLVED", id, `Ticket ${ticket.folio} resuelto: ${resolucion.trim()}`, "GE")
        if (ticket.solicitantePersonaId) {
          get().notify({
            destinatarioRol: rolDestinatarioCO(get, ticket.solicitantePersonaId),
            destinatarioPersonaId: ticket.solicitantePersonaId,
            asunto: `Tu solicitud ${ticket.folio} fue resuelta`,
            cuerpo: resolucion.trim(),
            moduloOrigen: "GE",
            ...(ticket.unidadId ? { unidadId: ticket.unidadId } : {}),
          })
        }
        return { ok: true }
      },

      cerrarSolicitudGE: (id) => {
        if (!get().hasHydrated) return { ok: false, error: "El almacenamiento aún se está hidratando. Intenta de nuevo." }
        const ticket = get().solicitudesGE.find(s => s.id === id)
        if (!ticket) return { ok: false, error: "No se puede cerrar: el ticket no existe." }
        if (ticket.estado !== "resuelto") {
          return { ok: false, error: "Solo un ticket Resuelto puede pasar a Cerrado." }
        }
        set(s => ({
          solicitudesGE: s.solicitudesGE.map(t =>
            t.id === id
              ? {
                  ...t,
                  estado: "cerrado",
                  fechaCierre: new Date().toISOString().slice(0, 10),
                  historialEstados: [...t.historialEstados, { de: "resuelto", a: "cerrado", fecha: new Date().toISOString() }],
                }
              : t
          ),
        }))
        registrarEvento(set, "GE_TICKET_STATE_CHANGE", id, `Ticket ${ticket.folio}: Resuelto → Cerrado (SLA registrado).`, "GE")
        return { ok: true }
      },

      removeSolicitudGE: (id) => {
        if (!get().hasHydrated) return { ok: false, error: "El almacenamiento aún se está hidratando. Intenta de nuevo." }
        set(s => ({ solicitudesGE: s.solicitudesGE.filter(t => t.id !== id) }))
        return { ok: true }
      },

      // --- IR: Inventario y Recursos ---
      saveRecursoIR: (recurso) => {
        if (!get().hasHydrated) return { ok: false, error: "El almacenamiento aún se está hidratando. Intenta de nuevo." }
        const esNuevo = !get().activosIR.some(r => r.id === recurso.id)
        let candidato: RecursoIR = recurso
        if (esNuevo) {
          candidato = { ...recurso, codigo: recurso.codigo ?? siguienteCodigoIR(get), estadoActivo: recurso.estadoActivo ?? "disponible" }
        }
        const validacion = validarConEsquema(RecursoIRSchema, candidato)
        if (!validacion.ok) return validacion
        const registro = validacion.data

        // Validaciones por naturaleza del recurso.
        if (registro.categoria === "infraestructura" && !registro.microSectorId && !registro.unidadId) {
          return { ok: false, error: "Los activos de infraestructura deben vincularse a una ubicación de la Estructura Física." }
        }
        if (registro.categoria === "acceso" && !registro.unidadId) {
          return { ok: false, error: "Las llaves y credenciales deben vincularse a la unidad correspondiente." }
        }
        if (registro.categoria === "insumo" && registro.esCritico && registro.umbralCritico === undefined) {
          return { ok: false, error: "Un insumo crítico debe fijar su umbral de Stock Crítico." }
        }
        if (registro.microSectorId && !get().microSectores.some(m => m.id === registro.microSectorId)) {
          return { ok: false, error: "No se puede guardar el recurso: el sub-sector indicado no existe en el inventario." }
        }
        if (registro.unidadId && !get().unidades.some(u => u.id === registro.unidadId)) {
          return { ok: false, error: "No se puede guardar el recurso: la unidad indicada no existe en el inventario." }
        }
        if (registro.responsablePersonaId && !get().personas.some(p => p.id === registro.responsablePersonaId)) {
          return { ok: false, error: "No se puede guardar el recurso: el responsable no existe en el Maestro de Personas." }
        }
        if (registro.unidadMedidaId && !get().maestros.unidadesMedida.some(u => u.id === registro.unidadMedidaId)) {
          return { ok: false, error: "No se puede guardar el recurso: la unidad de medida no existe en los maestros." }
        }

        let final = registro
        if (esNuevo) {
          final = {
            ...registro,
            cargoFIReferencia: registro.proveedor || registro.numeroFactura ? "pendiente" : registro.cargoFIReferencia,
          }
        }
        set(s => ({ activosIR: upsert(s.activosIR, final) }))
        return { ok: true }
      },

      removeRecursoIR: (id) => {
        if (!get().hasHydrated) return { ok: false, error: "El almacenamiento aún se está hidratando. Intenta de nuevo." }
        const conSolicitudes = get().solicitudesInsumoIR.filter(
          s => s.recursoInsumoId === id || s.recursoSustitutoId === id
        )
        if (conSolicitudes.length > 0) {
          return { ok: false, error: `No se puede eliminar el recurso: ${conSolicitudes.length} solicitud(es) de insumo lo referencian.` }
        }
        const conEntregas = get().entregasEPP.filter(e => e.recursoId === id)
        if (conEntregas.length > 0) {
          return { ok: false, error: `No se puede eliminar el EPP: ${conEntregas.length} entrega(s) individual(es) asociadas.` }
        }
        set(s => ({ activosIR: s.activosIR.filter(r => r.id !== id) }))
        return { ok: true }
      },

      cambiarEstadoRecursoIR: (id, estado) => {
        if (!get().hasHydrated) return { ok: false, error: "El almacenamiento aún se está hidratando. Intenta de nuevo." }
        const recurso = get().activosIR.find(r => r.id === id)
        if (!recurso) return { ok: false, error: "No se puede actualizar: el recurso no existe." }
        if (recurso.estadoActivo === estado) return { ok: true }
        set(s => ({
          activosIR: s.activosIR.map(r => (r.id === id ? { ...r, estadoActivo: estado } : r)),
        }))
        if (estado === "reparacion") {
          registrarEvento(set, "IR_ASSET_REPAIR", id, `${recurso.nombre} (${recurso.categoria}) entra a Reparación.`, "IR")
        }
        if (estado === "baja") {
          registrarEvento(set, "IR_ASSET_BAJA", id, `${recurso.nombre} marcado como Baja (pérdida/robo/fin de vida útil).`, "IR")
        }
        return { ok: true }
      },

      saveSolicitudInsumoIR: (solicitud) => {
        if (!get().hasHydrated) return { ok: false, error: "El almacenamiento aún se está hidratando. Intenta de nuevo." }
        const esNueva = !get().solicitudesInsumoIR.some(s => s.id === solicitud.id)
        let candidato: SolicitudInsumoIR = solicitud
        if (esNueva) {
          const numeros = get().solicitudesInsumoIR
            .map(s => Number.parseInt(s.folio.replace(/^SI-/, ""), 10))
            .filter(n => Number.isFinite(n))
          const siguiente = (numeros.length > 0 ? Math.max(...numeros) : 0) + 1
          candidato = {
            ...solicitud,
            folio: `SI-${String(siguiente).padStart(4, "0")}`,
            estado: "pendiente",
            estadoComodin: solicitud.comodin ? "pendiente" : "no_comodin",
          }
        }
        const validacion = validarConEsquema(SolicitudInsumoIRSchema, candidato)
        if (!validacion.ok) return validacion
        const registro = validacion.data

        if (!get().personas.some(p => p.id === registro.solicitantePersonaId)) {
          return { ok: false, error: "No se puede crear la solicitud: el solicitante no existe en el Maestro de Personas." }
        }
        if (!registro.comodin && !registro.recursoInsumoId) {
          return { ok: false, error: "La solicitud exige un artículo del catálogo o ser un comodín descrito y justificado." }
        }
        if (registro.comodin && registro.recursoInsumoId) {
          return { ok: false, error: "Una solicitud comodín no debe referenciar un artículo del catálogo." }
        }
        if (registro.recursoInsumoId) {
          const recurso = get().activosIR.find(r => r.id === registro.recursoInsumoId)
          if (!recurso) {
            return { ok: false, error: "No se puede crear la solicitud: el artículo del catálogo no existe." }
          }
          if (recurso.categoria !== "insumo") {
            return { ok: false, error: "Solo pueden solicitarse artículos de tipo insumo/consumible." }
          }
        }

        set(s => ({ solicitudesInsumoIR: upsert(s.solicitudesInsumoIR, registro) }))
        if (esNueva && registro.comodin) {
          // Comodín: alerta crítica al administrador para decidir (aprobar/sustituir/rechazar).
          registrarEvento(set, "IR_COMODIN_ALERTA", registro.id, `Comodín ${registro.folio}: "${registro.comodin.descripcionArticulo}" fuera de catálogo requiere decisión.`, "IR")
          get().notify({
            destinatarioRol: "administracion",
            asunto: `Alerta crítica: artículo no catalogado (${registro.folio})`,
            cuerpo: `${nombrePersona(get, registro.solicitantePersonaId)} solicitó "${registro.comodin.descripcionArticulo}" para ${registro.areaDestino}. Justificación: ${registro.comodin.justificacion}`,
            moduloOrigen: "IR",
          })
        }
        return { ok: true }
      },

      resolverComodinIR: (id, decision, opts) => {
        if (!get().hasHydrated) return { ok: false, error: "El almacenamiento aún se está hidratando. Intenta de nuevo." }
        const solicitud = get().solicitudesInsumoIR.find(s => s.id === id)
        if (!solicitud) return { ok: false, error: "No se puede resolver: la solicitud no existe." }
        if (solicitud.estadoComodin !== "pendiente" || !solicitud.comodin) {
          return { ok: false, error: "Solo una solicitud comodín pendiente puede resolverse." }
        }

        if (decision === "rechazar") {
          const justificacion = opts?.justificacion?.trim()
          if (!justificacion) return { ok: false, error: "El rechazo exige justificación obligatoria." }
          set(s => ({
            solicitudesInsumoIR: s.solicitudesInsumoIR.map(x =>
              x.id === id ? { ...x, estado: "rechazada", estadoComodin: "rechazada", rechazoJustificacion: justificacion } : x
            ),
          }))
          registrarEvento(set, "IR_COMODIN_RESUELTO", id, `Comodín ${solicitud.folio} rechazado: ${justificacion}`, "IR")
          get().notify({
            destinatarioRol: rolDestinatarioCO(get, solicitud.solicitantePersonaId),
            destinatarioPersonaId: solicitud.solicitantePersonaId,
            asunto: `Tu solicitud comodín ${solicitud.folio} fue rechazada`,
            cuerpo: justificacion,
            moduloOrigen: "IR",
          })
          return { ok: true }
        }

        if (decision === "sustituir") {
          const sustitutoId = opts?.recursoSustitutoId
          const sustituto = sustitutoId ? get().activosIR.find(r => r.id === sustitutoId) : undefined
          if (!sustituto || sustituto.categoria !== "insumo") {
            return { ok: false, error: "La sustitución exige un artículo similar existente en el catálogo." }
          }
          set(s => ({
            solicitudesInsumoIR: s.solicitudesInsumoIR.map(x =>
              x.id === id ? { ...x, recursoInsumoId: sustituto.id, recursoSustitutoId: sustituto.id, estadoComodin: "sustituida" } : x
            ),
          }))
          registrarEvento(set, "IR_COMODIN_RESUELTO", id, `Comodín ${solicitud.folio} sustituido por ${sustituto.nombre} (stock disponible).`, "IR")
          get().notify({
            destinatarioRol: rolDestinatarioCO(get, solicitud.solicitantePersonaId),
            destinatarioPersonaId: solicitud.solicitantePersonaId,
            asunto: `Tu solicitud comodín ${solicitud.folio} fue sustituida`,
            cuerpo: `Se asignó "${sustituto.nombre}" como artículo similar disponible.`,
            moduloOrigen: "IR",
          })
          return { ok: true }
        }

        // aprobar_crear: alta automática al catálogo para futuras solicitudes.
        const nombreArticulo = solicitud.comodin.descripcionArticulo.trim()
        const creado: RecursoIR = {
          id: `ir-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          codigo: siguienteCodigoIR(get),
          nombre: nombreArticulo,
          categoria: "insumo",
          descripcion: `Creado automáticamente desde comodín ${solicitud.folio}: ${solicitud.comodin.justificacion}`,
          estadoActivo: "disponible",
          stock: 0,
          esCritico: false,
        }
        const validacion = validarConEsquema(RecursoIRSchema, creado)
        if (!validacion.ok) return validacion
        set(s => ({ activosIR: upsert(s.activosIR, validacion.data) }))
        set(s => ({
          solicitudesInsumoIR: s.solicitudesInsumoIR.map(x =>
            x.id === id ? { ...x, recursoInsumoId: validacion.data.id, estadoComodin: "aprobada_creada" } : x
          ),
        }))
        registrarEvento(set, "IR_COMODIN_RESUELTO", id, `Comodín ${solicitud.folio} aprobado: "${nombreArticulo}" añadido al catálogo (${validacion.data.codigo}).`, "IR")
        get().notify({
          destinatarioRol: rolDestinatarioCO(get, solicitud.solicitantePersonaId),
          destinatarioPersonaId: solicitud.solicitantePersonaId,
          asunto: `Tu solicitud comodín ${solicitud.folio} fue aprobada`,
          cuerpo: `"${nombreArticulo}" quedó incorporado al catálogo para futuras solicitudes.`,
          moduloOrigen: "IR",
        })
        return { ok: true }
      },

      entregarSolicitudInsumoIR: (id) => {
        if (!get().hasHydrated) return { ok: false, error: "El almacenamiento aún se está hidratando. Intenta de nuevo." }
        const solicitud = get().solicitudesInsumoIR.find(s => s.id === id)
        if (!solicitud) return { ok: false, error: "No se puede entregar: la solicitud no existe." }
        if (solicitud.estado !== "pendiente") {
          return { ok: false, error: "Solo una solicitud Pendiente puede entregarse." }
        }
        if (!solicitud.recursoInsumoId) {
          return { ok: false, error: "No se puede entregar: el comodín aún no tiene artículo asociado (resuélvelo primero)." }
        }
        const recurso = get().activosIR.find(r => r.id === solicitud.recursoInsumoId)
        if (!recurso) return { ok: false, error: "No se puede entregar: el artículo del catálogo ya no existe." }
        if (recurso.stock < solicitud.cantidad) {
          return { ok: false, error: `Stock insuficiente: quedan ${recurso.stock} unidad(es) y se solicitaron ${solicitud.cantidad}.` }
        }
        const stockPrevio = recurso.stock
        const stockNuevo = stockPrevio - solicitud.cantidad
        set(s => ({
          activosIR: s.activosIR.map(r => (r.id === recurso.id ? { ...r, stock: stockNuevo } : r)),
          solicitudesInsumoIR: s.solicitudesInsumoIR.map(x =>
            x.id === id ? { ...x, estado: "entregada", entregaFecha: new Date().toISOString().slice(0, 10) } : x
          ),
        }))
        // Alarma de reposición automática al cruzar el umbral crítico.
        if (
          recurso.esCritico &&
          recurso.umbralCritico !== undefined &&
          stockNuevo <= recurso.umbralCritico &&
          stockPrevio > recurso.umbralCritico
        ) {
          registrarEvento(set, "IR_STOCK_LOW", recurso.id, `Alarma de reposición: ${recurso.nombre} llegó a ${stockNuevo} (umbral ${recurso.umbralCritico}).`, "IR")
          get().notify({
            destinatarioRol: "administracion",
            asunto: `Alarma de reposición: ${recurso.nombre}`,
            cuerpo: `El stock crítico bajó a ${stockNuevo} unidad(es), en o bajo el umbral definido (${recurso.umbralCritico}). Considera reponer pronto.`,
            moduloOrigen: "IR",
          })
        }
        return { ok: true }
      },

      registrarEntregaEPP: (entrega) => {
        if (!get().hasHydrated) return { ok: false, error: "El almacenamiento aún se está hidratando. Intenta de nuevo." }
        const validacion = validarConEsquema(EntregaEPPSchema, entrega)
        if (!validacion.ok) return validacion
        const recurso = get().activosIR.find(r => r.id === validacion.data.recursoId)
        if (!recurso) return { ok: false, error: "No se puede registrar la entrega: el recurso EPP no existe." }
        if (recurso.categoria !== "epp") {
          return { ok: false, error: "Solo pueden registrarse entregas sobre recursos de protección personal (EPP)." }
        }
        if (!get().personas.some(p => p.id === validacion.data.personaId)) {
          return { ok: false, error: "No se puede registrar la entrega: el receptor no existe en el Maestro de Personas." }
        }
        let registro = validacion.data
        if (recurso.renovacionMeses) {
          const proxima = new Date(`${registro.fechaEntrega}T00:00:00`)
          proxima.setMonth(proxima.getMonth() + recurso.renovacionMeses)
          registro = { ...registro, proximaRenovacion: proxima.toISOString().slice(0, 10) }
        }
        set(s => ({ entregasEPP: upsert(s.entregasEPP, registro) }))
        registrarEvento(set, "IR_DELIVERY_EPP", registro.id, `EPP ${recurso.nombre} entregado a ${nombrePersona(get, registro.personaId)}${registro.proximaRenovacion ? ` (renovación: ${registro.proximaRenovacion})` : ""}.`, "IR")
        return { ok: true }
      },

      asignarAccesoIR: (recursoId, personaId) => {
        if (!get().hasHydrated) return { ok: false, error: "El almacenamiento aún se está hidratando. Intenta de nuevo." }
        const recurso = get().activosIR.find(r => r.id === recursoId)
        if (!recurso) return { ok: false, error: "No se puede asignar: el acceso no existe." }
        if (recurso.categoria !== "acceso") {
          return { ok: false, error: "Solo llaves y credenciales admiten asignación." }
        }
        if (recurso.asignacionActual) {
          return { ok: false, error: `El acceso ya está asignado a ${nombrePersona(get, recurso.asignacionActual.personaId)}; regístralo como devuelto primero.` }
        }
        if (!get().personas.some(p => p.id === personaId)) {
          return { ok: false, error: "No se puede asignar: la persona no existe en el Maestro de Personas." }
        }
        set(s => ({
          activosIR: s.activosIR.map(r =>
            r.id === recursoId
              ? { ...r, asignacionActual: { personaId, fecha: new Date().toISOString().slice(0, 10) }, estadoActivo: "en_uso" }
              : r
          ),
        }))
        registrarEvento(set, "IR_ACCESO_ASIGNADO", recursoId, `${recurso.nombre} asignado a ${nombrePersona(get, personaId)} (quién tiene qué).`, "IR")
        return { ok: true }
      },

      devolverAccesoIR: (recursoId) => {
        if (!get().hasHydrated) return { ok: false, error: "El almacenamiento aún se está hidratando. Intenta de nuevo." }
        const recurso = get().activosIR.find(r => r.id === recursoId)
        if (!recurso) return { ok: false, error: "No se puede devolver: el acceso no existe." }
        if (!recurso.asignacionActual) return { ok: false, error: "El acceso no registra asignación vigente." }
        set(s => ({
          activosIR: s.activosIR.map(r =>
            r.id === recursoId ? { ...r, asignacionActual: undefined, estadoActivo: "disponible" } : r
          ),
        }))
        registrarEvento(set, "IR_ACCESO_DEVUELTO", recursoId, `${recurso.nombre} devuelto por ${nombrePersona(get, recurso.asignacionActual.personaId)}.`, "IR")
        return { ok: true }
      },

      // --- IN: Infracciones y Multas ---
      saveTipoInfraccionIN: (tipo) => {
        if (!get().hasHydrated) return { ok: false, error: "El almacenamiento aún se está hidratando. Intenta de nuevo." }
        const validacion = validarConEsquema(TipoInfraccionINSchema, tipo)
        if (!validacion.ok) return validacion
        set(s => ({ tiposInfraccionIN: upsert(s.tiposInfraccionIN, validacion.data) }))
        return { ok: true }
      },

      removeTipoInfraccionIN: (id) => {
        if (!get().hasHydrated) return { ok: false, error: "El almacenamiento aún se está hidratando. Intenta de nuevo." }
        const enUso = get().infraccionesIN.filter(i => i.tipoInfraccionId === id)
        if (enUso.length > 0) {
          return { ok: false, error: `No se puede eliminar el tipo de infracción: ${enUso.length} infracción(es) registrada(s) lo utilizan.` }
        }
        set(s => ({ tiposInfraccionIN: s.tiposInfraccionIN.filter(t => t.id !== id) }))
        return { ok: true }
      },

      saveInfraccionIN: (infraccion) => {
        if (!get().hasHydrated) return { ok: false, error: "El almacenamiento aún se está hidratando. Intenta de nuevo." }
        const esNueva = !get().infraccionesIN.some(i => i.id === infraccion.id)
        let candidato: InfraccionIN = infraccion
        if (esNueva) {
          const numeros = get().infraccionesIN
            .map(i => Number.parseInt(i.folio.replace(/^IN-/, ""), 10))
            .filter(n => Number.isFinite(n))
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
          return { ok: false, error: "La infracción exige un tipo del catálogo o ser un cobro directo por daños con descripción y costo." }
        }
        if (registro.tipoInfraccionId && registro.danoDirecto) {
          return { ok: false, error: "Una infracción no puede tener tipo de catálogo y cobro directo por daños a la vez." }
        }
        if (registro.tipoInfraccionId && !get().tiposInfraccionIN.some(t => t.id === registro.tipoInfraccionId)) {
          return { ok: false, error: "No se puede registrar: el tipo de infracción indicado no existe en el catálogo." }
        }
        if (registro.danoDirecto && registro.evidencias.length === 0) {
          return { ok: false, error: "El cobro directo por daños exige al menos una evidencia adjunta (cotización/factura/foto)." }
        }
        if (!get().unidades.some(u => u.id === registro.unidadId)) {
          return { ok: false, error: "No se puede registrar: la unidad infractora no existe en el inventario." }
        }
        if (registro.reportantePersonaId && !get().personas.some(p => p.id === registro.reportantePersonaId)) {
          return { ok: false, error: "No se puede registrar: el reportante no existe en el Maestro de Personas." }
        }
        if (registro.mensajeBuzonId && !get().mensajesBuzonCO.some(m => m.id === registro.mensajeBuzonId)) {
          return { ok: false, error: "No se puede registrar: el mensaje del buzón CO indicado no existe." }
        }

        set(s => ({ infraccionesIN: upsert(s.infraccionesIN, registro) }))
        if (esNueva) {
          const referencia = registro.danoDirecto
            ? `Daño directo: ${registro.danoDirecto.descripcionDaño}`
            : get().tiposInfraccionIN.find(t => t.id === registro.tipoInfraccionId)?.nombre ?? registro.tipoInfraccionId
          registrarEvento(set, "IN_REG_EVENT", registro.id, `Infracción ${registro.folio} (${referencia}) registrada para unidad ${refUnidad(get, registro.unidadId)}.`, "IN")
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
        if (!get().hasHydrated) return { ok: false, error: "El almacenamiento aún se está hidratando. Intenta de nuevo." }
        const infraccion = get().infraccionesIN.find(i => i.id === id)
        if (!infraccion) return { ok: false, error: "No se puede apelar: la infracción no existe." }
        if (infraccion.estado !== "en_revision") {
          return { ok: false, error: "Solo una infracción En Revisión puede recibir descargos de apelación." }
        }
        if (descargos.trim().length < 10) {
          return { ok: false, error: "Los descargos deben detallar la posición del vecino (mínimo 10 caracteres)." }
        }
        set(s => ({
          infraccionesIN: s.infraccionesIN.map(x =>
            x.id === id ? { ...x, estado: "apelada", apelacion: { descargos: descargos.trim(), fecha: new Date().toISOString().slice(0, 10) } } : x
          ),
        }))
        registrarEvento(set, "IN_APELACION", id, `Descargos presentados en infracción ${infraccion.folio}: En Revisión → Apelada.`, "IN")
        return { ok: true }
      },

      comentarInfraccionIN: (id, comentario) => {
        if (!get().hasHydrated) return { ok: false, error: "El almacenamiento aún se está hidratando. Intenta de nuevo." }
        const infraccion = get().infraccionesIN.find(i => i.id === id)
        if (!infraccion) return { ok: false, error: "No se puede comentar: la infracción no existe." }
        if (comentario.texto.trim().length === 0) return { ok: false, error: "El comentario no puede estar vacío." }
        const autor = get().personas.find(p => p.id === comentario.autorPersonaId)
        if (!autor?.datosGobernanza || autor.estadoCuenta !== "activa") {
          return { ok: false, error: "Solo administración y directiva pueden dejar comentarios internos." }
        }
        set(s => ({
          infraccionesIN: s.infraccionesIN.map(x =>
            x.id === id
              ? {
                  ...x,
                  comentariosDirectiva: [
                    ...x.comentariosDirectiva,
                    { id: `com-in-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, autorPersonaId: comentario.autorPersonaId, texto: comentario.texto.trim(), fecha: new Date().toISOString() },
                  ],
                }
              : x
          ),
        }))
        registrarEvento(set, "IN_COMENTARIO_DIRECTIVA", id, `Comentario interno de ${nombrePersona(get, comentario.autorPersonaId)} en ${infraccion.folio}.`, "IN")
        return { ok: true }
      },

      respaldarInfraccionIN: (id, personaId) => {
        if (!get().hasHydrated) return { ok: false, error: "El almacenamiento aún se está hidratando. Intenta de nuevo." }
        const infraccion = get().infraccionesIN.find(i => i.id === id)
        if (!infraccion) return { ok: false, error: "No se puede respaldar: la infracción no existe." }
        if (["aplicada", "desestimada"].includes(infraccion.estado)) {
          return { ok: false, error: "La infracción ya tiene resolución final." }
        }
        const firmante = get().personas.find(p => p.id === personaId)
        if (!firmante?.datosGobernanza || firmante.estadoCuenta !== "activa") {
          return { ok: false, error: "Solo un miembro vigente de la directiva puede respaldar la aplicación de la multa." }
        }
        if (infraccion.respaldosDirectiva.includes(personaId)) {
          return { ok: false, error: "Este miembro de la directiva ya respaldó la multa." }
        }
        set(s => ({
          infraccionesIN: s.infraccionesIN.map(x =>
            x.id === id ? { ...x, respaldosDirectiva: [...x.respaldosDirectiva, personaId] } : x
          ),
        }))
        registrarEvento(set, "IN_RESPALDO_DIRECTIVA", id, `${nombrePersona(get, personaId)} respalda la aplicación de la multa ${infraccion.folio}.`, "IN")
        return { ok: true }
      },

      aplicarInfraccionIN: (id) => {
        if (!get().hasHydrated) return { ok: false, error: "El almacenamiento aún se está hidratando. Intenta de nuevo." }
        const infraccion = get().infraccionesIN.find(i => i.id === id)
        if (!infraccion) return { ok: false, error: "No se puede aplicar: la infracción no existe." }
        if (!["en_revision", "apelada"].includes(infraccion.estado)) {
          return { ok: false, error: "Solo una infracción En Revisión o Apelada puede aplicarse." }
        }

        let montoAplicado: number
        let descripcionSancion: string
        if (infraccion.danoDirecto) {
          montoAplicado = infraccion.danoDirecto.costoReparacion
          descripcionSancion = `Cobro directo $${montoAplicado.toLocaleString("es-CL")}`
        } else {
          const tipo = get().tiposInfraccionIN.find(t => t.id === infraccion.tipoInfraccionId)
          if (!tipo) return { ok: false, error: "No se puede aplicar: el tipo de infracción ya no existe en el catálogo." }
          montoAplicado = tipo.valor
          descripcionSancion = tipo.tipoSancion === "porcentaje_gc" ? `${tipo.valor}% del Gasto Común` : `$${tipo.valor.toLocaleString("es-CL")} monto fijo`
          // Multas grave/gravísima exigen respaldo previo de la directiva.
          if (["grave", "gravisima"].includes(tipo.categoria) && infraccion.respaldosDirectiva.length === 0) {
            return { ok: false, error: "Las multas Grave/Gravísima requieren el respaldo de la directiva antes de cargarse al Gasto Común." }
          }
          // FI: la sanción % GC se resuelve contra el último cobro GC emitido a la unidad;
          // sin historial previo se usa el valor nominal del catálogo.
          if (tipo.tipoSancion === "porcentaje_gc") {
            const ultimoGC = [...get().cobrosFI]
              .filter(c => c.concepto === "gasto_comun" && c.unidadId === infraccion.unidadId)
              .sort((a, b) => b.periodo.localeCompare(a.periodo))[0]
            if (ultimoGC) {
              montoAplicado = Math.round((tipo.valor / 100) * ultimoGC.montoBase)
              descripcionSancion = `${tipo.valor}% del Gasto Común ($${montoAplicado.toLocaleString("es-CL")})`
            }
          }
        }

        const hoyStr = hoyISO()
        const fondoGC = get().fondosFI.find(f => f.tipo === "gasto_comun" && f.activo)
        let cargoFIReferencia: string | undefined
        let nuevoCobro: CobroFI | undefined
        if (fondoGC && montoAplicado > 0) {
          nuevoCobro = {
            id: `cob-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            unidadId: infraccion.unidadId,
            periodo: hoyStr.slice(0, 7),
            concepto: "multa_in",
            origenModulo: "IN",
            origenRef: infraccion.id,
            fondoId: fondoGC.id,
            descripcion: `Multa ${infraccion.folio}: ${descripcionSancion}`,
            montoBase: montoAplicado,
            fechaCargo: hoyStr,
            fechaVencimiento: vencimientoDesdeDiaCorte(hoyStr.slice(0, 7), get().configuracion?.diaCortePago ?? 5),
            moras: [],
            pagos: [],
            diferencias: [],
          }
          cargoFIReferencia = nuevoCobro.id
        }

        set(s => ({
          infraccionesIN: s.infraccionesIN.map(x =>
            x.id === id
              ? { ...x, estado: "aplicada" as EstadoInfraccionIN, montoAplicado, ...(cargoFIReferencia ? { cargoFIReferencia } : { cargoFIReferencia: "pendiente" as const }) }
              : x
          ),
          ...(nuevoCobro ? { cobrosFI: [...s.cobrosFI, nuevoCobro] } : {}),
        }))
        registrarEvento(set, "IN_APPLY_FINE", id, `Multa ${infraccion.folio} APLICADA (${descripcionSancion}) para unidad ${refUnidad(get, infraccion.unidadId)}${nuevoCobro ? `; cobro FI materializado (${nuevoCobro.id})` : "; sin fondo disponible para imputar el cargo"}.`, "IN")
        // Notifica al propietario vigente de la unidad infractora (pasa por gate AD).
        const propietario = get().vinculos.find(v => v.unidadId === infraccion.unidadId && v.rol === "propietario" && !v.fechaFin)
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
        if (!get().hasHydrated) return { ok: false, error: "El almacenamiento aún se está hidratando. Intenta de nuevo." }
        const infraccion = get().infraccionesIN.find(i => i.id === id)
        if (!infraccion) return { ok: false, error: "No se puede desestimar: la infracción no existe." }
        if (!["en_revision", "apelada"].includes(infraccion.estado)) {
          return { ok: false, error: "La infracción ya tiene resolución final." }
        }
        if (justificacion.trim().length === 0) {
          return { ok: false, error: "La desestimación exige justificación obligatoria." }
        }
        set(s => ({
          infraccionesIN: s.infraccionesIN.map(x =>
            x.id === id ? { ...x, estado: "desestimada", desestimacionJustificacion: justificacion.trim() } : x
          ),
        }))
        registrarEvento(set, "IN_DESESTIMADA", id, `Infracción ${infraccion.folio} desestimada: ${justificacion.trim()}`, "IN")
        return { ok: true }
      },

      removeInfraccionIN: (id) => {
        if (!get().hasHydrated) return { ok: false, error: "El almacenamiento aún se está hidratando. Intenta de nuevo." }
        set(s => ({ infraccionesIN: s.infraccionesIN.filter(i => i.id !== id) }))
        return { ok: true }
      },

      // --- MT: Mantenimiento y Proyectos ---
      saveTrabajoMT: (trabajo) => {
        if (!get().hasHydrated) return { ok: false, error: "El almacenamiento aún se está hidratando. Intenta de nuevo." }
        const esNuevo = !get().trabajosMT.some(t => t.id === trabajo.id)
        let candidato: TrabajoMT = trabajo
        if (esNuevo) {
          const numeros = get().trabajosMT
            .map(t => Number.parseInt(t.folio.replace(/^MT-/, ""), 10))
            .filter(n => Number.isFinite(n))
          const siguiente = (numeros.length > 0 ? Math.max(...numeros) : 0) + 1
          candidato = {
            ...trabajo,
            folio: `MT-${String(siguiente).padStart(4, "0")}`,
            estado: trabajo.estado ?? "planificado",
            estadoPago: trabajo.estadoPago ?? "pendiente",
            alertaGarantiaEnviada: trabajo.alertaGarantiaEnviada ?? false,
          }
        }
        const validacion = validarConEsquema(TrabajoMTSchema, candidato)
        if (!validacion.ok) return validacion
        const registro = validacion.data

        if (!registro.unidadId && !registro.microSectorId) {
          return { ok: false, error: "El trabajo exige una ubicación: unidad o sub-sector de la Estructura Física." }
        }
        if (registro.unidadId && !get().unidades.some(u => u.id === registro.unidadId)) {
          return { ok: false, error: "No se puede guardar el trabajo: la unidad indicada no existe en el inventario." }
        }
        if (registro.microSectorId && !get().microSectores.some(m => m.id === registro.microSectorId)) {
          return { ok: false, error: "No se puede guardar el trabajo: el sub-sector indicado no existe en el inventario." }
        }
        if (registro.activoIRId && !get().activosIR.some(r => r.id === registro.activoIRId)) {
          return { ok: false, error: "No se puede guardar el trabajo: el activo del catálogo IR indicado no existe." }
        }
        if (registro.responsablePersonaId && !get().personas.some(p => p.id === registro.responsablePersonaId)) {
          return { ok: false, error: "No se puede guardar el trabajo: el responsable interno no existe en el Maestro de Personas." }
        }
        if (!registro.responsablePersonaId && !registro.proveedor) {
          return { ok: false, error: "El trabajo exige responsable: personal interno del maestro o proveedor externo." }
        }
        if (registro.garantiaInicio && registro.garantiaFin && registro.garantiaFin < registro.garantiaInicio) {
          return { ok: false, error: "La garantía no puede terminar antes de iniciar." }
        }

        set(s => ({ trabajosMT: upsert(s.trabajosMT, registro) }))
        if (esNuevo) {
          registrarEvento(set, "MT_WORK_CREATED", registro.id, `Trabajo ${registro.folio} "${registro.titulo}" creado (${registro.prioridad}${registro.preventivo ? `, preventivo cada ${registro.preventivo.periodicidadMeses} mes(es)` : ""}).`, "MT")
        }
        return { ok: true }
      },

      removeTrabajoMT: (id) => {
        if (!get().hasHydrated) return { ok: false, error: "El almacenamiento aún se está hidratando. Intenta de nuevo." }
        set(s => ({ trabajosMT: s.trabajosMT.filter(t => t.id !== id) }))
        return { ok: true }
      },

      iniciarTrabajoMT: (id) => {
        if (!get().hasHydrated) return { ok: false, error: "El almacenamiento aún se está hidratando. Intenta de nuevo." }
        const trabajo = get().trabajosMT.find(t => t.id === id)
        if (!trabajo) return { ok: false, error: "No se puede iniciar: el trabajo no existe." }
        if (trabajo.estado !== "planificado") {
          return { ok: false, error: "Solo un trabajo Planificado puede iniciarse." }
        }
        set(s => ({
          trabajosMT: s.trabajosMT.map(t =>
            t.id === id ? { ...t, estado: "en_curso", fechaInicio: new Date().toISOString().slice(0, 10) } : t
          ),
        }))
        registrarEvento(set, "MT_WORK_STARTED", id, `Trabajo ${trabajo.folio} "${trabajo.titulo}" En Curso.`, "MT")
        return { ok: true }
      },

      finalizarTrabajoMT: (id, cierre) => {
        if (!get().hasHydrated) return { ok: false, error: "El almacenamiento aún se está hidratando. Intenta de nuevo." }
        const trabajo = get().trabajosMT.find(t => t.id === id)
        if (!trabajo) return { ok: false, error: "No se puede finalizar: el trabajo no existe." }
        if (trabajo.estado === "finalizado") return { ok: false, error: "El trabajo ya está finalizado." }
        if (trabajo.estado === "cancelado") return { ok: false, error: "Un trabajo cancelado no puede finalizarse." }

        const fechaTermino = cierre?.fechaTermino ?? new Date().toISOString().slice(0, 10)
        const costoFinal = cierre?.costoFinal ?? trabajo.costoTotal
        set(s => ({
          trabajosMT: s.trabajosMT.map(t =>
            t.id === id ? { ...t, estado: "finalizado", fechaTermino, costoTotal: costoFinal } : t
          ),
        }))
        registrarEvento(set, "MT_WORK_FINISHED", id, `Trabajo ${trabajo.folio} FINALIZADO (${fechaTermino}, costo $${costoFinal.toLocaleString("es-CL")}).`, "MT")

        // Generación automática de la siguiente mantención preventiva.
        if (trabajo.preventivo) {
          const base = new Date(`${fechaTermino}T00:00:00`)
          base.setMonth(base.getMonth() + trabajo.preventivo.periodicidadMeses)
          const proximaFecha = base.toISOString().slice(0, 10)
          const numeros = get().trabajosMT
            .map(t => Number.parseInt(t.folio.replace(/^MT-/, ""), 10))
            .filter(n => Number.isFinite(n))
          const siguienteNum = (numeros.length > 0 ? Math.max(...numeros) : 0) + 1
          const siguiente: TrabajoMT = {
            ...trabajo,
            id: `mt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            folio: `MT-${String(siguienteNum).padStart(4, "0")}`,
            titulo: trabajo.titulo,
            estado: "planificado",
            estadoPago: "pendiente",
            alertaGarantiaEnviada: false,
            evidencias: [],
            fechaProgramada: proximaFecha,
            fechaInicio: undefined,
            fechaTermino: undefined,
          }
          set(s => ({ trabajosMT: upsert(s.trabajosMT, siguiente) }))
          registrarEvento(set, "MT_PREVENTIVE_GENERATED", siguiente.id, `Mantención preventiva ${siguiente.folio} generada automáticamente (${siguiente.fechaProgramada}).`, "MT")
          get().notify({
            destinatarioRol: "administracion",
            asunto: `Mantención preventiva programada (${siguiente.folio})`,
            cuerpo: `"${siguiente.titulo}" fue reprogramada automáticamente para el ${proximaFecha}.`,
            moduloOrigen: "MT",
          })
        }
        return { ok: true }
      },

      cancelarTrabajoMT: (id) => {
        if (!get().hasHydrated) return { ok: false, error: "El almacenamiento aún se está hidratando. Intenta de nuevo." }
        const trabajo = get().trabajosMT.find(t => t.id === id)
        if (!trabajo) return { ok: false, error: "No se puede cancelar: el trabajo no existe." }
        if (["finalizado", "cancelado"].includes(trabajo.estado)) {
          return { ok: false, error: `Un trabajo ${trabajo.estado} no puede cancelarse.` }
        }
        set(s => ({
          trabajosMT: s.trabajosMT.map(t => (t.id === id ? { ...t, estado: "cancelado" } : t)),
        }))
        registrarEvento(set, "MT_WORK_CANCELLED", id, `Trabajo ${trabajo.folio} "${trabajo.titulo}" cancelado.`, "MT")
        return { ok: true }
      },

      actualizarPagoTrabajoMT: (id, estadoPago) => {
        if (!get().hasHydrated) return { ok: false, error: "El almacenamiento aún se está hidratando. Intenta de nuevo." }
        const trabajo = get().trabajosMT.find(t => t.id === id)
        if (!trabajo) return { ok: false, error: "No se puede actualizar: el trabajo no existe." }
        if (trabajo.estadoPago === estadoPago) return { ok: true }
        // Sin saltos inversos inválidos: pagado solo desde parcial; parcial desde pendiente.
        const FLUJO: Record<EstadoPagoMT, EstadoPagoMT[]> = {
          pendiente: ["parcial", "pagado"],
          parcial: ["pagado", "pendiente"],
          pagado: ["pendiente"],
        }
        if (!FLUJO[trabajo.estadoPago]?.includes(estadoPago)) {
          return { ok: false, error: `Transición inválida: un pago ${trabajo.estadoPago} no puede pasar directamente a ${estadoPago}.` }
        }
        set(s => ({
          trabajosMT: s.trabajosMT.map(t => (t.id === id ? { ...t, estadoPago } : t)),
        }))
        registrarEvento(set, "MT_PAYMENT_UPDATE", id, `Estado de pago de ${trabajo.folio}: ${trabajo.estadoPago} → ${estadoPago}.`, "MT")
        return { ok: true }
      },

      verificarGarantiasMT: () => {
        if (!get().hasHydrated) return { ok: false, error: "El almacenamiento aún se está hidratando. Intenta de nuevo." }
        const hoyStr = new Date().toISOString().slice(0, 10)
        const limite30 = new Date()
        limite30.setDate(limite30.getDate() + 30)
        const limiteStr = limite30.toISOString().slice(0, 10)
        for (const trabajo of get().trabajosMT) {
          if (!trabajo.garantiaFin || trabajo.alertaGarantiaEnviada || trabajo.estado !== "finalizado") continue
          const porVencer = trabajo.garantiaFin >= hoyStr && trabajo.garantiaFin <= limiteStr
          const vencida = trabajo.garantiaFin < hoyStr
          if (!porVencer && !vencida) continue
          set(s => ({
            trabajosMT: s.trabajosMT.map(t =>
              t.id === trabajo.id ? { ...t, alertaGarantiaEnviada: true } : t
            ),
          }))
          registrarEvento(
            set,
            "MT_GUARANTEE_EXPIRED",
            trabajo.id,
            vencida
              ? `Garantía VENCIDA de ${trabajo.folio} "${trabajo.titulo}" (hasta ${trabajo.garantiaFin}); agendar inspección con proveedor.`
              : `Garantía por expirar (${trabajo.garantiaFin}) de ${trabajo.folio}; realizar inspección final.`,
            "MT"
          )
          get().notify({
            destinatarioRol: "administracion",
            asunto: `Garantía ${vencida ? "vencida" : "por expirar"}: ${trabajo.titulo}`,
            cuerpo: vencida
              ? `La garantía venció el ${trabajo.garantiaFin}. Considera registrar el cumplimiento del proveedor.`
              : `Realiza la inspección final antes del ${trabajo.garantiaFin}.`,
            moduloOrigen: "MT",
          })
        }
        return { ok: true }
      },

      saveProyectoMT: (proyecto) => {
        if (!get().hasHydrated) return { ok: false, error: "El almacenamiento aún se está hidratando. Intenta de nuevo." }
        const validacion = validarConEsquema(ProyectoMTSchema, proyecto)
        if (!validacion.ok) return validacion
        const registro = validacion.data
        if (registro.fondoFinanciamientoId) {
          const fondo = get().fondosFI.find(f => f.id === registro.fondoFinanciamientoId)
          if (!fondo) return { ok: false, error: "No se puede guardar el proyecto: el fondo de financiamiento indicado no existe en Finanzas." }
          if (!fondo.activo) return { ok: false, error: `No se puede guardar el proyecto: el fondo "${fondo.nombre}" está inactivo.` }
          const saldo = saldoFondo(fondo.id, { cobros: get().cobrosFI, egresos: get().egresosFI, emisiones: get().emisionesGC })
          if (saldo < registro.presupuestoEstimado) {
            return {
              ok: false,
              error: `Saldo insuficiente en "${fondo.nombre}": disponible $${saldo.toLocaleString("es-CL")} para financiar un presupuesto de $${registro.presupuestoEstimado.toLocaleString("es-CL")}.`,
            }
          }
        }
        set(s => ({ proyectosMT: upsert(s.proyectosMT, registro) }))
        return { ok: true }
      },

      removeProyectoMT: (id) => {
        if (!get().hasHydrated) return { ok: false, error: "El almacenamiento aún se está hidratando. Intenta de nuevo." }
        set(s => ({ proyectosMT: s.proyectosMT.filter(p => p.id !== id) }))
        return { ok: true }
      },

      // --- RA: Reservas y Amenities ---
      saveElementoRA: (elemento) => {
        if (!get().hasHydrated) return { ok: false, error: "El almacenamiento aún se está hidratando. Intenta de nuevo." }
        const validacion = validarConEsquema(ElementoRASchema, elemento)
        if (!validacion.ok) return validacion
        const registro = validacion.data
        if (!registro.microSectorId && !registro.activoIRId) {
          return { ok: false, error: "El elemento reservable exige una ubicación: sub-sector de la Estructura Física o activo del catálogo IR." }
        }
        if (registro.microSectorId && !get().microSectores.some(m => m.id === registro.microSectorId)) {
          return { ok: false, error: "No se puede guardar el elemento: el sub-sector indicado no existe en el inventario." }
        }
        if (registro.activoIRId && !get().activosIR.some(r => r.id === registro.activoIRId)) {
          return { ok: false, error: "No se puede guardar el elemento: el activo del catálogo IR indicado no existe." }
        }
        set(s => ({ elementosRA: upsert(s.elementosRA, registro) }))
        return { ok: true }
      },

      removeElementoRA: (id) => {
        if (!get().hasHydrated) return { ok: false, error: "El almacenamiento aún se está hidratando. Intenta de nuevo." }
        const vigentes = get().reservasRA.filter(r => r.elementoId === id && r.estado !== "cancelada")
        if (vigentes.length > 0) {
          return { ok: false, error: `No se puede eliminar el elemento: ${vigentes.length} reserva(s) sin cancelar lo referencian.` }
        }
        set(s => ({ elementosRA: s.elementosRA.filter(e => e.id !== id) }))
        return { ok: true }
      },

      saveReservaRA: (reserva) => {
        if (!get().hasHydrated) return { ok: false, error: "El almacenamiento aún se está hidratando. Intenta de nuevo." }
        const esNueva = !get().reservasRA.some(r => r.id === reserva.id)
        let candidato: ReservaRA = reserva
        if (esNueva) candidato = { ...reserva, folio: siguienteFolioRA(get), estado: "confirmada" }
        const validacion = validarConEsquema(ReservaRASchema, candidato)
        if (!validacion.ok) return validacion
        const registro = validacion.data

        const elemento = get().elementosRA.find(e => e.id === registro.elementoId)
        if (!elemento) return { ok: false, error: "No se puede reservar: el elemento reservable no existe." }
        if (!elemento.activo) return { ok: false, error: `No se puede reservar: ${elemento.nombre} está deshabilitado para reservas.` }
        const solicitante = get().personas.find(p => p.id === registro.solicitantePersonaId)
        if (!solicitante) return { ok: false, error: "No se puede reservar: el solicitante no existe en el Maestro de Personas." }
        if (solicitante.estadoCuenta !== "activa") {
          return { ok: false, error: "No se puede reservar: la cuenta del solicitante no está activa." }
        }
        if (registro.unidadId && !get().unidades.some(u => u.id === registro.unidadId)) {
          return { ok: false, error: "No se puede reservar: la unidad indicada no existe en el inventario." }
        }
        if (registro.horaInicio >= registro.horaFin) {
          return { ok: false, error: "El tramo horario es inválido: la hora de inicio debe ser anterior a la de término." }
        }

        // Regla especial: anticipación mínima para reservar.
        if (elemento.anticipacionMinimaDias) {
          const limite = new Date()
          limite.setDate(limite.getDate() + elemento.anticipacionMinimaDias)
          const limiteStr = limite.toISOString().slice(0, 10)
          if (registro.fecha < limiteStr) {
            return { ok: false, error: `Anticipación insuficiente: ${elemento.nombre} exige reservar con al menos ${elemento.anticipacionMinimaDias} día(s) de anticipación (hasta ${limiteStr}).` }
          }
        }

        // Validación de morosidad (RA §2): bloquea solicitantes con deuda vencida en FI.
        const deudaFI = getDeudaVigenteFI(get, registro.solicitantePersonaId)
        if (deudaFI) return { ok: false, error: deudaFI }

        // Prevención de overbooking: solapamiento [inicio, fin) según stock concurrente.
        const solapadas = get().reservasRA.filter(
          r =>
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
            const fondoAmenities = get().fondosFI.find(f => f.tipo === "amenities" && f.activo)
            const unidadCobro = registro.unidadId ?? get().vinculos.find(v => v.personaId === registro.solicitantePersonaId && !v.fechaFin)?.unidadId
            if (fondoAmenities && unidadCobro) {
              const hoyStr = hoyISO()
              const cobro: CobroFI = {
                id: `cob-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
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
              set(s => ({ cobrosFI: [...s.cobrosFI, cobro] }))
              final = { ...final, cargoFIReferencia: cobro.id }
            }
          } else {
            final = { ...final, cargoFIReferencia: registro.cargoFIReferencia }
          }
        }
        set(s => ({ reservasRA: upsert(s.reservasRA, final) }))
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
        if (!get().hasHydrated) return { ok: false, error: "El almacenamiento aún se está hidratando. Intenta de nuevo." }
        const reserva = get().reservasRA.find(r => r.id === id)
        if (!reserva) return { ok: false, error: "No se puede cancelar: la reserva no existe." }
        if (reserva.estado !== "confirmada") {
          return { ok: false, error: "Solo una reserva Confirmada puede cancelarse." }
        }
        const elemento = get().elementosRA.find(e => e.id === reserva.elementoId)
        const hoyStr = new Date().toISOString().slice(0, 10)
        const diasRestantes = Math.round((new Date(`${reserva.fecha}T00:00:00`).getTime() - new Date(`${hoyStr}T00:00:00`).getTime()) / 86400000)
        const ventanaTardia = elemento?.cancelacionTardiaDias
        const tardia = ventanaTardia !== undefined && diasRestantes <= ventanaTardia
        const penalizacion = tardia && elemento?.penalizacionTardiaMonto ? elemento.penalizacionTardiaMonto : undefined
        let cargoPenalizacion: string | undefined
        if (penalizacion) {
          const fondoAmenities = get().fondosFI.find(f => f.tipo === "amenities" && f.activo)
          const unidadCobro = reserva.unidadId ?? get().vinculos.find(v => v.personaId === reserva.solicitantePersonaId && !v.fechaFin)?.unidadId
          if (fondoAmenities && unidadCobro) {
            const hoyStr2 = hoyISO()
            const cobro: CobroFI = {
              id: `cob-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
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
            set(s => ({ cobrosFI: [...s.cobrosFI, cobro] }))
          }
        }
        set(s => ({
          reservasRA: s.reservasRA.map(r =>
            r.id === id
              ? {
                  ...r,
                  estado: "cancelada",
                  cancelacion: { fecha: hoyStr, tardia, ...(penalizacion ? { penalizacion } : {}) },
                  ...(cargoPenalizacion ? { cargoFIReferencia: cargoPenalizacion } : {}),
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
        if (!get().hasHydrated) return { ok: false, error: "El almacenamiento aún se está hidratando. Intenta de nuevo." }
        const reserva = get().reservasRA.find(r => r.id === id)
        if (!reserva) return { ok: false, error: "No se puede retener: la reserva no existe." }
        if (reserva.estado !== "confirmada") {
          return { ok: false, error: "La garantía se retiene sobre una reserva Confirmada." }
        }
        if (reserva.garantiaRetenida) {
          return { ok: false, error: "La garantía de esta reserva ya fue retenida." }
        }
        if (motivo.trim().length === 0) {
          return { ok: false, error: "La retención exige describir el daño o motivo." }
        }
        if (reserva.montoGarantia <= 0) {
          return { ok: false, error: "El elemento no exige garantía: nada que retener." }
        }
        const fondoAmenities = get().fondosFI.find(f => f.tipo === "amenities" && f.activo)
        const unidadCobro = reserva.unidadId ?? get().vinculos.find(v => v.personaId === reserva.solicitantePersonaId && !v.fechaFin)?.unidadId
        let cargoGarantia: string | undefined
        let nuevoCobro: CobroFI | undefined
        if (fondoAmenities && unidadCobro) {
          const hoyStr = hoyISO()
          nuevoCobro = {
            id: `cob-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
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
        set(s => ({
          reservasRA: s.reservasRA.map(r =>
            r.id === id
              ? { ...r, garantiaRetenida: { monto: r.montoGarantia, motivo: motivo.trim() }, ...(cargoGarantia ? { cargoFIReferencia: cargoGarantia } : {}) }
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

      // --- CV: Visor de Mensajes ---
      saveAvisoCV: (aviso, creadoPorPersonaId) => {
        if (!get().hasHydrated) return { ok: false, error: "El almacenamiento aún se está hidratando. Intenta de nuevo." }
        const esNuevo = !get().avisosCV.some(a => a.id === aviso.id)
        let candidato: AvisoCV = aviso

        if (esNuevo) {
          // Creación por tercero habilitado: exige flag MP y visto bueno según CF.
          if (creadoPorPersonaId) {
            const autor = get().personas.find(p => p.id === creadoPorPersonaId)
            if (!autor) return { ok: false, error: "No se puede crear el mensaje: el autor no existe en el Maestro de Personas." }
            if (!autor.permiteCreacionManualCV) {
              return { ok: false, error: "Sin habilitación: la creación manual exige el permiso especial en el perfil del usuario." }
            }
            const vbGlobal = get().configuracion.cvRequiereVistoBueno !== false
            candidato = {
              ...candidato,
              creadoPorPersonaId,
              requiereVistoBueno: vbGlobal,
              estado: "borrador",
              origen: "manual",
              fechaCreacion: new Date().toISOString().slice(0, 10),
            }
          } else {
            // Creación directa de administración.
            candidato = {
              ...candidato,
              requiereVistoBueno: false,
              estado: "borrador",
              fechaCreacion: new Date().toISOString().slice(0, 10),
            }
          }
        } else {
          const anterior = get().avisosCV.find(a => a.id === aviso.id)!
          if (anterior.estado === "archivado") {
            return { ok: false, error: "Un aviso Archivado conserva su data para auditoría y no admite ediciones." }
          }
        }

        const validacion = validarConEsquema(AvisoCVSchema, candidato)
        if (!validacion.ok) return validacion
        set(s => ({ avisosCV: upsert(s.avisosCV, validacion.data) }))
        if (esNuevo) {
          registrarEvento(set, "CV_DRAFT_CREATED", validacion.data.id, `Borrador "${validacion.data.titulo}" creado (${validacion.data.tipologia}${validacion.data.requiereVistoBueno ? ", espera visto bueno" : ""}).`, "CV")
        } else {
          registrarEvento(set, "CV_EDITED", validacion.data.id, `Aviso "${validacion.data.titulo}" editado (${validacion.data.duracionSegundos}s${validacion.data.expiresAt ? `, vence ${validacion.data.expiresAt}` : ""}).`, "CV")
        }
        return { ok: true }
      },

      removeAvisoCV: (id) => {
        if (!get().hasHydrated) return { ok: false, error: "El almacenamiento aún se está hidratando. Intenta de nuevo." }
        const aviso = get().avisosCV.find(a => a.id === id)
        if (!aviso) return { ok: false, error: "No se puede eliminar: el aviso no existe." }
        if (aviso.estado !== "borrador") {
          return { ok: false, error: "Solo un aviso Borrador admite eliminación; los publicados se archivan." }
        }
        set(s => ({ avisosCV: s.avisosCV.filter(a => a.id !== id) }))
        return { ok: true }
      },

      publicarAvisoCV: (id) => {
        if (!get().hasHydrated) return { ok: false, error: "El almacenamiento aún se está hidratando. Intenta de nuevo." }
        const aviso = get().avisosCV.find(a => a.id === id)
        if (!aviso) return { ok: false, error: "No se puede publicar: el aviso no existe." }
        if (aviso.estado !== "borrador") {
          return { ok: false, error: `Solo un aviso Borrador puede publicarse (estado actual: ${aviso.estado}).` }
        }
        const publicado: AvisoCV = { ...aviso, estado: "publicado", requiereVistoBueno: false, fechaPublicacion: new Date().toISOString().slice(0, 10) }
        set(s => ({ avisosCV: upsert(s.avisosCV, publicado) }))
        registrarEvento(set, "CV_PUBLISHED", id, `Aviso "${aviso.titulo}" PUBLICADO en el carrusel (${aviso.duracionSegundos}s por ciclo${aviso.actaId ? ", desde acta de directiva" : ""}).`, "CV")
        return { ok: true }
      },

      archivarAvisoCV: (id) => {
        if (!get().hasHydrated) return { ok: false, error: "El almacenamiento aún se está hidratando. Intenta de nuevo." }
        const aviso = get().avisosCV.find(a => a.id === id)
        if (!aviso) return { ok: false, error: "No se puede archivar: el aviso no existe." }
        if (aviso.estado !== "publicado") {
          return { ok: false, error: `Solo un aviso Publicado puede archivarse (estado actual: ${aviso.estado}).` }
        }
        set(s => ({
          avisosCV: s.avisosCV.map(a => (a.id === id ? { ...a, estado: "archivado", fechaArchivado: new Date().toISOString().slice(0, 10) } : a)),
        }))
        registrarEvento(set, "CV_ARCHIVED", id, `Aviso "${aviso.titulo}" ARCHIVADO (retirado del carrusel; data conservada para auditoría).`, "CV")
        return { ok: true }
      },

      caducarAvisosCV: () => {
        if (!get().hasHydrated) return { ok: false, error: "El almacenamiento aún se está hidratando. Intenta de nuevo." }
        const hoyStr = new Date().toISOString().slice(0, 10)
        const vencidos = get().avisosCV.filter(a => a.estado === "publicado" && a.expiresAt && a.expiresAt < hoyStr)
        if (vencidos.length === 0) return { ok: true }
        set(s => ({
          avisosCV: s.avisosCV.map(a =>
            vencidos.some(v => v.id === a.id)
              ? { ...a, estado: "archivado", fechaArchivado: hoyStr }
              : a
          ),
        }))
        for (const aviso of vencidos) {
          registrarEvento(set, "CV_ARCHIVED", aviso.id, `Aviso "${aviso.titulo}" expiró automáticamente (${aviso.expiresAt}) y salió del carrusel.`, "CV")
        }
        return { ok: true }
      },

      savePlantillaCV: (plantilla) => {
        if (!get().hasHydrated) return { ok: false, error: "El almacenamiento aún se está hidratando. Intenta de nuevo." }
        const validacion = validarConEsquema(PlantillaCVSchema, plantilla)
        if (!validacion.ok) return validacion
        set(s => ({ plantillasCV: upsert(s.plantillasCV, validacion.data) }))
        return { ok: true }
      },

      removePlantillaCV: (id) => {
        if (!get().hasHydrated) return { ok: false, error: "El almacenamiento aún se está hidratando. Intenta de nuevo." }
        const enUso = get().avisosCV.filter(a => a.plantillaId === id)
        if (enUso.length > 0) {
          return { ok: false, error: `No se puede eliminar la plantilla: ${enUso.length} aviso(es) fueron activados desde ella.` }
        }
        set(s => ({ plantillasCV: s.plantillasCV.filter(p => p.id !== id) }))
        return { ok: true }
      },

      activarPlantillaCV: (id) => {
        if (!get().hasHydrated) return { ok: false, error: "El almacenamiento aún se está hidratando. Intenta de nuevo." }
        const plantilla = get().plantillasCV.find(p => p.id === id)
        if (!plantilla) return { ok: false, error: "No se puede activar: la plantilla no existe." }
        if (!plantilla.activa) return { ok: false, error: "La plantilla está desactivada por administración." }
        const hoyStr = new Date().toISOString().slice(0, 10)
        const aviso: AvisoCV = {
          id: `cv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          titulo: plantilla.titulo,
          cuerpo: plantilla.cuerpo,
          tipologia: plantilla.tipologia,
          duracionSegundos: plantilla.duracionSegundosSugerida,
          ...(plantilla.imagenUrl ? { imagenUrl: plantilla.imagenUrl } : {}),
          ...(plantilla.videoUrl ? { videoUrl: plantilla.videoUrl } : {}),
          pantallaCompleta: plantilla.pantallaCompleta,
          tags: [...plantilla.tags],
          estado: "publicado",
          requiereVistoBueno: false,
          origen: "plantilla",
          plantillaId: plantilla.id,
          fechaCreacion: hoyStr,
          fechaPublicacion: hoyStr,
        }
        const validacion = validarConEsquema(AvisoCVSchema, aviso)
        if (!validacion.ok) return validacion
        set(s => ({ avisosCV: upsert(s.avisosCV, validacion.data) }))
        registrarEvento(set, "CV_PUBLISHED", validacion.data.id, `Plantilla "${plantilla.titulo}" activada por personal de servicio: aviso PUBLICADO (${aviso.duracionSegundos}s).`, "CV")
        return { ok: true }
      },

      publicarActaEnCV: (actaId) => {
        if (!get().hasHydrated) return { ok: false, error: "El almacenamiento aún se está hidratando. Intenta de nuevo." }
        const acta = get().actasGD.find(a => a.id === actaId)
        if (!acta) return { ok: false, error: "No se puede publicar: el acta no existe." }
        if (acta.estado !== "publicada") {
          return { ok: false, error: "Solo un acta Publicada por quórum puede difundirse en el visor." }
        }
        if (acta.avisoCVReferencia && acta.avisoCVReferencia !== "pendiente") {
          return { ok: false, error: `El acta ya fue publicada en el visor (aviso ${acta.avisoCVReferencia}).` }
        }
        const hoyStr = new Date().toISOString().slice(0, 10)
        const temas = acta.tablaTemas.length > 0 ? `Temas: ${acta.tablaTemas.join("; ")}. ` : ""
        const minuta = acta.minuta ? acta.minuta.slice(0, 240) : ""
        const aviso: AvisoCV = {
          id: `cv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          titulo: `Acta de reunión del ${acta.fecha}`,
          cuerpo: `Reunión de directiva en ${acta.lugar}. ${temas}${minuta}`.trim(),
          tipologia: "info",
          duracionSegundos: 15,
          pantallaCompleta: false,
          tags: ["directiva", "acta"],
          estado: "publicado",
          requiereVistoBueno: false,
          origen: "acta_gd",
          actaId: acta.id,
          fechaCreacion: hoyStr,
          fechaPublicacion: hoyStr,
        }
        const validacion = validarConEsquema(AvisoCVSchema, aviso)
        if (!validacion.ok) return validacion
        set(s => ({
          avisosCV: upsert(s.avisosCV, validacion.data),
          actasGD: s.actasGD.map(a => (a.id === actaId ? { ...a, avisoCVReferencia: validacion.data.id } : a)),
        }))
        registrarEvento(set, "CV_PUBLISHED", validacion.data.id, `Aviso "${aviso.titulo}" PUBLICADO desde acta ${acta.id}; referencia avisoCVReferencia materializada.`, "CV")
        return { ok: true }
      },

      // --- FI: Finanzas y Morosidad ---
      saveFondoFI: (fondo) => {
        if (!get().hasHydrated) return { ok: false, error: "El almacenamiento aún se está hidratando. Intenta de nuevo." }
        const validacion = validarConEsquema(FondoFISchema, fondo)
        if (!validacion.ok) return validacion
        const duplicado = get().fondosFI.find(f => f.nombre.toLowerCase() === validacion.data.nombre.toLowerCase() && f.id !== validacion.data.id)
        if (duplicado) return { ok: false, error: `Ya existe un fondo con el nombre "${validacion.data.nombre}".` }
        set(s => ({ fondosFI: upsert(s.fondosFI, validacion.data) }))
        return { ok: true }
      },

      removeFondoFI: (id) => {
        if (!get().hasHydrated) return { ok: false, error: "El almacenamiento aún se está hidratando. Intenta de nuevo." }
        const egresos = get().egresosFI.filter(e => e.fondoId === id).length
        const cobros = get().cobrosFI.filter(c => c.fondoId === id).length
        const aportes = get().emisionesGC.filter(e => e.fondoReservaAporte?.fondoId === id).length
        const total = egresos + cobros + aportes
        if (total > 0) {
          return { ok: false, error: `No se puede eliminar el fondo: ${total} movimiento(s) financiero(s) lo imputan.` }
        }
        set(s => ({ fondosFI: s.fondosFI.filter(f => f.id !== id) }))
        return { ok: true }
      },

      saveEgresoFI: (egreso) => {
        if (!get().hasHydrated) return { ok: false, error: "El almacenamiento aún se está hidratando. Intenta de nuevo." }
        const esNuevo = !get().egresosFI.some(e => e.id === egreso.id)
        let candidato: EgresoFI = egreso
        if (esNuevo) candidato = { ...egreso, folio: siguienteFolioFE(get) }
        const validacion = validarConEsquema(EgresoFISchema, candidato)
        if (!validacion.ok) return validacion
        const registro = validacion.data
        const fondo = get().fondosFI.find(f => f.id === registro.fondoId)
        if (!fondo) return { ok: false, error: "No se puede guardar el gasto: el fondo de imputación no existe." }
        if (!fondo.activo) return { ok: false, error: `No se puede guardar el gasto: el fondo "${fondo.nombre}" está inactivo.` }
        for (const microId of registro.microSectoresIds ?? []) {
          if (!get().microSectores.some(m => m.id === microId)) {
            return { ok: false, error: "No se puede guardar el gasto: uno de los sub-sectores diferenciados no existe." }
          }
        }
        if (registro.unidadId && !get().unidades.some(u => u.id === registro.unidadId)) {
          return { ok: false, error: "No se puede guardar el gasto: la unidad indicada no existe en el inventario." }
        }
        if (registro.aprobacionActaGDId && !get().actasGD.some(a => a.id === registro.aprobacionActaGDId)) {
          return { ok: false, error: "No se puede guardar el gasto: el acta de aprobación indicada no existe." }
        }
        set(s => ({ egresosFI: upsert(s.egresosFI, registro) }))
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

      removeEgresoFI: (id) => {
        if (!get().hasHydrated) return { ok: false, error: "El almacenamiento aún se está hidratando. Intenta de nuevo." }
        set(s => ({ egresosFI: s.egresosFI.filter(e => e.id !== id) }))
        return { ok: true }
      },

      emitirGastoComun: (input) => {
        if (!get().hasHydrated) return { ok: false, error: "El almacenamiento aún se está hidratando. Intenta de nuevo." }
        const configuracion = get().configuracion
        if (!configuracion || configuracion.modoCalculoGC === undefined) {
          return { ok: false, error: "CF no cargado: la configuración global debe estar disponible para emitir el Gasto Común." }
        }
        if (!/^\d{4}-\d{2}$/.test(input.periodo)) {
          return { ok: false, error: "El periodo debe tener formato AAAA-MM." }
        }
        if (get().emisionesGC.some(e => e.periodo === input.periodo)) {
          return { ok: false, error: `El periodo ${input.periodo} ya fue procesado previamente.` }
        }
        const modo = configuracion.modoCalculoGC
        const fondoGC = get().fondosFI.find(f => f.tipo === "gasto_comun" && f.activo)
        if (!fondoGC) {
          return { ok: false, error: "No existe un Fondo de Gasto Común activo para imputar la emisión." }
        }
        const elegibles = get().unidades.filter(u => {
          if (u.id.startsWith("u-E-")) return false
          if (input.unidadIds && input.unidadIds.length > 0) return input.unidadIds.includes(u.id)
          return true
        })
        if (elegibles.length === 0) {
          return { ok: false, error: "No hay unidades elegibles para la emisión." }
        }
        const sinResponsable = elegibles.filter(
          u => !get().vinculos.some(v => v.unidadId === u.id && v.rol === "propietario" && !v.fechaFin)
        )
        if (sinResponsable.length > 0) {
          const refs = sinResponsable.slice(0, 3).map(u => refUnidad(get, u.id)).join(", ")
          return { ok: false, error: `Emisión bloqueada: ${sinResponsable.length} unidad(es) sin responsable de cobro asignado (${refs}${sinResponsable.length > 3 ? "…" : ""}).` }
        }
        if (modo === "variable" && (!input.gastoTotal || input.gastoTotal <= 0)) {
          return { ok: false, error: "La modalidad prorrateo exige definir el gasto total a recaudar." }
        }

        const hoyStr = hoyISO()
        const vencimiento = input.fechaVencimiento ?? vencimientoDesdeDiaCorte(input.periodo, configuracion.diaCortePago)
        const stamp = Date.now()
        const emisionId = `egc-${stamp}-${Math.random().toString(36).slice(2, 8)}`
        const lineas: EmisionGC["lineas"] = []
        const nuevosCobros: CobroFI[] = []
        elegibles.forEach((u, idx) => {
          const responsable = get().vinculos.find(v => v.unidadId === u.id && v.rol === "propietario" && !v.fechaFin)!
          let monto: number
          if (modo === "fijo") {
            const tipo = get().tiposUnidad.find(t => t.id === u.tipoUnidadId)
            monto = Math.round(tipo?.montoBaseGc ?? 0)
          } else {
            monto = Math.round((input.gastoTotal ?? 0) * u.prorrateo)
          }
          const cobroId = `cob-${stamp}-${idx}-${Math.random().toString(36).slice(2, 8)}`
          lineas.push({ unidadId: u.id, responsablePersonaId: responsable.personaId, monto, cobroId })
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
        const fondoReserva = get().fondosFI.find(f => f.tipo === "reserva" && f.activo && (f.porcentajeAporte ?? 0) > 0)
        const totalEmitido = lineas.reduce((acc, l) => acc + l.monto, 0)
        const aporte = fondoReserva
          ? { fondoId: fondoReserva.id, monto: Math.round((totalEmitido * (fondoReserva.porcentajeAporte ?? 0)) / 100) }
          : undefined
        const emision: EmisionGC = {
          id: emisionId,
          periodo: input.periodo,
          modo,
          gastoTotal: modo === "variable" ? (input.gastoTotal ?? totalEmitido) : totalEmitido,
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
        set(s => ({
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
        if (!get().hasHydrated) return { ok: false, error: "El almacenamiento aún se está hidratando. Intenta de nuevo." }
        const cobro = get().cobrosFI.find(c => c.id === cobroId)
        if (!cobro) return { ok: false, error: "No se puede aplicar mora: el cobro no existe." }
        if (!cobro.fechaVencimiento) return { ok: false, error: "El cobro no tiene fecha de vencimiento registrada." }
        if (tasaMensualPct <= 0) return { ok: false, error: "La tasa de mora debe ser mayor a cero." }
        const hoyStr = hoyISO()
        const dias = Math.max(
          0,
          Math.floor((new Date(`${hoyStr}T00:00:00`).getTime() - new Date(`${cobro.fechaVencimiento}T00:00:00`).getTime()) / 86400000)
        )
        if (dias <= 0) return { ok: false, error: "El cobro aún no está vencido: no procede aplicar mora." }
        const pendiente = saldoPendiente(cobro)
        if (pendiente <= 0) return { ok: false, error: "El cobro ya está completamente pagado." }
        if (cobro.moras.some(m => m.fecha === hoyStr)) return { ok: true }
        const monto = montoMoraPropuesta(pendiente, dias, tasaMensualPct)
        if (monto <= 0) return { ok: false, error: "El cálculo no arrojó mora aplicable." }
        set(s => ({
          cobrosFI: s.cobrosFI.map(c =>
            c.id === cobroId
              ? {
                  ...c,
                  moras: [
                    ...c.moras,
                    { id: `mora-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, monto, diasAtraso: dias, tasaMensualPct, fecha: hoyStr },
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
        if (!get().hasHydrated) return { ok: false, error: "El almacenamiento aún se está hidratando. Intenta de nuevo." }
        const cobro = get().cobrosFI.find(c => c.id === cobroId)
        if (!cobro) return { ok: false, error: "No se puede registrar el pago: el cobro no existe." }
        if (!(pago.monto > 0)) return { ok: false, error: "El monto del pago debe ser mayor a cero." }
        if (pago.medio.trim().length === 0) return { ok: false, error: "Debe indicar el medio de pago." }
        const pendiente = saldoPendiente(cobro)
        if (pendiente <= 0) return { ok: false, error: "El cobro ya está completamente pagado." }
        const hoyStr = hoyISO()
        const ajuste = pago.monto !== pendiente
        let diferencia: CobroFI["diferencias"][number] | undefined
        if (ajuste) {
          const justificacion = pago.ajusteJustificacion?.trim()
          if (!justificacion) {
            return { ok: false, error: "El ajuste manual exige una justificación obligatoria para generar el informe de diferencia." }
          }
          if (justificacion.length < 10) {
            return { ok: false, error: "La justificación debe explicar el motivo del ajuste (mínimo 10 caracteres)." }
          }
          diferencia = {
            id: `dif-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            tipo: pago.monto < pendiente ? "descuento" : "recargo",
            esperado: exigibleTotal(cobro),
            recibido: totalPagado(cobro) + pago.monto,
            diferencia: Math.abs(pago.monto - pendiente),
            justificacion,
            fecha: hoyStr,
          }
        }
        set(s => ({
          cobrosFI: s.cobrosFI.map(c =>
            c.id === cobroId
              ? {
                  ...c,
                  pagos: [
                    ...c.pagos,
                    { id: `pag-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, monto: pago.monto, fecha: hoyStr, medio: pago.medio.trim() },
                  ],
                  ...(diferencia ? { diferencias: [...c.diferencias, diferencia] } : {}),
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
        const propietario = get().vinculos.find(v => v.unidadId === cobro.unidadId && v.rol === "propietario" && !v.fechaFin)
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
        if (!get().hasHydrated) return { ok: false, error: "El almacenamiento aún se está hidratando. Intenta de nuevo." }
        if (!get().unidades.some(u => u.id === unidadId)) {
          return { ok: false, error: "No se puede enviar la cobranza: la unidad no existe en el inventario." }
        }
        const hoyStr = hoyISO()
        const vencidos = get().cobrosFI.filter(c => c.unidadId === unidadId && estadoDeCobro(c, hoyStr) === "vencido")
        if (vencidos.length === 0) {
          return { ok: false, error: "La unidad no registra deuda vencida: no hay nada que cobrar." }
        }
        const total = vencidos.reduce((acc, c) => acc + saldoPendiente(c), 0)
        const propietario = get().vinculos.find(v => v.unidadId === unidadId && v.rol === "propietario" && !v.fechaFin)
        if (!propietario) {
          return { ok: false, error: "La unidad no tiene responsable de cobro asignado." }
        }
        const detalle = vencidos.map(c => `${c.descripcion} ($${saldoPendiente(c).toLocaleString("es-CL")})`).join("; ")
        get().notify({
          destinatarioRol: "propietario",
          destinatarioPersonaId: propietario.personaId,
          asunto: `Recordatorio de deuda vencida (${refUnidad(get, unidadId)})`,
          cuerpo: `Su unidad registra $${total.toLocaleString("es-CL")} en ${vencidos.length} cobro(s) vencido(s): ${detalle}. Regularice su situación para evitar corte de servicios.`,
          moduloOrigen: "FI",
          unidadId,
        })
        registrarEvento(set, "FI_COBRANZA_SENT", unidadId, `Gestión de cobranza enviada a ${refUnidad(get, unidadId)}: $${total.toLocaleString("es-CL")} en ${vencidos.length} cobro(s) vencido(s).`, "FI")
        return { ok: true }
      },

      retirarFondoFI: (input) => {
        if (!get().hasHydrated) return { ok: false, error: "El almacenamiento aún se está hidratando. Intenta de nuevo." }
        const fondo = get().fondosFI.find(f => f.id === input.fondoId)
        if (!fondo) return { ok: false, error: "No se puede retirar: el fondo no existe." }
        if (!fondo.activo) return { ok: false, error: `No se puede retirar: el fondo "${fondo.nombre}" está inactivo.` }
        if (!(input.monto > 0)) return { ok: false, error: "El monto del retiro debe ser mayor a cero." }
        if (input.descripcion.trim().length === 0) return { ok: false, error: "El retiro exige describir el uso del dinero." }
        let actaPublicada: string | undefined
        if (input.aprobacionActaGDId) {
          const acta = get().actasGD.find(a => a.id === input.aprobacionActaGDId)
          if (!acta) return { ok: false, error: "El acta de aprobación indicada no existe." }
          if (acta.estado !== "publicada") {
            return { ok: false, error: "Solo un acta Publicada por la directiva respalda el retiro." }
          }
          actaPublicada = acta.id
        }
        if (fondo.tipo === "reserva" && !actaPublicada) {
          return { ok: false, error: "El retiro del Fondo de Reserva exige aprobación documentada mediante un acta publicada de la directiva." }
        }
        const saldo = saldoFondo(fondo.id, { cobros: get().cobrosFI, egresos: get().egresosFI, emisiones: get().emisionesGC })
        if (input.monto > saldo) {
          return { ok: false, error: `Saldo insuficiente en "${fondo.nombre}": disponible $${saldo.toLocaleString("es-CL")} para un retiro de $${input.monto.toLocaleString("es-CL")}.` }
        }
        const egreso: EgresoFI = {
          id: `egr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
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
        set(s => ({ egresosFI: upsert(s.egresosFI, validacion.data) }))
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
        if (!get().hasHydrated) return { ok: false, error: "El almacenamiento aún se está hidratando. Intenta de nuevo." }
        const persona = get().personas.find(p => p.id === personaId)
        if (!persona?.datosLaborales) return { ok: false, error: "La persona no tiene ficha laboral de PE." }
        const entrada = { id: `he-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, ...horaExtra }
        const actualizada: Persona = {
          ...persona,
          datosLaborales: { ...persona.datosLaborales, horasExtras: [...(persona.datosLaborales.horasExtras ?? []), entrada] },
        }
        const validacion = validarConEsquema(PersonaSchema, actualizada)
        if (!validacion.ok) return validacion
        set(s => ({ personas: upsert(s.personas, validacion.data) }))
        registrarEvento(set, "PE_HORA_EXTRA_REGISTRADA", personaId, `${horaExtra.horas} h extra (${horaExtra.motivo}) registradas para ${persona.nombres} ${persona.apellidos}.`, "PE")
        return { ok: true }
      },

      registrarEvaluacionPE: (personaId, evaluacion) => {
        if (!get().hasHydrated) return { ok: false, error: "El almacenamiento aún se está hidratando. Intenta de nuevo." }
        const persona = get().personas.find(p => p.id === personaId)
        if (!persona?.datosLaborales) return { ok: false, error: "La persona no tiene ficha laboral de PE." }
        const entrada = { id: `ev-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, ...evaluacion }
        const actualizada: Persona = {
          ...persona,
          datosLaborales: { ...persona.datosLaborales, evaluaciones: [...(persona.datosLaborales.evaluaciones ?? []), entrada] },
        }
        const validacion = validarConEsquema(PersonaSchema, actualizada)
        if (!validacion.ok) return validacion
        set(s => ({ personas: upsert(s.personas, validacion.data) }))
        registrarEvento(set, "PE_EVALUACION_REGISTRADA", personaId, `Evaluación de desempeño (${evaluacion.puntaje}/7) registrada para ${persona.nombres} ${persona.apellidos}.`, "PE")
        return { ok: true }
      },

      iniciarTurnoPE: (personaId, jornadaId) => {
        if (!get().hasHydrated) return { ok: false, error: "El almacenamiento aún se está hidratando. Intenta de nuevo." }
        const persona = get().personas.find(p => p.id === personaId)
        if (!persona) return { ok: false, error: "El trabajador no existe en el Maestro de Personas." }
        if (!persona.datosLaborales) return { ok: false, error: "La persona no tiene ficha laboral de PE." }
        if (!get().maestros.jornadas.some(j => j.id === jornadaId)) return { ok: false, error: "jornadaId no existe en el maestro de jornadas." }
        registrarEvento(
          set,
          "PE_START_SHIFT",
          personaId,
          `${persona.nombres} ${persona.apellidos} inicia turno (${get().maestros.jornadas.find(j => j.id === jornadaId)?.nombre ?? jornadaId}).`,
          "PE"
        )
        return { ok: true }
      },

      completarTareaMonitoreoPE: (trabajoMTId) => {
        if (!get().hasHydrated) return { ok: false, error: "El almacenamiento aún se está hidratando. Intenta de nuevo." }
        const trabajo = get().trabajosMT.find(t => t.id === trabajoMTId)
        if (!trabajo) return { ok: false, error: "La tarea indicada no existe en Mantenimiento." }
        if (trabajo.estado === "finalizado" || trabajo.estado === "cancelado") {
          return { ok: false, error: "La tarea ya se encuentra cerrada." }
        }
        set(s => ({
          trabajosMT: s.trabajosMT.map(t =>
            t.id === trabajoMTId ? { ...t, estado: "finalizado" as const, fechaTermino: t.fechaTermino ?? hoyISO() } : t
          ),
        }))
        registrarEvento(set, "PE_TASK_DONE", trabajoMTId, `Tarea "${trabajo.titulo}" completada desde el panel de monitoreo de PE.`, "PE")
        return { ok: true }
      },

      saveBitacoraVisitaPE: (visita) => {
        if (!get().hasHydrated) return { ok: false, error: "El almacenamiento aún se está hidratando. Intenta de nuevo." }
        const validacion = validarConEsquema(BitacoraVisitaPESchema, visita)
        if (!validacion.ok) return validacion
        const v = validacion.data
        if (!get().maestros.jornadas.some(j => j.id === v.jornadaId)) {
          return { ok: false, error: "jornadaId no existe en el maestro de jornadas." }
        }
        if (v.unidadId && !get().unidades.some(u => u.id === v.unidadId)) {
          return { ok: false, error: "unidadId no existe en el inventario." }
        }
        if (v.destinoPersonaId && !get().personas.some(p => p.id === v.destinoPersonaId)) {
          return { ok: false, error: "destinoPersonaId no existe en el Maestro de Personas." }
        }
        set(s => ({ bitacoraVisitasPE: upsert(s.bitacoraVisitasPE, v) }))
        if (v.estado === "ingresada") {
          const hora = v.horaIngreso ?? new Date().toTimeString().slice(0, 5)
          set(s => ({
            bitacoraVisitasPE: s.bitacoraVisitasPE.map(x => (x.id === v.id ? { ...x, horaIngreso: x.horaIngreso ?? hora } : x)),
          }))
          registrarEvento(set, "PE_VISITA_INGRESADA", v.id, `Visita ${v.nombre} ingresada (${v.origenAgenda === "pre_agendada" ? "agendada" : "sin aviso"}) a las ${hora}.`, "PE")
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
        if (!get().hasHydrated) return { ok: false, error: "El almacenamiento aún se está hidratando. Intenta de nuevo." }
        const visita = get().bitacoraVisitasPE.find(v => v.id === id)
        if (!visita) return { ok: false, error: "La visita agendada no existe." }
        if (visita.estado !== "agendada") return { ok: false, error: "Solo las visitas agendadas pueden marcarse como ingresadas." }
        const hora = new Date().toTimeString().slice(0, 5)
        set(s => ({
          bitacoraVisitasPE: s.bitacoraVisitasPE.map(v => (v.id === id ? { ...v, estado: "ingresada" as const, horaIngreso: hora } : v)),
        }))
        registrarEvento(set, "PE_VISITA_INGRESADA", id, `Visita pre-agendada ${visita.nombre} sellada a las ${hora}.`, "PE")
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

      removeBitacoraVisitaPE: (id) => {
        if (!get().hasHydrated) return { ok: false, error: "El almacenamiento aún se está hidratando. Intenta de nuevo." }
        const visita = get().bitacoraVisitasPE.find(v => v.id === id)
        if (visita?.estado === "ingresada") {
          return { ok: false, error: "No se puede eliminar una visita ya ingresada (registro auditable)." }
        }
        set(s => ({ bitacoraVisitasPE: s.bitacoraVisitasPE.filter(v => v.id !== id) }))
        return { ok: true }
      },

      saveEncomiendaPE: (encomienda) => {
        if (!get().hasHydrated) return { ok: false, error: "El almacenamiento aún se está hidratando. Intenta de nuevo." }
        const validacion = validarConEsquema(EncomiendaPESchema, encomienda)
        if (!validacion.ok) return validacion
        const e = validacion.data
        if (!get().maestros.couriers.some(c => c.id === e.courierId)) {
          return { ok: false, error: "courierId no existe en el maestro de couriers." }
        }
        if (e.destinatarioPersonaId && !get().personas.some(p => p.id === e.destinatarioPersonaId)) {
          return { ok: false, error: "destinatarioPersonaId no existe en el Maestro de Personas." }
        }
        if (e.unidadId && !get().unidades.some(u => u.id === e.unidadId)) {
          return { ok: false, error: "unidadId no existe en el inventario." }
        }
        set(s => ({ encomiendasPE: upsert(s.encomiendasPE, e) }))
        registrarEvento(set, "PE_ENCOMIENDA_RECIBIDA", e.id, `Encomienda recibida de ${get().maestros.couriers.find(c => c.id === e.courierId)?.nombre ?? e.courierId}.`, "PE")
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
        if (!get().hasHydrated) return { ok: false, error: "El almacenamiento aún se está hidratando. Intenta de nuevo." }
        const encomienda = get().encomiendasPE.find(e => e.id === id)
        if (!encomienda) return { ok: false, error: "La encomienda no existe." }
        if (encomienda.estado === "retirada") return { ok: false, error: "La encomienda ya fue retirada." }
        if (!retiradoPor || retiradoPor.trim().length === 0) return { ok: false, error: "Debe identificar quién retira la encomienda." }
        set(s => ({
          encomiendasPE: s.encomiendasPE.map(e =>
            e.id === id
              ? { ...e, estado: "retirada" as const, retiro: { retiradoPor: retiradoPor.trim(), fechaRetiro: hoyISO(), relacion } }
              : e
          ),
        }))
        registrarEvento(set, "PE_ENCOMIENDA_RETIRADA", id, `Encomienda entregada a ${retiradoPor.trim()}.`, "PE")
        return { ok: true }
      },

      removeEncomiendaPE: (id) => {
        if (!get().hasHydrated) return { ok: false, error: "El almacenamiento aún se está hidratando. Intenta de nuevo." }
        const encomienda = get().encomiendasPE.find(e => e.id === id)
        if (encomienda?.estado === "retirada") {
          return { ok: false, error: "No se puede eliminar una encomienda retirada (registro auditable)." }
        }
        set(s => ({ encomiendasPE: s.encomiendasPE.filter(e => e.id !== id) }))
        return { ok: true }
      },

      saveIngresoContratistaPE: (ingreso) => {
        if (!get().hasHydrated) return { ok: false, error: "El almacenamiento aún se está hidratando. Intenta de nuevo." }
        const validacion = validarConEsquema(IngresoContratistaPESchema, ingreso)
        if (!validacion.ok) return validacion
        const i = validacion.data
        if (!get().maestros.contratistas.some(c => c.id === i.contratistaId)) {
          return { ok: false, error: "contratistaId no existe en el maestro de contratistas." }
        }
        if (!get().maestros.jornadas.some(j => j.id === i.jornadaId)) {
          return { ok: false, error: "jornadaId no existe en el maestro de jornadas." }
        }
        if (i.unidadId && !get().unidades.some(u => u.id === i.unidadId)) {
          return { ok: false, error: "unidadId no existe en el inventario." }
        }
        if (i.personaAgendaId && !get().personas.some(p => p.id === i.personaAgendaId)) {
          return { ok: false, error: "personaAgendaId no existe en el Maestro de Personas." }
        }
        set(s => ({ ingresosContratistasPE: upsert(s.ingresosContratistasPE, i) }))
        return { ok: true }
      },

      confirmarIngresoContratistaPE: (id) => {
        if (!get().hasHydrated) return { ok: false, error: "El almacenamiento aún se está hidratando. Intenta de nuevo." }
        const ingreso = get().ingresosContratistasPE.find(i => i.id === id)
        if (!ingreso) return { ok: false, error: "El ingreso agendado no existe." }
        if (ingreso.estado !== "agendado") return { ok: false, error: "Solo ingresos agendados pueden confirmarse." }
        const hora = new Date().toTimeString().slice(0, 5)
        set(s => ({
          ingresosContratistasPE: s.ingresosContratistasPE.map(i => (i.id === id ? { ...i, estado: "ingresado" as const, horaIngreso: hora } : i)),
        }))
        const contratista = get().maestros.contratistas.find(c => c.id === ingreso.contratistaId)?.nombre ?? ingreso.contratistaId
        registrarEvento(set, "PE_CONTRATISTA_INGRESADO", id, `Contratista ${contratista} ingresó (${ingreso.motivo.slice(0, 60)}).`, "PE")
        return { ok: true }
      },

      removeIngresoContratistaPE: (id) => {
        if (!get().hasHydrated) return { ok: false, error: "El almacenamiento aún se está hidratando. Intenta de nuevo." }
        const ingreso = get().ingresosContratistasPE.find(i => i.id === id)
        if (ingreso?.estado === "ingresado") {
          return { ok: false, error: "No se puede eliminar un contratista ya ingresado (registro auditable)." }
        }
        set(s => ({ ingresosContratistasPE: s.ingresosContratistasPE.filter(i => i.id !== id) }))
        return { ok: true }
      },

      saveProveedorPE: (proveedor) => {
        if (!get().hasHydrated) return { ok: false, error: "El almacenamiento aún se está hidratando. Intenta de nuevo." }
        const validacion = validarConEsquema(ProveedorPESchema, proveedor)
        if (!validacion.ok) return validacion
        const duplicado = get().proveedoresPE.find(p => p.nombre.toLowerCase() === validacion.data.nombre.toLowerCase() && p.id !== validacion.data.id)
        if (duplicado) return { ok: false, error: `Ya existe un proveedor con el nombre "${validacion.data.nombre}".` }
        set(s => ({ proveedoresPE: upsert(s.proveedoresPE, validacion.data) }))
        registrarEvento(set, "PE_PROVEEDOR_SAVED", validacion.data.id, `Proveedor "${validacion.data.nombre}" (${validacion.data.rubro}) guardado.`, "PE")
        return { ok: true }
      },

      removeProveedorPE: (id) => {
        if (!get().hasHydrated) return { ok: false, error: "El almacenamiento aún se está hidratando. Intenta de nuevo." }
        const mantenciones = get().mantencionesPreventivasPE.filter(m => m.proveedorId === id)
        const visitas = get().visitasTecnicasPE.filter(v => v.proveedorId === id)
        if (mantenciones.length > 0 || visitas.length > 0) {
          return { ok: false, error: `No se puede eliminar el proveedor: ${mantenciones.length} mantención(es) y ${visitas.length} visita(s) técnica(s) asociadas.` }
        }
        set(s => ({ proveedoresPE: s.proveedoresPE.filter(p => p.id !== id) }))
        return { ok: true }
      },

      saveMantencionPE: (mantencion) => {
        if (!get().hasHydrated) return { ok: false, error: "El almacenamiento aún se está hidratando. Intenta de nuevo." }
        const validacion = validarConEsquema(MantencionPreventivaPESchema, mantencion)
        if (!validacion.ok) return validacion
        const proveedor = get().proveedoresPE.find(p => p.id === validacion.data.proveedorId)
        if (!proveedor) return { ok: false, error: "proveedorId no existe en el catálogo de proveedores." }
        if (!proveedor.activo) return { ok: false, error: `El proveedor "${proveedor.nombre}" está inactivo.` }
        set(s => ({ mantencionesPreventivasPE: upsert(s.mantencionesPreventivasPE, validacion.data) }))
        registrarEvento(set, "PE_MANTENCION_SAVED", validacion.data.id, `Mantención preventiva "${validacion.data.descripcion}" programada para ${validacion.data.proximaFecha}.`, "PE")
        return { ok: true }
      },

      removeMantencionPE: (id) => {
        if (!get().hasHydrated) return { ok: false, error: "El almacenamiento aún se está hidratando. Intenta de nuevo." }
        const vinculadas = get().visitasTecnicasPE.filter(v => v.mantencionId === id)
        if (vinculadas.length > 0) {
          return { ok: false, error: `No se puede eliminar la mantención: ${vinculadas.length} visita(s) técnica(s) asociadas.` }
        }
        set(s => ({ mantencionesPreventivasPE: s.mantencionesPreventivasPE.filter(m => m.id !== id) }))
        return { ok: true }
      },

      registrarVisitaTecnicaPE: (visita) => {
        if (!get().hasHydrated) return { ok: false, error: "El almacenamiento aún se está hidratando. Intenta de nuevo." }
        const validacion = validarConEsquema(VisitaTecnicaPESchema, visita)
        if (!validacion.ok) return validacion
        const v = validacion.data
        const proveedor = get().proveedoresPE.find(p => p.id === v.proveedorId)
        if (!proveedor) return { ok: false, error: "proveedorId no existe en el catálogo de proveedores." }
        const mantencion = get().mantencionesPreventivasPE.find(m => m.id === v.mantencionId)
        if (v.mantencionId && !mantencion) {
          return { ok: false, error: "mantencionId no existe en el calendario preventivo." }
        }
        if (v.supervisorPersonaId && !get().personas.some(p => p.id === v.supervisorPersonaId)) {
          return { ok: false, error: "supervisorPersonaId no existe en el Maestro de Personas." }
        }
        if (v.unidadId && !get().unidades.some(u => u.id === v.unidadId)) {
          return { ok: false, error: "unidadId no existe en el inventario." }
        }
        set(s => ({ visitasTecnicasPE: upsert(s.visitasTecnicasPE, v) }))
        // Ciclo preventivo cerrado: la próxima fecha avanza según periodicidad.
        if (mantencion) {
          const proxima = proximaFechaPreventiva(v.fecha, mantencion.periodicidadMeses)
          set(s => ({
            mantencionesPreventivasPE: s.mantencionesPreventivasPE.map(m =>
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
        if (!get().hasHydrated) return { ok: false, error: "El almacenamiento aún se está hidratando. Intenta de nuevo." }
        const trabajador = get().personas.find(p => p.id === input.trabajadorPersonaId)
        if (!trabajador) return { ok: false, error: "El trabajador no existe en el Maestro de Personas." }
        if (!trabajador.datosLaborales) return { ok: false, error: "El trabajador no tiene ficha laboral de PE." }
        if (!get().maestros.jornadas.some(j => j.id === input.jornadaReportadaId)) {
          return { ok: false, error: "jornadaReportadaId no existe en el maestro de jornadas." }
        }
        // Anti-negligencia: incidencias marcadas exigen descripción y evidencia.
        if (input.incidencias.hubo) {
          if (!input.incidencias.descripcion || input.incidencias.descripcion.trim().length < 20) {
            return { ok: false, error: "Con incidencias marcadas debe describir lo ocurrido (mínimo 20 caracteres)." }
          }
          if (!input.incidencias.evidencias || input.incidencias.evidencias.length === 0) {
            return { ok: false, error: "Con incidencias marcadas debe adjuntar al menos una evidencia por referencia (URL)." }
          }
        }
        if (input.checklistInstalaciones.length === 0 || input.checklistEquipamiento.length === 0) {
          return { ok: false, error: "El cierre exige los checklist de instalaciones y equipamiento." }
        }
        const duplicado = get().cierresTurnoPE.some(c =>
          c.fecha === input.fecha &&
          c.jornadaReportadaId === input.jornadaReportadaId &&
          c.trabajadorPersonaId === input.trabajadorPersonaId
        )
        if (duplicado) {
          return { ok: false, error: "Este trabajador ya registró un cierre para esa fecha y jornada." }
        }
        const cierre: CierreTurnoPE = {
          ...input,
          incidencias: {
            hubo: input.incidencias.hubo,
            descripcion: input.incidencias.descripcion,
            evidencias: input.incidencias.evidencias,
          },
          id: input.id ?? `pe-cierre-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          historialCambios: [],
          notificadoAAdmin: true,
        }
        const validacion = validarConEsquema(CierreTurnoPESchema, cierre)
        if (!validacion.ok) return validacion
        set(s => ({ cierresTurnoPE: upsert(s.cierresTurnoPE, validacion.data) }))
        const jornadaNombre = get().maestros.jornadas.find(j => j.id === input.jornadaReportadaId)?.nombre ?? input.jornadaReportadaId
        const resumen = [
          input.novedadesGenerales?.trim(),
          input.incidencias.hubo ? `Incidencias: ${input.incidencias.descripcion!.slice(0, 120)}` : "Sin incidencias reportadas",
        ].filter(Boolean).join(". ")
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

      editarCierreTurnoPE: (id, cambios, resumen) => {
        if (!get().hasHydrated) return { ok: false, error: "El almacenamiento aún se está hidratando. Intenta de nuevo." }
        const cierre = get().cierresTurnoPE.find(c => c.id === id)
        if (!cierre) return { ok: false, error: "El cierre de turno no existe." }
        if (!resumen || resumen.trim().length < 5) {
          return { ok: false, error: "Cada edición exige un resumen del cambio (mínimo 5 caracteres)." }
        }
        const fusionado: CierreTurnoPE = {
          ...cierre,
          ...cambios,
          incidencias: cambios.incidencias ?? cierre.incidencias,
          checklistInstalaciones: cambios.checklistInstalaciones ?? cierre.checklistInstalaciones,
          checklistEquipamiento: cambios.checklistEquipamiento ?? cierre.checklistEquipamiento,
          jornadaReportadaId: cambios.jornadaReportadaId ?? cierre.jornadaReportadaId,
          novedadesGenerales: cambios.novedadesGenerales ?? cierre.novedadesGenerales,
        }
        if (fusionado.incidencias.hubo) {
          if (!fusionado.incidencias.descripcion || fusionado.incidencias.descripcion.trim().length < 20) {
            return { ok: false, error: "Con incidencias marcadas debe describir lo ocurrido (mínimo 20 caracteres)." }
          }
          if (!fusionado.incidencias.evidencias || fusionado.incidencias.evidencias.length === 0) {
            return { ok: false, error: "Con incidencias marcadas debe adjuntar al menos una evidencia por referencia (URL)." }
          }
        }
        if (fusionado.jornadaReportadaId && !get().maestros.jornadas.some(j => j.id === fusionado.jornadaReportadaId)) {
          return { ok: false, error: "jornadaReportadaId no existe en el maestro de jornadas." }
        }
        const editado: CierreTurnoPE = {
          ...fusionado,
          historialCambios: [...cierre.historialCambios, { fecha: hoyISO(), resumen: resumen.trim() }],
        }
        const validacion = validarConEsquema(CierreTurnoPESchema, editado)
        if (!validacion.ok) return validacion
        set(s => ({ cierresTurnoPE: upsert(s.cierresTurnoPE, validacion.data) }))
        registrarEvento(set, "PE_CIERRE_EDITADO", id, `Cierre de turno editado: ${resumen.trim()}`, "PE")
        return { ok: true }
      },

      removeCierreTurnoPE: (id) => {
        if (!get().hasHydrated) return { ok: false, error: "El almacenamiento aún se está hidratando. Intenta de nuevo." }
        const cierre = get().cierresTurnoPE.find(c => c.id === id)
        if (!cierre) return { ok: false, error: "El cierre de turno no existe." }
        // Auditoría: solo cierres TEST o del día en curso son removibles.
        if (!id.startsWith("test-") && cierre.fecha !== hoyISO()) {
          return { ok: false, error: "Solo pueden eliminarse cierres del día en curso (los históricos son auditablemente inmutables)." }
        }
        set(s => ({ cierresTurnoPE: s.cierresTurnoPE.filter(c => c.id !== id) }))
        registrarEvento(set, "PE_CIERRE_ELIMINADO", id, `Cierre de turno del ${cierre.fecha} eliminado por administración.`, "PE")
        return { ok: true }
      },

      enviarProyeccionCostoFI: (mesAnio, params) => {
        if (!get().hasHydrated) return { ok: false, error: "El almacenamiento aún se está hidratando. Intenta de nuevo." }
        if (!/^\d{4}-\d{2}$/.test(mesAnio)) return { ok: false, error: "El mes debe tener formato AAAA-MM." }
        const proyeccionBase = calcularProyeccionCobertura({ feriados: get().maestros.feriados, mesAnio })
        if (proyeccionBase.diasFeriados === 0) {
          return { ok: false, error: `No hay feriados registrados para ${mesAnio}; cargue el calendario antes de proyectar.` }
        }
        if (params.costoParche < 0 || params.costoDiaExtra < 0) {
          return { ok: false, error: "Los costos de parche y día extra no pueden ser negativos." }
        }
        const personalPlanta = get().personas.filter(p => p.datosLaborales !== undefined && p.estadoCuenta === "activa").length
        const costoEstimado = costoProyeccionPE(proyeccionBase.reemplazosNecesarios, personalPlanta, params.costoParche, params.costoDiaExtra)
        const proyeccion: ProyeccionPE = {
          id: params.id ?? `pe-proy-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          mesAnio,
          feriados: proyeccionBase.feriados,
          diasFeriados: proyeccionBase.diasFeriados,
          reemplazosNecesarios: proyeccionBase.reemplazosNecesarios,
          costoEstimado,
          detalleCosto: { personalPlanta, costoParche: params.costoParche, costoDiaExtra: params.costoDiaExtra },
          enviadoAFI: true,
          liquidacionPLReferencia: "pendiente",
        }
        const validacion = validarConEsquema(ProyeccionPESchema, proyeccion)
        if (!validacion.ok) return validacion
        set(s => ({ proyeccionesPE: upsert(s.proyeccionesPE, validacion.data) }))
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

      // --- PL: Liquidaciones y Remuneraciones ---

      generarLiquidacionPL: (input) => {
        if (!get().hasHydrated) return { ok: false, error: "El almacenamiento aún se está hidratando. Intenta de nuevo." }
        if (!/^\d{4}-\d{2}$/.test(input.periodo)) return { ok: false, error: "El periodo debe tener formato AAAA-MM." }
        const trabajador = get().personas.find(p => p.id === input.trabajadorPersonaId)
        if (!trabajador) return { ok: false, error: "El trabajador no existe en el Maestro de Personas." }
        const dl = trabajador.datosLaborales
        if (!dl) return { ok: false, error: "La persona no tiene ficha laboral de PE." }
        const sueldoBase = dl.sueldoBase ?? 0
        if (!(sueldoBase > 0)) return { ok: false, error: "La ficha del trabajador no registra sueldo base contractual (PE)." }
        // FKs legales vigentes contra los maestros (RG escritura).
        const m = get().maestros
        if (dl.afpId && !m.afps.some(a => a.id === dl.afpId)) return { ok: false, error: "afpId no existe en el maestro de AFPs." }
        if (dl.saludId && !m.previsionesSalud.some(s => s.id === dl.saludId)) return { ok: false, error: "saludId no existe en el maestro de previsiones de salud." }
        if (dl.asignacionFamiliarId && !m.asignacionFamiliar.some(a => a.id === dl.asignacionFamiliarId)) {
          return { ok: false, error: "asignacionFamiliarId no existe en el maestro de tramos legales." }
        }
        // CF sin parámetros legales bloquea la generación.
        const cfg = get().configuracion
        const diasMesComercial = cfg.diasMesComercial ?? 30
        if (
          cfg.ufMensual === undefined ||
          cfg.ingresoMinimoMensual === undefined ||
          cfg.topeGratificacionLegal === undefined ||
          cfg.tasaSIS === undefined
        ) {
          return { ok: false, error: "CF no cargado: faltan parámetros legales de remuneraciones (UF mensual, ingreso mínimo, tope gratificación o tasa SIS)." }
        }
        // Un solo documento por trabajador y periodo.
        const duplicado = get().liquidacionesPL.some(
          l => l.trabajadorPersonaId === input.trabajadorPersonaId && l.periodo === input.periodo
        )
        if (duplicado) {
          return { ok: false, error: `Ya existe una liquidación ${input.periodo} para este trabajador.` }
        }

        const esHonorarios = dl.tipoContrato === "honorarios"
        const afp = dl.afpId ? m.afps.find(a => a.id === dl.afpId) : undefined
        const salud = dl.saludId ? m.previsionesSalud.find(s => s.id === dl.saludId) : undefined
        const tramo = dl.asignacionFamiliarId ? m.asignacionFamiliar.find(a => a.id === dl.asignacionFamiliarId) : undefined
        const bonos = (input.bonos ?? []).map((b, idx) => ({
          id: b.id ?? `bono-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
          glosa: b.glosa,
          monto: b.monto,
          imponible: b.imponible,
        }))
        const anticiposPendientes = get().adelantosPL.filter(a => a.trabajadorPersonaId === input.trabajadorPersonaId && a.estado === "pendiente")

        const calculo = calcularLiquidacion({
          sueldoBaseContrato: sueldoBase,
          diasTrabajados: input.diasTrabajados,
          diasMesComercial,
          jornadaSemanal: dl.jornadaBaseHoras ?? cfg.jornadaSemanalEstandar,
          horasExtrasHoras: (dl.horasExtras ?? []).filter(h => h.fecha.startsWith(`${input.periodo}-`)).reduce((acc, h) => acc + h.horas, 0),
          bonos,
          asignacionMovilizacion: input.asignacionMovilizacion ?? 0,
          asignacionColacion: input.asignacionColacion ?? 0,
          montoAsignacionFamiliar: tramo ? tramo.monto * Math.max(0, dl.cargas ?? 0) : 0,
          tasaAFP: afp?.tasaCotizacion ?? 0,
          saludPlan: {
            tipo: salud?.tipo ?? "fonasa",
            porcentaje: input.saludPorcentaje,
            valorUF: input.saludValorUF,
            ufVigente: cfg.ufMensual!,
          },
          ufVigente: cfg.ufMensual!,
          ingresoMinimoMensual: cfg.ingresoMinimoMensual!,
          topeGratificacionLegal: cfg.topeGratificacionLegal!,
          tasaSIS: cfg.tasaSIS!,
          tasaSeguroCesantia: 0.6,
          esHonorarios,
          montoAPV: input.montoAPV ?? (dl.apv ? 0 : 0),
          anticiposPendientes: anticiposPendientes.map(a => ({ id: a.id, monto: a.monto })),
        })

        // Folio LIQ correlativo.
        const numeros = get().liquidacionesPL
          .map(l => Number.parseInt(l.folio.replace(/^LIQ-/, ""), 10))
          .filter(n => Number.isFinite(n))
        const folio = `LIQ-${String((numeros.length > 0 ? Math.max(...numeros) : 0) + 1).padStart(4, "0")}`

        // Referencia a la proyección PE del periodo si existe.
        const proyeccion = get().proyeccionesPE.find(p => p.mesAnio === input.periodo)

        const liquidacion: LiquidacionPL = {
          id: input.id ?? `pl-liq-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          folio,
          trabajadorPersonaId: input.trabajadorPersonaId,
          periodo: input.periodo,
          fechaGeneracion: hoyISOPL(),
          diasTrabajados: input.diasTrabajados,
          sueldoBaseContrato: sueldoBase,
          diasMesComercial,
          jornadaSemanal: dl.jornadaBaseHoras ?? cfg.jornadaSemanalEstandar,
          sueldoBaseProporcional: calculo.sueldoBaseProporcional,
          horasExtrasHoras: (dl.horasExtras ?? []).filter(h => h.fecha.startsWith(`${input.periodo}-`)).reduce((acc, h) => acc + h.horas, 0),
          valorHoraOrdinaria: calculo.valorHoraOrdinaria,
          montoHorasExtras: calculo.montoHorasExtras,
          bonos,
          gratificacionLegal: calculo.gratificacionLegal,
          totalImponible: calculo.totalImponible,
          asignacionMovilizacion: input.asignacionMovilizacion ?? 0,
          asignacionColacion: input.asignacionColacion ?? 0,
          asignacionFamiliarTramoId: dl.asignacionFamiliarId,
          cargas: Math.max(0, dl.cargas ?? 0),
          montoAsignacionFamiliar: tramo ? tramo.monto * Math.max(0, dl.cargas ?? 0) : 0,
          totalHaberes: calculo.totalHaberes,
          afpId: dl.afpId,
          nombreAfp: afp?.nombre ?? (esHonorarios ? "Boleta honorarios" : ""),
          tasaAFP: afp?.tasaCotizacion ?? 0,
          montoAFP: calculo.montoAFP,
          saludId: dl.saludId,
          nombreSalud: salud?.nombre ?? "",
          saludTipo: salud?.tipo ?? "fonasa",
          saludPorcentaje: input.saludPorcentaje,
          saludValorUF: input.saludValorUF,
          ufAplicada: cfg.ufMensual,
          montoSalud: calculo.montoSalud,
          tasaSIS: cfg.tasaSIS!,
          montoSIS: calculo.montoSIS,
          montoSeguroCesantia: calculo.montoSeguroCesantia,
          montoAPV: input.montoAPV ?? 0,
          totalDescuentos: calculo.totalDescuentos,
          descuentoAnticipos: calculo.descuentoAnticipos,
          adelantosIds: calculo.adelantosIds,
          alcanceLiquido: calculo.alcanceLiquido,
          liquidoAPagar: calculo.liquidoAPagar,
          estado: "borrador",
          egresoFIReferencia: "pendiente",
          ...(proyeccion ? { proyeccionPEReferencia: proyeccion.id } : {}),
        }
        const validacion = validarConEsquema(LiquidacionPLSchema, liquidacion)
        if (!validacion.ok) return validacion

        set(s => ({
          liquidacionesPL: upsert(s.liquidacionesPL, validacion.data),
          proyeccionesPE: s.proyeccionesPE.map(p =>
            p.mesAnio === input.periodo && p.liquidacionPLReferencia === "pendiente"
              ? { ...p, liquidacionPLReferencia: validacion.data.id }
              : p
          ),
        }))
        registrarEvento(
          set,
          "PL_GENERATE_PAYSLIP",
          validacion.data.id,
          `Liquidación ${folio} generada para ${trabajador.nombres} ${trabajador.apellidos} (${input.periodo}): haberes $${calculo.totalHaberes.toLocaleString("es-CL")}, líquido a pagar $${calculo.liquidoAPagar.toLocaleString("es-CL")}.`,
          "PL"
        )
        return { ok: true }
      },

      confirmarLiquidacionPL: (id) => {
        if (!get().hasHydrated) return { ok: false, error: "El almacenamiento aún se está hidratando. Intenta de nuevo." }
        const liquidacion = get().liquidacionesPL.find(l => l.id === id)
        if (!liquidacion) return { ok: false, error: "No se puede confirmar: la liquidación no existe." }
        if (liquidacion.estado !== "borrador") return { ok: false, error: "La liquidación ya está confirmada." }
        const fondoGC = get().fondosFI.find(f => f.tipo === "gasto_comun" && f.activo)
        if (!fondoGC) return { ok: false, error: "No existe un Fondo de Gasto Común activo para imputar el egreso de sueldos." }
        const trabajador = get().personas.find(p => p.id === liquidacion.trabajadorPersonaId)
        const nombreCompleto = trabajador ? `${trabajador.nombres} ${trabajador.apellidos}` : liquidacion.trabajadorPersonaId

        const egreso: EgresoFI = {
          id: `egr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          folio: siguienteFolioFE(get),
          fecha: hoyISO(),
          categoria: "sueldos",
          descripcion: `Liquidación ${liquidacion.folio} ${nombreCompleto} (${liquidacion.periodo})`,
          monto: Math.max(1, liquidacion.liquidoAPagar),
          fondoId: fondoGC.id,
          esRecurrente: false,
        }
        const validacionEgreso = validarConEsquema(EgresoFISchema, egreso)
        if (!validacionEgreso.ok) return validacionEgreso

        set(s => ({
          liquidacionesPL: s.liquidacionesPL.map(l =>
            l.id === id ? { ...l, estado: "confirmada" as const, egresoFIReferencia: validacionEgreso.data.id } : l
          ),
          adelantosPL: s.adelantosPL.map(a =>
            a.estado === "pendiente" && liquidacion.adelantosIds.includes(a.id)
              ? { ...a, estado: "descontado" as const, liquidacionId: id }
              : a
          ),
          egresosFI: [...s.egresosFI, validacionEgreso.data],
        }))
        registrarEvento(
          set,
          "PL_EXPENSE_SYNC",
          id,
          `Liquidación ${liquidacion.folio} CONFIRMADA: egreso ${validacionEgreso.data.folio} de $${egreso.monto.toLocaleString("es-CL")} imputado a ${fondoGC.nombre} (categoría Sueldos); ${liquidacion.adelantosIds.length} anticipo(s) descontado(s).`,
          "PL"
        )
        return { ok: true }
      },

      removeLiquidacionPL: (id) => {
        if (!get().hasHydrated) return { ok: false, error: "El almacenamiento aún se está hidratando. Intenta de nuevo." }
        const liquidacion = get().liquidacionesPL.find(l => l.id === id)
        if (!liquidacion) return { ok: false, error: "No se puede eliminar: la liquidación no existe." }
        if (liquidacion.estado !== "borrador" || (liquidacion.egresoFIReferencia && liquidacion.egresoFIReferencia !== "pendiente")) {
          return { ok: false, error: "Solo una liquidación en borrador sin egreso sincronizado puede eliminarse." }
        }
        set(s => ({ liquidacionesPL: s.liquidacionesPL.filter(l => l.id !== id) }))
        registrarEvento(set, "PL_DELETE_PAYSLIP", id, `Liquidación borrador ${liquidacion.folio} (${liquidacion.periodo}) eliminada por administración.`, "PL")
        return { ok: true }
      },

      saveAdelantoPL: (adelanto) => {
        if (!get().hasHydrated) return { ok: false, error: "El almacenamiento aún se está hidratando. Intenta de nuevo." }
        const esNuevo = !get().adelantosPL.some(a => a.id === adelanto.id)
        let candidato: AdelantoPL = adelanto
        if (esNuevo) {
          const numeros = get().adelantosPL
            .map(a => Number.parseInt(a.folio.replace(/^ADE-/, ""), 10))
            .filter(n => Number.isFinite(n))
          const siguiente = (numeros.length > 0 ? Math.max(...numeros) : 0) + 1
          candidato = { ...adelanto, folio: `ADE-${String(siguiente).padStart(4, "0")}`, estado: "pendiente" }
        }
        const validacion = validarConEsquema(AdelantoPLSchema, candidato)
        if (!validacion.ok) return validacion
        const registro = validacion.data
        const trabajador = get().personas.find(p => p.id === registro.trabajadorPersonaId)
        if (!trabajador) return { ok: false, error: "El trabajador no existe en el Maestro de Personas." }
        if (!trabajador.datosLaborales) return { ok: false, error: "La persona no tiene ficha laboral de PE." }

        set(s => ({ adelantosPL: upsert(s.adelantosPL, registro) }))
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

      removeAdelantoPL: (id) => {
        if (!get().hasHydrated) return { ok: false, error: "El almacenamiento aún se está hidratando. Intenta de nuevo." }
        const adelanto = get().adelantosPL.find(a => a.id === id)
        if (!adelanto) return { ok: false, error: "No se puede eliminar: el adelanto no existe." }
        if (adelanto.estado !== "pendiente") {
          return { ok: false, error: "No se puede eliminar un adelanto ya descontado en liquidación." }
        }
        set(s => ({ adelantosPL: s.adelantosPL.filter(a => a.id !== id) }))
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
        // SEC-005: los secretos no se persisten en localStorage; viven solo en
        // memoria de la sesión hasta su traslado definitivo al servidor (Fase C).
        configuracion: state.configuracion
          ? { ...state.configuracion, smtpPassword: "", claveEliminacionMaestro: "" }
          : state.configuracion,
        maestros: state.maestros,
        publicacionesPortal: state.publicacionesPortal,
        leadsPortal: state.leadsPortal,
        notificaciones: state.notificaciones,
        controlesPropiedades: state.controlesPropiedades,
        actasGD: state.actasGD,
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
          const mergeById = <T extends { id: string }>(prevArr: T[], seedArr: T[]): T[] => {
            const prevIds = new Set(prevArr.map(p => p.id))
            return [...prevArr, ...seedArr.filter(s => !prevIds.has(s.id))]
          }
          // TST-002: mergeById reconstruye `unidades` desde el persistido crudo y
          // deshacía la conversión estado→estadoId de la rama <3; se reaplica
          // migrarEstadoUnidades sobre la fusión resultante.
          const unidadesFusionadas = mergeById(
            (prev.unidades ?? []) as { id: string }[],
            seed.unidades as unknown as { id: string }[]
          )
          // Limpiar keys legacy v7 que ya no existen en CompassData
          const prevAny = prev as unknown as Record<string, unknown>
          result = {
            ...result,
            macroSectores: mergeById((prev.macroSectores ?? []) as { id: string }[], seed.macroSectores as unknown as { id: string }[]) as never,
            microSectores: mergeById((prev.microSectores ?? []) as { id: string }[], seed.microSectores as unknown as { id: string }[]) as never,
            unidades: migrarEstadoUnidades(unidadesFusionadas as unknown as Unidad[]) as never,
            maestros: {
              ...seed.maestros,
              ...(prev.maestros ?? {}),
              categoriasMacro: mergeById(
                (prev.maestros?.categoriasMacro ?? []) as { id: string }[],
                seed.maestros.categoriasMacro as unknown as { id: string }[]
              ) as never,
            } as never,
          }
          // Eliminar estacionamientos legacy del persistido si existe
          if (prevAny["estacionamientos"] !== undefined) delete (result as unknown as Record<string, unknown>)["estacionamientos"]
          const maestrosAny = (result.maestros ?? {}) as unknown as Record<string, unknown>
          if (maestrosAny["ubicacionesEstacionamiento"] !== undefined) delete maestrosAny["ubicacionesEstacionamiento"]
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
          const mergeById = <T extends { id: string }>(prevArr: T[] | undefined, seedArr: T[]): T[] => {
            if (!prevArr) return seedArr
            const prevIds = new Set(prevArr.map(p => p.id))
            return [...prevArr, ...seedArr.filter(s => !prevIds.has(s.id))]
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
              asignacionFamiliar: mergeById(maestrosPrev["asignacionFamiliar"] as AsignacionFamiliar[] | undefined, seed.maestros.asignacionFamiliar),
              jornadas: mergeById(maestrosPrev["jornadas"] as Jornada[] | undefined, seed.maestros.jornadas),
              couriers: mergeById(maestrosPrev["couriers"] as Courier[] | undefined, seed.maestros.couriers),
              contratistas: mergeById(maestrosPrev["contratistas"] as Contratista[] | undefined, seed.maestros.contratistas),
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
        // TST-002: los stores que ya quedaron en v8 con unidades dañadas por este
        // bug (estado sin estadoId) se rescatan aquí en el salto a v9.
        if ((version ?? 0) < STORE_VERSION && Array.isArray(result.unidades)) {
          result = { ...result, unidades: migrarEstadoUnidades(result.unidades) }
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

export function useStoreRehydrated(): void {
  useEffect(() => {
    rehydrateStore()
  }, [])
}
