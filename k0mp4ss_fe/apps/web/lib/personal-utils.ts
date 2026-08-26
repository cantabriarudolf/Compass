// Helpers puros de PE - Personal y Servicios (ventana 7). Sin acceso al store:
// reciben slices tipados y devuelven derivaciones testables.
import type {
  CierreTurnoPE,
  ChecklistItemTurno,
  MantencionPreventivaPE,
} from "./schemas"
import type { Feriado } from "@/data/admin/maestros"

export interface FeriadoSnapshotPE {
  id: string
  fecha: string
  nombre: string
  irrenunciable: boolean
}

export function hoyISOPE(): string {
  return new Date().toISOString().slice(0, 10)
}

export function feriadosDelMes(feriados: Feriado[], mesAnio: string): Feriado[] {
  return feriados
    .filter(f => f.fecha.startsWith(`${mesAnio}-`))
    .sort((a, b) => a.fecha.localeCompare(b.fecha))
}

export interface ResultadoCoberturaPE {
  mesAnio: string
  feriados: FeriadoSnapshotPE[]
  diasFeriados: number
  reemplazosNecesarios: number
}

// Proyección de cobertura NSGC §1.2: cada feriado exige parches de cobertura
// según su carácter legal. Irrenunciables (2 jornadas por defecto) demandan
// más reemplazo que un feriado renunciable (1 jornada).
export function calcularProyeccionCobertura(input: {
  feriados: Feriado[]
  mesAnio: string
  jornadasPorFeriadoIrrenunciable?: number
  jornadasPorFeriadoRenunciable?: number
}): ResultadoCoberturaPE {
  const delMes = feriadosDelMes(input.feriados, input.mesAnio)
  const porIrrenunciable = input.jornadasPorFeriadoIrrenunciable ?? 2
  const porRenunciable = input.jornadasPorFeriadoRenunciable ?? 1
  const reemplazos = delMes.reduce(
    (acc, f) => acc + (f.irrenunciable ? porIrrenunciable : porRenunciable),
    0
  )
  return {
    mesAnio: input.mesAnio,
    feriados: delMes.map(f => ({ id: f.id, fecha: f.fecha, nombre: f.nombre, irrenunciable: f.irrenunciable })),
    diasFeriados: delMes.length,
    reemplazosNecesarios: reemplazos,
  }
}

export function costoProyeccionPE(reemplazosNecesarios: number, personalPlanta: number, costoParche: number, costoDiaExtra: number): number {
  return Math.max(0, Math.round(reemplazosNecesarios * costoParche + personalPlanta * costoDiaExtra))
}

export interface AlertaMantencionPE {
  mantencion: MantencionPreventivaPE
  diasRestantes: number
}

// Alertas automáticas del calendario preventivo: activas cuya próxima fecha
// cae dentro del horizonte de alerta (o ya vencidas, con negativo).
export function alertasMantencionesVencidas(mantenciones: MantencionPreventivaPE[], hoy: string): AlertaMantencionPE[] {
  const msDia = 24 * 60 * 60 * 1000
  const base = new Date(`${hoy}T00:00:00`).getTime()
  if (!Number.isFinite(base)) return []
  return mantenciones
    .filter(m => m.activo)
    .map(m => ({
      mantencion: m,
      diasRestantes: Math.round((new Date(`${m.proximaFecha}T00:00:00`).getTime() - base) / msDia),
    }))
    .filter(a => Number.isFinite(a.diasRestantes) && a.diasRestantes <= a.mantencion.alertaDiasAntes)
    .sort((a, b) => a.diasRestantes - b.diasRestantes)
}

function sumarMeses(fechaISO: string, meses: number): string {
  const d = new Date(`${fechaISO}T00:00:00`)
  d.setMonth(d.getMonth() + meses)
  return d.toISOString().slice(0, 10)
}

export function proximaFechaPreventiva(fechaVisita: string, periodicidadMeses: number): string {
  return sumarMeses(fechaVisita, Math.max(1, periodicidadMeses))
}

// Plantillas canónicas del checklist de instalaciones por jornada reportada
// (NSGC §3 "Estado de Instalaciones: Checklist basado en la Jornada reportada").
// Se snapshot-ean en cada cierre para no reescribir históricos.
const PLANTILLAS_INSTALACIONES: Record<string, string[]> = {
  "j-manana": ["Portería y accesos ordenados", "Iluminación perimetral operativa", "Basuras del día anterior retiradas", "Salas de uso común revisadas"],
  "j-tarde": ["Accesos y rejas cerradas correctamente", "Piscina/quinchos ordenados", "Estacionamientos de visita despejados"],
  "j-noche": ["Perímetro verificado con rondas", "Puertas de acceso aseguradas", "Iluminación nocturna operativa", "Registro de ronda al día"],
}

const PLANTILLA_EQUIPAMIENTO = ["Celular de turno operativo", "PC de conserjería operativo", "Llaves maestras completas"]

export function checklistInstalacionesParaJornada(jornadaId: string): ChecklistItemTurno[] {
  const items = PLANTILLAS_INSTALACIONES[jornadaId] ?? PLANTILLAS_INSTALACIONES["j-manana"]!
  return items.map(item => ({ item, ok: false }))
}

export function checklistEquipamientoBase(): ChecklistItemTurno[] {
  return PLANTILLA_EQUIPAMIENTO.map(item => ({ item, ok: false }))
}

// Reporte diario derivado: mapa jornadaId -> informado para la fecha consultada.
export function estadoReporteDiario(cierres: CierreTurnoPE[], fecha: string): Record<string, boolean> {
  const estado: Record<string, boolean> = {}
  for (const c of cierres) {
    if (c.fecha !== fecha) continue
    estado[c.jornadaReportadaId] = true
  }
  return estado
}
